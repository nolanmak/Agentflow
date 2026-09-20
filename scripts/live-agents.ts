import { isAgent } from "../public/contracts.js";
import { Agents } from "../src/agents.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const a = new Agents();
await a.init();
const agent = process.argv[2] || "codex";
if (!isAgent(agent)) throw Error("Invalid agent");
const cwd = await mkdtemp(join(tmpdir(), "agentflow-continuity-"));
const signal = AbortSignal.timeout(180000);
let id = "new";
try {
  for (const [n, text] of [
    "Remember exactly this token for this conversation: amber-seahorse-731. Reply only: remembered. Do not use tools.",
    "What token did I tell you? Also remember cobalt-finch-842. Answer briefly, without tools.",
    "What are both tokens? Reply with only those tokens. Do not use tools.",
  ].entries()) {
    let reply = "";
    let actual;
    await a.run(
      { agent, sessionId: id, cwd, text, voice: false },
      (e) => {
        if (e.type === "session") actual = e.id;
        if (e.type === "text") reply += e.text;
      },
      signal,
      async () => false,
    );
    if (!actual) throw Error("Missing native session ID");
    if (id !== "new" && actual !== id) throw Error("Session forked");
    id = actual;
    console.log(
      agent,
      "turn",
      n + 1,
      "same native session:",
      id,
      "reply:",
      reply.trim(),
    );
    if (
      n === 2 &&
      (!reply.includes("amber-seahorse-731") ||
        !reply.includes("cobalt-finch-842"))
    )
      throw Error("Context round trip failed");
  }
  console.log(
    "PASS: three turns preserved native session ID and both memory tokens.",
  );
} finally {
  a.close();
}
