import {
  record,
  isProvider,
  type PublicSettings,
  type TurnInput,
} from "../../public/contracts.js";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const settings: PublicSettings = {
  stt: { provider: "deepgram", model: "nova-3" },
  tts: { provider: "deepgram", model: "aura-2-thalia-en", voice: "" },
  routerUrl: "http://127.0.0.1:20128",
  configured: {
    deepgram: true,
    openai: false,
    elevenlabs: false,
    "9router": false,
    "local-whisper": true,
    "local-kokoro": true,
  },
  defaults: {
    deepgram: { stt: "nova-3", tts: "aura-2-thalia-en", voice: "" },
    openai: {
      stt: "gpt-4o-mini-transcribe",
      tts: "gpt-4o-mini-tts",
      voice: "coral",
    },
    elevenlabs: { stt: "scribe_v2", tts: "eleven_flash_v2_5", voice: "" },
    "local-whisper": { stt: "base.en", tts: "", voice: "" },
    "local-kokoro": { stt: "", tts: "kokoro", voice: "af_heart" },
    "9router": { stt: "", tts: "", voice: "" },
  },
};
function wav() {
  const b = Buffer.alloc(44 + 1600);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(1600, 40);
  return b;
}
async function mock(page: Page) {
  let cfg = structuredClone(settings),
    turn: TurnInput | undefined;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data;
    if (path === "/api/bootstrap") data = { token: "test-token" };
    else if (path === "/api/sessions")
      data = {
        sessions: [
          {
            agent: "codex",
            id,
            title: "Native sync test",
            cwd: "/tmp/test-project",
            updatedAt: Date.now(),
            managed: true,
          },
        ],
        errors: [],
      };
    else if (path === "/api/history")
      data = {
        messages: [
          {
            role: "user",
            text: "Earlier terminal message",
            timestamp: "2026-09-18T20:00:00Z",
          },
          {
            role: "assistant",
            text: "Earlier native reply",
            timestamp: "2026-09-18T20:00:02Z",
          },
        ],
      };
    else if (path === "/api/settings") {
      if (route.request().method() === "PUT")
        cfg = { ...cfg, ...route.request().postDataJSON() };
      data = cfg;
    } else if (path === "/api/keys") {
      const x = record(route.request().postDataJSON());
      if (!isProvider(x.provider)) throw Error("Invalid test provider");
      cfg.configured[x.provider] = !x.remove;
      data = { ok: true };
    } else if (path === "/api/transcribe")
      data = { text: "What did we discuss yesterday?" };
    else if (path === "/api/turns") {
      turn = route.request().postDataJSON();
      data = {
        ...turn,
        id: turn!.id,
        status: "running",
        reply: "",
        events: [],
        createdAt: "2026-09-19T00:00:00Z",
      };
    } else if (path.startsWith("/api/jobs/"))
      data = {
        ...turn,
        events: [],
        createdAt: "2026-09-19T00:00:00Z",
        id: turn!.id,
        sessionId: id,
        status: "complete",
        reply: "We discussed the terminal session.",
      };
    else if (path === "/api/synthesize")
      return route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: wav(),
      });
    else
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected test endpoint " + path },
      });
    await route.fulfill({ json: data });
  });
  return () => turn;
}
test("session picker, historical timestamps, safe rendering, and provider swaps", async ({
  page,
}) => {
  await mock(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await expect(page.locator("#sessionTitle")).toHaveText("Native sync test");
  await page.getByRole("button", { name: "Show transcript" }).click();
  await expect(page.locator("#messages")).toContainText(
    "Earlier terminal message",
  );
  await expect(page.locator("#messages time").first()).toContainText("2026");
  await page.locator("#settingsButton").click();
  await page.locator("#ttsProvider").selectOption("openai");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("#ttsLabel")).toHaveText("OpenAI speaks");
  await expect(page.locator("#sttLabel")).toHaveText("Deepgram listens");
  expect(errors).toEqual([]);
});
test("microphone → exact transcript → same native ID → spoken reply", async ({
  page,
}) => {
  const getTurn = await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page
    .getByRole("button", { name: "◉ Start talking", exact: true })
    .click();
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "■ Send recording" }).click();
  await expect(page.locator("#state")).toHaveText("Your turn", {
    timeout: 15000,
  });
  expect(getTurn()!.text).toBe("What did we discuss yesterday?");
  expect(getTurn()!.sessionId).toBe(id);
  expect(getTurn()!.voice).toBe(false);
  await page.locator("#end").click();
  await expect(page.locator("#state")).toHaveText("Ready when you are");
});
test("desktop and narrow layouts have usable controls without horizontal overflow", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#talk")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
});
test("Deepgram picker saves the selected voice and preserves listening/session across reload", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#settingsButton").click();
  await expect(
    page.getByLabel("Deepgram voice", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Deepgram voice", { exact: true })
    .selectOption("aura-2-helena-en");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("#ttsLabel")).toContainText("Helena");
  await expect(page.locator("#sttLabel")).toHaveText("Deepgram listens");
  await page.reload();
  await expect(page.locator("#sessionId")).toHaveText(id);
  await page.locator("#settingsButton").click();
  await expect(page.getByLabel("Deepgram voice", { exact: true })).toHaveValue(
    "aura-2-helena-en",
  );
});
test("voice speed saves at 2× and applies to preview playback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const playbackRates: number[] = [];
    Object.defineProperty(window, "agentflowPlaybackRates", {
      value: playbackRates,
    });
    HTMLMediaElement.prototype.play = function () {
      playbackRates.push(this.playbackRate);
      queueMicrotask(() => this.dispatchEvent(new Event("ended")));
      return Promise.resolve();
    };
  });
  await mock(page);
  await page.goto("/");
  await page.locator("#settingsButton").click();
  await page.getByLabel("Voice speed", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#message").fill("Read this at two times speed.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#state")).toHaveText("Your turn");
  await page.locator("#settingsButton").click();
  await expect(page.getByLabel("Voice speed", { exact: true })).toHaveValue(
    "2",
  );
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  await expect(page.locator("#settingsNotice")).toContainText(
    "Preview finished",
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { agentflowPlaybackRates: number[] })
          .agentflowPlaybackRates,
    ),
  ).toEqual([2, 2]);
});
test("Deepgram key gates voice picker and preview; other providers keep manual voice fields", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.locator("#settingsButton").click();
  const row = page
    .locator(".keyrow")
    .filter({ has: page.getByLabel("Deepgram API key") });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByLabel("Deepgram voice", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview voice", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#deepgramVoiceHelp")).toContainText(
    "Add a Deepgram key",
  );
  await page.getByLabel("Deepgram API key").fill("TEST_ONLY");
  await row.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(
    page.getByLabel("Deepgram voice", { exact: true }),
  ).toBeEnabled();
  await page.locator("#ttsProvider").selectOption("openai");
  await expect(page.getByLabel("Deepgram voice", { exact: true })).toBeHidden();
  await expect(page.locator("#ttsVoice")).toBeVisible();
});
test("preview uses unsaved voice without updating settings or submitting a native turn", async ({
  page,
}) => {
  const getTurn = await mock(page);
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT") mutations.push(r.url());
  });
  await page.goto("/");
  await page.locator("#settingsButton").click();
  await page
    .getByLabel("Deepgram voice", { exact: true })
    .selectOption("aura-2-delia-en");
  const req = page.waitForRequest((r) => r.url().endsWith("/api/synthesize"));
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  expect((await req).postDataJSON().model).toBe("aura-2-delia-en");
  await expect(page.locator("#settingsNotice")).toContainText(
    "Preview finished",
  );
  expect(mutations).toEqual([]);
  expect(getTurn()).toBeUndefined();
  await page.locator("#closeSettings").click();
  await page.locator("#settingsButton").click();
  await expect(page.getByLabel("Deepgram voice", { exact: true })).toHaveValue(
    "aura-2-thalia-en",
  );
});
test("changing voice or closing settings discards an in-flight preview; errors stay visible", async ({
  page,
}) => {
  await mock(page);
  let release: () => void = () => {
    throw Error("Preview not started");
  };
  await page.route("**/api/synthesize", async (route) => {
    await new Promise<void>((r) => (release = r));
    await route
      .fulfill({ status: 503, json: { error: "Preview provider unavailable" } })
      .catch(() => {});
  });
  await page.goto("/");
  await page.locator("#settingsButton").click();
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop preview", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Deepgram voice", { exact: true })
    .selectOption("aura-2-hera-en");
  release();
  await expect(page.locator("#settingsNotice")).toHaveText(
    "Save preferences to use this voice.",
  );
  await expect(
    page.getByRole("button", { name: "Preview voice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop preview", exact: true }),
  ).toBeVisible();
  await page.locator("#closeSettings").click();
  release();
  await page.locator("#settingsButton").click();
  await expect(page.locator("#settingsNotice")).toBeEmpty();
  await page.unroute("**/api/synthesize");
  await page.route("**/api/synthesize", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Preview provider unavailable" },
    }),
  );
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  await expect(page.locator("#settingsNotice")).toHaveText(
    "Preview provider unavailable",
  );
});
test("voice preview is blocked during an active microphone conversation", async ({
  page,
}) => {
  await mock(page);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/synthesize")) calls++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page.locator("#talk").click();
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.locator("#settingsButton").click();
  await page
    .getByRole("button", { name: "Preview voice", exact: true })
    .click();
  await expect(page.locator("#settingsNotice")).toContainText(
    "End the current conversation",
  );
  expect(calls).toBe(0);
});
test("local listening persists independently and is unavailable as TTS or API key", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#settingsButton").click();
  await page.locator("#sttProvider").selectOption("local-whisper");
  await page.getByLabel("Local Whisper URL").fill("http://127.0.0.1:17864");
  await expect(
    page.locator('#ttsProvider option[value="local-whisper"]'),
  ).toHaveCount(0);
  await expect(page.getByLabel("Local Whisper API key")).toHaveCount(0);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("#sttLabel")).toHaveText("Local Whisper listens");
  await expect(page.locator("#ttsLabel")).toContainText("Deepgram");
  await page.reload();
  await expect(page.locator("#sessionId")).toHaveText(id);
  await page.locator("#settingsButton").click();
  await expect(page.getByLabel("Local Whisper URL")).toHaveValue(
    "http://127.0.0.1:17864",
  );
});
test("recording snapshots listening settings and canceled inference cannot submit a turn", async ({
  page,
}) => {
  const getTurn = await mock(page);
  let snapshot: unknown;
  let release: () => void = () => {};
  await page.route("**/api/transcribe", async (route) => {
    snapshot = route.request().headers()["x-agentflow-stt"];
    await new Promise<void>((r) => (release = r));
    await route.fulfill({ json: { text: "late transcript" } }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page.locator("#talk").click();
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.waitForTimeout(300);
  await page.locator("#talk").click();
  await expect.poll(() => snapshot).toBeTruthy();
  expect(JSON.parse(String(snapshot)).stt.provider).toBe("deepgram");
  await page.locator("#end").click();
  release();
  await page.waitForTimeout(200);
  expect(getTurn()).toBeUndefined();
});
test("starting another recording invalidates the previous pending transcript", async ({
  page,
}) => {
  const getTurn = await mock(page);
  let release: () => void = () => {};
  let received = false;
  await page.route("**/api/transcribe", async (route) => {
    received = true;
    await new Promise<void>((r) => (release = r));
    await route.fulfill({ json: { text: "superseded" } }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page.locator("#talk").click();
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.waitForTimeout(300);
  await page.locator("#talk").click();
  await expect.poll(() => received).toBe(true);
  await page.locator("#talk").click();
  await expect(page.locator("#state")).toHaveText("Listening");
  release();
  await page.waitForTimeout(200);
  expect(getTurn()).toBeUndefined();
  await page.locator("#end").click();
});
test("out-of-order microphone permission results release every acquired track", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const microphoneRequests: { stream: MediaStream; release: () => void }[] =
      [];
    Object.assign(window, { microphoneRequests });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      await new Promise<void>((release) =>
        microphoneRequests.push({ stream, release }),
      );
      return stream;
    };
  });
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page.locator("#talk").click();
  const count = () =>
    page.evaluate(
      () =>
        (window as unknown as { microphoneRequests: unknown[] })
          .microphoneRequests.length,
    );
  await expect.poll(count).toBe(1);
  await page.locator("#talk").click();
  await expect.poll(count).toBe(2);
  await page.evaluate(() =>
    (
      window as unknown as { microphoneRequests: { release: () => void }[] }
    ).microphoneRequests[1]!.release(),
  );
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.evaluate(() =>
    (
      window as unknown as { microphoneRequests: { release: () => void }[] }
    ).microphoneRequests[0]!.release(),
  );
  await page.locator("#end").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { microphoneRequests: { stream: MediaStream }[] }
        ).microphoneRequests.flatMap((r) =>
          r.stream.getTracks().map((t) => t.readyState),
        ),
      ),
    )
    .toEqual(["ended", "ended"]);
});
test("stale microphone permission rejection cannot stop the current recording", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    let requests = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (++requests === 1)
        return new Promise<MediaStream>((_, reject) =>
          Object.assign(window, {
            rejectOldMicrophone: () => reject(Error("Old permission denied")),
          }),
        );
      return original(constraints);
    };
  });
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#handsfree").uncheck();
  await page.locator("#talk").click();
  await page.locator("#talk").click();
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.evaluate(() =>
    (
      window as unknown as { rejectOldMicrophone: () => void }
    ).rejectOldMicrophone(),
  );
  await expect(page.locator("#state")).toHaveText("Listening");
  await page.locator("#end").click();
});

test("local Kokoro output is independent, keyless and saved with voice and speed", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.locator("#settingsButton").click();
  await expect(
    page.locator('#ttsProvider option[value="local-kokoro"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#sttProvider option[value="local-kokoro"]'),
  ).toHaveCount(0);
  await page.locator("#ttsProvider").selectOption("local-kokoro");
  await expect(page.locator("#ttsVoice")).toHaveValue("af_heart");
  await expect(page.getByLabel("Local Kokoro API key")).toHaveCount(0);
  await page.locator("#ttsSpeed").selectOption("1.25");
  const saved = page.waitForRequest(
    (r) => r.url().endsWith("/api/settings") && r.method() === "PUT",
  );
  await page.getByRole("button", { name: "Save preferences" }).click();
  const body = (await saved).postDataJSON();
  expect(body.stt.provider).toBe("deepgram");
  expect(body.tts).toMatchObject({
    provider: "local-kokoro",
    model: "kokoro",
    voice: "af_heart",
    speed: 1.25,
    baseUrl: "http://127.0.0.1:17865",
  });
  await expect(page.locator("#ttsLabel")).toContainText("Local Kokoro speaks");
  await page.locator("#testVoice").click();
  await expect(page.locator("#state")).not.toHaveText("Error");
});

test("voice test can be interrupted during synthesis and cannot play a late response", async ({
  page,
}) => {
  await mock(page);
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/synthesize", async (route) => {
    await held;
    await route
      .fulfill({ contentType: "audio/wav", body: wav() })
      .catch(() => {});
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "playedCount", { value: { count: 0 } });
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { playedCount: { count: number } }).playedCount
        .count++;
      return Promise.resolve();
    };
  });
  await page.goto("/");
  const pending = page.waitForRequest("**/api/synthesize");
  await page.locator("#testVoice").click();
  await pending;
  await expect(page.locator("#interrupt")).toBeEnabled();
  await page.locator("#interrupt").click();
  release();
  await expect(page.locator("#state")).toHaveText("Interrupted");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { playedCount: { count: number } }).playedCount
          .count,
    ),
  ).toBe(0);
});

test("local voice playback pauses within 250ms and replay never dispatches a new turn", async ({
  page,
}) => {
  await mock(page);
  let turns = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/turns")) turns++;
  });
  const long = Buffer.alloc(44 + 160000);
  wav().copy(long, 0, 0, 44);
  long.writeUInt32LE(long.length - 8, 4);
  long.writeUInt32LE(long.length - 44, 40);
  for (let i = 44; i < long.length; i += 2)
    long.writeInt16LE(
      Math.round(1000 * Math.sin((((i - 44) / 2) * Math.PI * 2 * 440) / 8000)),
      i,
    );
  await page.route("**/api/synthesize", (r) =>
    r.fulfill({ contentType: "audio/wav", body: long }),
  );
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      Object.assign(window, { testAudio: this });
      return play.call(this);
    };
  });
  await page.goto("/");
  await page.locator("#settingsButton").click();
  await page.locator("#ttsProvider").selectOption("local-kokoro");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.getByRole("button", { name: "Show transcript" }).click();
  await page.locator("#replay").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as unknown as { testAudio?: HTMLAudioElement })
          .testAudio;
        return Boolean(a && !a.paused && a.currentTime > 0);
      }),
    )
    .toBe(true);
  const elapsed = await page.evaluate(() => {
    const a = (window as unknown as { testAudio: HTMLAudioElement }).testAudio;
    const start = performance.now();
    document.getElementById("interrupt")!.click();
    if (!a.paused) throw Error("Playback did not pause synchronously");
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThanOrEqual(250);
  console.log("Local playback interrupt ms:", elapsed);
  expect(turns).toBe(0);
});

test("interrupting replay preserves Interrupted after a delayed synthesis response", async ({
  page,
}) => {
  await mock(page);
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/synthesize", async (route) => {
    await held;
    await route
      .fulfill({ contentType: "audio/wav", body: wav() })
      .catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.getByRole("button", { name: "Show transcript" }).click();
  const pending = page.waitForRequest("**/api/synthesize");
  await page.locator("#replay").click();
  await pending;
  await page.locator("#interrupt").click();
  release();
  await expect(page.locator("#state")).toHaveText("Interrupted");
});

test("failed speech keeps the error and explicit replay retries ordered sentences without another agent turn", async ({
  page,
}) => {
  await mock(page);
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      queueMicrotask(() => this.dispatchEvent(new Event("ended")));
      return Promise.resolve();
    };
  });
  let fail = true,
    turns = 0;
  const spoken: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/turns")) turns++;
  });
  await page.route("**/api/jobs/*", (r) =>
    r.fulfill({
      json: {
        id: "fixture",
        agent: "codex",
        sessionId: id,
        cwd: "/tmp/test-project",
        text: "hello",
        status: "complete",
        reply: "First sentence. Second sentence.",
        events: [],
        createdAt: "2026-09-19T00:00:00Z",
      },
    }),
  );
  await page.route("**/api/synthesize", (r) => {
    spoken.push(r.request().postDataJSON().text);
    return fail
      ? r.fulfill({
          status: 503,
          json: { error: "Local engine is unavailable" },
        })
      : r.fulfill({ contentType: "audio/wav", body: wav() });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Native sync test/ }).click();
  await page.locator("#message").fill("hello");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#state")).toHaveText("Let’s try that again");
  expect(spoken).toEqual(["First sentence."]);
  fail = false;
  await page.getByRole("button", { name: "Show transcript" }).click();
  await page.locator("#replay").click();
  await expect(page.locator("#hint")).toHaveText("Replay complete.");
  expect(spoken).toEqual([
    "First sentence.",
    "First sentence.",
    "Second sentence.",
  ]);
  expect(turns).toBe(1);
});
