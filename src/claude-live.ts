import { record, isAgent, string } from "../public/contracts.js";
interface LiveClaude {
  pid: number;
  sessionId: string;
  cwd: string;
  procStart: string;
  version: string;
  peerProtocol: number;
  messagingSocketPath: string;
}
// Version-gated local inbox bridge for the installed Claude Code peerProtocol=1.
// This is a private CLI protocol, not the Anthropic public API. Fail closed on changes.
import net from "node:net";
import { readFile, readdir, lstat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { exec } from "./store.js";
import { failure } from "./speech.js";
export function liveFrame(
  sessionId: string,
  operationId: string,
  text: string,
) {
  return {
    type: "user",
    session_id: sessionId,
    uuid: operationId,
    msg_id: operationId,
    from: "Agentflow voice",
    priority: "next",
    message: { role: "user", content: text },
  };
}
export async function liveClaudeSession(
  id: string,
): Promise<LiveClaude | null> {
  const dir = join(homedir(), ".claude/sessions");
  for (const name of await readdir(dir).catch(() => [])) {
    if (!/^\d+\.json$/.test(name)) continue;
    const path = join(dir, name);
    const st = await lstat(path);
    if (st.isSymbolicLink() || st.uid !== process.getuid!()) continue;
    let r: LiveClaude;
    try {
      const value = record(JSON.parse(await readFile(path, "utf8")));
      if (
        typeof value.pid !== "number" ||
        typeof value.peerProtocol !== "number"
      )
        continue;
      r = {
        pid: value.pid,
        peerProtocol: value.peerProtocol,
        sessionId: string(value.sessionId),
        cwd: string(value.cwd),
        procStart: string(value.procStart),
        version: string(value.version),
        messagingSocketPath: string(value.messagingSocketPath),
      };
    } catch {
      continue;
    }
    if (r.sessionId === id) {
      try {
        process.kill(r.pid, 0);
      } catch {
        continue;
      }
      return r;
    }
  }
  return null;
}
export async function sendLiveClaude(
  id: string,
  operationId: string,
  text: string,
) {
  const r = await liveClaudeSession(id);
  if (!r)
    throw failure(
      "not_running",
      "Claude Code session is not currently running",
    );
  if (r.peerProtocol !== 1 || !/^2\.1\.(276|278)$/.test(r.version))
    throw failure(
      "unsupported_version",
      "This Claude Code inbox version has not been verified. Use an Agentflow-managed native terminal.",
    );
  const socket = r.messagingSocketPath;
  if (typeof socket !== "string" || !socket.endsWith("/" + r.pid + ".sock"))
    throw failure("unsafe_socket", "Unexpected Claude socket");
  const st = await lstat(socket),
    parent = await lstat(dirname(socket));
  if (
    !st.isSocket() ||
    st.isSymbolicLink() ||
    st.uid !== process.getuid!() ||
    parent.isSymbolicLink() ||
    parent.uid !== process.getuid!()
  )
    throw failure("unsafe_socket", "Claude socket ownership mismatch");
  const { stdout } = await exec(
    "/bin/ps",
    ["-p", String(r.pid), "-o", "lstart="],
    { env: { ...process.env, TZ: "UTC", LC_ALL: "C" } },
  );
  if (stdout.trim() !== r.procStart)
    throw failure("stale_session", "Claude process identity changed");
  const dir = join(homedir(), ".claude/sessions");
  let key;
  for (const name of await readdir(dir)) {
    if (!new RegExp("^" + r.pid + "\\.[0-9a-f]{64}\\.key$").test(name))
      continue;
    const p = join(dir, name),
      s = await lstat(p);
    if (s.isSymbolicLink() || s.uid !== process.getuid!() || s.mode & 0o077)
      continue;
    const entry = record(JSON.parse(await readFile(p, "utf8")));
    if (
      entry.procStart === r.procStart &&
      typeof entry.peerToken === "string" &&
      /^[0-9a-f]{32}$/.test(entry.peerToken)
    )
      key = entry.peerToken;
  }
  if (!key)
    throw failure(
      "missing_inbox_key",
      "Claude inbox authentication is unavailable",
    );
  await new Promise<void>((resolve, reject) => {
    const s = net.createConnection(socket);
    const timer = setTimeout(() => {
      s.destroy();
      reject(Error("Claude inbox connection timed out"));
    }, 5000);
    s.on("connect", () => {
      s.end(
        JSON.stringify({ type: "auth", token: key }) +
          "\n" +
          JSON.stringify(liveFrame(id, operationId, text)) +
          "\n",
      );
    });
    s.on("error", () => {
      clearTimeout(timer);
      reject(Error("Could not connect to the running Claude session"));
    });
    s.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return { deliveredToInbox: true };
}
