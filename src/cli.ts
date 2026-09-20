#!/usr/bin/env node
import {
  parseTerminalServerMessage,
  record,
  string,
  errorMessage,
  type TerminalClientMessage,
} from "../public/contracts.js";
import { object } from "./native-protocol.js";
import WebSocket from "ws";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createInterface as lines } from "node:readline";
import { appHome, exec } from "./store.js";
import { service } from "./service.js";
const base = process.env.AGENTFLOW_URL || "http://127.0.0.1:4317";
async function request(path: string, body?: unknown) {
  let token;
  try {
    token = string(
      JSON.parse(await readFile(join(appHome, "auth.json"), "utf8")),
    );
  } catch {
    throw Error("Start Agentflow first: agentflow service install");
  }
  let r;
  try {
    r = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-agentflow-token": token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Error(
      "Agentflow is offline. Run agentflow service install or agentflow start.",
    );
  }
  const data = record(await r.json());
  if (!r.ok) throw Error(string(data.error));
  return data;
}
async function textInput(args: string[]) {
  const at = args.indexOf("--text");
  if (at >= 0) return args.slice(at + 1).join(" ");
  if (!stdin.isTTY) {
    let text = "";
    for await (const c of stdin) text += c;
    return text;
  }
  return args.join(" ");
}
async function terminal(args: string[]) {
  const agent = args[0];
  if (agent !== "codex" && agent !== "claude")
    throw Error("Use agentflow run codex or agentflow run claude");
  const id = args.includes("--resume")
    ? args[args.indexOf("--resume") + 1]
    : "new";
  const session = await request("/terminals", {
    agent,
    id,
    cwd: process.cwd(),
    cols: stdout.columns || 100,
    rows: stdout.rows || 30,
  });
  const token = string(
    JSON.parse(await readFile(join(appHome, "auth.json"), "utf8")),
  );
  console.log(
    `Connected to native ${agent}: ${session.id}. Ctrl+] detaches; the session stays running.\nDashboard: ${base}/#agent=${agent}&session=${session.id}`,
  );
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/terminal");
    const send = (m: TerminalClientMessage) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(m));
    };
    let raw = false;
    const input = (data: Buffer) => {
      if (data.includes(29)) {
        ws.close();
        return;
      }
      send({ type: "input", data: data.toString() });
    };
    const resize = () =>
      send({
        type: "resize",
        cols: stdout.columns || 100,
        rows: stdout.rows || 30,
      });
    const cleanup = () => {
      stdin.off("data", input);
      stdout.off("resize", resize);
      if (raw) stdin.setRawMode(false);
      stdin.pause();
      stdout.write(
        "\x1b[0m\nDetached. Native session is still available in Agentflow.\n",
      );
    };
    ws.on("open", () => {
      send({ type: "attach", token, agent, id: string(session.id) });
      if (stdin.isTTY) {
        stdin.setRawMode(true);
        raw = true;
      }
      stdin.resume();
      stdin.on("data", input);
      stdout.on("resize", resize);
    });
    ws.on("message", (data) => {
      const m = parseTerminalServerMessage(JSON.parse(data.toString()));
      if (m.type === "output") stdout.write(string(m.data));
      if (m.type === "error") {
        console.error(m.error);
        ws.close();
      }
      if (m.type === "exit") {
        console.log("\nNative agent exited.");
        ws.close();
      }
    });
    ws.on("error", reject);
    ws.on("close", () => {
      cleanup();
      resolve();
    });
  });
}

async function mcp() {
  const input = lines({ input: stdin });
  for await (const line of input) {
    let m: Record<string, unknown>;
    try {
      m = record(JSON.parse(line));
    } catch {
      continue;
    }
    if (m.id === undefined) continue;
    const params = object(m.params),
      args = object(params.arguments);
    let result: unknown;
    try {
      if (m.method === "initialize")
        result = {
          protocolVersion: params.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "agentflow", version: "0.1.0" },
        };
      else if (m.method === "tools/list")
        result = {
          tools: [
            {
              name: "speak",
              description:
                "Read text aloud on the user’s Mac when they request a spoken response. No dashboard is needed. Pass the answer text directly; this tool does not change or resume the agent session.",
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string", minLength: 1, maxLength: 12000 },
                },
                required: ["text"],
                additionalProperties: false,
              },
            },
            {
              name: "current_time",
              description:
                "Read the Mac’s current date, time, and IANA timezone. Use for time-sensitive questions; never guess the current time.",
              annotations: { readOnlyHint: true },
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
            {
              name: "session_history",
              description:
                "Read the selected native session’s most recent messages with original timestamps. A bounded history preview, not a replacement for native context.",
              annotations: { readOnlyHint: true },
              inputSchema: {
                type: "object",
                properties: {
                  agent: { enum: ["codex", "claude"] },
                  id: { type: "string" },
                },
                required: ["agent", "id"],
                additionalProperties: false,
              },
            },
          ],
        };
      else if (m.method === "tools/call" && params.name === "speak") {
        const r = await request("/speak", { text: args.text });
        result = {
          content: [
            {
              type: "text",
              text: r.ok
                ? "Speech played on the local Mac."
                : "Playback failed",
            },
          ],
        };
      } else if (m.method === "tools/call" && params.name === "current_time") {
        const now = new Date();
        result = {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                utc: now.toISOString(),
                local: now.toString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            },
          ],
        };
      } else if (
        m.method === "tools/call" &&
        params.name === "session_history"
      ) {
        const { agent, id } = args;
        if (
          (agent !== "codex" && agent !== "claude") ||
          typeof id !== "string" ||
          !/^([0-9a-f-]{36})$/.test(id)
        )
          throw Error("Provide the native agent and session UUID");
        const r = await request("/history?agent=" + agent + "&id=" + id);
        result = { content: [{ type: "text", text: JSON.stringify(r) }] };
      } else if (m.method === "ping") result = {};
      else throw Error("Unknown method");
      stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\n");
    } catch (e) {
      const response =
        m.method === "tools/call"
          ? {
              jsonrpc: "2.0",
              id: m.id,
              result: {
                isError: true,
                content: [{ type: "text", text: errorMessage(e) }],
              },
            }
          : {
              jsonrpc: "2.0",
              id: m.id,
              error: { code: -32603, message: errorMessage(e) },
            };
      stdout.write(JSON.stringify(response) + "\n");
    }
  }
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "service") {
    console.log(await service(args[0] || "status"));
    return;
  }
  if (command === "status") {
    console.log(await service("status"));
    console.log("Dashboard: " + base);
    return;
  }
  if (command === "start") {
    const { createApp } = await import("./server.js");
    const a = await createApp();
    console.log("Agentflow listening at " + a.url);
    process.on("SIGINT", async () => {
      await a.close();
      process.exit(0);
    });
    return;
  }
  if (command === "open") {
    const agent = args[args.indexOf("--agent") + 1],
      id = args[args.indexOf("--session") + 1];
    await exec("/usr/bin/open", [
      base +
        (args.includes("--session")
          ? `/#agent=${encodeURIComponent(agent)}&session=${encodeURIComponent(id)}`
          : ""),
    ]);
    return;
  }
  if (command === "speak") {
    const text = await textInput(args);
    await request("/speak", { text });
    console.log("Spoken.");
    return;
  }
  if (command === "run") {
    await terminal(args);
    return;
  }
  if (command === "mcp") {
    await mcp();
    return;
  }
  console.log(
    'Agentflow\n  start | open | status\n  run codex|claude [--resume ID]\n  speak --text "Hello" (or pipe text through stdin)\n  service install|status|restart|stop|uninstall\n  mcp',
  );
}
main().catch((e) => {
  console.error(errorMessage(e));
  process.exitCode = 1;
});
