import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig, saveConfig } from '../config/load.js';
import { getGitHubToken } from '../auth/token.js';
import { loginCommand } from './login.js';
import { bootstrapStorageRepo } from './init-storage.js';

export async function initCommand(options: {
  selfHost?: boolean;
  dryRun?: boolean;
  storageName?: string;
}): Promise<void> {
  if (options.selfHost) {
    console.log('Self-host provisioning lands in Phase 4');
    return;
  }

  if (options.dryRun) {
    console.log('[DRY RUN] Initializing md-share configuration...');
    console.log('[DRY RUN] App Base URL: https://md-share-kut.pages.dev');
    console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
    console.log('[DRY RUN] Would initiate GitHub authentication and bootstrap storage repo.');
    return;
  }

  console.log('=== md-share initialization wizard ===\n');

  const rl = readline.createInterface({ input, output });

  try {
    const existingConfig = loadConfig();
    let appBaseUrl = existingConfig.app_base_url || 'https://md-share-kut.pages.dev';

    // 1. Choose Hosting Mode
    const hostingAnswer = await rl.question(
      'Choose hosting mode: [s]hared default, [f]ull self-host on Cloudflare, or [c]ustom URL? (s/f/c) [s]: '
    );
    const mode = hostingAnswer.trim().toLowerCase() || 's';

    if (mode === 'f' || mode === 'self-host') {
      console.log('\nSelf-host provisioning lands in Phase 4');
      rl.close();
      return;
    }

    if (mode === 'c' || mode === 'custom') {
      const customUrl = await rl.question(
        `Enter your custom App Base URL [${appBaseUrl}]: `
      );
      if (customUrl.trim()) {
        appBaseUrl = customUrl.trim();
      }
    }

    console.log(`Using App Base URL: \x1b[36m${appBaseUrl}\x1b[0m\n`);

    // 2. Authentication
    let token = getGitHubToken();
    if (!token) {
      console.log('GitHub authentication is required to configure storage.');
      rl.close();
      await loginCommand({});
      token = getGitHubToken();
    } else {
      console.log('\x1b[32mAlready authenticated with GitHub.\x1b[0m\n');
    }

    if (!token) {
      throw new Error('Authentication failed.');
    }

    // 3. Configure storage repo
    if (!rl.closed) {
      rl.close();
    }

    const storageRepoPath = await bootstrapStorageRepo(options.storageName);

    // 4. Save config
    saveConfig({
      app_base_url: appBaseUrl,
      storage_repo: storageRepoPath,
    });

    console.log(`\n\x1b[32m[OK] Configuration successfully saved to ~/.config/md-share/config.json!\x1b[0m`);
    console.log(`You are ready to share documents! Run: \x1b[36mmd-share <file>\x1b[0m`);
  } catch (e) {
    if (!rl.closed) {
      rl.close();
    }
    console.error(`\x1b[31mError during initialization: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
