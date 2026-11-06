import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Build identity shown in the sidebar/login and sent with crash reports.
// Best-effort: Vercel's clone may lack tags, in which case only the commit shows.
const git = (...args) => {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
  } catch {
    return null
  }
}
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || git('rev-parse', 'HEAD') || '').slice(0, 7)
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
// Tag wins; with no tag (or no tags in the host's clone) fall back to package.json.
const tag = (process.env.VITE_APP_VERSION || git('describe', '--tags', '--abbrev=0') || pkgVersion || '').replace(/^v/, '')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(tag),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Fake bill masthead details - the real ones live in the deploy environment (VITE_BILL_*).
    env: {
      VITE_BILL_PROPRIETOR: 'Pro: TEST PROPRIETOR',
      VITE_BILL_ADDRESS: '1 Test Road, Sample Town - 000 000',
      VITE_BILL_PHONES: '9000000001, 9000000002',
    },
    setupFiles: ['./src/test/setup.js'],
    // automation-ui/ is the Playwright suite run against the deployed app, not a Vitest suite.
    exclude: [...configDefaults.exclude, 'automation-ui/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{js,jsx}',
        'src/test/**',
        'src/main.jsx',
        'src/App.jsx', // route wiring + lazy imports only, exercised via pages
      ],
      // Thresholds set a few points below the measured baseline (81.6/72.2/75/83.7
      // stmts/branches/funcs/lines) so this is a real regression gate, not
      // decoration — CI fails if coverage meaningfully drops.
      thresholds: {
        statements: 78,
        branches: 68,
        functions: 70,
        lines: 80,
      },
    },
  },
})
