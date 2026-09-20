import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  webServer: {
    command: "node dist/src/server.js",
    url: "http://127.0.0.1:4318",
    env: {
      AGENTFLOW_PORT: "4318",
      AGENTFLOW_HOME: "test-results/server-state",
    },
    reuseExistingServer: false,
  },
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4318",
    headless: true,
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
