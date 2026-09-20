import { copyFile, chmod, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir(resolve("dist/public"), { recursive: true });
for (const name of ["index.html", "style.css"])
  await copyFile(resolve("public", name), resolve("dist/public", name));
await chmod(resolve("dist/src/cli.js"), 0o755);
