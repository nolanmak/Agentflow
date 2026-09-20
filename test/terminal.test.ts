import type { NativeTerminal } from "../src/terminal.js";
import type { TerminalEvent } from "../public/contracts.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalSession } from "../src/terminal.js";
test("terminal and dashboard share one native process; voice text is unchanged", () => {
  let callback: (data: string) => void = () => {
    throw Error("Not subscribed");
  };
  const writes: string[] = [];
  const native: NativeTerminal = {
    pid: 123,
    onData: (f) => (callback = f),
    onExit: () => {},
    write: (x) => writes.push(x),
    resize: () => {},
    kill: () => {},
  };
  const session = new TerminalSession(
    { agent: "codex", id: "one", cwd: "/tmp" },
    native,
  );
  const terminal: TerminalEvent[] = [],
    browser: TerminalEvent[] = [];
  session.subscribe((x) => terminal.push(x));
  session.subscribe((x) => browser.push(x));
  session.input("typed command\r");
  session.voice("What happened yesterday?");
  callback("native response");
  assert.deepEqual(terminal, browser);
  assert.ok(writes.includes("typed command\r"));
  assert.ok(writes.includes("\x1b[200~What happened yesterday?\x1b[201~"));
  assert.equal(session.pid, 123);
  assert.ok(!writes.join("").includes("Voice conversation"));
});
test("disconnecting one view does not terminate the native session", () => {
  let killed = false;
  const native: NativeTerminal = {
    pid: 1,
    onData: () => {},
    onExit: () => {},
    write: () => {},
    resize: () => {},
    kill: () => (killed = true),
  };
  const session = new TerminalSession(
    { agent: "claude", id: "one", cwd: "/tmp" },
    native,
  );
  const off = session.subscribe(() => {});
  off();
  assert.equal(killed, false);
});
