import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['node_modules/**', '.next/**', 'next-env.d.ts', 'docs/brand/assets/archive/**'],
  },
  {
    // This rule targets the pages-router idiom (fonts declared per-page in
    // pages/_document.js). It false-positives on the App Router's root
    // layout, where a <link> in the shared layout already applies
    // site-wide — see https://github.com/vercel/next.js/discussions for
    // the same report from other App Router projects.
    rules: {
      '@next/next/no-page-custom-font': 'off',
    },
  },
];

export default eslintConfig;
