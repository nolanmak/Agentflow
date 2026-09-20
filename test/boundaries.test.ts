import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "../public/contracts.js";

test("external job and terminal payloads are validated before reaching application state", () => {
  // Exercise the runtime export boundary so the red stage fails behaviorally.
  const exports: Record<string, unknown> = contracts;
  assert.equal(typeof exports.parseJob, "function", "A job decoder must exist");
  assert.equal(
    typeof exports.parseTerminalServerMessage,
    "function",
    "A terminal decoder must exist",
  );
  const job = exports.parseJob as (value: unknown) => unknown;
  const terminal = exports.parseTerminalServerMessage as (
    value: unknown,
  ) => unknown;
  assert.throws(() => job({ status: "invented" }));
  assert.throws(() => terminal({ type: "output", data: 17 }));
  assert.throws(() => terminal({ type: "session", id: null }));
  assert.deepEqual(terminal({ type: "output", data: "  exact\ntext  " }), {
    type: "output",
    data: "  exact\ntext  ",
  });
});
test("persisted job decoder preserves identity, timestamps, literal text and rejects unknown status", () => {
  const exports: Record<string, unknown> = contracts;
  assert.equal(typeof exports.parseJob, "function", "A job decoder must exist");
  const decode = exports.parseJob as (value: unknown) => unknown;
  const input = {
    id: "request",
    agent: "codex",
    sessionId: "native",
    requestSessionId: "original",
    cwd: "/tmp",
    text: "  unchanged\n",
    voice: false,
    status: "complete",
    reply: "answer",
    events: [{ type: "text", text: "answer" }],
    createdAt: "2026-09-19T00:00:00Z",
  };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, status: "invented" }));
  assert.throws(() =>
    decode({ ...input, events: [{ type: "text", text: 2 }] }),
  );
});
