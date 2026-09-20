import {
  string,
  errorCode,
  errorMessage,
  record,
} from "../public/contracts.js";
import type {
  AgentKind,
  AgentEvent,
  Emit,
  Ask,
  RunInput,
  SessionSummary,
  HistoryMessage,
} from "../public/contracts.js";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  object,
  contentText,
  rpcMessage,
  parseRpcResult,
} from "./native-protocol.js";
import type { RpcMessage, RpcResults } from "./native-protocol.js";
type SessionRef = Pick<SessionSummary, "agent" | "id" | "cwd">;
import { liveClaudeSession } from "./claude-live.js";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec, load, save, appHome } from "./store.js";
import { failure } from "./speech.js";
import {
  listSessions,
  getSessionMessages,
  query,
} from "@anthropic-ai/claude-agent-sdk";
const binaries = {
  codex: process.env.AGENTFLOW_CODEX || join(homedir(), ".local/bin/codex"),
  claude: process.env.AGENTFLOW_CLAUDE || join(homedir(), ".local/bin/claude"),
};
export function normalizeCodex(value: unknown): AgentEvent[] {
  const m = object(value),
    p = object(m.params);
  return m.method === "item/agentMessage/delta" && typeof p.delta === "string"
    ? [{ type: "text", text: p.delta }]
    : [];
}
export function normalizeClaude(value: unknown): AgentEvent[] {
  const m = object(value);
  if (
    m.type === "system" &&
    m.subtype === "init" &&
    typeof m.session_id === "string"
  )
    return [{ type: "session", id: m.session_id }];
  const delta = object(object(m.event).delta);
  if (
    m.type === "stream_event" &&
    delta.type === "text_delta" &&
    typeof delta.text === "string"
  )
    return [{ type: "text", text: delta.text }];
  return [];
}
export class Rpc extends EventEmitter {
  next: number;
  pending: Map<
    string | number,
    {
      timer: NodeJS.Timeout;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >;
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  constructor() {
    super();
    this.next = 0;
    this.pending = new Map();
    this.child = spawn(binaries.codex, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.child.stderr.on("data", () => {});
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      let m: RpcMessage;
      try {
        m = rpcMessage(JSON.parse(line));
      } catch {
        return;
      }
      if (m.id !== undefined && !m.method) {
        const p = this.pending.get(m.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(m.id);
          m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
        }
      } else this.emit("message", m);
    });
    this.child.on("error", () => this.die("Codex executable is unavailable"));
    this.child.on("close", () => this.die("Codex connection closed"));
    this.child.stdin.on("error", () => {});
    this.ready = this.call("initialize", {
      clientInfo: { name: "agentflow", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    }).then(() => this.send({ method: "initialized", params: {} }));
  }
  die(message: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(message));
    }
    this.pending.clear();
    this.emit("closed");
  }
  send(m: unknown) {
    if (!this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(m) + "\n");
  }
  call<M extends keyof RpcResults>(
    method: M,
    params: Record<string, unknown>,
  ): Promise<RpcResults[M]> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`Codex ${method} timed out`));
      }, 90000);
      this.pending.set(id, {
        resolve: (value) => {
          try {
            resolve(parseRpcResult(method, value));
          } catch (e) {
            reject(e);
          }
        },
        reject,
        timer,
      });
      this.send({ id, method, params });
    });
  }
  close() {
    this.child.kill("SIGTERM");
    this.die("Codex connection closed");
  }
}
export class Agents {
  index: Rpc | null;
  cache: SessionSummary[];
  cacheAt: number;
  managed: Record<string, { cwd: string }>;
  errors: string[] = [];
  constructor() {
    this.index = null;
    this.cache = [];
    this.cacheAt = 0;
    this.managed = {};
  }
  async init() {
    this.managed = Object.fromEntries(
      Object.entries(record(await load(join(appHome, "managed.json"), {}))).map(
        ([key, value]) => [key, { cwd: string(record(value).cwd) }],
      ),
    );
  }
  async codexIndex() {
    if (!this.index) {
      const r = new Rpc();
      r.on("closed", () => {
        if (this.index === r) this.index = null;
      });
      this.index = r;
      try {
        await r.ready;
      } catch (e) {
        r.close();
        throw e;
      }
    }
    return this.index;
  }
  async list(force = false) {
    if (!force && Date.now() - this.cacheAt < 10000) return this.cache;
    const results = await Promise.allSettled([
      (async () => {
        const rpc = await this.codexIndex();
        const r = await rpc.call("thread/list", {
          limit: 100,
          archived: false,
          sortKey: "updated_at",
        });
        return r.data.map((s) => ({
          agent: "codex" as const,
          id: s.id,
          title: s.name || s.preview || "Codex session",
          cwd: s.cwd,
          updatedAt: s.updatedAt * 1000,
        }));
      })(),
      listSessions({ limit: 100 }).then((ss) =>
        ss.map((s) => ({
          agent: "claude" as const,
          id: s.sessionId,
          title:
            s.customTitle || s.summary || s.firstPrompt || "Claude session",
          cwd: s.cwd || homedir(),
          updatedAt: s.lastModified,
        })),
      ),
    ]);
    this.errors = results
      .map((r, i) =>
        r.status === "rejected"
          ? `${i ? "Claude Code" : "Codex"}: ${errorMessage(r.reason)}`
          : null,
      )
      .filter((x): x is string => x !== null);
    this.cache = results
      .flatMap<SessionSummary>((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((s) => s.id && s.cwd)
      .map((s) => ({
        ...s,
        title: s.title.replace(/<[^>]+>/g, " ").slice(0, 200),
        managed: !!this.managed[s.agent + ":" + s.id],
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    this.cacheAt = Date.now();
    return this.cache;
  }
  async session(agent: AgentKind, id: string) {
    let s = (await this.list()).find((s) => s.agent === agent && s.id === id);
    if (!s)
      s = (await this.list(true)).find((s) => s.agent === agent && s.id === id);
    if (!s)
      throw failure(
        "not_found",
        "Session not found. Refresh the session list.",
        404,
      );
    return s;
  }
  async history(agent: AgentKind, id: string): Promise<HistoryMessage[]> {
    const s = await this.session(agent, id);
    if (agent === "claude") {
      const messages = await getSessionMessages(id, { dir: s.cwd, limit: 40 });
      return messages
        .flatMap<HistoryMessage>((m) =>
          m.type === "user" || m.type === "assistant"
            ? [
                {
                  role: m.type,
                  text: contentText(object(m.message).content),
                },
              ]
            : [],
        )
        .filter((m) => m.text)
        .slice(-30);
    }
    const r = await (
      await this.codexIndex()
    ).call("thread/read", { threadId: id, includeTurns: true });
    return (r.thread.turns || [])
      .flatMap((t) =>
        (t.items || [])
          .filter((i) => ["userMessage", "agentMessage"].includes(i.type))
          .map((i) => ({
            role:
              i.type === "userMessage"
                ? ("user" as const)
                : ("assistant" as const),
            text:
              i.text || (i.content || []).map((c) => c.text || "").join("\n"),
          })),
      )
      .filter((x) => x.text)
      .slice(-30);
  }
  async externalOwner(s: SessionRef) {
    // lsof reports active open handles, not merely stale lock-file existence.
    const lock = join(homedir(), ".codex/thread-writer-locks", s.id + ".lock");
    if (s.agent === "codex") {
      try {
        const { stdout } = await exec("/usr/sbin/lsof", ["-t", lock], {
          timeout: 5000,
        });
        if (stdout.trim())
          return "This Codex session is already running. Use its native live queue.";
      } catch (e) {
        if (errorCode(e) !== 1 && errorCode(e) !== 2)
          return "Could not establish Codex session ownership.";
      }
    }
    if (s.agent === "claude" && (await liveClaudeSession(s.id)))
      return "This Claude Code session is running externally. User-input attachment is unavailable.";
    return null;
  }
  async run(job: RunInput, emit: Emit, signal: AbortSignal, ask: Ask) {
    const s =
      job.sessionId === "new"
        ? { agent: job.agent, cwd: job.cwd, id: "new" }
        : await this.session(job.agent, job.sessionId);
    const conflict = await this.externalOwner(s);
    if (conflict) throw failure("owned", conflict, 409);
    const text = job.text;
    if (job.agent === "codex") await this.runCodex(s, text, emit, signal, ask);
    else await this.runClaude(s, text, emit, signal, ask);
    this.cacheAt = 0;
  }
  async mark(agent: AgentKind, id: string, cwd: string) {
    this.managed[agent + ":" + id] = { cwd };
    await save(join(appHome, "managed.json"), this.managed);
  }
  async runCodex(
    s: SessionRef,
    text: string,
    emit: Emit,
    signal: AbortSignal,
    ask: Ask,
  ) {
    const rpc = new Rpc();
    let turnId: string | undefined,
      threadId = s.id;
    const done = Promise.withResolvers<void>();
    let completed = false;
    const abort = () => {
      if (turnId)
        rpc.call("turn/interrupt", { threadId, turnId }).catch(() => {});
      setTimeout(() => rpc.close(), 1500).unref();
      done.reject(Error("Turn interrupted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    rpc.on("closed", () => {
      if (!completed)
        done.reject(Error("Codex exited before completing the turn"));
    });
    // Attach a rejection handler before startup RPCs, avoiding unhandled rejections on abort.
    done.promise.catch(() => {});
    rpc.on("message", async (m: RpcMessage) => {
      if (m.id !== undefined && m.method) {
        try {
          if (m.method.endsWith("/requestApproval")) {
            if (m.method === "item/permissions/requestApproval") {
              rpc.send({
                id: m.id,
                result: { permissions: {}, scope: "turn" },
              });
              return;
            }
            const allow = await ask(
              String(
                m.params.command ||
                  m.params.reason ||
                  "Codex requests permission for a tool action",
              ),
            );
            rpc.send({
              id: m.id,
              result: { decision: allow ? "accept" : "decline" },
            });
          } else if (m.method === "item/tool/requestUserInput") {
            rpc.send({ id: m.id, result: { answers: {} } });
            emit({
              type: "notice",
              text: "Codex requested structured input; answer in your next message.",
            });
          } else
            rpc.send({
              id: m.id,
              error: {
                code: -32601,
                message: "Client does not support this request",
              },
            });
        } catch {
          rpc.send({
            id: m.id,
            error: { code: -32603, message: "Approval failed" },
          });
        }
        return;
      }
      for (const e of normalizeCodex(m)) emit(e);
      if (m.method === "turn/completed") {
        completed = true;
        object(m.params.turn).status === "failed"
          ? done.reject(
              Error(
                String(
                  object(object(m.params.turn).error).message ||
                    "Codex turn failed",
                ),
              ),
            )
          : done.resolve();
      }
    });
    try {
      await rpc.ready;
      signal.throwIfAborted();
      const r = await rpc.call(
        s.id === "new" ? "thread/start" : "thread/resume",
        s.id === "new"
          ? {
              cwd: s.cwd,
              approvalPolicy: "on-request",
              sandbox: "workspace-write",
              serviceName: "agentflow",
            }
          : { threadId: s.id },
      );
      threadId = r.thread.id;
      emit({ type: "session", id: threadId });
      await this.mark("codex", threadId, s.cwd);
      const t = await rpc.call("turn/start", {
        threadId,
        input: [{ type: "text", text }],
        approvalPolicy: "on-request",
      });
      turnId = t.turn.id;
      await done.promise;
    } finally {
      completed = true;
      signal.removeEventListener("abort", abort);
      rpc.close();
    }
  }
  async runClaude(
    s: SessionRef,
    text: string,
    emit: Emit,
    signal: AbortSignal,
    ask: Ask,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    let resultSeen = false,
      reply = "";
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const q = query({
      prompt: text,
      options: {
        cwd: s.cwd,
        ...(s.id === "new" ? {} : { resume: s.id }),
        pathToClaudeCodeExecutable: binaries.claude,
        includePartialMessages: true,
        abortController: controller,
        env,
        settingSources: ["user", "project", "local"],
        permissionMode: "default",
        canUseTool: async (name, input) =>
          (await ask(`${name}: ${JSON.stringify(input).slice(0, 3000)}`))
            ? { behavior: "allow", updatedInput: input }
            : { behavior: "deny", message: "User denied this action" },
        stderr: () => {},
      },
    });
    try {
      for await (const m of q) {
        for (const e of normalizeClaude(m)) {
          if (e.type === "text") reply += e.text;
          if (e.type === "session") await this.mark("claude", e.id, s.cwd);
          emit(e);
        }
        if (m.type === "result") {
          resultSeen = true;
          if (m.is_error)
            throw Error(
              ("errors" in m ? m.errors.join("; ") : m.result) ||
                "Claude Code failed",
            );
          if ("result" in m && m.result && !reply)
            emit({ type: "text", text: m.result });
        }
      }
      if (!resultSeen && !signal.aborted)
        throw Error("Claude Code ended without a result");
    } finally {
      signal.removeEventListener("abort", abort);
      q.close();
    }
  }
  close() {
    this.index?.close();
  }
}
