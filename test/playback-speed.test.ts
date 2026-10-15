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

test("local playback preserves WAV extension and keeps MPEG playback unchanged, then deletes audio", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const wav = Buffer.alloc(46);
  wav.write("RIFF");
  wav.writeUInt32LE(38, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(2, 40);
  for (const [bytes, extension] of [
    [wav, ".wav"],
    [Buffer.from("ID3"), ".mp3"],
  ] as const) {
    let path = "";
    await playLocalAudio(bytes, 1.25, async (_executable, args) => {
      path = args.at(-1)!;
      assert.ok(path.endsWith(extension), path);
      assert.deepEqual(await readFile(path), bytes);
    });
    await assert.rejects(() => access(path));
  }
});
