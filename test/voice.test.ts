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
test("bounded speech chunks preserve long replies, whitespace and Unicode in order", async () => {
  const voice = await import("../public/voice.js");
  const split = (
    voice as unknown as { speechChunks: (text: string) => string[] }
  ).speechChunks;
  assert.equal(typeof split, "function");
  for (const text of [
    "Hello.",
    "word ".repeat(6000),
    "x".repeat(25000),
    "x".repeat(11999) + "😀" + "tail".repeat(4000),
  ]) {
    const chunks = split(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every((c) => c.length > 0 && c.length <= 12000));
    assert.ok(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c)));
  }
  assert.deepEqual(split(""), []);
  const words = split("word ".repeat(6000));
  assert.ok(words.slice(0, -1).every((c) => /\s$/.test(c)));
});
