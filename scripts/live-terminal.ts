import type { AgentEvent } from "../public/contracts.js";
import { Agents } from "../src/agents.js";
import { Terminals } from "../src/terminal.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const a = new Agents();
await a.init();
const t = new Terminals(a);
const cwd = await mkdtemp(join(tmpdir(), "agentflow-native-"));
try {
  const s = await t.open({ agent: "codex", cwd });
  let screen = "";
  s.subscribe((e) => {
    if (e.type === "output") screen += e.data;
  });
  await new Promise((r) => setTimeout(r, 3000));
  console.log(
    "native startup:",
    screen.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").slice(-1800),
  );
  if (screen.includes("trust")) {
    s.input("\r");
    await new Promise((r) => setTimeout(r, 1000));
  }
  const events: AgentEvent[] = [];
  await t.run(
    {
      agent: "codex",
      sessionId: s.id,
      cwd,
      text: "Remember violet-otter-951. Reply only remembered. Do not use tools.",
    },
    (e) => events.push(e),
    AbortSignal.timeout(90000),
  );
  console.log(
    "Voice input native reply:",
    events
      .filter((x) => x.type === "text")
      .map((x) => ("text" in x ? x.text : ""))
      .join(""),
  );
  const before = screen.length;
  const outsider = new Terminals(a);
  const second: AgentEvent[] = [];
  await outsider.run(
    {
      agent: "codex",
      sessionId: s.id,
      cwd,
      text: "What token did I tell you? Reply only the token. Do not use tools.",
    },
    (e) => second.push(e),
    AbortSignal.timeout(90000),
  );
  const answer = second
    .filter((e) => e.type === "text")
    .map((e) => ("text" in e ? e.text : ""))
    .join("");
  console.log("External live queue response:", answer);
  if (!answer.includes("violet-otter-951"))
    throw Error("Live queue context failed");
  if (s.exited) throw Error("Native terminal unexpectedly exited");
  console.log("Terminal stayed alive:", !s.exited, "pid", s.pid);
  console.log("Native session:", s.id);
  console.log("History:", (await a.history("codex", s.id)).slice(-2));
} finally {
  t.close();
  a.close();
}
