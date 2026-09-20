import { nativeLog, object, array, contentText } from "./native-protocol.js";
import type { NativeLog } from "./native-protocol.js";
import type { Agents } from "./agents.js";
import type {
  AgentKind,
  SessionSummary,
  RunInput,
  Emit,
  TerminalEvent,
} from "../public/contracts.js";
export type TerminalInfo = Pick<SessionSummary, "agent" | "id" | "cwd"> &
  Partial<SessionSummary>;
export interface NativeTerminal {
  pid: number;
  onData(fn: (data: string) => void): unknown;
  onExit(fn: (event: { exitCode: number; signal?: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
import pty from "node-pty";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, stat, readdir, realpath, open } from "node:fs/promises";
import { Rpc } from "./agents.js";
import { failure } from "./speech.js";
import { exec } from "./store.js";
export class TerminalSession extends EventEmitter {
  agent: AgentKind;
  id: string;
  cwd: string;
  title?: string;
  pending?: boolean;
  path?: string;
  idTimer?: NodeJS.Timeout;
  native: NativeTerminal;
  pid: number;
  buffer: string;
  subscribers: Set<(event: TerminalEvent) => void>;
  exited: boolean;
  draft: boolean;
  startedAt: number;
  constructor(info: TerminalInfo, native: NativeTerminal) {
    super();
    this.agent = info.agent;
    this.id = info.id;
    this.cwd = info.cwd;
    this.title = info.title;
    this.pending = info.pending;
    this.path = info.path;
    this.native = native;
    this.pid = native.pid;
    this.buffer = "";
    this.subscribers = new Set();
    this.exited = false;
    this.draft = false;
    this.startedAt = Date.now();
    native.onData((data) => {
      this.buffer = (this.buffer + data).slice(-300000);
      this.broadcast({ type: "output", data });
      if (data.includes("\x1b[6n")) native.write("\x1b[1;1R");
      if (data.includes("\x1b[c")) native.write("\x1b[?1;2c");
    });
    native.onExit((e) => {
      this.exited = true;
      this.broadcast({ type: "exit", ...e });
    });
  }
  subscribe(fn: (event: TerminalEvent) => void) {
    this.subscribers.add(fn);
    fn({ type: "output", data: this.buffer });
    return () => this.subscribers.delete(fn);
  }
  broadcast(e: TerminalEvent) {
    for (const f of this.subscribers) f(e);
    this.emit("event", e);
  }
  input(data: string) {
    if (this.exited) throw failure("exited", "This native terminal has exited");
    if (/[\r\n\x03\x15]/.test(data)) this.draft = false;
    else if (data && !/^\x1b/.test(data)) this.draft = true;
    this.native.write(data);
  }
  voice(text: string) {
    if (this.draft)
      throw failure(
        "draft",
        "There is unfinished text in the terminal prompt. Send or clear it before speaking.",
        409,
      );
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text))
      throw failure(
        "invalid_text",
        "Message contains terminal control characters",
      );
    this.native.write("\x1b[200~" + text + "\x1b[201~");
    setTimeout(() => {
      if (!this.exited) this.native.write("\r");
    }, 100);
  }
  resize(cols: number, rows: number) {
    this.native.resize(
      Math.max(40, Math.min(300, Number(cols) || 100)),
      Math.max(10, Math.min(100, Number(rows) || 30)),
    );
  }
  close() {
    if (!this.exited) this.native.kill();
  }
  summary(): SessionSummary {
    return {
      agent: this.agent,
      id: this.id,
      cwd: this.cwd,
      title: this.title || "Live " + this.agent + " session",
      updatedAt: Date.now(),
      managed: true,
      live: !this.exited,
      pid: this.pid,
    };
  }
}
export class Terminals {
  agents: Pick<Agents, "session" | "externalOwner" | "mark" | "codexIndex">;
  sessions: Map<string, TerminalSession>;
  constructor(
    agents: Pick<Agents, "session" | "externalOwner" | "mark" | "codexIndex">,
  ) {
    this.agents = agents;
    this.sessions = new Map();
  }
  get(agent: AgentKind, id: string) {
    return this.sessions.get(agent + ":" + id);
  }
  async open({
    agent,
    id = "new",
    cwd,
    cols = 100,
    rows = 30,
  }: {
    agent: AgentKind;
    id?: string;
    cwd: string;
    cols?: number;
    rows?: number;
  }) {
    if (!["codex", "claude"].includes(agent))
      throw failure("invalid_agent", "Invalid agent");
    let existing = this.get(agent, id);
    if (existing && !existing.exited) return existing;
    let info: TerminalInfo =
      id === "new"
        ? { agent, id, cwd, title: "Live " + agent + " session" }
        : await this.agents.session(agent, id);
    if (!info.cwd?.startsWith("/"))
      throw failure("invalid_cwd", "Select an absolute project directory");
    if (!(await stat(info.cwd)).isDirectory())
      throw failure("invalid_cwd", "Project directory does not exist");
    info.cwd = await realpath(info.cwd);
    if (id !== "new") {
      const owner = await this.agents.externalOwner(info);
      if (owner)
        throw failure(
          "external_terminal",
          agent === "codex"
            ? "This session is already running externally. Voice messages will use Codex’s live queue; its terminal stays open."
            : "This Claude session is already running outside Agentflow. Live native terminal mirroring requires launching it through agentflow run. Its existing process will not be stopped.",
          409,
        );
    }
    if (id === "new") {
      info.id = randomUUID();
      info.pending = agent === "codex";
    }
    const binary =
      process.env[agent === "codex" ? "AGENTFLOW_CODEX" : "AGENTFLOW_CLAUDE"] ||
      join(homedir(), ".local/bin", agent);
    const args =
      agent === "codex"
        ? [
            ...(id === "new" ? [] : ["resume", info.id]),
            "--no-alt-screen",
            "-c",
            "check_for_update_on_startup=false",
          ]
        : id === "new"
          ? ["--session-id", info.id]
          : ["--resume", info.id];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };
    delete env.CLAUDECODE;
    const native = pty.spawn(binary, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: info.cwd,
      env,
    });
    const session = new TerminalSession(info, native);
    this.sessions.set(agent + ":" + info.id, session);
    await this.agents.mark(agent, info.id, info.cwd);
    if (info.pending) {
      const timer = setInterval(
        () => this.resolveId(session).catch(() => {}),
        500,
      );
      timer.unref();
      session.idTimer = timer;
    }
    return session;
  }
  async resolveId(session: TerminalSession) {
    if (!session.pending) return session.id;
    try {
      const { stdout } = await exec(
        "/usr/sbin/lsof",
        ["-p", String(session.pid), "-Fn"],
        { timeout: 3000 },
      );
      const match = stdout.match(/thread-writer-locks\/([a-f0-9-]{36})\.lock/);
      if (match) {
        const old = session.id;
        session.id = match[1];
        session.pending = false;
        this.sessions.set(session.agent + ":" + session.id, session);
        clearInterval(session.idTimer);
        session.broadcast({ type: "session", id: session.id, previousId: old });
        await this.agents.mark(session.agent, session.id, session.cwd);
        return session.id;
      }
    } catch {}
    return null;
  }
  async file(agent: AgentKind, id: string, cwd: string): Promise<string> {
    if (agent === "codex") {
      const r = await (
        await this.agents.codexIndex()
      ).call("thread/read", { threadId: id });
      if (!r.thread.path)
        throw Error("Native history path is not available yet");
      return r.thread.path;
    }
    const dir = join(
      homedir(),
      ".claude/projects",
      cwd.replace(/[^a-zA-Z0-9]/g, "-"),
    );
    return join(dir, id + ".jsonl");
  }
  async run(job: RunInput, emit: Emit, signal: AbortSignal) {
    const session = this.get(job.agent, job.sessionId);
    const info =
      session || (await this.agents.session(job.agent, job.sessionId));
    let path;
    try {
      path = info.path || (await this.file(job.agent, info.id, info.cwd));
    } catch {}
    let offset = 0;
    try {
      if (path) offset = (await stat(path)).size;
    } catch {}
    if (!session?.pending) emit({ type: "session", id: info.id });
    if (session && !session.exited) {
      session.voice(job.text);
    } else if (job.agent === "codex") {
      await exec(
        join(homedir(), ".local/bin/codex"),
        ["queue", "--thread", job.sessionId, "--message", job.text],
        { timeout: 20000 },
      );
    } else {
      throw failure(
        "external_claude_input",
        "This externally launched Claude terminal has no verified user-input attachment. Agentflow will not convert your words into a peer message or close the process. Native voice input is supported for sessions launched with agentflow run claude; agent-requested speech works directly through the Agentflow MCP tool.",
        409,
      );
    }
    let rest = "",
      started = false,
      reply = "",
      lastChanged = Date.now();
    const deadline = Date.now() + 15 * 60 * 1000;
    const abort = () => {
      if (session) session.input("\x03");
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (!path) {
          if (session?.pending) await this.resolveId(session);
          if (!session?.pending) {
            try {
              path = await this.file(
                job.agent,
                session?.id || job.sessionId,
                info.cwd,
              );
              emit({ type: "session", id: session?.id || job.sessionId });
            } catch {}
          }
          if (!path) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
        }
        let file;
        try {
          file = await open(path, "r");
          const size = (await file.stat()).size;
          if (size < offset) offset = 0;
          const bytes = Buffer.alloc(
            Math.min(1024 * 1024, Math.max(0, size - offset)),
          );
          const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
          offset += bytesRead;
          rest += bytes.subarray(0, bytesRead).toString();
        } catch {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        } finally {
          await file?.close();
        }
        const lines = rest.split("\n");
        rest = lines.pop() || "";
        for (const line of lines) {
          let m: NativeLog;
          try {
            m = nativeLog(JSON.parse(line));
          } catch {
            continue;
          }
          if (job.agent === "codex") {
            if (
              m.type === "response_item" &&
              m.payload?.type === "message" &&
              m.payload.role === "user" &&
              (m.payload.content || []).some((x) => x.text === job.text)
            )
              started = true;
            if (
              started &&
              m.type === "response_item" &&
              m.payload?.type === "message" &&
              m.payload.role === "assistant"
            ) {
              const t = (m.payload.content || [])
                .filter((x) => x.type === "output_text")
                .map((x) => x.text)
                .join("\n");
              if (t) {
                reply += t + "\n";
                emit({ type: "text", text: t + "\n" });
              }
            }
            if (
              started &&
              m.type === "event_msg" &&
              m.payload?.type === "task_complete"
            )
              return;
          } else {
            if (
              m.type === "user" &&
              (m.uuid === job.id ||
                m.message?.content === job.text ||
                (Array.isArray(m.message?.content) &&
                  m.message.content.some(
                    (x) => x.type === "text" && x.text === job.text,
                  )))
            )
              started = true;
            if (started && m.type === "assistant") {
              const t = contentText(m.message?.content);
              if (t) {
                reply += t + "\n";
                emit({ type: "text", text: t + "\n" });
                lastChanged = Date.now();
              }
              if (
                m.message?.stop_reason === "end_turn" ||
                m.message?.stop_reason === "stop_sequence"
              )
                return;
            }
            if (started && m.type === "system" && m.subtype === "turn_duration")
              return;
          }
        }
        if (session?.exited) throw Error("Native terminal exited");
        if (
          job.agent === "claude" &&
          reply &&
          Date.now() - lastChanged > 2500
        ) {
          try {
            const { stdout } = await exec(
              join(homedir(), ".local/bin/claude"),
              ["agents", "--json"],
              { timeout: 5000 },
            );
            if (
              object(
                array(JSON.parse(stdout)).find(
                  (x) => object(x).sessionId === job.sessionId,
                ),
              ).status === "idle"
            )
              return;
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw Error(
        "No completed turn received. Check the live terminal for a permission prompt or login message.",
      );
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  close() {
    for (const s of new Set(this.sessions.values())) {
      clearInterval(s.idTimer);
      s.close();
    }
  }
}
