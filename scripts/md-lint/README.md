# md-lint

Build-time markdown linter for share-md.

## Build

```bash
npm install && npm run build
```

Emits `../md-lint.mjs` (a single self-contained ESM file with shebang).

## Usage

```bash
node scripts/md-lint.mjs <file>
cat foo.md | node scripts/md-lint.mjs -
```

Exit 0 = clean. Exit 2 = errors printed to stderr.

## Adding new validators

1. Add a file under `src/validators/` implementing `FenceValidator` or `DocValidator`
2. Register it in `src/registry.ts`
3. Rebuild
