import { test } from "node:test";
import assert from "node:assert/strict";
import { sentences, VoiceGate } from "../public/voice.js";
test("speech chunks preserve order and retain incomplete sentences", () => {
  assert.deepEqual(sentences("Hello there. Working on it! unfinished"), {
    ready: ["Hello there.", "Working on it!"],
    rest: " unfinished",
  });
  assert.deepEqual(sentences("hello", true), { ready: ["hello"], rest: "" });
});
test("voice gate submits speech after silence, never silence alone", () => {
  const gate = new VoiceGate();
  assert.equal(gate.sample(0, 0), false);
  assert.equal(gate.sample(0, 5000), false);
  gate.sample(0.1, 5100);
  gate.sample(0.1, 5500);
  assert.equal(gate.sample(0, 5800), false);
  assert.equal(gate.sample(0, 6600), true);
});
