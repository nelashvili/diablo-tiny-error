import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['.claude', 'dist', 'node_modules', 'public', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // core/ and data/ must stay engine-agnostic: no Three.js, Preact or DOM-layer imports.
    files: ['src/core/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'core/data must not import Three.js' },
            { group: ['preact', 'preact/*', '@preact/*'], message: 'core/data must not import Preact' },
            {
              group: ['@/render/*', '@/ui/*', '@/audio/*', '@/platform/*', '@/game/*'],
              message: 'core/data must not import render/ui/audio/platform/game',
            },
          ],
        },
      ],
    },
  },
);
