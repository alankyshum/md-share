import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
});
