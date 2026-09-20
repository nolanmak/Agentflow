import type { KeyStorage, TerminalServerMessage } from "../public/contracts.js";
import type { AppAgents } from "../src/server.js";
import type WebSocketType from "ws";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.js";
test("real HTTP boundary protects session data and persists settings without leaking keys", async () => {
  const keys = new Map<string, string>();
  const store: KeyStorage = {
    get: async (p) => keys.get(p) || "",
    set: async (p, k) => {
      keys.set(p, k);
    },
    delete: async (p) => {
      keys.delete(p);
    },
  };
  const agents: AppAgents = {
    init: async () => {},
    list: async () => [
      {
        agent: "codex",
        id: "test-session",
        cwd: "/tmp",
        title: "Test session",
        updatedAt: 0,
      },
    ],
    errors: [],
    close() {},
    run: async (job, emit) => emit({ type: "text", text: "hello" }),
  };
  const app = await createApp({
    port: 0,
    dir: await mkdtemp(join(tmpdir(), "af-server-")),
    store,
    agents,
  });
  const base = app.url;
  try {
    let r = await fetch(base + "/api/sessions");
    assert.equal(r.status, 401);
    r = await fetch(base + "/api/bootstrap", {
      headers: { Origin: "https://bad.test" },
    });
    assert.equal(r.status, 403);
    const { token } = await (await fetch(base + "/api/bootstrap")).json();
    const headers = {
      "x-agentflow-token": token,
      "Content-Type": "application/json",
    };
    r = await fetch(base + "/api/keys", {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "deepgram", key: "DO_NOT_LEAK" }),
    });
    assert.equal(r.status, 200);
    const settings = await (
      await fetch(base + "/api/settings", { headers })
    ).text();
    assert.ok(!settings.includes("DO_NOT_LEAK"));
    assert.equal(JSON.parse(settings).configured.deepgram, true);
    assert.equal(
      (await (await fetch(base + "/api/sessions", { headers })).json())
        .sessions[0].id,
      "test-session",
    );
  } finally {
    await app.close();
  }
});
test("voice transport preserves user text byte for byte", async () => {
  let received;
  const agents: AppAgents = {
    init: async () => {},
    list: async () => [],
    errors: [],
    close() {},
    run: async (job) => {
      received = job.text;
    },
  };
  const app = await createApp({
    port: 0,
    dir: await mkdtemp(join(tmpdir(), "af-exact-")),
    store: { get: async () => "" },
    agents,
  });
  try {
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    const text = "  Yesterday?\nExactly this.  ";
    const r = await fetch(app.url + "/api/turns", {
      method: "POST",
      headers: {
        "x-agentflow-token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "exact-text",
        agent: "codex",
        sessionId: "new",
        cwd: "/tmp",
        text,
      }),
    });
    assert.equal(r.status, 202);
    assert.equal(received, text);
  } finally {
    await app.close();
  }
});
test("authenticated terminal websocket shares output and input without replacing the process", async () => {
  const { default: WebSocket } = await import("ws");
  const { TerminalSession } = await import("../src/terminal.js");
  let output: (data: string) => void = () => {
    throw Error("No subscriber");
  };
  const writes: string[] = [];
  const agents: AppAgents = { init: async () => {}, close() {} };
  const app = await createApp({
    port: 0,
    dir: await mkdtemp(join(tmpdir(), "af-ws-")),
    store: { get: async () => "" },
    agents,
  });
  const session = new TerminalSession(
    { agent: "codex", id: "fixture", cwd: "/tmp" },
    {
      pid: 123,
      onData: (f) => (output = f),
      onExit() {},
      write: (s) => writes.push(s),
      resize() {},
      kill() {},
    },
  );
  app.terminals.sessions.set("codex:fixture", session);
  let ws: WebSocketType | undefined;
  try {
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    ws = new WebSocket(app.url.replace("http", "ws") + "/terminal");
    const events: TerminalServerMessage[] = [];
    ws.on("message", (x) => events.push(JSON.parse(x.toString())));
    await new Promise((r, j) => {
      ws!.on("open", r);
      ws!.on("error", j);
    });
    ws.send(
      JSON.stringify({ type: "attach", token, agent: "codex", id: "fixture" }),
    );
    for (let i = 0; i < 50 && !events.some((x) => x.type === "attached"); i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(events.some((x) => x.type === "attached"));
    output("native reply");
    ws.send(JSON.stringify({ type: "input", data: "typed input\r" }));
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(
      events.some((x) => x.type === "output" && x.data === "native reply"),
    );
    assert.ok(writes.includes("typed input\r"));
    assert.equal(session.pid, 123);
  } finally {
    ws?.close();
    await app.close();
  }
});
test("invalid voice preview is rejected before fetching a key or calling a provider", async () => {
  let keyReads = 0;
  const app = await createApp({
    port: 0,
    dir: await mkdtemp(join(tmpdir(), "af-preview-")),
    store: {
      get: async () => {
        keyReads++;
        return "FAKE";
      },
    },
    agents: { init: async () => {}, close() {} },
  });
  try {
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    const r = await fetch(app.url + "/api/synthesize", {
      method: "POST",
      headers: {
        "x-agentflow-token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Hello", model: "invalid-model" }),
    });
    assert.equal(r.status, 400);
    assert.equal(keyReads, 0);
    assert.equal((await r.json()).code, "invalid_preview");
  } finally {
    await app.close();
  }
});
test("invalid local playback speed is rejected before fetching a key or calling a provider", async () => {
  let keyReads = 0;
  const app = await createApp({
    port: 0,
    dir: await mkdtemp(join(tmpdir(), "af-speed-")),
    store: {
      get: async () => {
        keyReads++;
        return "FAKE";
      },
    },
    agents: { init: async () => {}, close() {} },
  });
  try {
    const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
    const r = await fetch(app.url + "/api/speak", {
      method: "POST",
      headers: {
        "x-agentflow-token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Hello", speed: 2.1 }),
    });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /speed/i);
    assert.equal(keyReads, 0);
  } finally {
    await app.close();
  }
});
