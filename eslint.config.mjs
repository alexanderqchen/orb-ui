import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'demo/dist/**',
      'node_modules/**',
      'demo/node_modules/**',
      'coverage/**',
      'outputs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      sourceType: 'module',
    },
  },
]
