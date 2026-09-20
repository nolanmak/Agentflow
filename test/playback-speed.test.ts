import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Settings } from "../src/state.js";
import { playLocalAudio } from "../src/server.js";
import { synthesize, type Fetcher } from "../src/speech.js";
import type { KeyStorage } from "../public/contracts.js";

const store: KeyStorage = { get: async () => "" };

test("TTS playback speed defaults to 1×, persists valid values, and rejects invalid values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "af-playback-speed-"));
  await writeFile(
    join(dir, "settings.json"),
    JSON.stringify({
      stt: { provider: "deepgram", model: "nova-3" },
      tts: { provider: "deepgram", model: "aura-2-helena-en", voice: "" },
      routerUrl: "http://127.0.0.1:20128",
    }),
  );
  const settings = new Settings(store, dir);
  await settings.init();
  assert.equal((await settings.public()).tts.speed, 1);

  await settings.update({
    tts: { provider: "deepgram", model: "voice", speed: 2 },
  });
  assert.equal((await settings.public()).tts.speed, 2);

  for (const speed of [0.5, 1.1, 2.1, Infinity])
    await assert.rejects(
      () =>
        settings.update({
          tts: { provider: "deepgram", model: "voice", speed },
        }),
      /speed/i,
    );
  assert.equal((await settings.public()).tts.speed, 2);
});

test("local speak sends the saved playback speed to afplay without changing synthesis", async () => {
  let command: { executable: string; args: string[] } | undefined;
  await playLocalAudio(Buffer.from([1, 2, 3]), 2, async (executable, args) => {
    command = { executable, args };
  });
  assert.equal(command?.executable, "/usr/bin/afplay");
  assert.deepEqual(command?.args.slice(0, 4), [
    "--rate",
    "2",
    "--rQuality",
    "1",
  ]);

  let request = "";
  const fetcher: Fetcher = async (url) => {
    request = url;
    return new Response(new Uint8Array([1]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  };
  await synthesize(
    { provider: "deepgram", model: "aura-2-helena-en", speed: 2 },
    "fake-key",
    "hello",
    undefined,
    fetcher,
  );
  assert.ok(!request.includes("speed"));
});
