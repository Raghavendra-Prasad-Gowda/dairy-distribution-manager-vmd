import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

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
const tag = (process.env.VITE_APP_VERSION || git('describe', '--tags', '--abbrev=0') || '').replace(/^v/, '')

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
    setupFiles: ['./src/test/setup.js'],
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
