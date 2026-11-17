import { defineConfig } from 'tsdown'

/**
 * Two standalone bundles.
 *
 * Neither may keep a `@deepseek-ai/*` import: a third-party bundle in a real
 * profile cannot resolve those specifiers, because the host packages live
 * inside the application archive rather than the profile's `node_modules`.
 * `zod` is therefore inlined into the host bundle, and the client bundle keeps
 * only the two host-provided React entries.
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    target: 'node20',
    platform: 'node',
    sourcemap: true,
    clean: true,
    dts: false,
    external: [/^node:/],
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    entry: ['src/client/index.tsx'],
    outDir: 'lib',
    format: 'cjs',
    target: 'es2022',
    platform: 'browser',
    sourcemap: true,
    clean: false,
    dts: false,
    external: ['react', 'react/jsx-runtime'],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-task-lens", factory: (require) => {',
      intro: 'var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
      footer: 'return module.exports; } });',
    },
  },
])
