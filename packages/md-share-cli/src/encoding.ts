import pako from 'pako';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(s: string): Uint8Array {
  let base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function encodeChunk(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // Default pako.gzip with maximum compression level 9 to match Python.
  const compressed = pako.gzip(bytes, { level: 9 });
  
  // Set OS byte to 255 (unknown) to match Python's gzip.compress
  if (compressed.length >= 10) {
    compressed[9] = 255;
  }
  
  return bytesToBase64Url(compressed);
}

export function decodeChunk(encoded: string): string {
  const bytes = base64UrlToBytes(encoded);
  const decompressed = pako.ungzip(bytes);
  return new TextDecoder().decode(decompressed);
}
