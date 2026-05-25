import { requireGitHubToken } from '../auth/token.js';
import {
  getAuthenticatedUser,
  getRepoInfo,
  createRepo,
  getFile,
  putFile,
} from '../github/contents.js';

export async function bootstrapStorageRepo(
  storageRepoName: string | undefined,
  options: { dryRun?: boolean } = {}
): Promise<string> {
  const token = requireGitHubToken();
  const user = await getAuthenticatedUser(token);
  
  const repoNameOnly = storageRepoName || 'md-share--cms';
  const fullRepoPath = repoNameOnly.includes('/')
    ? repoNameOnly
    : `${user.login}/${repoNameOnly}`;

  if (options.dryRun) {
    console.log(`[DRY RUN] Would bootstrap storage repository: ${fullRepoPath}`);
    return fullRepoPath;
  }

  console.log(`Bootstrapping storage repository: \x1b[36m${fullRepoPath}\x1b[0m...`);

  // 1. Verify / Create Repo
  let repoExists = false;
  try {
    const info = await getRepoInfo(fullRepoPath, token);
    if (info) {
      repoExists = true;
    }
  } catch {
    // Treat error as not exists or handle on create
  }

  if (!repoExists) {
    const nameToCreate = fullRepoPath.split('/')[1];
    console.log(`Creating repository '${nameToCreate}' on GitHub...`);
    try {
      await createRepo(nameToCreate, token);
      console.log(`Repository created successfully.`);
    } catch (e) {
      console.error(`\x1b[31mFailed to create repository: ${(e as Error).message}\x1b[0m`);
      throw e;
    }
  } else {
    console.log(`Repository already exists.`);
  }

  // 2. Initialize README.md if not present
  try {
    const readmeFile = await getFile(fullRepoPath, 'README.md', token);
    if (!readmeFile) {
      console.log(`Writing README.md...`);
      const readmeContent = `# md-share storage backend\n\nThis repository stores encrypted documents for md-share.\n\nAll document bodies are fully encrypted client-side using AES-256-GCM. The keys never leave the client.\nPlaintext title and description metadata are stored in the JSON files to support rich link previews and search.\n`;
      await putFile(
        fullRepoPath,
        'README.md',
        readmeContent,
        undefined,
        'Initialize README.md',
        token
      );
    }
  } catch (e) {
    console.warn(`Warning: Could not initialize README.md: ${(e as Error).message}`);
  }

  // 3. Initialize shares/.gitkeep if not present
  try {
    const gitkeepFile = await getFile(fullRepoPath, 'shares/.gitkeep', token);
    if (!gitkeepFile) {
      console.log(`Writing shares/.gitkeep...`);
      await putFile(
        fullRepoPath,
        'shares/.gitkeep',
        '',
        undefined,
        'Initialize shares directory',
        token
      );
    }
  } catch (e) {
    console.warn(`Warning: Could not initialize shares/.gitkeep: ${(e as Error).message}`);
  }

  console.log(`\x1b[32m[OK] Storage repository ${fullRepoPath} is fully bootstrapped and ready.\x1b[0m`);
  return fullRepoPath;
}

export async function initStorageCommand(
  storageRepoName: string | undefined,
  options: { dryRun?: boolean }
): Promise<void> {
  try {
    await bootstrapStorageRepo(storageRepoName, options);
  } catch (e) {
    console.error(`\x1b[31mError bootstrapping storage repository: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
