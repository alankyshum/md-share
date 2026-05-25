import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { requireGitHubToken } from '../auth/token.js';
import { loadConfig } from '../config/load.js';
import { getFile, deleteFile } from '../github/contents.js';

export function parseKeyFromInput(s: string): string | null {
  const trimmed = s.trim();
  const mUrl = trimmed.match(/\/s\/([0-9a-f]{12})\b/);
  if (mUrl) {
    return mUrl[1];
  }
  const mKey = trimmed.match(/\b([0-9a-f]{12})\b/);
  if (mKey) {
    return mKey[1];
  }
  return null;
}

export async function deleteCommand(
  keyOrUrl: string,
  options: {
    yes?: boolean;
    storageRepo?: string;
  }
): Promise<void> {
  const config = loadConfig();
  const storageRepo = options.storageRepo || config.storage_repo;

  if (!storageRepo) {
    console.error(
      `\x1b[31mError: No storage repository configured. Please run 'md-share init' or provide '--storage-repo <owner/repo>'.\x1b[0m`
    );
    process.exit(1);
  }

  const key = parseKeyFromInput(keyOrUrl);
  if (!key) {
    console.error(`\x1b[31mError: Could not extract a valid 12-character hex key from "${keyOrUrl}".\x1b[0m`);
    process.exit(1);
  }

  const path = `shares/${key.slice(0, 2)}/${key}.json`;

  // Confirmation if --yes is not set
  if (!options.yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      `Are you sure you want to delete share ${key} from ${storageRepo}? (y/N) `
    );
    rl.close();
    const confirmed = answer.trim().toLowerCase();
    if (confirmed !== 'y' && confirmed !== 'yes') {
      console.log('Deletion cancelled.');
      return;
    }
  }

  const token = requireGitHubToken();

  try {
    console.log(`Locating share ${key} in ${storageRepo}...`);
    const file = await getFile(storageRepo, path, token);
    if (!file) {
      console.error(`\x1b[31mError: Share ${key} not found in ${storageRepo}.\x1b[0m`);
      process.exit(1);
    }

    console.log(`Deleting file ${path} on GitHub...`);
    await deleteFile(storageRepo, path, file.sha, `Delete share ${key}`, token);
    console.log(`\x1b[32m[OK] Share ${key} has been successfully deleted.\x1b[0m`);
  } catch (e) {
    console.error(`\x1b[31mError deleting share: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
export { deleteCommand as default };
