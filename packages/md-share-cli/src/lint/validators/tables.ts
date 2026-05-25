import type { DocValidator } from '../types.js';

export const tablesValidator: DocValidator = {
  name: 'tables',
  validate(md) {
    const errs: string[] = [];
    const lines = md.split(/\r?\n/);
    const fenceOpenRe = /^\s*(`{3,}|~{3,})/;
    let fenceChar: string | null = null;
    let fenceLen = 0;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(fenceOpenRe);
      if (m) {
        if (fenceChar === null) {
          fenceChar = m[1][0];
          fenceLen = m[1].length;
        } else if (m[1][0] === fenceChar && m[1].length >= fenceLen) {
          fenceChar = null;
          fenceLen = 0;
        }
        i++; continue;
      }
      if (fenceChar !== null) { i++; continue; }

      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length) {
        const sep = lines[i + 1];
        if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(sep)) {
          const headerCols = line.trim().replace(/^\||\|$/g, '').split('|').length;
          let row = i + 2;
          while (row < lines.length && /^\s*\|.*\|\s*$/.test(lines[row])) {
            const cols = lines[row].trim().replace(/^\||\|$/g, '').split('|').length;
            if (cols !== headerCols) {
              errs.push(
                `L${row + 1}: table row has ${cols} columns but header has ${headerCols}`
              );
            }
            row++;
          }
          i = row;
          continue;
        }
      }
      i++;
    }
    return errs;
  }
};
