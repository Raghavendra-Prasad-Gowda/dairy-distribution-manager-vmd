import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
