import { defineConfig, devices } from "@playwright/test";

const port = 3000;

/**
 * Smoke e2e na zbudowanej aplikacji (docs/engineering-standards.md §4.5).
 * Wymaga `npm run build`, dzialajacego lokalnego Supabase i danych z
 * scripts/e2e-seed.mjs - `npm run test:e2e` robi seed przed testami.
 * CHROME_PATH pozwala uzyc Chromium spoza cache Playwrighta (np. /opt/pw-browsers/chromium).
 */
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
      },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
