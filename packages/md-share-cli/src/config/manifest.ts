import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Local share manifest: persists the mapping shareKey -> AES decryption key
 * so `md-share --update` can ALWAYS reuse the same key for a given share,
 * even when the caller does not paste the full `#k=<key>` URL fragment.
 *
 * Without this, every update that omits `#k=` would rotate the key and break
 * every previously-shared link to that share. The manifest makes the key
 * stable for the lifetime of the share on this machine.
 *
 * Stored at ~/.config/md-share/manifest.json (0600). Contains plaintext AES
 * keys, so it is treated like a credential file.
 */

const CONFIG_DIR = path.join(os.homedir(), '.config', 'md-share');
const MANIFEST_PATH = path.join(CONFIG_DIR, 'manifest.json');

export interface ManifestEntry {
  /** base64url-encoded AES-256 key (same value that appears after `#k=`) */
  key: string;
  /** full share URL including the `#k=` fragment, for convenience */
  url?: string;
  title?: string;
  storage_repo?: string;
  updated_at?: string;
  expires_at?: string;
  expiration_state?: 'pending' | 'active';
}

export interface Manifest {
  version: number;
  shares: Record<string, ManifestEntry>;
}

export function manifestPath(): string {
  return MANIFEST_PATH;
}

export function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return { version: 1, shares: {} };
  const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (!data || typeof data !== 'object' || !data.shares || typeof data.shares !== 'object' || Array.isArray(data.shares)) {
    throw new Error('Invalid share manifest; refusing to overwrite it');
  }
  return data as Manifest;
}

/** Serialize publishers and the expiry reaper; no stale lock is reclaimed automatically. */
export function acquireManifestLock(): () => void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const lock = path.join(CONFIG_DIR, '.share-page.lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error('Share manifest is locked; inspect before retrying'); }
  return () => fs.rmdirSync(lock);
}

/** Look up the saved AES key (base64url) for a share, if any. */
export function getManifestKey(shareKey: string): string | undefined {
  return loadManifest().shares[shareKey]?.key;
}

/** Upsert a share entry and persist with 0600 permissions. */
export function saveManifestEntry(shareKey: string, entry: ManifestEntry): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const m = loadManifest();
  m.shares[shareKey] = { ...m.shares[shareKey], ...entry };
  // Resolve a chezmoi symlink instead of replacing it; atomic rename is in the
  // actual file's directory. Existing data is never truncated in place.
  const destination = fs.existsSync(MANIFEST_PATH) ? fs.realpathSync(MANIFEST_PATH) : MANIFEST_PATH;
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(m, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
