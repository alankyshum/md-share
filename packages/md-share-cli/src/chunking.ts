import { encodeChunk } from './encoding.js';

export const MAX_PAYLOAD = 28000;

export function encodedLen(text: string): number {
  return encodeChunk(text).length;
}

export function computeSafeSplitLines(md: string): number[] {
  const lines = md.split('\n');
  const safe: number[] = [];
  let inFence = false;
  const fenceRe = /^(`{3,}|~{3,})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = fenceRe.test(line);
    if (m) {
      inFence = !inFence;
    }

    if (!inFence && i > 0) {
      // Prefer headings or blank lines
      if (/^#{1,6} /.test(line)) {
        safe.push(i);
      } else if (line.trim() === '') {
        safe.push(i);
      } else {
        safe.push(i);
      }
    }
  }

  return safe.length > 0 ? safe : Array.from({ length: lines.length - 1 }, (_, i) => i + 1);
}

export function splitIntoNParts(md: string, n: number): string[] {
  const lines = md.split('\n');
  const safeLines = computeSafeSplitLines(md);
  
  if (safeLines.length === 0) {
    const chunkSize = Math.max(1, Math.floor(lines.length / n));
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    return chunks;
  }

  const targetPerChunk = lines.length / n;
  const chunks: string[] = [];
  let currentStart = 0;

  for (let i = 1; i < n; i++) {
    const ideal = Math.round(i * targetPerChunk);
    const candidates = safeLines.filter((x) => x > currentStart);
    if (candidates.length === 0) {
      break;
    }
    const best = candidates.reduce((prev, curr) =>
      Math.abs(curr - ideal) < Math.abs(prev - ideal) ? curr : prev
    );
    chunks.push(lines.slice(currentStart, best).join('\n'));
    currentStart = best;
  }

  chunks.push(lines.slice(currentStart).join('\n'));
  const filtered = chunks.filter((c) => c.trim() !== '');
  return filtered.length > 0 ? filtered : [md];
}

export function chunkMarkdown(md: string): string[] {
  if (encodedLen(md) <= MAX_PAYLOAD) {
    return [md];
  }

  const encLen = encodedLen(md);
  let nParts = Math.floor(encLen / MAX_PAYLOAD) + 1;

  while (true) {
    const chunks = splitIntoNParts(md, nParts);
    const allFit = chunks.every((c) => encodedLen(c) <= MAX_PAYLOAD);
    if (allFit) {
      return chunks;
    }
    nParts += 1;
    if (nParts > 100) {
      throw new Error('markdown too large to chunk reasonably (>100 parts needed)');
    }
  }
}
