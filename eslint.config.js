import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'functions/lib/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.runtime/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules, 'react-hooks/set-state-in-effect': 'off' },
  },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
