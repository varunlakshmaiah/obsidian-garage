// Obsidian's official review rules: https://github.com/obsidianmd/eslint-plugin
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default defineConfig([
  // main.js is the build output; dot folders hold a local test vault's config
  { ignores: ['main.js', 'preview/**', 'node_modules/**', '.*/**'] },
  ...obsidianmd.configs.recommended,
  {
    // Build, release and test scripts run in Node on the developer's machine, never inside Obsidian
    files: ['*.mjs', 'test.cjs'],
    languageOptions: { globals: globals.node },
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
      'obsidianmd/no-global-this': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-nodejs-modules': 'off',
    },
  },
]);
