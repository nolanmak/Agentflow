import { nativeLog, contentText } from "./native-protocol.js";
import type { NativeLog } from "./native-protocol.js";
import { errorCode } from "../public/contracts.js";
import type { AgentKind, HistoryMessage } from "../public/contracts.js";
import { open } from "node:fs/promises";
export async function readHistory(
  path: string,
  agent: AgentKind,
): Promise<HistoryMessage[]> {
  let f;
  try {
    f = await open(path, "r");
    const stat = await f.stat(),
      size = Math.min(stat.size, 1024 * 1024),
      buffer = Buffer.alloc(size);
    await f.read(buffer, 0, size, stat.size - size);
    const lines = buffer.toString("utf8").split("\n");
    if (stat.size > size) lines.shift();
    const messages: HistoryMessage[] = [];
    for (const line of lines) {
      let m: NativeLog;
      try {
        m = nativeLog(JSON.parse(line));
      } catch {
        continue;
      }
      if (
        agent === "codex" &&
        m.type === "response_item" &&
        m.payload?.type === "message" &&
        (m.payload.role === "user" || m.payload.role === "assistant")
      ) {
        const text = (m.payload.content || [])
          .filter((x) =>
            ["input_text", "output_text", "text"].includes(x.type || ""),
          )
          .map((x) => x.text)
          .join("\n");
        if (text)
          messages.push({
            role: m.payload.role,
            text,
            timestamp: m.timestamp,
            id: String(m.ordinal ?? m.timestamp),
          });
      } else if (
        agent === "claude" &&
        (m.type === "user" || m.type === "assistant")
      ) {
        const c = m.message?.content;
        const text =
          typeof c === "string"
            ? c
            : (c || [])
                .filter((x) => x.type === "text")
                .map((x) => x.text)
                .join("\n");
        if (text)
          messages.push({
            role: m.type,
            text,
            timestamp: m.timestamp,
            id: m.uuid,
          });
      }
    }
    return messages.slice(-40);
  } catch (e) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  } finally {
    await f?.close();
  }
}
