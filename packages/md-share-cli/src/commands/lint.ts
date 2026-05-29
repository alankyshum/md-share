import fs from 'node:fs';
import { lintMarkdown } from '../lint/index.js';
import { smokeTestRender } from '../lint/render-smoke.js';

/**
 * `md-share lint <file>` — run the full lint pipeline (structural + render
 * smoke) without uploading. Useful for CI and pre-commit hooks.
 */
export async function lintFileCommand(
  fileArg: string,
  options: { skipSmoke?: boolean },
): Promise<void> {
  let md = '';
  try {
    md = fileArg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(fileArg, 'utf8');
  } catch (e) {
    console.error(`Error reading "${fileArg}": ${(e as Error).message}`);
    process.exit(1);
  }

  let hadErrors = false;

  const structural = lintMarkdown(md);
  if (structural.length > 0) {
    hadErrors = true;
    console.error('Structural lint errors:');
    for (const err of structural) console.error(`  • ${err}`);
  }

  if (!options.skipSmoke) {
    try {
      const smoke = await smokeTestRender(md);
      if (smoke.length > 0) {
        hadErrors = true;
        console.error(structural.length > 0 ? '\nRender smoke errors:' : 'Render smoke errors:');
        for (const e of smoke) console.error(`  • L${e.startLine} [${e.kind}]: ${e.message}`);
      }
    } catch (e) {
      console.warn(`Warning: render smoke test skipped: ${(e as Error).message}`);
    }
  }

  if (hadErrors) process.exit(2);
  console.error('[OK] lint passed');
}
