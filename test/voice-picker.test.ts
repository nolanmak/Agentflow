import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, previewConfig } from "../src/speech.js";
test("Helena is the new Deepgram default; preview does not mutate saved settings", () => {
  assert.equal(defaults.deepgram.tts, "aura-2-helena-en");
  const saved = {
    provider: "deepgram" as const,
    model: "aura-2-pandora-en",
    voice: "",
  };
  const preview = previewConfig(saved, "aura-2-hera-en");
  assert.equal(preview.model, "aura-2-hera-en");
  assert.equal(saved.model, "aura-2-pandora-en");
  assert.deepEqual(previewConfig(saved, undefined), saved);
});
test("preview accepts catalog voices only and cannot override another provider", () => {
  for (const model of ["unknown", "aura-2-helena-en&key=bad", {}, null])
    assert.throws(() =>
      previewConfig({ provider: "deepgram", model: "saved" }, model),
    );
  assert.throws(() =>
    previewConfig({ provider: "openai", model: "saved" }, "aura-2-helena-en"),
  );
});
