import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const authFile = 'auth/session.json';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 0,
  workers: 1,

  use: {
    baseURL: 'https://neurealm.darwinbox.in',
    headless: false,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  projects: [
    // Auth setup project — runs first
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Main tests — depend on setup, reuse saved session
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
