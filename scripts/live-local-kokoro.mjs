import { createApp } from "../dist/src/server.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
const dir = await mkdtemp("/tmp/agentflow-kokoro-app-");
await writeFile(
  dir + "/settings.json",
  JSON.stringify({
    stt: { provider: "local-whisper", model: "base.en" },
    tts: {
      provider: "local-kokoro",
      model: "kokoro",
      voice: "af_heart",
      speed: 1.25,
    },
    routerUrl: "http://127.0.0.1:20128",
  }),
);
const app = await createApp({
  dir,
  port: 0,
  store: {
    get: async () => {
      throw Error("No keys allowed");
    },
  },
  agents: { init: async () => {}, close() {} },
});
async function cli(args, input) {
  const p = spawn(process.execPath, ["dist/src/cli.js", ...args], {
    env: { ...process.env, AGENTFLOW_HOME: dir, AGENTFLOW_URL: app.url },
  });
  let out = "",
    err = "";
  p.stdout.on("data", (b) => (out += b));
  p.stderr.on("data", (b) => (err += b));
  p.stdin.end(input);
  const code = await new Promise((r) => p.on("close", r));
  if (code) throw Error(err);
  return out;
}
try {
  const { token } = await (await fetch(app.url + "/api/bootstrap")).json();
  const r = await fetch(app.url + "/api/synthesize", {
    method: "POST",
    headers: { "x-agentflow-token": token, "content-type": "application/json" },
    body: JSON.stringify({ text: "Local speech is ready." }),
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  if (r.status !== 200 || bytes.toString("ascii", 0, 4) !== "RIFF")
    throw Error("Invalid synthesis " + r.status);
  console.log(JSON.stringify({ synthesize: r.status, bytes: bytes.length }));
  if (process.argv.includes("--play")) {
    console.log(await cli(["speak", "--text", "Local voice test."], ""));
    console.log(
      await cli(
        ["mcp"],
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "speak", arguments: { text: "Local tool test." } },
        }) + "\n",
      ),
    );
  }
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
