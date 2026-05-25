import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
