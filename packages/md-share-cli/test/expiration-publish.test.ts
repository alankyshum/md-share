import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  getFile: vi.fn(), putFile: vi.fn(),
}));
vi.mock('../src/github/contents.js', () => ({ getFile: mocks.getFile, putFile: mocks.putFile }));
vi.mock('../src/auth/token.js', () => ({ requireGitHubToken: () => 'fake-token' }));
vi.mock('../src/config/load.js', () => ({ loadConfig: () => ({ storage_repo: 'example/shares', app_base_url: 'https://example.test' }) }));

let root: string;
let oldHome: string | undefined;
beforeEach(() => {
  oldHome = process.env.HOME;
  root = fs.mkdtempSync(path.join(oldHome!, 'isolated-publish-'));
  process.env.HOME = root;
  vi.resetModules();
  mocks.getFile.mockReset(); mocks.putFile.mockReset();
  mocks.getFile.mockResolvedValue(null);
  mocks.putFile.mockResolvedValue({});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env.HOME = oldHome;
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('public expiry publication', () => {
  it('publishes a document just below the limit and encrypts the complete content', async () => {
    const { shareCommand, MAX_MARKDOWN_LENGTH } = await import('../src/commands/share.js');
    const { loadManifest } = await import('../src/config/manifest.js');
    const { decryptShare, base64UrlToBytes } = await import('@alankyshum/share-crypto');
    const text = randomBytes(Math.ceil(MAX_MARKDOWN_LENGTH * 3 / 4)).toString('base64').slice(0, MAX_MARKDOWN_LENGTH - 1);
    await shareCommand(undefined, { text, lint: false, copy: false, expires: '1d' });
    const share = JSON.parse(mocks.putFile.mock.calls[0][2]);
    const key = Object.values(loadManifest().shares)[0].key;
    expect(await decryptShare(base64UrlToBytes(share.iv), base64UrlToBytes(share.ct), base64UrlToBytes(key))).toBe(text);
    expect(mocks.putFile).toHaveBeenCalledTimes(1);
  }, 30000);
  it('rejects a document just over the UTF-16 limit without writing', async () => {
    const { shareCommand, MAX_MARKDOWN_LENGTH } = await import('../src/commands/share.js');
    await expect(shareCommand(undefined, { text: 'a'.repeat(MAX_MARKDOWN_LENGTH + 1), lint: false, copy: false }))
      .rejects.toThrow('Markdown exceeds the 3,000,000 UTF-16 code unit storage limit');
    expect(mocks.getFile).not.toHaveBeenCalled();
    expect(mocks.putFile).not.toHaveBeenCalled();
  });
  it('records expiry and enforces no duplicate overwrite', async () => {
    const { shareCommand } = await import('../src/commands/share.js');
    const { loadManifest } = await import('../src/config/manifest.js');
    await shareCommand(undefined, { text: '# New', lint: false, copy: false, purpose: 'decision' });
    const shares = Object.values(loadManifest().shares);
    expect(shares).toHaveLength(1);
    expect(shares[0].expiration_state).toBe('active');
    expect(Date.parse(shares[0].expires_at!) - Date.now()).toBeGreaterThan(6 * 86400 * 1000);
    expect(mocks.putFile).toHaveBeenCalledTimes(1);
    await expect(shareCommand(undefined, { text: '# New', lint: false, copy: false })).rejects.toThrow('already exists');
    expect(mocks.putFile).toHaveBeenCalledTimes(1);
  });
  it('never falls back to a non-expiring fragment after remote failure', async () => {
    mocks.putFile.mockRejectedValue(new Error('offline'));
    const { shareCommand } = await import('../src/commands/share.js');
    const { loadManifest } = await import('../src/config/manifest.js');
    await expect(shareCommand(undefined, { text: '# Failure', lint: false, copy: false })).rejects.toThrow('offline');
    expect(Object.values(loadManifest().shares)[0].expiration_state).toBe('pending');
    expect(console.log).not.toHaveBeenCalled();
  });
  it('refuses non-expiring fragments', async () => {
    const { shareCommand } = await import('../src/commands/share.js');
    await expect(shareCommand(undefined, { text: '# Test', lint: false, copy: false, short: false })).rejects.toThrow('cannot expire');
    expect(mocks.putFile).not.toHaveBeenCalled();
  });
  it('updates legacy shares without retroactively assigning expiry', async () => {
    const { shareCommand } = await import('../src/commands/share.js');
    const { saveManifestEntry, loadManifest } = await import('../src/config/manifest.js');
    const key = Buffer.alloc(32, 7).toString('base64url');
    saveManifestEntry('aaaaaaaaaaaa', { key, storage_repo: 'example/shares' });
    mocks.getFile.mockResolvedValue({ sha: 'fake-sha' });
    await shareCommand(undefined, { text: '# Legacy', lint: false, copy: false, update: 'aaaaaaaaaaaa' });
    expect(loadManifest().shares.aaaaaaaaaaaa.expires_at).toBeUndefined();
    await expect(shareCommand(undefined, { text: '# Legacy', lint: false, copy: false, update: 'aaaaaaaaaaaa', expires: '7d' })).rejects.toThrow('retroactively');
    expect(mocks.putFile).toHaveBeenCalledTimes(1);
  });
});
