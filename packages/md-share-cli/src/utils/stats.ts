import pako from 'pako';
import { encodeChunk } from '../encoding.js';

export function printStats(md: string, chunks: string[], urls: string[]): void {
  const rawBytes = new TextEncoder().encode(md).length;
  const rawLines = md.split('\n').length;
  
  // Standard gzip for stats calculation matching python levels/header modifications is fine,
  // let's match the level 9 compression to be highly precise
  const compressed = pako.gzip(new TextEncoder().encode(md), { level: 9 });
  if (compressed.length >= 10) {
    compressed[9] = 255;
  }
  const gzBytes = compressed.length;
  const compressionPct = rawBytes ? (1 - gzBytes / rawBytes) * 100 : 0;
  
  const encoded = encodeChunk(md);
  const encChars = encoded.length;
  const urlLen = urls.length > 0 ? urls[0].length : 0;

  console.error(`raw:        ${rawBytes.toLocaleString()} bytes (${rawLines} lines)`);
  console.error(`gzipped:    ${gzBytes.toLocaleString()} bytes (compression: ${compressionPct.toFixed(1)}%)`);
  console.error(`encoded:    ${encChars.toLocaleString()} chars (base64url)`);
  console.error(`chunks:     ${chunks.length}`);
  console.error(`url length: ${urlLen.toLocaleString()} chars`);
}
