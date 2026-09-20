import type { AddressInfo } from "node:net";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
test("MCP exposes speech plus accurate clock and timestamped native history tools", async () => {
  const p = spawn(process.execPath, ["dist/src/cli.js", "mcp"]);
  let out = "";
  p.stdout.on("data", (x) => (out += x));
  p.stdin.end(
    [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "current_time", arguments: {} },
      }),
    ].join("\n") + "\n",
  );
  await new Promise((r, j) => {
    p.on("close", r);
    p.on("error", j);
  });
  const results = out
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    results[0].result.tools.map((x: { name: string }) => x.name),
    ["speak", "current_time", "session_history"],
  );
  const speak = results[0].result.tools.find(
    (tool: { name: string }) => tool.name === "speak",
  );
  assert.deepEqual(
    speak.inputSchema.properties.speed.enum,
    [0.75, 1, 1.25, 1.5, 1.75, 2],
  );
  const now = JSON.parse(results[1].result.content[0].text);
  assert.ok(Math.abs(Date.now() - Date.parse(now.utc)) < 5000);
  assert.ok(now.timezone);
  assert.ok(now.local);
});
test("CLI stdin and MCP speech use the same browser-free endpoint with literal text", async () => {
  const { default: http } = await import("node:http");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "af-cli-"));
  await writeFile(join(dir, "auth.json"), JSON.stringify("fixture-token"));
  const requests: {
    path: string | undefined;
    token: string | string[] | undefined;
    text: string;
    speed?: number;
  }[] = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    requests.push({
      path: req.url,
      token: req.headers["x-agentflow-token"],
      text: JSON.parse(body).text,
      speed: JSON.parse(body).speed,
    });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  async function run(args: string[], input: string) {
    const p = spawn(process.execPath, ["dist/src/cli.js", ...args], {
      env: {
        ...process.env,
        AGENTFLOW_HOME: dir,
        AGENTFLOW_URL:
          "http://127.0.0.1:" + (server.address() as AddressInfo).port,
      },
    });
    let out = "";
    p.stdout.on("data", (x) => (out += x));
    p.stdin.end(input);
    const code = await new Promise((r) => p.on("close", r));
    return { out, code };
  }
  try {
    const text = "Literal $HOME, `code`, $(command), and Unicode: café.\n";
    assert.equal((await run(["speak", "--speed", "2"], text)).code, 0);
    const reply = await run(
      ["mcp"],
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "speak", arguments: { text, speed: 1.5 } },
      }) + "\n",
    );
    assert.equal(reply.code, 0);
    assert.match(JSON.parse(reply.out).result.content[0].text, /played/);
    assert.deepEqual(requests, [
      { path: "/api/speak", token: "fixture-token", text, speed: 2 },
      { path: "/api/speak", token: "fixture-token", text, speed: 1.5 },
    ]);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
test("MCP speech execution failures are tool errors, never false playback success", async () => {
  const p = spawn(process.execPath, ["dist/src/cli.js", "mcp"], {
    env: { ...process.env, AGENTFLOW_HOME: "/nonexistent-agentflow-test-home" },
  });
  let out = "";
  p.stdout.on("data", (x) => (out += x));
  p.stdin.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "speak", arguments: { text: "hello" } },
    }) + "\n",
  );
  await new Promise((r) => p.on("close", r));
  const response = JSON.parse(out);
  assert.equal(response.result?.isError, true);
  assert.match(response.result.content[0].text, /Start Agentflow/);
});
test("MCP rejects an unsupported per-response speech speed before calling the service", async () => {
  const p = spawn(process.execPath, ["dist/src/cli.js", "mcp"], {
    env: { ...process.env, AGENTFLOW_HOME: "/nonexistent-agentflow-test-home" },
  });
  let out = "";
  p.stdout.on("data", (x) => (out += x));
  p.stdin.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "speak", arguments: { text: "hello", speed: 2.1 } },
    }) + "\n",
  );
  await new Promise((r) => p.on("close", r));
  const response = JSON.parse(out);
  assert.equal(response.result?.isError, true);
  assert.match(response.result.content[0].text, /speed/i);
});
