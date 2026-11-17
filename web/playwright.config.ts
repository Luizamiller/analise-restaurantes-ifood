import { defineConfig } from "@playwright/test";

// Usa o Edge do sistema (PLAYWRIGHT_CHANNEL=msedge) ou o Chromium do Playwright no CI.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5101", channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: [
    { command: "uv run --directory ../backend uvicorn app.main:app --port 8101", env: { FONTE: process.env.FONTE ?? "sintetica" }, url: "http://127.0.0.1:8101/api/status", reuseExistingServer: true },
    { command: "pnpm exec vite --port 5101 --strictPort", url: "http://localhost:5101", reuseExistingServer: true },
  ],
});
