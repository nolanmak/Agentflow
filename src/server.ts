import {
  list,
  record,
  string,
  isAgent,
  isProvider,
  errorMessage,
  errorCode,
  playbackSpeed,
  parseTerminalMessage,
  type KeyStorage,
} from "../public/contracts.js";
import type { TerminalSession } from "./terminal.js";
export type AppAgents = Pick<Agents, "init" | "close"> &
  Partial<
    Pick<
      Agents,
      | "list"
      | "session"
      | "externalOwner"
      | "mark"
      | "codexIndex"
      | "run"
      | "history"
      | "errors"
    >
  >;
interface AppOptions {
  port?: number;
  dir?: string;
  store?: KeyStorage;
  agents?: AppAgents;
}
function unavailable(): never {
  throw Error("Native agent adapter unavailable");
}
import { readHistory } from "./history.js";
import { WebSocketServer } from "ws";
import { Terminals } from "./terminal.js";
import http from "node:http";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { KeyStore, appHome, save, load, exec } from "./store.js";
import { Settings, Jobs } from "./state.js";
import { Agents } from "./agents.js";
import { authorize } from "./security.js";
import {
  transcribe,
  synthesize,
  failure,
  providers,
  previewConfig,
} from "./speech.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function body(req: http.IncomingMessage, limit = 1024 * 1024) {
  let size = 0,
    parts: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw failure("too_large", "Request is too large", 413);
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
async function json(req: http.IncomingMessage) {
  try {
    return record(JSON.parse((await body(req)).toString()));
  } catch (e) {
    if (e instanceof Error && "status" in e) throw e;
    throw failure("invalid_json", "Invalid request JSON");
  }
}
function reply(res: http.ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export type LocalPlayer = (
  executable: string,
  args: string[],
  options: { signal?: AbortSignal; timeout: number },
) => Promise<unknown>;
export async function playLocalAudio(
  audio: Buffer,
  speed: number,
  player: LocalPlayer = exec,
  signal?: AbortSignal,
) {
  const d = await mkdtemp(join(tmpdir(), "agentflow-play-"));
  try {
    const p = join(d, "speech.mp3");
    await writeFile(p, audio, { mode: 0o600 });
    await player(
      "/usr/bin/afplay",
      ["--rate", String(speed), "--rQuality", "1", p],
      {
        signal,
        timeout: 120000,
      },
    );
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}
export async function createApp({
  port = Number(process.env.AGENTFLOW_PORT || 4317),
  dir = appHome,
  store = new KeyStore(),
  agents = new Agents(),
}: AppOptions = {}) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const settings = new Settings(store, dir);
  await settings.init();
  await agents.init();
  const savedToken = await load(join(dir, "auth.json"), null);
  let token = savedToken === null ? null : string(savedToken);
  if (!token) {
    token = randomBytes(32).toString("hex");
    await save(join(dir, "auth.json"), token);
  }
  const terminals = new Terminals({
    session: agents.session?.bind(agents) || unavailable,
    externalOwner: agents.externalOwner?.bind(agents) || unavailable,
    mark: agents.mark?.bind(agents) || unavailable,
    codexIndex: agents.codexIndex?.bind(agents) || unavailable,
  });
  const jobs = new Jobs(dir, async (job, emit, signal, ask) => {
    if (!agents.session)
      return (agents.run?.bind(agents) || unavailable)(job, emit, signal, ask);
    let native = terminals.get(job.agent, job.sessionId);
    if (!native) {
      const info = await (agents.session?.bind(agents) || unavailable)(
        job.agent,
        job.sessionId,
      );
      const owner = await (agents.externalOwner?.bind(agents) || unavailable)(
        info,
      );
      if (!owner) {
        native = await terminals.open({
          agent: job.agent,
          id: job.sessionId,
          cwd: info.cwd,
        });
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    return terminals.run(job, emit, signal);
  });
  await jobs.init();
  let actualPort = port;
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'",
    );
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        authorize(req, actualPort, token);
        if (req.method === "GET" && url.pathname === "/api/bootstrap")
          return reply(res, { token });
        if (req.method === "GET" && url.pathname === "/api/settings")
          return reply(res, await settings.public());
        if (req.method === "PUT" && url.pathname === "/api/settings")
          return reply(res, await settings.update(await json(req)));
        if (req.method === "POST" && url.pathname === "/api/keys") {
          const b = await json(req);
          if (!isProvider(b.provider))
            throw failure("invalid_provider", "Invalid provider");
          b.remove
            ? await (store.delete?.bind(store) || unavailable)(b.provider)
            : await (store.set?.bind(store) || unavailable)(
                b.provider,
                string(b.key),
              );
          return reply(res, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/terminals") {
          const b = await json(req);
          if (!isAgent(b.agent))
            throw failure("invalid_agent", "Invalid agent");
          const native = await terminals.open({
            agent: b.agent,
            id: typeof b.id === "string" ? b.id : "new",
            cwd: string(b.cwd),
            ...(typeof b.cols === "number" ? { cols: b.cols } : {}),
            ...(typeof b.rows === "number" ? { rows: b.rows } : {}),
          });
          return reply(res, native.summary());
        }
        if (req.method === "GET" && url.pathname === "/api/sessions") {
          const original = await (agents.list?.bind(agents) || unavailable)(
            url.searchParams.has("refresh"),
          );
          const map = new Map(original.map((s) => [s.agent + ":" + s.id, s]));
          for (const n of terminals.sessions.values())
            if (!n.exited)
              map.set(n.agent + ":" + n.id, {
                ...map.get(n.agent + ":" + n.id),
                ...n.summary(),
              });
          const ss = [...map.values()].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          );
          return reply(res, {
            sessions: ss.map((s) => ({
              ...s,
              busy: [...jobs.active.values()].some(
                (x) => x.job.agent === s.agent && x.job.sessionId === s.id,
              ),
            })),
            errors: agents.errors || [],
          });
        }
        if (req.method === "GET" && url.pathname === "/api/history") {
          const agent = url.searchParams.get("agent"),
            id = url.searchParams.get("id");
          if (!isAgent(agent) || !id)
            throw failure("invalid_session", "Invalid session");
          const n = terminals.get(agent, id);
          let messages;
          if (n) {
            const path = n.path || (await terminals.file(agent, id, n.cwd));
            messages = await readHistory(path, agent);
          } else {
            try {
              const info = await (agents.session?.bind(agents) || unavailable)(
                agent,
                id,
              );
              messages = await readHistory(
                await terminals.file(agent, id, info.cwd),
                agent,
              );
            } catch {
              messages = await (agents.history?.bind(agents) || unavailable)(
                agent,
                id,
              );
            }
          }
          return reply(res, { messages });
        }
        if (req.method === "GET" && url.pathname === "/api/jobs") {
          return reply(res, { jobs: [...jobs.jobs.values()].slice(-30) });
        }
        if (req.method === "POST" && url.pathname === "/api/turns") {
          const b = await json(req);
          if (
            !isAgent(b.agent) ||
            typeof b.text !== "string" ||
            !b.text.trim() ||
            b.text.length > 50000 ||
            typeof b.sessionId !== "string" ||
            !/^([0-9a-f-]{36}|new)$/.test(b.sessionId)
          )
            throw failure("invalid_turn", "Invalid session or message");
          const cwd =
            b.sessionId === "new"
              ? b.cwd || homedir()
              : (
                  terminals.get(b.agent, b.sessionId) ||
                  (await (agents.session?.bind(agents) || unavailable)(
                    b.agent,
                    b.sessionId,
                  ))
                ).cwd;
          if (typeof cwd !== "string" || !cwd.startsWith("/"))
            throw failure("invalid_cwd", "Use an absolute project directory");
          return reply(
            res,
            await jobs.start({
              id: string(b.id),
              agent: b.agent,
              sessionId: b.sessionId,
              cwd,
              text: b.text,
              voice: b.voice === true,
            }),
            202,
          );
        }
        const match = url.pathname.match(/^\/api\/jobs\/([\w-]+)(\/cancel)?$/);
        if (match) {
          if (req.method === "POST" && match[2])
            return reply(res, await jobs.cancel(match[1]));
          if (req.method === "GET" && !match[2])
            return reply(res, jobs.get(match[1]));
        }
        if (req.method === "POST" && url.pathname === "/api/approvals") {
          const b = await json(req);
          jobs.answer(string(b.id), b.allow === true);
          return reply(res, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/transcribe") {
          const c = await settings.speech("stt");
          const audio = await body(req, 20 * 1024 * 1024);
          const ac = new AbortController();
          res.on("close", () => ac.abort());
          return reply(
            res,
            await transcribe(
              c,
              await store.get(c.provider),
              audio,
              req.headers["content-type"] || "audio/webm",
              ac.signal,
            ),
          );
        }
        if (
          req.method === "POST" &&
          ["/api/synthesize", "/api/speak"].includes(url.pathname)
        ) {
          const b = await json(req),
            c = previewConfig(await settings.speech("tts"), b.model);
          const speed =
            url.pathname === "/api/speak"
              ? b.speed === undefined
                ? (c.speed ?? 1)
                : playbackSpeed(b.speed)
              : undefined;
          const ac = new AbortController();
          res.on("close", () => ac.abort());
          const r = await synthesize(
            c,
            await store.get(c.provider),
            string(b.text),
            ac.signal,
          );
          if (url.pathname === "/api/speak") {
            await playLocalAudio(r.audio, speed!, exec, ac.signal);
            return reply(res, { ok: true, bytes: r.audio.length });
          }
          res.writeHead(200, {
            "Content-Type": r.mime,
            "Content-Length": r.audio.length,
            "Cache-Control": "no-store",
          });
          return res.end(r.audio);
        }
        if (req.method === "GET" && url.pathname === "/api/router/models") {
          const c = await settings.speech("stt"),
            key = await store.get("9router");
          const base = settings.value.routerUrl
            .replace(/\/$/, "")
            .replace(/\/v1$/, "");
          const u = new URL(base);
          if (
            !["http:", "https:"].includes(u.protocol) ||
            u.username ||
            u.password
          )
            throw failure("invalid_url", "Invalid router URL");
          const values = await Promise.all(
            ["stt", "tts"].map(async (kind) => {
              const r = await fetch(base + "/v1/models/" + kind, {
                headers: key ? { Authorization: "Bearer " + key } : {},
                redirect: "error",
                signal: AbortSignal.timeout(8000),
              });
              if (!r.ok)
                throw failure(
                  "router_error",
                  `9Router returned HTTP ${r.status}`,
                  502,
                );
              return {
                kind,
                models: list(record(await r.json()).data || [], (item) => ({
                  id: string(record(item).id),
                })),
              };
            }),
          );
          return reply(res, values);
        }
        throw failure("not_found", "Endpoint not found", 404);
      }
      if (
        ![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(
          req.headers.host || "",
        )
      )
        throw failure("forbidden", "Invalid host", 403);
      if (req.method !== "GET")
        throw failure("not_allowed", "Method not allowed", 405);
      const vendor: Record<string, string> = {
        "/xterm.js": "@xterm/xterm/lib/xterm.js",
        "/xterm.css": "@xterm/xterm/css/xterm.css",
        "/xterm-fit.js": "@xterm/addon-fit/lib/addon-fit.js",
      };
      if (vendor[url.pathname]) {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
        );
        return res.end(
          await readFile(
            join(root, "..", "node_modules", vendor[url.pathname]),
          ),
        );
      }
      const files: Record<string, string> = {
        "/contracts.js": "contracts.js",
        "/dom.js": "dom.js",
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/voice.js": "voice.js",
        "/deepgram-voices.js": "deepgram-voices.js",
      };
      const name = files[url.pathname];
      if (!name) throw failure("not_found", "Not found", 404);
      const data = await readFile(join(root, "public", name));
      res.setHeader(
        "Content-Type",
        name.endsWith(".html")
          ? "text/html; charset=utf-8"
          : name.endsWith(".css")
            ? "text/css"
            : "text/javascript",
      );
      res.end(data);
    } catch (e) {
      if (res.destroyed) return;
      reply(
        res,
        {
          error: errorMessage(e),
          code: errorCode(e) || "internal_error",
        },
        e instanceof Error && "status" in e && typeof e.status === "number"
          ? e.status
          : 500,
      );
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on("upgrade", (req, socket, head) => {
    try {
      authorize(
        { headers: req.headers, url: "/api/bootstrap" },
        actualPort,
        token,
      );
      if (req.url !== "/terminal") throw Error("Unknown socket");
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
    } catch {
      socket.destroy();
    }
  });
  wss.on("connection", (ws) => {
    let native: TerminalSession | undefined, off: (() => boolean) | undefined;
    const timeout = setTimeout(() => ws.close(), 5000);
    ws.on("message", (raw) => {
      try {
        const m = parseTerminalMessage(JSON.parse(raw.toString()));
        if (!native) {
          if (m.type !== "attach" || m.token !== token)
            throw Error("Unauthorized");
          native = terminals.get(m.agent, m.id);
          if (!native || native.exited) throw Error("Live terminal not found");
          clearTimeout(timeout);
          off = native.subscribe((e) => {
            if (ws.readyState === 1) ws.send(JSON.stringify(e));
          });
          ws.send(JSON.stringify({ type: "attached", ...native.summary() }));
          return;
        }
        if (m.type === "input" && typeof m.data === "string")
          native.input(m.data);
        if (m.type === "resize") native.resize(m.cols, m.rows);
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", error: errorMessage(e) }));
        ws.close();
      }
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      off?.();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing listener address");
  actualPort = address.port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    server,
    jobs,
    settings,
    agents,
    terminals,
    close: async () => {
      for (const { job } of jobs.active.values()) await jobs.cancel(job.id);
      terminals.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      agents.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  createApp()
    .then((app) => {
      console.log("Agentflow listening at " + app.url);
      for (const sig of ["SIGTERM", "SIGINT"])
        process.on(sig, async () => {
          await app.close();
          process.exit(0);
        });
    })
    .catch((e) => {
      console.error(
        e.code === "EADDRINUSE"
          ? "Agentflow port is already in use. Run agentflow status."
          : e.message,
      );
      process.exit(1);
    });
}
