import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npx vite --port 5199', port: 5199, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PW_CHROMIUM },
      },
    },
    {
      name: 'ipad',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'chromium',
        launchOptions: { executablePath: process.env.PW_CHROMIUM },
      },
    },
  ],
});
