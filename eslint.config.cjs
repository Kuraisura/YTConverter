const nextConfig = require('eslint-config-next');

module.exports = [
  ...nextConfig,
  {
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];
