import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Settings } from "../src/state.js";
import { synthesize, transcribe } from "../src/speech.js";
import { parseSettings, type SpeechConfig } from "../public/contracts.js";
const local = {
  provider: "local-kokoro",
  model: "kokoro",
  voice: "af_heart",
  baseUrl: "http://127.0.0.1:17865",
} as unknown as SpeechConfig;
function wav() {
  const b = Buffer.alloc(46);
  b.write("RIFF");
  b.writeUInt32LE(38, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(2, 40);
  return b;
}
test("local Kokoro persists independently and requires no credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "af-kokoro-"));
  try {
    const store = {
      get: async (p: string) => {
        assert.ok(!p.startsWith("local-"));
        return "";
      },
    };
    const s = new Settings(store, dir);
    const stt = structuredClone(s.value.stt);
    await s.update({ tts: { ...local, speed: 1.5 } });
    const restored = new Settings(store, dir);
    await restored.init();
    assert.deepEqual(await restored.speech("tts"), { ...local, speed: 1.5 });
    assert.deepEqual(restored.value.stt, stt);
    await assert.rejects(() => s.update({ stt: local }), /speech output only/i);
    assert.throws(
      () => parseSettings({ ...s.value, stt: local }),
      /speech output only/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("local Kokoro sends WAV request without credentials or synthesis speed", async () => {
  const result = await synthesize(
    { ...local, speed: 1.5 },
    "DO_NOT_SEND",
    "Hello.",
    undefined,
    async (url, options) => {
      assert.equal(url, local.baseUrl + "/v1/audio/speech");
      assert.equal(new Headers(options.headers).get("authorization"), null);
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(String(options.body)), {
        model: "kokoro",
        input: "Hello.",
        voice: "af_heart",
        response_format: "wav",
      });
      return new Response(wav(), { headers: { "content-type": "audio/wav" } });
    },
  );
  assert.equal(result.mime, "audio/wav");
  assert.deepEqual(result.audio, wav());
});
test("local Kokoro rejects remote endpoints and STT before transport", async () => {
  for (const baseUrl of [
    "https://example.com",
    "http://localhost.evil",
    "http://x:y@127.0.0.1",
    "http://127.0.0.1/path",
    "http://127.0.0.1?key=x",
  ])
    await assert.rejects(
      () => synthesize({ ...local, baseUrl }, "", "hello"),
      /loopback/i,
    );
  await assert.rejects(
    () => transcribe(local, "", Buffer.from("audio")),
    /speech output only/i,
  );
});
test("local Kokoro rejects malformed WAV and canceled late audio", async () => {
  for (const bytes of [Buffer.from("not audio"), wav().subarray(0, 44)]) {
    await assert.rejects(
      () =>
        synthesize(
          local,
          "",
          "hello",
          undefined,
          async () =>
            new Response(bytes, { headers: { "content-type": "audio/wav" } }),
        ),
      /invalid WAV/i,
    );
  }
  const c = new AbortController();
  await assert.rejects(() =>
    synthesize(local, "", "hello", c.signal, async () => {
      c.abort();
      return new Response(wav(), { headers: { "content-type": "audio/wav" } });
    }),
  );
});
test("local Kokoro bounds output and normalizes runtime failure without response text", async () => {
  await assert.rejects(
    () =>
      synthesize(
        local,
        "",
        "hello",
        undefined,
        async () =>
          new Response(Buffer.alloc(24 * 1024 * 1024 + 1), {
            headers: { "content-type": "audio/wav" },
          }),
      ),
    /exceeded 24 MB/,
  );
  await assert.rejects(
    () =>
      synthesize(
        local,
        "",
        "hello",
        undefined,
        async () => new Response("private model path", { status: 503 }),
      ),
    (e) => {
      assert.ok(e instanceof Error);
      assert.doesNotMatch(e.message, /private model path/);
      return true;
    },
  );
});
test("real local Kokoro transport bypasses global fetch and refuses redirects", async () => {
  const { createServer } = await import("node:http");
  let count = 0;
  const server = createServer(async (req, res) => {
    count++;
    assert.equal(req.url, "/v1/audio/speech");
    assert.equal(req.headers.authorization, undefined);
    for await (const chunk of req) {
    }
    if (count === 1) {
      res.setHeader("content-type", "audio/wav");
      res.end(wav());
    } else {
      res.writeHead(302, { location: "http://127.0.0.1:1/forbidden" });
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw Error("proxy must not receive speech");
    };
    const config = { ...local, baseUrl: `http://127.0.0.1:${a.port}` };
    assert.deepEqual(
      (await synthesize(config, "SECRET", "hello")).audio,
      wav(),
    );
    await assert.rejects(() => synthesize(config, "", "hello"), /HTTP 302/);
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = saved;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("HTTP synthesis uses local Kokoro without any key lookup", async () => {
  const { createServer } = await import("node:http");
  const { createApp } = await import("../src/server.js");
  const engine = createServer(async (req, res) => {
    for await (const chunk of req) {
    }
    res.setHeader("content-type", "audio/wav");
    res.end(wav());
  });
  await new Promise<void>((r) => engine.listen(0, "127.0.0.1", r));
  const a = engine.address();
  assert.ok(a && typeof a !== "string");
  const dir = await mkdtemp(join(tmpdir(), "af-kokoro-http-"));
  let reads = 0;
  const app = await createApp({
    port: 0,
    dir,
    store: {
      get: async () => {
        reads++;
        throw Error("no key lookup");
      },
    },
    agents: { init: async () => {}, close() {} },
  });
  try {
    app.settings.value.tts = {
      ...local,
      baseUrl: `http://127.0.0.1:${a.port}`,
    };
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    const r = await fetch(app.url + "/api/synthesize", {
      method: "POST",
      headers: {
        "x-agentflow-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "Hello locally." }),
    });
    assert.equal(r.status, 200);
    assert.equal(reads, 0);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), wav());
  } finally {
    await app.close();
    await new Promise<void>((r) => engine.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("canceling a stalled real local audio response closes transport and permits a new request", async () => {
  const { createServer } = await import("node:http");
  let first = true;
  let closed!: () => void;
  const disconnected = new Promise<void>((r) => {
    closed = r;
  });
  let started!: () => void;
  const headersSent = new Promise<void>((r) => {
    started = r;
  });
  const engine = createServer(async (req, res) => {
    for await (const chunk of req) {
    }
    res.setHeader("content-type", "audio/wav");
    if (first) {
      first = false;
      res.write(wav().subarray(0, 20));
      res.on("close", closed);
      started();
    } else res.end(wav());
  });
  await new Promise<void>((r) => engine.listen(0, "127.0.0.1", r));
  const address = engine.address();
  assert.ok(address && typeof address !== "string");
  const config = { ...local, baseUrl: `http://127.0.0.1:${address.port}` };
  try {
    const controller = new AbortController();
    const pending = synthesize(config, "", "hello", controller.signal);
    const rejection = assert.rejects(pending);
    await headersSent;
    controller.abort();
    await rejection;
    await disconnected;
    assert.deepEqual((await synthesize(config, "", "next")).audio, wav());
  } finally {
    engine.closeAllConnections();
    await new Promise<void>((r) => engine.close(() => r()));
  }
});
