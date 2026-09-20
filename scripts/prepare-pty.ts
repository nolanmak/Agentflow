// node-pty's published macOS helper may lose its executable bit on installation.
import { chmod, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
if (process.platform === "darwin") {
  const helper = join(
    dirname(createRequire(import.meta.url).resolve("node-pty/package.json")),
    `prebuilds/darwin-${process.arch}/spawn-helper`,
  );
  try {
    const s = await stat(helper);
    await chmod(helper, s.mode | 0o100);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
  }
}
