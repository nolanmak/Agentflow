import {
  parseJob,
  parseSession,
  parseSessionList,
  parseHistory,
  parsePublicSettings,
  parseTerminalServerMessage,
  parseAudio,
  parseTranscript,
  parseRouterModels,
} from "./contracts.js";
import { deepgramVoices, deepgramVoice } from "./deepgram-voices.js";
import { sentences, VoiceGate } from "./voice.js";
import { element as $ } from "./dom.js";
import {
  errorMessage,
  record,
  string,
  isProvider,
  isAgent,
  type PublicSettings,
  type SessionSummary,
  type HistoryMessage,
  type Job,
  type TerminalServerMessage,
} from "./contracts.js";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
declare global {
  interface Window {
    Terminal: typeof Terminal;
    FitAddon: { FitAddon: typeof FitAddon };
  }
  interface Document {
    modelContext?: {
      registerTool(tool: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: { readOnlyHint: boolean };
        execute: (args: Record<string, unknown>) => Promise<unknown>;
      }): void;
    };
  }
}
interface SessionList {
  sessions: SessionSummary[];
  errors: string[];
}
interface History {
  messages: HistoryMessage[];
}

const names = {
  deepgram: "Deepgram",
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  "9router": "9Router",
};
let token: string,
  settings: PublicSettings,
  sessions: SessionSummary[] = [],
  selected: SessionSummary | undefined;
let filter = "all",
  generation = 0,
  currentJob: string | null = null,
  call = false,
  recording = false;
let recorder: MediaRecorder,
  stream: MediaStream | null = null,
  audioContext: AudioContext | null = null,
  analyser: AnalyserNode,
  raf: number;
let audio: HTMLAudioElement | null = null,
  aborter = new AbortController(),
  speechQueue = Promise.resolve(),
  lastReply = "",
  lastSpeechError = false;
let nativeSocket: WebSocket | undefined,
  nativeTerm: Terminal | null = null,
  nativeFit: FitAddon,
  historySignature = "",
  historyPolling = false;
interface ApiOptions {
  method?: string;
  body?: unknown;
  raw?: boolean;
  signal?: AbortSignal;
}
async function api<T = Record<string, unknown>>(
  path: string,
  decode: (value: unknown) => T,
  { method = "GET", body, raw = false, signal }: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-agentflow-token": token };
  if (raw && !(body instanceof Blob)) throw Error("Expected audio blob");
  if (body !== undefined)
    headers["Content-Type"] = raw
      ? (body instanceof Blob && body.type) || "audio/webm"
      : "application/json";
  const r = await fetch("/api" + path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : raw && body instanceof Blob
          ? body
          : JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    let d;
    try {
      d = record(await r.json());
    } catch {}
    throw Error(
      typeof d?.error === "string" ? d.error : `Request failed (${r.status})`,
    );
  }
  const value: unknown = r.headers.get("content-type")?.startsWith("audio/")
    ? await r.blob()
    : await r.json();
  return decode(value);
}
function notice(text: string) {
  $("notice").textContent = text || "";
  $("notice").hidden = !text;
}
function state(label: string, detail: string, kind = "idle") {
  $("state").textContent = label;
  $("hint").textContent = detail;
  $("orb").dataset.state = kind;
  $("end").disabled = !call && !currentJob;
  $("interrupt").disabled = !call && !currentJob && !audio;
  $("talk").textContent = recording
    ? "■ Send recording"
    : call
      ? "◉ Record next turn"
      : "◉ Start talking";
}
function report(e: unknown) {
  if (e instanceof Error && e.name === "AbortError") return;
  notice(errorMessage(e));
  state("Let’s try that again", errorMessage(e), "error");
}
function message(
  role: HistoryMessage["role"],
  text: string,
  timestamp?: string,
) {
  const row = document.createElement("div");
  row.className = "message " + role;
  const label = document.createElement("b");
  label.textContent =
    role === "user"
      ? "YOU"
      : selected?.agent === "claude"
        ? "CLAUDE CODE"
        : "CODEX";
  const time = document.createElement("time");
  time.textContent = new Date(timestamp || Date.now()).toLocaleString();
  label.append(time);
  const span = document.createElement("span");
  span.textContent = text;
  row.append(label, span);
  $("messages").append(row);
  $("messages").scrollTop = $("messages").scrollHeight;
  return span;
}
function renderSessions() {
  const needle = $("search").value.toLowerCase();
  $("sessions").replaceChildren();
  const list = sessions.filter(
    (s) =>
      (filter === "all" || s.agent === filter) &&
      [s.title, s.cwd, s.id].join(" ").toLowerCase().includes(needle),
  );
  if (!list.length) {
    $("sessions").textContent = "No matching sessions.";
    return;
  }
  for (const s of list) {
    const b = document.createElement("button");
    b.className =
      "session" +
      (selected?.id === s.id && selected?.agent === s.agent ? " selected" : "");
    const title = document.createElement("div");
    title.className = "session-title";
    title.textContent = s.title;
    const meta = document.createElement("div");
    meta.className = "session-meta";
    const tag = document.createElement("span");
    tag.className = s.agent === "claude" ? "claude-tag" : "agent-tag";
    tag.textContent = s.agent === "claude" ? "CLAUDE" : "CODEX";
    const date = document.createElement("span");
    date.textContent = s.busy
      ? "Working…"
      : new Date(s.updatedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
    meta.append(tag, date);
    b.append(title, meta);
    b.onclick = () => select(s);
    $("sessions").append(b);
  }
}
async function refresh() {
  const data = await api("/sessions?refresh=1", parseSessionList);
  sessions = data.sessions;
  renderSessions();
  if (data.errors.length) notice(data.errors.join("\n"));
}
async function select(s: SessionSummary) {
  await stop();
  nativeSocket?.close();
  nativeTerm?.dispose();
  nativeTerm = null;
  $("nativePanel").hidden = true;
  selected = s;
  historySignature = "";
  notice("");
  $("sessionTitle").textContent = s.title;
  $("agentLabel").textContent = s.agent === "claude" ? "CLAUDE CODE" : "CODEX";
  $("project").textContent = s.cwd;
  $("sessionBadge").textContent =
    s.agent === "claude" ? "CLAUDE CODE SESSION" : "CODEX SESSION";
  $("sessionId").textContent =
    s.id === "new" ? "New session · created on your first message" : s.id;
  $("messages").replaceChildren();
  lastReply = "";
  renderSessions();
  state("Let’s talk", "Speak naturally. Your agent will answer out loud.");
  localStorage.setItem(
    "agentflow.selection",
    JSON.stringify({ agent: s.agent, id: s.id }),
  );
  if (s.live) await connectNative(false);
  if (s.id !== "new") {
    const g = generation;
    try {
      const d = await api(
        "/history?agent=" + s.agent + "&id=" + s.id,
        parseHistory,
      );
      if (g !== generation) return;
      historySignature = JSON.stringify(d.messages);
      for (const m of d.messages) {
        message(m.role, m.text, m.timestamp);
        if (m.role === "assistant") lastReply = m.text;
      }
    } catch (e) {
      notice("Session selected. History preview: " + errorMessage(e));
    }
  }
}
function queueSpeech(text: string, g: number) {
  const spoken = text;
  if (!spoken) return;
  speechQueue = speechQueue
    .then(async () => {
      if (g !== generation) return;
      state(
        "Speaking",
        selected?.agent === "claude"
          ? "Claude Code is responding."
          : "Codex is responding.",
        "speaking",
      );
      const blob = await api("/synthesize", parseAudio, {
        method: "POST",
        body: { text: spoken.slice(0, 12000) },
        signal: aborter.signal,
      });
      if (g !== generation) return;
      const url = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          const a = new Audio(url);
          audio = a;
          a.onended = () => resolve();
          a.onerror = () => reject(Error("Audio playback failed"));
          a.onpause = () => resolve();
          a.play().catch(() =>
            reject(
              Error(
                "Click Test voice to enable audio playback, then Replay last reply.",
              ),
            ),
          );
        });
      } finally {
        URL.revokeObjectURL(url);
        audio = null;
      }
    })
    .catch((e) => {
      if (g === generation) {
        lastSpeechError = true;
        report(e);
      }
    });
}
async function send(text: string) {
  if (!selected) throw Error("Select a session first");
  if (selected.id === "new") await connectNative(true);
  if (currentJob)
    throw Error("The current turn is still running. Use Interrupt first.");
  const g = generation;
  aborter = new AbortController();
  lastSpeechError = false;
  notice("");
  message("user", text);
  const output = message("assistant", "");
  $("message").value = "";
  state("Thinking", "Your agent is working in this session.", "thinking");
  $("end").disabled = false;
  const input = {
    id: crypto.randomUUID(),
    agent: selected.agent,
    sessionId: selected.id,
    cwd: selected.cwd,
    text,
    voice: false,
  };
  const job = await api("/turns", parseJob, {
    method: "POST",
    body: input,
    signal: aborter.signal,
  });
  currentJob = job.id;
  sessionStorage.setItem(
    "agentflow.job",
    JSON.stringify({
      id: job.id,
      agent: selected.agent,
      sessionId: selected.id,
    }),
  );
  let spoken = 0;
  try {
    while (g === generation) {
      const j = await api("/jobs/" + job.id, parseJob, {
        signal: aborter.signal,
      });
      if (g !== generation) return;
      if (j.sessionId !== selected.id) {
        selected.id = j.sessionId;
        selected.managed = true;
        $("sessionId").textContent = j.sessionId;
        localStorage.setItem(
          "agentflow.selection",
          JSON.stringify({ agent: selected.agent, id: j.sessionId }),
        );
      }
      output.textContent = j.reply || "…";
      $("messages").scrollTop = $("messages").scrollHeight;
      if (j.approval) {
        $("approval").hidden = false;
        $("approvalText").textContent = j.approval.description;
        $("allow").onclick = () => answer(j.approval!.id, true);
        $("deny").onclick = () => answer(j.approval!.id, false);
        state(
          "Permission needed",
          "Review the request below to continue.",
          "thinking",
        );
      } else $("approval").hidden = true;
      const chunk = sentences(
        (j.reply || "").slice(spoken),
        !["running", "approval"].includes(j.status),
      );
      for (const s of chunk.ready) queueSpeech(s, g);
      spoken = (j.reply || "").length - chunk.rest.length;
      if (!["running", "approval"].includes(j.status)) {
        lastReply = j.reply || "";
        if (j.status === "error" || j.status === "uncertain")
          throw Error(j.error || "Agent turn failed");
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    await speechQueue;
  } finally {
    if (g === generation) {
      currentJob = null;
      sessionStorage.removeItem("agentflow.job");
      $("approval").hidden = true;
    }
  }
  if (g !== generation) return;
  state("Your turn", "Continue the conversation, or return to your terminal.");
  if (call && $("handsfree").checked && !lastSpeechError) await listen();
  refresh().catch(() => {});
}
async function answer(id: string, allow: boolean) {
  try {
    await api("/approvals", record, { method: "POST", body: { id, allow } });
    $("approval").hidden = true;
  } catch (e) {
    report(e);
  }
}
function releaseMic() {
  cancelAnimationFrame(raf);
  if (recorder?.state === "recording") recorder.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  recording = false;
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}
async function stop() {
  stopPreview();
  const job = currentJob;
  generation++;
  call = false;
  aborter?.abort();
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  releaseMic();
  speechQueue = Promise.resolve();
  currentJob = null;
  sessionStorage.removeItem("agentflow.job");
  $("approval").hidden = true;
  if (job)
    await api("/jobs/" + job + "/cancel", record, {
      method: "POST",
      body: {},
    }).catch(() => {});
  state("Ready when you are", "Start a conversation whenever you’re ready.");
}
async function listen() {
  if (recording) {
    recorder.stop();
    return;
  }
  if (!selected) {
    notice("Select a session in the sidebar, or create a new conversation.");
    return;
  }
  if (currentJob) {
    notice("Use Interrupt to stop the current turn first.");
    return;
  }
  if (
    !settings.configured[settings.stt.provider] &&
    settings.stt.provider !== "9router"
  ) {
    $("settings").showModal();
    notice("Add a key for your listening provider.");
    return;
  }
  call = true;
  const g = generation;
  aborter = new AbortController();
  notice("");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (g !== generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const chunks: Blob[] = [];
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
      (x) => MediaRecorder.isTypeSupported(x),
    );
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    const gate = new VoiceGate();
    const started = performance.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      releaseMic();
      if (g !== generation) return;
      try {
        state(
          "Listening back",
          "Turning your speech into a message.",
          "thinking",
        );
        const d = await api("/transcribe", parseTranscript, {
          method: "POST",
          body: blob,
          raw: true,
          signal: aborter.signal,
        });
        if (g !== generation) return;
        if (!d.text.trim()) {
          state(
            "I didn’t catch that",
            "Try speaking a little closer to the microphone.",
          );
          if (call && $("handsfree").checked) await listen();
          return;
        }
        $("message").value = d.text;
        await send(d.text);
      } catch (e) {
        report(e);
      }
    };
    recorder.start(200);
    recording = true;
    state(
      "Listening",
      "Speak, then pause. Click Send recording whenever you’re done.",
      "listening",
    );
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const values = new Float32Array(analyser.fftSize);
    function tick() {
      if (!recording || g !== generation) return;
      analyser.getFloatTimeDomainData(values);
      const rms = Math.sqrt(
        values.reduce((n, x) => n + x * x, 0) / values.length,
      );
      const finish = gate.sample(rms, performance.now());
      if (
        (finish && $("handsfree").checked) ||
        performance.now() - started > 90000
      ) {
        recorder.stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
  } catch (e) {
    call = false;
    releaseMic();
    report(
      e instanceof Error && e.name === "NotAllowedError"
        ? Error(
            "Microphone access was denied. Allow it in your browser’s site settings and try again.",
          )
        : e,
    );
  }
}
let previewController: AbortController | null = null,
  previewAudio: HTMLAudioElement | null = null;
function stopPreview() {
  previewController?.abort();
  previewController = null;
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = "";
    previewAudio = null;
  }
  $("previewVoice").textContent = "Preview voice";
}
function paintVoicePicker() {
  const active = $("ttsProvider").value === "deepgram";
  $("deepgramVoiceField").hidden = !active;
  $("ttsModelField").hidden = active;
  $("ttsVoiceField").hidden = active;
  const picker = $("deepgramVoice");
  picker.replaceChildren();
  for (const gender of ["Feminine", "Masculine"]) {
    const group = document.createElement("optgroup");
    group.label = gender;
    for (const v of deepgramVoices.filter((v) => v.gender === gender))
      group.append(new Option(v.name + " · " + v.accent, v.model));
    picker.append(group);
  }
  const model = $("ttsModel").value;
  if (!deepgramVoice(model))
    picker.add(new Option("Current model: " + model, model));
  picker.value = model;
  picker.disabled = !settings.configured.deepgram;
  $("previewVoice").disabled =
    !settings.configured.deepgram || !deepgramVoice(model);
  const voice = deepgramVoice(model);
  $("deepgramVoiceHelp").textContent = !settings.configured.deepgram
    ? "Add a Deepgram key below to choose and preview voices."
    : (voice?.description ? voice.description + ". " : "") +
      "Preview before saving. English Aura-2 voices.";
}
$("deepgramVoice").onchange = () => {
  stopPreview();
  $("ttsModel").value = $("deepgramVoice").value;
  paintVoicePicker();
  $("settingsNotice").textContent = "Save preferences to use this voice.";
};
$("previewVoice").onclick = async () => {
  if (previewController) {
    stopPreview();
    $("settingsNotice").textContent = "Preview stopped.";
    return;
  }
  if (call || currentJob || audio) {
    $("settingsNotice").textContent =
      "End the current conversation or playback before previewing a voice.";
    return;
  }
  const model = $("deepgramVoice").value,
    v = deepgramVoice(model);
  if (!settings.configured.deepgram || !v) return;
  const controller = new AbortController();
  previewController = controller;
  $("previewVoice").textContent = "Stop preview";
  $("settingsNotice").textContent = "Loading " + v.name + "…";
  let url;
  try {
    const blob = await api("/synthesize", parseAudio, {
      method: "POST",
      body: {
        model,
        text: `Hi, I’m ${v.name}. This is my voice in Agentflow. Your conversation stays right where you left it.`,
      },
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    url = URL.createObjectURL(blob);
    const player = new Audio(url);
    previewAudio = player;
    $("settingsNotice").textContent = "Playing " + v.name + "…";
    await new Promise<void>((resolve, reject) => {
      player.onended = () => resolve();
      player.onpause = () => resolve();
      player.onerror = () => reject(Error("Preview playback failed"));
      player
        .play()
        .catch(() =>
          reject(
            Error("Your browser blocked playback. Try Preview voice again."),
          ),
        );
    });
    if (!controller.signal.aborted)
      $("settingsNotice").textContent =
        "Preview finished. Save preferences to use " + v.name + ".";
  } catch (e) {
    if (!controller.signal.aborted)
      $("settingsNotice").textContent = errorMessage(e);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (previewController === controller) {
      previewController = null;
      previewAudio = null;
      $("previewVoice").textContent = "Preview voice";
    }
  }
};
$("settings").addEventListener("close", stopPreview);
$("settings").addEventListener("cancel", stopPreview);
function paintSettings() {
  stopPreview();
  for (const side of ["stt", "tts"] as const) {
    $(`${side}Provider`).replaceChildren();
    for (const [id, name] of Object.entries(names)) {
      const o = new Option(name, id);
      $(`${side}Provider`).add(o);
    }
    $(`${side}Provider`).value = settings[side].provider;
    $(`${side}Model`).value = settings[side].model;
  }
  $("ttsVoice").value = settings.tts.voice || "";
  $("routerUrl").value = settings.routerUrl;
  $("sttLabel").textContent = names[settings.stt.provider] + " listens";
  $("ttsLabel").textContent =
    (settings.tts.provider === "deepgram" && deepgramVoice(settings.tts.model)
      ? deepgramVoice(settings.tts.model)?.name + " · "
      : "") +
    names[settings.tts.provider] +
    " speaks";
  paintVoicePicker();
  $("keyRows").replaceChildren();
  for (const [id, name] of Object.entries(names)) {
    const row = document.createElement("div");
    row.className = "keyrow";
    const label = document.createElement("span");
    label.className = "key-name";
    label.textContent = name;
    const status = document.createElement("small");
    status.textContent =
      isProvider(id) && settings.configured[id] ? "Configured" : "No key";
    label.append(status);
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "new-password";
    input.placeholder = "Paste a key to replace";
    input.setAttribute("aria-label", name + " API key");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save key";
    save.onclick = async () => {
      try {
        await api("/keys", record, {
          method: "POST",
          body: { provider: id, key: input.value },
        });
        input.value = "";
        settings = await api("/settings", parsePublicSettings);
        paintSettings();
        $("settingsNotice").textContent = name + " key saved to Keychain.";
      } catch (e) {
        $("settingsNotice").textContent = errorMessage(e);
      }
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.onclick = async () => {
      try {
        await api("/keys", record, {
          method: "POST",
          body: { provider: id, remove: true },
        });
        settings = await api("/settings", parsePublicSettings);
        paintSettings();
      } catch (e) {
        $("settingsNotice").textContent = errorMessage(e);
      }
    };
    row.append(label, input, save, remove);
    $("keyRows").append(row);
  }
}
async function testVoice() {
  try {
    await stop();
    lastSpeechError = false;
    aborter = new AbortController();
    queueSpeech(
      "Agentflow is ready. This is your selected voice. You can talk to your Codex and Claude Code sessions here.",
      generation,
    );
    await speechQueue;
    if (lastSpeechError) return;
    state(
      "Voice test finished",
      "If you heard that, your speech output is connected.",
    );
  } catch (e) {
    report(e);
  }
}
$("talk").onclick = () => listen();
$("end").onclick = () => stop();
$("interrupt").onclick = async () => {
  await stop();
  state("Interrupted", "Start talking to give your next instruction.");
};
$("testVoice").onclick = testVoice;
$("replay").onclick = async () => {
  if (!lastReply) return;
  await stop();
  aborter = new AbortController();
  for (const s of sentences(lastReply, true).ready) queueSpeech(s, generation);
  await speechQueue;
  state("Your turn", "Replay complete.");
};
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("message").value.trim();
  if (text)
    try {
      await send(text);
    } catch (e) {
      report(e);
    }
};
$("search").oninput = renderSessions;
document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter || "all";
      document
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderSessions();
    }),
);
$("refresh").onclick = () => refresh().catch(report);
$("transcriptToggle").onclick = () => {
  $("transcript").hidden = !$("transcript").hidden;
  $("transcriptToggle").textContent = $("transcript").hidden
    ? "Show transcript"
    : "Hide transcript";
};
$("settingsButton").onclick = () => {
  paintSettings();
  $("settingsNotice").textContent = "";
  $("settings").showModal();
};
$("closeSettings").onclick = () => $("settings").close();
for (const side of ["stt", "tts"] as const)
  $(`${side}Provider`).onchange = () => {
    const provider = $(`${side}Provider`).value;
    if (!isProvider(provider)) throw Error("Invalid provider");
    const d = settings.defaults[provider];
    $(`${side}Model`).value = d[side];
    if (side === "tts") {
      stopPreview();
      $("ttsVoice").value = d.voice;
      paintVoicePicker();
    }
  };
$("settingsForm").onsubmit = async (e) => {
  e.preventDefault();
  if (call || currentJob) {
    $("settingsNotice").textContent =
      "End the current voice conversation before changing providers.";
    return;
  }
  try {
    settings = await api("/settings", parsePublicSettings, {
      method: "PUT",
      body: {
        stt: { provider: $("sttProvider").value, model: $("sttModel").value },
        tts: {
          provider: $("ttsProvider").value,
          model: $("ttsModel").value,
          voice: $("ttsVoice").value,
        },
        routerUrl: $("routerUrl").value,
      },
    });
    paintSettings();
    $("settings").close();
    notice("Speech preferences saved. Your agent session is unchanged.");
  } catch (e) {
    $("settingsNotice").textContent = errorMessage(e);
  }
};
$("routerModels").onclick = async () => {
  try {
    const r = await api("/router/models", parseRouterModels);
    $("settingsNotice").textContent = r
      .map(
        (x) =>
          x.kind.toUpperCase() +
          ": " +
          (x.models.map((m) => m.id).join(", ") || "No models configured"),
      )
      .join("\n");
  } catch (e) {
    $("settingsNotice").textContent = errorMessage(e);
  }
};
$("new").onclick = () => {
  $("newCwd").value = selected?.cwd || sessions[0]?.cwd || "";
  $("newDialog").showModal();
};
$("closeNew").onclick = () => $("newDialog").close();
$("newForm").onsubmit = async (e) => {
  e.preventDefault();
  const cwd = $("newCwd").value.trim();
  if (!cwd.startsWith("/")) return;
  await select({
    id: "new",
    agent: $("newAgent").value === "claude" ? "claude" : "codex",
    updatedAt: Date.now(),
    cwd,
    title: "New conversation",
    managed: true,
  });
  $("newDialog").close();
  await connectNative(true);
};
$("copyResume").onclick = async () => {
  if (!selected || selected.id === "new") return;
  const cmd = `agentflow run ${selected.agent} --resume ${selected.id}`;
  await navigator.clipboard.writeText(cmd);
  notice(
    "Copied: " +
      cmd +
      "\nThis opens another view of the same running native terminal. Both stay synchronized.",
  );
};
async function connectNative(create = true) {
  if (!selected) return;
  if (create) {
    const n = await api("/terminals", parseSession, {
      method: "POST",
      body: { agent: selected.agent, id: selected.id, cwd: selected.cwd },
    });
    selected = { ...selected, ...n };
    $("sessionId").textContent = n.id;
  }
  nativeSocket?.close();
  nativeTerm?.dispose();
  $("nativePanel").hidden = false;
  nativeTerm = new window.Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "Menlo, monospace",
    theme: { background: "#111215", foreground: "#e8eaf0" },
    scrollback: 3000,
  });
  nativeFit = new window.FitAddon.FitAddon();
  nativeTerm.loadAddon(nativeFit);
  nativeTerm.open($("nativeTerminal"));
  nativeFit.fit();
  nativeSocket = new WebSocket(
    location.origin.replace("http", "ws") + "/terminal",
  );
  const ws = nativeSocket;
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        type: "attach",
        token,
        agent: selected!.agent,
        id: selected!.id,
      }),
    );
  nativeTerm.onData((data) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "input", data }));
  });
  ws.onmessage = (e) => {
    const m = parseTerminalServerMessage(JSON.parse(e.data));
    if (!selected || !nativeTerm) return;
    if (m.type === "output") nativeTerm.write(m.data);
    if (m.type === "session") {
      selected.id = m.id;
      $("sessionId").textContent = m.id;
      localStorage.setItem(
        "agentflow.selection",
        JSON.stringify({ agent: selected.agent, id: m.id }),
      );
    }
    if (m.type === "attached") {
      $("liveConnect").textContent = "Live terminal connected";
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: nativeTerm.cols,
          rows: nativeTerm.rows,
        }),
      );
    }
    if (m.type === "error") notice(m.error);
    if (m.type === "exit")
      notice("The native agent exited. Its saved conversation is preserved.");
  };
  window.addEventListener("resize", () => {
    if (nativeTerm) {
      nativeFit.fit();
      if (ws.readyState === 1)
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: nativeTerm.cols,
            rows: nativeTerm.rows,
          }),
        );
    }
  });
}
$("liveConnect").onclick = () => connectNative().catch(report);
$("hideNative").onclick = () => {
  $("nativePanel").hidden = true;
};
setInterval(async () => {
  if (!selected || selected.id === "new" || currentJob || historyPolling)
    return;
  historyPolling = true;
  const id = selected.id,
    agent = selected.agent,
    g = generation;
  try {
    const d = await api("/history?agent=" + agent + "&id=" + id, parseHistory);
    if (g !== generation || selected?.id !== id) return;
    const signature = JSON.stringify(d.messages);
    if (signature !== historySignature) {
      const previous = historySignature;
      historySignature = signature;
      $("messages").replaceChildren();
      for (const m of d.messages) message(m.role, m.text, m.timestamp);
      const last = d.messages.filter((m) => m.role === "assistant").at(-1);
      if (last) {
        const changed = last.text !== lastReply;
        lastReply = last.text;
        if (changed && previous && call && !recording) {
          aborter = new AbortController();
          for (const c of sentences(last.text, true).ready) queueSpeech(c, g);
        }
      }
    }
  } catch {
  } finally {
    historyPolling = false;
  }
}, 1200);
window.addEventListener("beforeunload", () => {
  stopPreview();
  releaseMic();
  audio?.pause();
});
async function boot() {
  const pending = sessionStorage.getItem("agentflow.job");
  try {
    token = string(record(await (await fetch("/api/bootstrap")).json()).token);
    settings = await api("/settings", parsePublicSettings);
    paintSettings();
    await refresh();
    const hash = new URLSearchParams(location.hash.slice(1));
    let remembered: Record<string, unknown> | undefined;
    try {
      remembered = record(
        JSON.parse(localStorage.getItem("agentflow.selection") || "null"),
      );
    } catch {}
    const target = sessions.find(
      (s) =>
        s.agent === (hash.get("agent") || remembered?.agent) &&
        s.id === (hash.get("session") || remembered?.id),
    );
    if (target) await select(target);
    if (pending) {
      notice(
        "A turn was running before this page reloaded. Inspect its native history before sending another message.",
      );
    }
    if (document.modelContext?.registerTool) {
      document.modelContext.registerTool({
        name: "list_agent_sessions",
        description: "List available local Codex and Claude Code sessions.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => ({
          sessions: (await api("/sessions", parseSessionList)).sessions,
        }),
      });
      document.modelContext.registerTool({
        name: "select_agent_session",
        description:
          "Select an existing session in the visible dashboard without submitting a message.",
        inputSchema: {
          type: "object",
          properties: {
            agent: { enum: ["codex", "claude"] },
            id: { type: "string" },
          },
          required: ["agent", "id"],
          additionalProperties: false,
        },
        execute: async ({ agent, id }) => {
          const s = sessions.find((s) => s.agent === agent && s.id === id);
          if (!s) throw Error("Unknown session");
          await select(s);
          return { agent, id };
        },
      });
    }
  } catch (e) {
    report(e);
  }
}
boot();
