import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against production builds of both apps:
//   viewer  http://localhost:4173  (accepts previews from the editor below)
//   editor  http://localhost:4174  (talks to the viewer above)
// The exhibitions are prepared offline so the tests do not depend on manuscripta.se
// for anything but image tiles.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "node scripts/prepare-exhibitions.mjs --offline && npm run build --prefix viewer && npm run preview --prefix viewer -- --strictPort",
      url: "http://localhost:4173",
      env: { VITE_EDITOR_ORIGINS: "http://localhost:4174" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npm run build --prefix editor && npm run preview --prefix editor -- --strictPort",
      url: "http://localhost:4174",
      env: { VITE_VIEWER_URL: "http://localhost:4173/" },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
