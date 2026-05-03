import pako from 'pako';

const VERSION = 'v1';

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeMarkdown(md: string): string {
  const bytes = new TextEncoder().encode(md);
  const gz = pako.gzip(bytes);
  return `${VERSION}.${base64urlEncode(gz)}`;
}

export interface DecodeResult {
  markdown: string;
  part?: { current: number; total: number };
}

export function decodeFragment(fragment: string): DecodeResult {
  // strip leading '#' if present
  if (fragment.startsWith('#')) fragment = fragment.slice(1);
  if (!fragment) throw new Error('empty fragment');

  const parts = fragment.split('.');
  if (parts[0] !== VERSION) throw new Error(`unsupported version: ${parts[0]}`);

  let payload: string;
  let partInfo: DecodeResult['part'];

  if (parts.length === 2) {
    // v1.<data>
    payload = parts[1];
  } else if (parts.length === 3) {
    // v1.NofM.<data>
    const m = parts[1].match(/^(\d+)of(\d+)$/);
    if (!m) throw new Error(`invalid part marker: ${parts[1]}`);
    partInfo = { current: parseInt(m[1]), total: parseInt(m[2]) };
    payload = parts[2];
  } else {
    throw new Error('malformed fragment');
  }

  const gz = base64urlDecode(payload);
  const bytes = pako.ungzip(gz);
  const markdown = new TextDecoder().decode(bytes);
  return { markdown, part: partInfo };
}
