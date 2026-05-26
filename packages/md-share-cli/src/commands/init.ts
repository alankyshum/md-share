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
      console.log(`[DRY RUN] Pages Project Name: ${projectName}`);
      console.log(`[DRY RUN] App Base URL: https://${projectName}.pages.dev`);
      console.log(`[DRY RUN] Storage Repo Name: ${options.storageName || 'md-share--cms'}`);
      console.log('[DRY RUN] Would fork alankyshum/md-share to your-user/md-share, bootstrap storage repo, detect cf CLI, invoke cf to create Pages project, and save config.');
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
      console.log('\n=== Cloudflare Pages Provisioning ===');

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
          cfToken = await rlNew.question('Enter your Cloudflare API Token (requires Account.Pages:Edit): ');
          rlNew.close();
        } else {
          cfToken = await rl.question('Enter your Cloudflare API Token (requires Account.Pages:Edit): ');
        }
        cfToken = cfToken.trim();
      }
      if (!cfToken) {
        throw new Error('CLOUDFLARE_API_TOKEN is required for self-hosting.');
      }
      process.env.CLOUDFLARE_API_TOKEN = cfToken;

      let projectName = options.projectName;
      if (!projectName) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let randomStr = '';
        for (let i = 0; i < 6; i++) {
          randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        projectName = `md-share-${randomStr}`;
      }

      console.log(`Creating Cloudflare Pages project "${projectName}" using cf CLI...`);
      const bodyPayload = {
        name: projectName,
        production_branch: 'master',
        source: {
          type: 'github',
          config: {
            owner: username,
            repo_name: 'md-share',
            production_branch: 'master',
            root_dir: 'packages/md-share-app',
            deployments_enabled: true,
            production_deployment_enabled: true
          }
        },
        build_config: {
          build_command: 'pnpm install --frozen-lockfile && pnpm --filter @alankyshum/md-share-app build',
          destination_dir: 'build',
          root_dir: 'packages/md-share-app'
        }
      };

      let subdomain = '';
      try {
        const cfCmd = `cf pages projects create ${projectName} --body '${JSON.stringify(bodyPayload)}'`;
        const stdout = execSync(cfCmd, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }).toString();
        const parsed = JSON.parse(stdout);
        subdomain = parsed?.result?.subdomain || '';
      } catch (err: any) {
        console.error(`\x1b[31mError creating Pages project: ${err.message}\x1b[0m`);
        if (err.stderr) {
          console.error(err.stderr.toString());
        }
        console.error('\nFallback Advice: If cf pages is not available, upgrade your cf CLI or use the Cloudflare dashboard at https://dash.cloudflare.com/?to=/:account/pages');
        throw err;
      }

      if (!subdomain) {
        throw new Error('Failed to parse subdomain from cf CLI output.');
      }

      appBaseUrl = `https://${subdomain}`;
      console.log(`\x1b[32m[OK] Created Cloudflare Pages project: ${appBaseUrl}\x1b[0m\n`);

      console.log(`Connect your GitHub fork to Cloudflare: visit https://dash.cloudflare.com/?to=/:account/pages and authorize the Cloudflare Workers and Pages app for \`${username}/md-share\`. Then push any change to trigger the first build.\n`);
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
