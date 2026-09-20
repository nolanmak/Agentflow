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
  },
  defaults: {
    deepgram: { stt: "nova-3", tts: "aura-2-thalia-en", voice: "" },
    openai: {
      stt: "gpt-4o-mini-transcribe",
      tts: "gpt-4o-mini-tts",
      voice: "coral",
    },
    elevenlabs: { stt: "scribe_v2", tts: "eleven_flash_v2_5", voice: "" },
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
