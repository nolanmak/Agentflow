import { test } from "node:test";
import assert from "node:assert/strict";
import { liveFrame } from "../src/claude-live.js";
test("live Claude input preserves exact words and targets only the selected session", () => {
  const text = "What did we discuss yesterday?";
  const frame = liveFrame("session-123", "operation-123", text);
  assert.equal(frame.session_id, "session-123");
  assert.equal(frame.message.content, text);
  assert.equal(frame.type, "user");
  assert.equal(frame.priority, "next");
  assert.equal(frame.uuid, "operation-123");
  assert.ok(!JSON.stringify(frame).includes("system_prompt"));
});
