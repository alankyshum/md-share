import { describe, it, expect } from 'vitest';
import { parseShareJson, deriveMeta } from '../functions/_meta';
import { generateKey, encryptShare, decryptShare, bytesToBase64Url, serializeEncryptedShare } from '@alankyshum/share-crypto';
import sampleShare from './fixtures/sample-share.json';

function constructGhUrl(owner: string, repo: string, key: string): string {
  const prefix = key.slice(0, 2);
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/shares/${prefix}/${key}.json`;
}

describe('Phase 2 - Encryption layer & meta tests', () => {
  it('should parse encrypted share JSON correctly', () => {
    const jsonStr = JSON.stringify(sampleShare);
    const parsed = parseShareJson(jsonStr);

    expect(parsed.v).toBe(1);
    expect(parsed.alg).toBe('AES-256-GCM');
    expect(parsed.title).toBe('Sample Encrypted Title');
    expect(parsed.description).toBe('This is a sample encrypted description from the fixture schema.');
    expect(parsed.iv).toBe('placeholder_iv_base64url');
    expect(parsed.ct).toBe('placeholder_ct_base64url');
  });

  it('should reject a JSON with content field (transitional legacy guard)', () => {
    const badJson = {
      v: 1,
      title: 'Legacy',
      description: 'Legacy share',
      content: '# Plaintext markdown'
    };
    expect(() => parseShareJson(JSON.stringify(badJson))).toThrow(
      'Transitional contamination guard: JSON contains raw "content" field'
    );
  });

  it('should construct correct GitHub Raw URL matching convention', () => {
    const owner = 'alankyshum';
    const repo = 'md-share-repo';
    const key = 'abcdef123456'; // 12-char key

    const url = constructGhUrl(owner, repo, key);
    expect(url).toBe('https://raw.githubusercontent.com/alankyshum/md-share-repo/main/shares/ab/abcdef123456.json');
  });

  it('should extract OG meta from encrypted share correctly', () => {
    const jsonStr = JSON.stringify(sampleShare);
    const meta = deriveMeta(jsonStr, 'abcdef123456');

    expect(meta.title).toBe('Sample Encrypted Title');
    expect(meta.description).toBe('This is a sample encrypted description from the fixture schema.');
    expect(meta.siteName).toBe('md-share');
  });

  it('should fall back to deriving title/description from key/siteName when JSON has empty title/description', () => {
    const emptyJson = {
      v: 1,
      alg: 'AES-256-GCM',
      title: '',
      description: '',
      iv: 'iv_str',
      ct: 'ct_str',
    };
    const meta = deriveMeta(JSON.stringify(emptyJson), 'key123');

    expect(meta.title).toBe('Shared note (key123)');
    expect(meta.description).toBe('A markdown note shared via md-share.');
  });

  it('should round-trip encrypt and decrypt with the crypto module', async () => {
    const key = await generateKey();
    const markdown = '# Live Encrypted Document\n\nThis is generated live in the test environment!';

    const { iv, ct } = await encryptShare(markdown, key);
    const decrypted = await decryptShare(iv, ct, key);

    expect(decrypted).toBe(markdown);

    const serialized = serializeEncryptedShare({
      title: 'Live Encrypted Title',
      description: 'Live Encrypted Desc',
      iv,
      ct,
    });

    const parsed = parseShareJson(JSON.stringify(serialized));
    expect(parsed.title).toBe('Live Encrypted Title');
    expect(parsed.description).toBe('Live Encrypted Desc');
    expect(parsed.iv).toBe(bytesToBase64Url(iv));
    expect(parsed.ct).toBe(bytesToBase64Url(ct));
  });
});
