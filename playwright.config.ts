import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * The e2e test mutates the local SQLite database (it starts a real delivery),
 * therefore it calls POST /api/game/reset first to get a deterministic state.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
