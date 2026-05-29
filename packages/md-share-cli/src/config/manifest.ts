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
}

export interface Manifest {
  version: number;
  shares: Record<string, ManifestEntry>;
}

export function manifestPath(): string {
  return MANIFEST_PATH;
}

export function loadManifest(): Manifest {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      if (data && typeof data === 'object' && data.shares) {
        return data as Manifest;
      }
    }
  } catch {
    // corrupt manifest -> start fresh rather than crash a share
  }
  return { version: 1, shares: {} };
}

/** Look up the saved AES key (base64url) for a share, if any. */
export function getManifestKey(shareKey: string): string | undefined {
  return loadManifest().shares[shareKey]?.key;
}

/** Upsert a share entry and persist with 0600 permissions. */
export function saveManifestEntry(shareKey: string, entry: ManifestEntry): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const m = loadManifest();
    m.shares[shareKey] = { ...m.shares[shareKey], ...entry };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2), 'utf8');
    try {
      fs.chmodSync(MANIFEST_PATH, 0o600);
    } catch {
      // best-effort on platforms without chmod
    }
  } catch (e) {
    console.error(`Warning: failed to write share manifest: ${(e as Error).message}`);
  }
}
