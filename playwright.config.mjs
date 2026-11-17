import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const localChrome = process.platform === "win32" && existsSync(join(
  process.env.PROGRAMFILES || "C:/Program Files", "Google/Chrome/Application/chrome.exe",
));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.browser.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || (localChrome ? "chrome" : undefined),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
