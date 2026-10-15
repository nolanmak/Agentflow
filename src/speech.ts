import { localFetch } from "./local-http.js";
import { normalizeLocalAudio } from "./local-audio.js";
import {
  record,
  localWhisperUrl,
  localKokoroUrl,
} from "../public/contracts.js";
import type { SpeechConfig, Provider } from "../public/contracts.js";
export type Fetcher = (url: string, options: RequestInit) => Promise<Response>;
import { deepgramVoice } from "../public/deepgram-voices.js";
export const providers: Provider[] = [
  "deepgram",
  "openai",
  "elevenlabs",
  "9router",
  "local-whisper",
  "local-kokoro",
];
export const defaults = {
  deepgram: { stt: "nova-3", tts: "aura-2-helena-en", voice: "" },
  openai: {
    stt: "gpt-4o-mini-transcribe",
    tts: "gpt-4o-mini-tts",
    voice: "coral",
  },
  elevenlabs: { stt: "scribe_v2", tts: "eleven_flash_v2_5", voice: "" },
  "local-kokoro": { stt: "", tts: "kokoro", voice: "af_heart" },
  "local-whisper": { stt: "base.en", tts: "", voice: "" },
  "9router": { stt: "", tts: "", voice: "" },
};
export function failure(code: string, message: string, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function config(c: SpeechConfig, key: string) {
  if (c.provider === "local-whisper")
    return {
      base: localWhisperUrl(c.baseUrl),
      headers: {} as Record<string, string>,
    };
  if (c.provider === "local-kokoro") {
    if (c.model !== "kokoro")
      throw failure("invalid_model", "Local Kokoro requires the kokoro model");
    return {
      base: localKokoroUrl(c.baseUrl),
      headers: {} as Record<string, string>,
    };
  }
  if (!providers.includes(c.provider))
    throw failure("invalid_provider", "Unknown speech provider");
  if (!key && c.provider !== "9router")
    throw failure("not_configured", `${c.provider} API key is not configured`);
  if (!c.model?.trim())
    throw failure("invalid_model", "Choose a speech model in Settings");
  let base =
    c.provider === "9router"
      ? (c.baseUrl || "http://127.0.0.1:20128")
          .replace(/\/+$/, "")
          .replace(/\/v1$/, "")
      : {
          deepgram: "https://api.deepgram.com",
          openai: "https://api.openai.com",
          elevenlabs: "https://api.elevenlabs.io",
        }[c.provider];
  let url;
  try {
    url = new URL(base);
  } catch {
    throw failure("invalid_url", "Invalid router URL");
  }
  if (
    url.username ||
    url.password ||
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw failure("invalid_url", "Use HTTPS or a loopback HTTP router URL");
  const headers: Record<string, string> =
    c.provider === "elevenlabs"
      ? { "xi-api-key": key }
      : key
        ? {
            Authorization: `${c.provider === "deepgram" ? "Token" : "Bearer"} ${key}`,
          }
        : {};
  return { base, headers };
}
async function request(
  url: string,
  options: RequestInit,
  signal: AbortSignal | undefined,
  fetcher: Fetcher,
) {
  signal?.throwIfAborted();
  let r;
  try {
    r = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
  } catch (e) {
    if (signal?.aborted) throw failure("canceled", "Request aborted");
    throw failure(
      "provider_unavailable",
      "Speech provider is unreachable or timed out",
      502,
    );
  }
  if (!r.ok) {
    await r.body?.cancel();
    const code =
      (
        {
          401: "unauthorized",
          403: "unauthorized",
          429: "rate_limited",
          400: "invalid_configuration",
          404: "invalid_model",
        } as Record<number, string>
      )[r.status] || "provider_unavailable";
    throw failure(
      code,
      `Speech provider: ${code.replaceAll("_", " ")} (HTTP ${r.status}). Check Settings.`,
      502,
    );
  }
  return r;
}
export async function transcribe(
  c: SpeechConfig,
  key: string,
  audio: Buffer,
  mime = "audio/webm",
  signal?: AbortSignal,
  fetcher?: Fetcher,
) {
  if (c.provider === "local-kokoro")
    throw failure(
      "invalid_provider",
      "Local Kokoro supports speech output only",
    );
  fetcher ??= c.provider === "local-whisper" ? localFetch : fetch;
  const { base, headers } = config(c, key);
  if (!audio?.length || audio.length > 20 * 1024 * 1024)
    throw failure("invalid_audio", "Audio must be between 1 byte and 20 MB");
  if (!/^audio\/(webm|wav|x-wav|mpeg|mp3|mp4|ogg|flac)(;.*)?$/.test(mime))
    throw failure("invalid_audio", "Unsupported audio format");
  let url: string, body: BodyInit;
  if (c.provider === "local-whisper") {
    const normalized = await normalizeLocalAudio(audio, signal);
    if (!normalized) return { text: "" };
    url = `${base}/inference`;
    body = new FormData();
    body.append(
      "file",
      new Blob([new Uint8Array(normalized)], { type: "audio/wav" }),
      "recording.wav",
    );
    body.append("response_format", "json");
    body.append("temperature", "0");
  } else if (c.provider === "deepgram") {
    url = `${base}/v1/listen?model=${encodeURIComponent(c.model)}&smart_format=true`;
    headers["Content-Type"] = mime;
    body = new Uint8Array(audio);
  } else {
    url = `${base}/v1/${c.provider === "elevenlabs" ? "speech-to-text" : "audio/transcriptions"}`;
    body = new FormData();
    body.append(c.provider === "elevenlabs" ? "model_id" : "model", c.model);
    body.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: mime }),
      `recording.${mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : "webm"}`,
    );
  }
  const r = await request(
    url,
    { method: "POST", headers, body },
    signal,
    fetcher,
  );
  let payload: unknown;
  if (c.provider === "local-whisper") {
    const reader = r.body?.getReader();
    if (!reader)
      throw failure(
        "malformed_response",
        "Local Whisper returned no transcript",
        502,
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536)
          throw failure(
            "malformed_response",
            "Local Whisper transcript response is too large",
            502,
          );
        chunks.push(value);
      }
      payload = Buffer.concat(chunks).toString("utf8");
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  let data: Record<string, unknown>;
  try {
    data = record(
      c.provider === "local-whisper"
        ? JSON.parse(String(payload))
        : await r.json(),
    );
  } catch {
    throw failure(
      "malformed_response",
      "Speech provider returned an invalid transcript",
      502,
    );
  }
  let text: unknown = data.text;
  if (c.provider === "deepgram") {
    try {
      const channels = record(data.results).channels;
      if (!Array.isArray(channels)) throw Error();
      const alternatives = record(channels[0]).alternatives;
      if (!Array.isArray(alternatives)) throw Error();
      text = record(alternatives[0]).transcript;
    } catch {
      text = undefined;
    }
  }
  if (typeof text !== "string")
    throw failure(
      "malformed_response",
      "Speech provider returned no valid transcript",
      502,
    );
  signal?.throwIfAborted();
  return { text: text.trim() };
}
export async function synthesize(
  c: SpeechConfig,
  key: string,
  text: unknown,
  signal?: AbortSignal,
  fetcher?: Fetcher,
) {
  fetcher ??= c.provider === "local-kokoro" ? localFetch : fetch;
  if (c.provider === "local-whisper")
    throw failure(
      "invalid_provider",
      "Local Whisper supports transcription only",
    );
  const { base, headers } = config(c, key);
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw failure(
      "invalid_text",
      "Speech text must contain 1–12000 characters",
    );
  let url, body;
  headers["Content-Type"] = "application/json";
  if (c.provider === "deepgram") {
    url = `${base}/v1/speak?model=${encodeURIComponent(c.model)}&encoding=mp3`;
    body = { text };
  } else if (c.provider === "elevenlabs") {
    if (!c.voice?.trim())
      throw failure(
        "invalid_voice",
        "Choose an ElevenLabs voice ID in Settings",
      );
    url = `${base}/v1/text-to-speech/${encodeURIComponent(c.voice)}?output_format=mp3_44100_128`;
    body = { text, model_id: c.model };
  } else {
    url = `${base}/v1/audio/speech`;
    body = {
      model: c.model,
      input: text,
      voice: c.voice || (c.provider === "local-kokoro" ? "af_heart" : "coral"),
      response_format: c.provider === "local-kokoro" ? "wav" : "mp3",
    };
  }
  const r = await request(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    signal,
    fetcher,
  );
  const mime = r.headers.get("content-type")?.split(";")[0] || "";
  if (!mime.startsWith("audio/") && mime !== "application/octet-stream") {
    await r.body?.cancel();
    throw failure(
      "malformed_response",
      "Speech provider did not return audio",
      502,
    );
  }
  if (!r.body)
    throw failure(
      "malformed_response",
      "Speech provider returned empty audio",
      502,
    );
  const reader = r.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 24 * 1024 * 1024)
        throw failure("too_large", "Speech output exceeded 24 MB");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!size)
    throw failure(
      "malformed_response",
      "Speech provider returned empty audio",
      502,
    );
  signal?.throwIfAborted();
  const audio = Buffer.concat(chunks);
  if (c.provider === "local-kokoro" && !validWav(audio))
    throw failure(
      "malformed_response",
      "Local Kokoro returned invalid WAV audio",
      502,
    );
  return {
    audio,
    mime: mime === "application/octet-stream" ? "audio/mpeg" : mime,
  };
}

export function previewConfig(config: SpeechConfig, model: unknown) {
  if (model === undefined) return { ...config };
  if (
    config.provider !== "deepgram" ||
    typeof model !== "string" ||
    !deepgramVoice(model)
  )
    throw failure(
      "invalid_preview",
      "Choose a listed Deepgram voice to preview",
    );
  return { ...config, model };
}

// Validate the complete PCM container before handing local runtime bytes to playback.
function validWav(audio: Buffer): boolean {
  if (
    audio.length < 44 ||
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.toString("ascii", 8, 12) !== "WAVE" ||
    audio.readUInt32LE(4) !== audio.length - 8
  )
    return false;
  let format = false,
    data = false;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const id = audio.toString("ascii", offset, offset + 4);
    const length = audio.readUInt32LE(offset + 4);
    const start = offset + 8,
      end = start + length;
    if (end > audio.length) return false;
    if (id === "fmt ") {
      if (
        length < 16 ||
        audio.readUInt16LE(start) !== 1 ||
        audio.readUInt16LE(start + 2) !== 1 ||
        audio.readUInt32LE(start + 4) !== 24000 ||
        audio.readUInt32LE(start + 8) !== 48000 ||
        audio.readUInt16LE(start + 12) !== 2 ||
        audio.readUInt16LE(start + 14) !== 16
      )
        return false;
      format = true;
    }
    if (id === "data") data = length > 0 && length % 2 === 0;
    offset = end + (length % 2);
  }
  return format && data;
}
