import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig, saveConfig } from '../config/load.js';
import { getGitHubToken } from '../auth/token.js';
import { loginCommand } from './login.js';
import { bootstrapStorageRepo } from './init-storage.js';
import { listAccounts, getPagesProject, createPagesProject } from '../cloudflare/api.js';
import { getCfToken, setCfToken } from '../auth/keychain.js';

export async function initCommand(options: {
  selfHost?: boolean;
  dryRun?: boolean;
  storageName?: string;
  projectName?: string;
}): Promise<void> {
  if (options.dryRun) {
    if (options.selfHost) {
      console.log('[DRY RUN] Initializing md-share configuration with self-hosting...');
      let cfToken = process.env.CLOUDFLARE_API_TOKEN || getCfToken();
      if (!cfToken) {
        cfToken = 'dry-run-skip';
      }

      let accounts: { id: string; name: string }[] = [];
      if (cfToken === 'dry-run-skip') {
        accounts = [{ id: 'dry-run-account-id', name: 'Dry Run Mock Account' }];
      } else {
        try {
          accounts = await listAccounts(cfToken);
        } catch (err) {
          console.warn(`[DRY RUN] Warning: Failed to fetch accounts from Cloudflare: ${(err as Error).message}`);
          accounts = [{ id: 'dry-run-account-id', name: 'Dry Run Mock Account' }];
        }
      }

      const accountId = accounts[0]?.id || 'dry-run-account-id';
      const accountName = accounts[0]?.name || 'Dry Run Mock Account';

      let projectName = options.projectName;
      if (!projectName) {
        projectName = 'md-share-dryrun';
      }

      console.log(`[DRY RUN] Cloudflare Token: ${cfToken === 'dry-run-skip' ? 'dry-run-skip' : '***'}`);
      console.log(`[DRY RUN] Cloudflare Account: ${accountName} (${accountId})`);
      console.log(`[DRY RUN] Pages Project Name: ${projectName}`);
      console.log(`[DRY RUN] App Base URL: https://${projectName}.pages.dev`);
      console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
      console.log('[DRY RUN] Would initiate GitHub authentication, create Cloudflare Pages project, and bootstrap storage repo.');
      return;
    } else {
      console.log('[DRY RUN] Initializing md-share configuration...');
      console.log('[DRY RUN] App Base URL: https://md-share-kut.pages.dev');
      console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
      console.log('[DRY RUN] Would initiate GitHub authentication and bootstrap storage repo.');
      return;
    }
  }

  console.log('=== md-share initialization wizard ===\n');

  const rl = readline.createInterface({ input, output });

  try {
    const existingConfig = loadConfig();
    let appBaseUrl = existingConfig.app_base_url || 'https://md-share-kut.pages.dev';
    let isSelfHost = options.selfHost || false;

    if (!isSelfHost) {
      // 1. Choose Hosting Mode
      const hostingAnswer = await rl.question(
        'Choose hosting mode: [s]hared default, [f]ull self-host on Cloudflare, or [c]ustom URL? (s/f/c) [s]: '
      );
      const mode = hostingAnswer.trim().toLowerCase() || 's';

      if (mode === 'f' || mode === 'self-host') {
        isSelfHost = true;
      } else if (mode === 'c' || mode === 'custom') {
        const customUrl = await rl.question(
          `Enter your custom App Base URL [${appBaseUrl}]: `
        );
        if (customUrl.trim()) {
          appBaseUrl = customUrl.trim();
        }
      }
    }

    if (isSelfHost) {
      console.log('\n=== Cloudflare Pages Provisioning ===');
      let cfToken = process.env.CLOUDFLARE_API_TOKEN || getCfToken();
      if (!cfToken) {
        cfToken = await rl.question('Enter your Cloudflare API Token (requires Account.Pages:Edit): ');
        cfToken = cfToken.trim();
        if (!cfToken) {
          throw new Error('Cloudflare API Token is required for self-hosting.');
        }
        setCfToken(cfToken);
      } else {
        console.log('\x1b[32mAlready have Cloudflare API Token.\x1b[0m');
      }

      console.log('Fetching Cloudflare accounts...');
      const accounts = await listAccounts(cfToken);
      let accountId: string;
      let accountName: string;
      if (accounts.length === 0) {
        throw new Error('No Cloudflare accounts found for this token.');
      } else if (accounts.length === 1) {
        accountId = accounts[0].id;
        accountName = accounts[0].name;
      } else {
        console.log('\nMultiple Cloudflare accounts found:');
        accounts.forEach((acc, index) => {
          console.log(`[${index + 1}] ${acc.name} (${acc.id})`);
        });
        const selection = await rl.question(`Select an account (1-${accounts.length}): `);
        const idx = parseInt(selection.trim(), 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= accounts.length) {
          throw new Error('Invalid account selection.');
        }
        accountId = accounts[idx].id;
        accountName = accounts[idx].name;
      }

      console.log(`Using Cloudflare account: \x1b[36m${accountName} (${accountId})\x1b[0m`);

      let projectName = options.projectName;
      if (!projectName) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let randomStr = '';
        for (let i = 0; i < 6; i++) {
          randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        projectName = `md-share-${randomStr}`;
      }

      console.log(`Checking if Pages project "${projectName}" already exists...`);
      const existingProject = await getPagesProject(cfToken, accountId, projectName);
      if (existingProject) {
        throw new Error(`Cloudflare Pages project "${projectName}" already exists. Please choose a different name using --project-name <name>.`);
      }

      console.log(`Creating Cloudflare Pages project "${projectName}" connected to alankyshum/md-share on production branch "master"...`);
      const project = await createPagesProject(cfToken, accountId, projectName);
      appBaseUrl = `https://${project.subdomain}`;
      console.log(`\x1b[32m[OK] Created Cloudflare Pages project. Subdomain: ${appBaseUrl}\x1b[0m\n`);
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
