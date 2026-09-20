export type AgentKind = "codex" | "claude";
export type Provider = "deepgram" | "openai" | "elevenlabs" | "9router";
export type SpeechSide = "stt" | "tts";
export interface SpeechConfig {
  provider: Provider;
  model: string;
  voice?: string;
  baseUrl?: string;
}
export interface SettingsValue {
  stt: SpeechConfig;
  tts: SpeechConfig;
  routerUrl: string;
}
export interface PublicSettings extends SettingsValue {
  configured: Record<Provider, boolean>;
  defaults: Record<Provider, { stt: string; tts: string; voice: string }>;
}
export interface SessionSummary {
  agent: AgentKind;
  id: string;
  cwd: string;
  title: string;
  updatedAt: number;
  managed?: boolean;
  live?: boolean;
  busy?: boolean;
  pid?: number;
  pending?: boolean;
  path?: string;
}
export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  id?: string;
}
export type AgentEvent =
  | { type: "session"; id: string }
  | { type: "text" | "replace" | "notice"; text: string };
export type Emit = (event: AgentEvent) => void;
export type Ask = (description: string) => Promise<boolean>;
export interface TurnInput {
  id: string;
  agent: AgentKind;
  sessionId: string;
  cwd: string;
  text: string;
  voice?: boolean;
}
export type RunInput = Omit<TurnInput, "id"> & { id?: string };
export type JobStatus =
  "running" | "approval" | "complete" | "error" | "canceled" | "uncertain";
export interface Job extends TurnInput {
  requestSessionId?: string;
  status: JobStatus;
  reply: string;
  events: AgentEvent[];
  createdAt: string;
  error?: string;
  approval?: { id: string; description: string };
}
export type Runner = (
  job: Job,
  emit: Emit,
  signal: AbortSignal,
  ask: Ask,
) => Promise<void>;
export type TerminalEvent =
  | { type: "output"; data: string }
  | { type: "session"; id: string; previousId: string }
  | { type: "exit"; exitCode: number; signal?: number };
export type TerminalClientMessage =
  | { type: "attach"; token: string; agent: AgentKind; id: string }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };
export type TerminalServerMessage =
  | TerminalEvent
  | ({ type: "attached" } & SessionSummary)
  | { type: "error"; error: string };
export interface KeyStorage {
  get(provider: Provider): Promise<string>;
  set?(provider: Provider, key: string): Promise<void>;
  delete?(provider: Provider): Promise<void>;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected an object");
  return value as Record<string, unknown>;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
export function errorCode(error: unknown): string | number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
  )
    return error.code;
  return undefined;
}
export function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "string" &&
    ["deepgram", "openai", "elevenlabs", "9router"].includes(value)
  );
}
export function isAgent(value: unknown): value is AgentKind {
  return value === "codex" || value === "claude";
}
export function string(value: unknown, label = "value"): string {
  if (typeof value !== "string") throw Error("Expected text for " + label);
  return value;
}
export function parseSettings(value: unknown): SettingsValue {
  const r = record(value);
  function side(value: unknown): SpeechConfig {
    const c = record(value);
    if (!isProvider(c.provider)) throw Error("Invalid provider");
    return {
      provider: c.provider,
      model: string(c.model),
      ...(typeof c.voice === "string" ? { voice: c.voice } : {}),
    };
  }
  return { stt: side(r.stt), tts: side(r.tts), routerUrl: string(r.routerUrl) };
}
export function parseTurn(value: unknown): TurnInput {
  const r = record(value);
  if (!isAgent(r.agent)) throw Error("Invalid agent");
  return {
    id: string(r.id),
    agent: r.agent,
    sessionId: string(r.sessionId),
    cwd: string(r.cwd),
    text: string(r.text),
    voice: r.voice === true,
  };
}
export function parseTerminalMessage(value: unknown): TerminalClientMessage {
  const r = record(value);
  if (r.type === "attach" && isAgent(r.agent))
    return {
      type: "attach",
      token: string(r.token),
      agent: r.agent,
      id: string(r.id),
    };
  if (r.type === "input") return { type: "input", data: string(r.data) };
  if (
    r.type === "resize" &&
    typeof r.cols === "number" &&
    Number.isFinite(r.cols) &&
    typeof r.rows === "number" &&
    Number.isFinite(r.rows)
  )
    return { type: "resize", cols: r.cols, rows: r.rows };
  throw Error("Invalid terminal message");
}

export function list<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw Error("Expected an array");
  return value.map(decode);
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error("Expected a finite number");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw Error("Expected a boolean");
  return value;
}
export function parseSession(value: unknown): SessionSummary {
  const r = record(value);
  if (!isAgent(r.agent)) throw Error("Invalid agent");
  const result: SessionSummary = {
    agent: r.agent,
    id: string(r.id),
    cwd: string(r.cwd),
    title: string(r.title),
    updatedAt: number(r.updatedAt),
  };
  for (const key of ["managed", "live", "busy", "pending"] as const)
    if (r[key] !== undefined) result[key] = boolean(r[key]);
  if (r.pid !== undefined) result.pid = number(r.pid);
  if (r.path !== undefined) result.path = string(r.path);
  return result;
}
export function parseSessionList(value: unknown) {
  const r = record(value);
  return {
    sessions: list(r.sessions, parseSession),
    errors: list(r.errors, string),
  };
}
export function parseHistory(value: unknown): { messages: HistoryMessage[] } {
  const r = record(value);
  return {
    messages: list(r.messages, (item) => {
      const m = record(item);
      if (m.role !== "user" && m.role !== "assistant")
        throw Error("Invalid message role");
      return {
        role: m.role,
        text: string(m.text),
        ...(m.timestamp !== undefined
          ? { timestamp: string(m.timestamp) }
          : {}),
        ...(m.id !== undefined ? { id: string(m.id) } : {}),
      };
    }),
  };
}
export function parseAgentEvent(value: unknown): AgentEvent {
  const r = record(value);
  if (r.type === "session") return { type: r.type, id: string(r.id) };
  if (r.type === "text" || r.type === "replace" || r.type === "notice")
    return { type: r.type, text: string(r.text) };
  throw Error("Invalid agent event");
}
export function parseJob(value: unknown): Job {
  const r = record(value),
    status = r.status;
  if (
    status !== "running" &&
    status !== "approval" &&
    status !== "complete" &&
    status !== "error" &&
    status !== "canceled" &&
    status !== "uncertain"
  )
    throw Error("Invalid job status");
  const result: Job = {
    ...parseTurn(r),
    status,
    reply: string(r.reply),
    createdAt: string(r.createdAt),
    events: list(r.events, parseAgentEvent),
  };
  if (r.requestSessionId !== undefined)
    result.requestSessionId = string(r.requestSessionId);
  if (r.error !== undefined) result.error = string(r.error);
  if (r.approval !== undefined) {
    const a = record(r.approval);
    result.approval = { id: string(a.id), description: string(a.description) };
  }
  return result;
}
export function parsePublicSettings(value: unknown): PublicSettings {
  const r = record(value),
    cfg = record(r.configured),
    defs = record(r.defaults);
  function defaults(p: Provider) {
    const d = record(defs[p]);
    return { stt: string(d.stt), tts: string(d.tts), voice: string(d.voice) };
  }
  return {
    ...parseSettings(r),
    configured: {
      deepgram: boolean(cfg.deepgram),
      openai: boolean(cfg.openai),
      elevenlabs: boolean(cfg.elevenlabs),
      "9router": boolean(cfg["9router"]),
    },
    defaults: {
      deepgram: defaults("deepgram"),
      openai: defaults("openai"),
      elevenlabs: defaults("elevenlabs"),
      "9router": defaults("9router"),
    },
  };
}
export function parseTerminalServerMessage(
  value: unknown,
): TerminalServerMessage {
  const r = record(value);
  if (r.type === "output") return { type: r.type, data: string(r.data) };
  if (r.type === "session")
    return { type: r.type, id: string(r.id), previousId: string(r.previousId) };
  if (r.type === "exit")
    return {
      type: r.type,
      exitCode: number(r.exitCode),
      ...(r.signal !== undefined ? { signal: number(r.signal) } : {}),
    };
  if (r.type === "error") return { type: r.type, error: string(r.error) };
  if (r.type === "attached") return { ...parseSession(r), type: r.type };
  throw Error("Invalid terminal event");
}
export function parseAudio(value: unknown): Blob {
  if (!(value instanceof Blob)) throw Error("Expected audio");
  return value;
}
export function parseTranscript(value: unknown) {
  return { text: string(record(value).text) };
}
export function parseRouterModels(value: unknown) {
  return list(value, (item) => {
    const r = record(item);
    return {
      kind: string(r.kind),
      models: list(r.models, (m) => ({ id: string(record(m).id) })),
    };
  });
}
