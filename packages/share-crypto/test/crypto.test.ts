import { describe, it, expect } from 'vitest';
import {
  generateKey,
  generateIV,
  encryptShare,
  decryptShare,
  bytesToBase64Url,
  base64UrlToBytes,
  serializeEncryptedShare,
  parseEncryptedShare,
} from '../src/index';

describe('share-crypto unit tests', () => {
  it('should generate valid key and iv lengths', async () => {
    const key = await generateKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);

    const iv = generateIV();
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(12);
  });

  it('should encode and decode base64url accurately', () => {
    const original = new TextEncoder().encode('Hello World! 12345?_#-+');
    const encoded = bytesToBase64Url(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    const decoded = base64UrlToBytes(encoded);
    expect(new TextDecoder().decode(decoded)).toBe('Hello World! 12345?_#-+');
  });

  it('should round-trip encrypt and decrypt successfully', async () => {
    const key = await generateKey();
    const plaintext = '# Test Share\n\nHello from the encrypted world!';

    const { iv, ct } = await encryptShare(plaintext, key);

    const decrypted = await decryptShare(iv, ct, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw on decryption with the wrong key', async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const plaintext = 'Secret data';

    const { iv, ct } = await encryptShare(plaintext, key1);

    await expect(decryptShare(iv, ct, key2)).rejects.toThrow();
  });

  it('should throw on decryption with tampered ciphertext', async () => {
    const key = await generateKey();
    const plaintext = 'Secret data';

    const { iv, ct } = await encryptShare(plaintext, key);

    // Tamper the ciphertext slightly
    const tamperedCt = new Uint8Array(ct);
    tamperedCt[0] ^= 1;

    await expect(decryptShare(iv, tamperedCt, key)).rejects.toThrow();
  });

  it('should serialize and parse EncryptedShare correctly', async () => {
    const iv = generateIV();
    const ct = new TextEncoder().encode('some ct');
    
    const serialized = serializeEncryptedShare({
      title: 'A title',
      description: 'A description',
      iv,
      ct,
    });

    expect(serialized.v).toBe(1);
    expect(serialized.alg).toBe('AES-256-GCM');
    expect(serialized.title).toBe('A title');
    expect(serialized.description).toBe('A description');
    expect(serialized.iv).toBe(bytesToBase64Url(iv));
    expect(serialized.ct).toBe(bytesToBase64Url(ct));

    const parsed = parseEncryptedShare(serialized);
    expect(parsed).toEqual(serialized);
  });

  it('should reject parsing if a content field is present', () => {
    const badShare = {
      v: 1,
      alg: 'AES-256-GCM',
      title: 'A title',
      description: 'A description',
      created_at: '2026-05-25T21:00:00Z',
      updated_at: '2026-05-25T21:00:00Z',
      iv: 'some_iv',
      ct: 'some_ct',
      content: 'legacy content',
    };

    expect(() => parseEncryptedShare(badShare)).toThrow(
      'Transitional contamination guard: JSON contains raw "content" field'
    );
  });
});
