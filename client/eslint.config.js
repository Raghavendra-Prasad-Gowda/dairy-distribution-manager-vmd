import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // injected by vite.config.js `define`
        __APP_VERSION__: 'readonly',
        __APP_COMMIT__: 'readonly',
        __APP_BUILT_AT__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Without this, base no-unused-vars can't see that a capitalized
      // identifier used only as a JSX tag (<Page />, <Icon />) is a real
      // reference — it was flagging genuinely-used component vars/params as
      // dead code (e.g. App.jsx's `S = (Page) => <Page />` helper).
      'react/jsx-uses-vars': 'error',
    },
  },
])
