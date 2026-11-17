import { defineConfig } from 'tsdown'

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
    external: [/^@deepseek-ai\//, /^node:/],
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    entry: ['src/client/index.tsx'],
    outDir: 'lib',
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    sourcemap: true,
    dts: false,
    external: [/^@deepseek-ai\//, 'react', 'react/jsx-runtime'],
    outputOptions: { entryFileNames: 'client.js' },
  },
])
