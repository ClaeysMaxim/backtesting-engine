import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const nonDeterministic = 'Breaks determinism (see CLAUDE.md).';

export default defineConfig(
  js.configs.recommended,
  {
    // The only recommended rule that conflicts with Prettier, which can split long chains
    // so it fires; Prettier's semicolons already prevent the ASI bugs it guards against.
    rules: { 'no-unexpected-multiline': 'off' },
  },
  {
    files: ['**/*.ts'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: `${nonDeterministic} Pass a seeded RNG instead.`,
        },
        {
          object: 'Date',
          property: 'now',
          message: `${nonDeterministic} Use candle timestamps instead.`,
        },
        {
          object: 'performance',
          property: 'now',
          message: `${nonDeterministic} Use candle timestamps instead.`,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: `${nonDeterministic} new Date() reads the system clock.`,
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: `${nonDeterministic} Date() reads the system clock.`,
        },
        {
          selector: 'MemberExpression[property.name=/^toLocale/]',
          message: `${nonDeterministic} Output depends on the locale.`,
        },
        {
          selector: "MemberExpression[property.name='localeCompare']",
          message: `${nonDeterministic} Sort order depends on the locale.`,
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Intl',
          message: `${nonDeterministic} Output depends on the locale.`,
        },
      ],
    },
  },
);
