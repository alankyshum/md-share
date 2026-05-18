import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { 'md-lint': 'src/cli.ts' },
  outDir: '..',                  // emit to scripts/md-lint.mjs
  format: ['esm'],
  target: 'node18',
  bundle: true,
  noExternal: [/.*/],            // inline all deps
  minify: true,
  splitting: false,
  sourcemap: false,
  clean: false,                  // don't wipe scripts/ contents
  outExtension: () => ({ js: '.mjs' }),
  banner: { js: '#!/usr/bin/env node' },
});
