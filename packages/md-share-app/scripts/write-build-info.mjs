import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  // Ignore git errors, default to unknown
}

const content = `// This file is auto-generated during the build process. Do not commit.
export const version = ${JSON.stringify(pkg.version)};
export const build_commit = ${JSON.stringify(commit)};
`;

const outputPath = path.resolve(__dirname, '../functions/_build-info.ts');
fs.writeFileSync(outputPath, content, 'utf8');
console.log(`[write-build-info] Wrote version=${pkg.version}, commit=${commit} to ${outputPath}`);
