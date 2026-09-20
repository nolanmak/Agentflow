import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("built CLI and browser assets run without TypeScript at runtime", async () => {
  await access("dist/src/cli.js");
  await access("dist/src/server.js");
  await access("dist/public/index.html");
  await access("dist/public/app.js");
  const { stdout } = await promisify(execFile)(process.execPath, [
    "dist/src/cli.js",
  ]);
  assert.match(stdout, /Agentflow/);
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.bin.agentflow, "./dist/src/cli.js");
});
