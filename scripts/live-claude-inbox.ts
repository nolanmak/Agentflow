import { Agents } from "../src/agents.js";
import { Terminals } from "../src/terminal.js";
import { sendLiveClaude, liveClaudeSession } from "../src/claude-live.js";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const a = new Agents();
await a.init();
const t = new Terminals(a);
const cwd = await realpath(
  await mkdtemp(join(tmpdir(), "agentflow-claude-inbox-")),
);
try {
  const s = await t.open({ agent: "claude", cwd });
  let screen = "";
  s.subscribe((e) => {
    if (e.type === "output") screen += e.data;
  });
  await new Promise((r) => setTimeout(r, 3500));
  console.log(
    "Native Claude startup:",
    screen.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").slice(-1200),
  );
  if (/trust|Yes, I trust/i.test(screen)) {
    s.input("\x1b[B");
    await new Promise((r) => setTimeout(r, 100));
    s.input("\r");
    await new Promise((r) => setTimeout(r, 2000));
  }
  const live = await liveClaudeSession(s.id);
  console.log("Registered native session:", !!live);
  const id = randomUUID(),
    text = "Agentflow live-sync test. Reply only hello. Do not use tools.";
  await sendLiveClaude(s.id, id, text);
  const path = await t.file("claude", s.id, cwd);
  let found = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const content = await readFile(path, "utf8");
      if (content.includes(id) || content.includes(text)) {
        found = true;
        console.log(
          "Inbox message appeared in the same native session history.",
        );
        break;
      }
    } catch {}
  }
  if (!found) throw Error("No persisted inbox receipt");
  console.log("Native process remained alive:", !s.exited, "pid", s.pid);
  console.log("Quota response visible:", /weekly limit/i.test(screen));
} finally {
  t.close();
  a.close();
}
