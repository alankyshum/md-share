import pako from 'pako';

export interface EncryptedShare {
  v: 1;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  alg: 'AES-256-GCM';
  iv: string; // base64url encoded
  ct: string; // base64url encoded
}

// Browser-safe and Node-safe reference to WebCrypto
const getCrypto = (): Crypto => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as Crypto;
  }
  throw new Error('WebCrypto API not found');
};

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

export async function generateKey(): Promise<Uint8Array> {
  const bytes = new Uint8Array(32);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

export function generateIV(): Uint8Array {
  const bytes = new Uint8Array(12);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

export async function encryptShare(
  plaintext: string,
  key: Uint8Array
): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const crypto = getCrypto();
  
  // 1. gzip via pako
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const compressedBytes = pako.gzip(plaintextBytes);

  // 2. generate fresh IV
  const iv = generateIV();

  // 3. Import key for AES-GCM
  const importedKey = await crypto.subtle.importKey(
    'raw',
    key as any,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 4. encrypt via AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any, tagLength: 128 },
    importedKey,
    compressedBytes as any
  );

  return {
    iv,
    ct: new Uint8Array(encryptedBuffer),
  };
}

export async function decryptShare(
  iv: Uint8Array,
  ct: Uint8Array,
  key: Uint8Array
): Promise<string> {
  const crypto = getCrypto();

  // 1. Import key for AES-GCM
  const importedKey = await crypto.subtle.importKey(
    'raw',
    key as any,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // 2. decrypt via AES-GCM
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any, tagLength: 128 },
    importedKey,
    ct as any
  );

  // 3. gunzip via pako
  const decompressedBytes = pako.ungzip(new Uint8Array(decryptedBuffer));

  // 4. decode to string
  return new TextDecoder().decode(decompressedBytes);
}

export function serializeEncryptedShare(s: {
  title: string;
  description: string;
  created_at?: string;
  updated_at?: string;
  iv: Uint8Array;
  ct: Uint8Array;
}): EncryptedShare {
  const now = new Date().toISOString();
  return {
    v: 1,
    title: s.title,
    description: s.description,
    created_at: s.created_at || now,
    updated_at: s.updated_at || now,
    alg: 'AES-256-GCM',
    iv: bytesToBase64Url(s.iv),
    ct: bytesToBase64Url(s.ct),
  };
}

export function parseEncryptedShare(json: unknown): EncryptedShare {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid JSON structure');
  }
  const data = json as Record<string, unknown>;

  if ('content' in data) {
    throw new Error('Transitional contamination guard: JSON contains raw "content" field');
  }

  if (data.v !== 1) {
    throw new Error(`Unsupported share version: ${data.v}`);
  }

  if (data.alg !== 'AES-256-GCM') {
    throw new Error(`Unsupported or missing encryption algorithm: ${data.alg}`);
  }

  if (typeof data.title !== 'string') {
    throw new Error('Missing or invalid title field');
  }

  if (typeof data.description !== 'string') {
    throw new Error('Missing or invalid description field');
  }

  if (typeof data.created_at !== 'string') {
    throw new Error('Missing or invalid created_at field');
  }

  if (typeof data.updated_at !== 'string') {
    throw new Error('Missing or invalid updated_at field');
  }

  if (typeof data.iv !== 'string' || !data.iv) {
    throw new Error('Missing or invalid iv field');
  }

  if (typeof data.ct !== 'string' || !data.ct) {
    throw new Error('Missing or invalid ct field');
  }

  return {
    v: 1,
    title: data.title,
    description: data.description,
    created_at: data.created_at,
    updated_at: data.updated_at,
    alg: 'AES-256-GCM',
    iv: data.iv,
    ct: data.ct,
  };
}
