import { extractBlocks } from './extract.js';
import { BUILTIN_FENCE_VALIDATORS, BUILTIN_DOC_VALIDATORS } from './registry.js';
import type { FenceValidator } from './types.js';

export function lintMarkdown(md: string): string[] {
  const errors: string[] = [];
  const { blocks, unbalancedAt } = extractBlocks(md);
  if (unbalancedAt !== null) {
    errors.push(`L${unbalancedAt}: unclosed fenced code block (missing closing \`\`\`)`);
  }

  const fenceMap = new Map<string, FenceValidator>();
  for (const v of BUILTIN_FENCE_VALIDATORS) {
    const langs = Array.isArray(v.lang) ? v.lang : [v.lang];
    for (const l of langs) {
      fenceMap.set(l, v);
    }
  }

  for (const block of blocks) {
    const v = fenceMap.get(block.lang);
    if (!v) continue;
    if (v.validate) {
      errors.push(...v.validate(block.body, { startLine: block.startLine }));
    }
  }

  for (const dv of BUILTIN_DOC_VALIDATORS) {
    errors.push(...dv.validate(md));
  }
  return errors;
}

export { extractBlocks } from './extract.js';
export type { FenceValidator, DocValidator } from './types.js';
