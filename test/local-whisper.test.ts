import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Settings } from "../src/state.js";
import { transcribe, synthesize } from "../src/speech.js";
import type { SpeechConfig } from "../public/contracts.js";
const local = {
  provider: "local-whisper",
  model: "base.en",
  baseUrl: "http://127.0.0.1:17864",
} as unknown as SpeechConfig;
function wav() {
  const b = Buffer.alloc(44 + 3200);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(3200, 40);
  for (let i = 44; i < b.length; i += 2) b.writeInt16LE(1000, i);
  return b;
}
test("local STT persists independently without consulting its Keychain", async () => {
  const dir = await mkdtemp(join(tmpdir(), "af-local-"));
  try {
    const store = {
      get: async (p: string) => {
        assert.notEqual(p, "local-whisper");
        return "";
      },
    };
    const s = new Settings(store, dir);
    const tts = structuredClone(s.value.tts);
    await s.update({ stt: local });
    const reloaded = new Settings(store, dir);
    await reloaded.init();
    assert.deepEqual(await reloaded.speech("stt"), { ...local, voice: "" });
    assert.deepEqual(reloaded.value.tts, tts);
    assert.equal(
      (await reloaded.public()).configured[
        "local-whisper" as keyof Awaited<
          ReturnType<Settings["public"]>
        >["configured"]
      ],
      true,
    );
    await assert.rejects(() => s.update({ tts: local }), /transcription/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("local Whisper posts normalized WAV to inference without credentials or redirects", async () => {
  const result = await transcribe(
    local,
    "DO_NOT_SEND",
    wav(),
    "audio/wav",
    undefined,
    async (url, options) => {
      assert.equal(url, local.baseUrl + "/inference");
      assert.equal(options.redirect, "error");
      assert.equal(new Headers(options.headers).get("Authorization"), null);
      assert.ok(options.body instanceof FormData);
      const f = options.body.get("file") as File;
      assert.equal(f.type, "audio/wav");
      assert.equal(
        Buffer.from(await f.arrayBuffer()).toString("ascii", 0, 4),
        "RIFF",
      );
      assert.equal(options.body.get("response_format"), "json");
      return Response.json({ text: "  hello locally  " });
    },
  );
  assert.equal(result.text, "hello locally");
});
test("local endpoint rejects remote hosts, credentials, paths and queries before transport", async () => {
  for (const baseUrl of [
    "https://example.com",
    "http://localhost.evil",
    "http://a:b@127.0.0.1",
    "http://127.0.0.1/path",
    "http://127.0.0.1?key=secret",
  ])
    await assert.rejects(
      () => transcribe({ ...local, baseUrl }, "", wav(), "audio/wav"),
      /loopback/i,
    );
});
test("local Whisper cannot be used for speech output", async () => {
  await assert.rejects(() => synthesize(local, "", "hello"), /transcription/i);
});
test("silence bypasses inference, broken recordings fail recoverably, and canceled work never returns text", async () => {
  const silent = wav();
  silent.fill(0, 44);
  let requests = 0;
  const fetcher = async () => {
    requests++;
    return Response.json({ text: "hallucination" });
  };
  assert.equal(
    (await transcribe(local, "", silent, "audio/wav", undefined, fetcher)).text,
    "",
  );
  assert.equal(requests, 0);
  await assert.rejects(
    () =>
      transcribe(
        local,
        "",
        Buffer.from("broken"),
        "audio/webm",
        undefined,
        fetcher,
      ),
    /decode recording/i,
  );
  assert.equal(requests, 0);
  const c = new AbortController();
  await assert.rejects(() =>
    transcribe(local, "", wav(), "audio/wav", c.signal, async () => {
      c.abort();
      return Response.json({ text: "late" });
    }),
  );
});
test("local response is bounded and canceling during response cannot yield a transcript", async () => {
  await assert.rejects(
    () =>
      transcribe(local, "", wav(), "audio/wav", undefined, async () =>
        Response.json({ text: "x".repeat(70000) }),
      ),
    /too large/i,
  );
});
test("real local HTTP transport sends WAV without secrets and refuses redirects", async () => {
  const { createServer } = await import("node:http");
  let count = 0;
  const server = createServer(async (req, res) => {
    count++;
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.url, "/inference");
    let bytes = 0;
    for await (const chunk of req) bytes += chunk.length;
    assert.ok(bytes > 3200);
    res.writeHead(302, { location: "http://127.0.0.1:1/forbidden" });
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(
      () =>
        transcribe(
          { ...local, baseUrl: `http://127.0.0.1:${address.port}` },
          "SECRET",
          wav(),
          "audio/wav",
        ),
      /unreachable|HTTP 302/,
    );
    assert.equal(count, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("local production transport bypasses global fetch proxy configuration", async () => {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    for await (const chunk of req) {
    }
    res.setHeader("content-type", "application/json");
    res.end('{"text":"direct local"}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw Error("global proxy must not see recording");
    };
    assert.equal(
      (
        await transcribe(
          { ...local, baseUrl: `http://127.0.0.1:${a.port}` },
          "",
          wav(),
          "audio/wav",
        )
      ).text,
      "direct local",
    );
  } finally {
    globalThis.fetch = saved;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("HTTP transcription uses captured local selection even after settings change without reading a key", async () => {
  const { createApp } = await import("../src/server.js");
  const dir = await mkdtemp(join(tmpdir(), "af-snapshot-"));
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
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    const silent = wav();
    silent.fill(0, 44);
    const r = await fetch(app.url + "/api/transcribe", {
      method: "POST",
      headers: {
        "x-agentflow-token": token,
        "content-type": "audio/wav",
        "x-agentflow-stt": JSON.stringify({
          stt: local,
          routerUrl: "http://127.0.0.1:20128",
        }),
      },
      body: silent,
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: "" });
    assert.equal(reads, 0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("empty HTTP statuses become recoverable transcript errors instead of crashing the service", async () => {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    for await (const chunk of req) {
    }
    res.writeHead(204);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    await assert.rejects(
      () =>
        transcribe(
          { ...local, baseUrl: `http://127.0.0.1:${a.port}` },
          "",
          wav(),
          "audio/wav",
        ),
      /no transcript/,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
