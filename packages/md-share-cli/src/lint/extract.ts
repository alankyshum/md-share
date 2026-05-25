import type { Block } from './types.js';

export function extractBlocks(md: string): { blocks: Block[]; unbalancedAt: number | null } {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let inBlock = false;
  let curLang = '';
  let curBody: string[] = [];
  let curStart = 0;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(\s*)(```+|~~~+)([^\s`~]*)/);
    if (fence) {
      const thisFenceChar = fence[2][0];
      const thisFenceLen = fence[2].length;
      if (!inBlock) {
        inBlock = true;
        fenceChar = thisFenceChar;
        fenceLen = thisFenceLen;
        curLang = fence[3].trim().toLowerCase();
        curBody = [];
        curStart = i + 1;
      } else if (thisFenceChar === fenceChar && thisFenceLen >= fenceLen && !fence[3]) {
        blocks.push({ lang: curLang, body: curBody.join('\n'), startLine: curStart });
        inBlock = false;
        curLang = '';
        curBody = [];
        fenceChar = '';
        fenceLen = 0;
      } else {
        curBody.push(line);
      }
    } else if (inBlock) {
      curBody.push(line);
    }
  }
  return { blocks, unbalancedAt: inBlock ? curStart : null };
}
