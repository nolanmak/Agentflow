import { errorCode } from "../public/contracts.js";
import type { Provider } from "../public/contracts.js";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const exec = promisify(execFile);
export const appHome =
  process.env.AGENTFLOW_HOME || join(homedir(), ".config", "agentflow");
export async function save(file: string, value: unknown) {
  await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}
export async function load(file: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (errorCode(e) === "ENOENT") return fallback;
    throw e;
  }
}
const envNames = {
  deepgram: "DEEPGRAM_API_KEY",
  openai: "OPENAI_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  "9router": "NINEROUTER_KEY",
};
export class KeyStore {
  cache: Map<Provider, string>;
  constructor() {
    this.cache = new Map<Provider, string>();
  }
  async get(provider: Provider) {
    if (this.cache.has(provider)) return this.cache.get(provider)!;
    let value = "";
    try {
      value = (
        await exec("/usr/bin/security", [
          "find-generic-password",
          "-s",
          "com.agentflow.speech",
          "-a",
          provider,
          "-w",
        ])
      ).stdout.trim();
    } catch {}
    value ||= process.env[envNames[provider]] || "";
    this.cache.set(provider, value);
    return value;
  }
  async set(provider: Provider, key: string) {
    if (
      !envNames[provider] ||
      typeof key !== "string" ||
      !key.trim() ||
      /[\r\n\0]/.test(key)
    )
      throw Error("Invalid provider key");
    const quote = (s: string) =>
      '"' + s.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
    await new Promise<void>((resolve, reject) => {
      const p = spawn("/usr/bin/security", ["-i"], {
        stdio: ["pipe", "ignore", "pipe"],
      });
      let err = "";
      p.stderr.on("data", (x) => (err += x));
      p.on("error", () => reject(Error("Keychain unavailable")));
      p.on("close", (code) =>
        code || /SecKeychain.*(error|denied)/i.test(err)
          ? reject(Error("Could not save key to macOS Keychain"))
          : resolve(),
      );
      p.stdin.end(
        `add-generic-password -U -s com.agentflow.speech -a ${quote(provider)} -w ${quote(key.trim())}\n`,
      );
    });
    this.cache.set(provider, key.trim());
  }
  async delete(provider: Provider) {
    try {
      await exec("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        "com.agentflow.speech",
        "-a",
        provider,
      ]);
    } catch {}
    this.cache.set(provider, "");
  }
}
