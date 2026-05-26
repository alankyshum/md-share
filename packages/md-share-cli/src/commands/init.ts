import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execSync } from 'node:child_process';
import { loadConfig, saveConfig } from '../config/load.js';
import { getGitHubToken } from '../auth/token.js';
import { loginCommand } from './login.js';
import { bootstrapStorageRepo } from './init-storage.js';
import { getAuthenticatedUser, forkRepo } from '../github/contents.js';

export async function initCommand(options: {
  selfHost?: boolean;
  dryRun?: boolean;
  storageName?: string;
  projectName?: string;
}): Promise<void> {
  if (options.dryRun) {
    if (options.selfHost) {
      console.log('[DRY RUN] Initializing md-share configuration with self-hosting...');
      let cfToken = process.env.CLOUDFLARE_API_TOKEN || 'dry-run-skip';
      let projectName = options.projectName || 'md-share-dryrun';

      console.log(`[DRY RUN] Cloudflare Token: ${cfToken === 'dry-run-skip' ? 'dry-run-skip' : '***'}`);
      console.log(`[DRY RUN] Worker Name: ${projectName}`);
      console.log(`[DRY RUN] App Base URL: https://${projectName}.workers.dev`);
      console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
      console.log('[DRY RUN] Would fork alankyshum/md-share to your-user/md-share, bootstrap storage repo, detect cf CLI, guide you to set up Workers Builds project, and save config.');
      return;
    } else {
      console.log('[DRY RUN] Initializing md-share configuration...');
      console.log('[DRY RUN] App Base URL: https://share.alanshum.org');
      console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
      console.log('[DRY RUN] Would initiate GitHub authentication and bootstrap storage repo.');
      return;
    }
  }

  console.log('=== md-share initialization wizard ===\n');

  const rl = readline.createInterface({ input, output });

  try {
    const existingConfig = loadConfig();
    let appBaseUrl = existingConfig.app_base_url || 'https://share.alanshum.org';
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

    // 2. Authentication (required for storage and self-hosting)
    let token = getGitHubToken();
    if (!token) {
      console.log('GitHub authentication is required.');
      rl.close();
      await loginCommand({});
      token = getGitHubToken();
    } else {
      console.log('\x1b[32mAlready authenticated with GitHub.\x1b[0m\n');
    }

    if (!token) {
      throw new Error('Authentication failed.');
    }

    const user = await getAuthenticatedUser(token);
    const username = user.login;

    if (isSelfHost) {
      console.log('\n=== Cloudflare Workers Provisioning ===');

      // Fork alankyshum/md-share to <user>/md-share
      console.log(`Forking alankyshum/md-share to ${username}/md-share...`);
      await forkRepo(token);
      console.log('\x1b[32m[OK] Forked md-share repo successfully (or already exists).\x1b[0m');

      // Check cf CLI
      console.log('Checking for Cloudflare CLI (cf)...');
      try {
        execSync('cf --version', { stdio: 'pipe' });
      } catch (err) {
        console.error('\x1b[31mError: Cloudflare CLI (cf) is missing.\x1b[0m');
        console.error('\nPlease install the cf CLI:');
        console.error('  brew install cloudflare/cloudflare/cf');
        console.error('Or download from: https://github.com/cloudflare/cli/releases');
        console.error('See our tool--cloudflare skill for full reference.');
        process.exit(1);
      }

      // Get CF Token
      let cfToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!cfToken) {
        if (rl.closed) {
          const rlNew = readline.createInterface({ input, output });
          cfToken = await rlNew.question('Enter your Cloudflare API Token (requires Account.Workers:Edit): ');
          rlNew.close();
        } else {
          cfToken = await rl.question('Enter your Cloudflare API Token (requires Account.Workers:Edit): ');
        }
        cfToken = cfToken.trim();
      }
      if (!cfToken) {
        throw new Error('CLOUDFLARE_API_TOKEN is required for self-hosting.');
      }
      process.env.CLOUDFLARE_API_TOKEN = cfToken;

      // Worker names must be lowercase, alphanumeric, dashes, 1-63 chars
      let workerName = options.projectName;
      if (!workerName) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let randomStr = '';
        for (let i = 0; i < 6; i++) {
          randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        workerName = `md-share-${randomStr}`;
      }

      console.log('\n=== Cloudflare Workers Builds Setup ===');
      console.log('Cloudflare Workers Builds currently requires a one-time dashboard step to connect your fork.');
      console.log('After this is set up, every push to master will auto-deploy your application.');
      console.log('\nPlease follow these steps to connect your fork:');
      console.log('1. Open the Cloudflare dashboard: https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/workers');
      console.log('2. Click on "Import a repository" under "Create using Workers Builds" or "Connect to Git"');
      console.log(`3. Select your fork: \`${username}/md-share\``);
      console.log('4. Configure the Build Settings:');
      console.log('   - Project Name / Worker Name: ' + workerName);
      console.log('   - Production branch: master');
      console.log('   - Root directory: packages/md-share-app');
      console.log('   - Build command: pnpm install --frozen-lockfile && pnpm --filter @alankyshum/md-share-app build');
      console.log('   - Deploy command: wrangler deploy');
      console.log('5. Click "Save and Deploy" to trigger the first build.');

      console.log('\nOnce you have saved and deployed your Worker, please enter its deployed URL.');
      console.log(`(e.g., https://${workerName}.<your-subdomain>.workers.dev)`);

      let userProvidedUrl = '';
      if (rl.closed) {
        const rlNew = readline.createInterface({ input, output });
        userProvidedUrl = await rlNew.question('\nEnter your Worker\'s base URL: ');
        rlNew.close();
      } else {
        userProvidedUrl = await rl.question('\nEnter your Worker\'s base URL: ');
      }

      userProvidedUrl = userProvidedUrl.trim();
      if (!userProvidedUrl) {
        throw new Error('Worker base URL is required to complete self-hosting setup.');
      }

      if (!userProvidedUrl.startsWith('http://') && !userProvidedUrl.startsWith('https://')) {
        userProvidedUrl = `https://${userProvidedUrl}`;
      }

      appBaseUrl = userProvidedUrl;
      console.log(`\x1b[32m[OK] Set App Base URL to: ${appBaseUrl}\x1b[0m\n`);
    }

    console.log(`Using App Base URL: \x1b[36m${appBaseUrl}\x1b[0m\n`);

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
