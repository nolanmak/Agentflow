import { record, string } from "../public/contracts.js";
export function object(value: unknown): Record<string, unknown> {
  try {
    return record(value);
  } catch {
    return {};
  }
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  return array(value)
    .flatMap((x) => {
      const r = object(x);
      return typeof r.text === "string" ? [r.text] : [];
    })
    .join("\n");
}
export interface CodexItem {
  type: string;
  text?: string;
  content?: { text?: string }[];
}
export interface CodexThread {
  id: string;
  cwd: string;
  path?: string;
  name?: string;
  preview?: string;
  updatedAt: number;
  turns?: { items: CodexItem[] }[];
}
export interface RpcResults {
  initialize: unknown;
  "thread/list": { data: CodexThread[] };
  "thread/read": { thread: CodexThread };
  "thread/start": { thread: CodexThread };
  "thread/resume": { thread: CodexThread };
  "turn/start": { turn: { id: string } };
  "turn/interrupt": unknown;
}
function thread(value: unknown): CodexThread {
  const r = record(value);
  return {
    id: string(r.id),
    cwd: string(r.cwd),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    ...(typeof r.path === "string" ? { path: r.path } : {}),
    ...(typeof r.name === "string" ? { name: r.name } : {}),
    ...(typeof r.preview === "string" ? { preview: r.preview } : {}),
    turns: array(r.turns).map((t) => ({
      items: array(object(t).items).map((i) => {
        const item = record(i);
        return {
          type: string(item.type),
          text: typeof item.text === "string" ? item.text : undefined,
          content: array(item.content).map((c) => ({
            text:
              typeof object(c).text === "string"
                ? String(object(c).text)
                : undefined,
          })),
        };
      }),
    })),
  };
}
export function parseRpcResult<M extends keyof RpcResults>(
  method: M,
  value: unknown,
): RpcResults[M] {
  let result: unknown = value;
  if (method === "thread/list")
    result = { data: array(record(value).data).map(thread) };
  else if (method.startsWith("thread/"))
    result = { thread: thread(record(value).thread) };
  else if (method === "turn/start")
    result = { turn: { id: string(record(record(value).turn).id) } };
  // Each method's payload is narrowed above; TypeScript cannot correlate generic M to these branches.
  return result as RpcResults[M];
}
export interface RpcMessage {
  id?: string | number;
  method?: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
}
export function rpcMessage(value: unknown): RpcMessage {
  const r = record(value);
  return {
    id: typeof r.id === "string" || typeof r.id === "number" ? r.id : undefined,
    method: typeof r.method === "string" ? r.method : undefined,
    params: object(r.params),
    result: r.result,
    error: r.error
      ? {
          message:
            typeof object(r.error).message === "string"
              ? String(object(r.error).message)
              : "Native RPC error",
        }
      : undefined,
  };
}
interface ContentPart {
  type?: string;
  text?: string;
}
export interface NativeLog {
  type?: string;
  subtype?: string;
  uuid?: string;
  timestamp?: string;
  ordinal?: number;
  payload?: { type?: string; role?: string; content: ContentPart[] };
  message?: { content: string | ContentPart[]; stop_reason?: string };
}
export function nativeLog(value: unknown): NativeLog {
  const r = record(value);
  const optionalString = (v: unknown) =>
    typeof v === "string" ? v : undefined;
  const parts = (v: unknown): ContentPart[] =>
    array(v).map((x) => {
      const p = object(x);
      return { type: optionalString(p.type), text: optionalString(p.text) };
    });
  const p = object(r.payload),
    m = object(r.message);
  return {
    type: optionalString(r.type),
    subtype: optionalString(r.subtype),
    uuid: optionalString(r.uuid),
    timestamp: optionalString(r.timestamp),
    ordinal: typeof r.ordinal === "number" ? r.ordinal : undefined,
    payload: r.payload
      ? {
          type: optionalString(p.type),
          role: optionalString(p.role),
          content: parts(p.content),
        }
      : undefined,
    message: r.message
      ? {
          content: typeof m.content === "string" ? m.content : parts(m.content),
          stop_reason: optionalString(m.stop_reason),
        }
      : undefined,
  };
}
