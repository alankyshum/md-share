import { readFileSync } from 'node:fs';
import { lintMarkdown } from './index.js';

const HELP = `md-lint — validate markdown for share-md
Usage:
  md-lint <file>     Lint file. Exit 0 = clean, exit 2 = errors (printed to stderr).
  md-lint -          Read from stdin.
  md-lint --help     Show this help.`;

const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') {
  console.log(HELP);
  process.exit(arg ? 0 : 2);
}

let md: string;
try {
  md = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
} catch (e) {
  console.error(`md-lint: cannot read ${arg}: ${(e as Error).message}`);
  process.exit(2);
}

const errors = lintMarkdown(md);
if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(2);
}
process.exit(0);
