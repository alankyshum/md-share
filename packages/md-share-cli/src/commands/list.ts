import { requireGitHubToken } from '../auth/token.js';
import { loadConfig } from '../config/load.js';
import { getRepoInfo, getRecursiveTree, getFile } from '../github/contents.js';

export interface ShareMetadata {
  key: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  url: string;
}

const SHARE_PATH_RE = /^shares\/[0-9a-f]{2}\/([0-9a-f]{12})\.json$/;

export async function fetchAllShares(
  storageRepo: string,
  appBaseUrl: string,
  token: string
): Promise<ShareMetadata[]> {
  const [owner, repoName] = storageRepo.split('/');
  if (!owner || !repoName) {
    throw new Error(`Invalid storage repository format: ${storageRepo}. Expected owner/repo`);
  }

  // 1. Get default branch
  const info = await getRepoInfo(storageRepo, token);
  if (!info) {
    throw new Error(`Could not retrieve repository info for ${storageRepo}. Make sure the repository exists.`);
  }
  const branch = info.default_branch || 'main';

  // 2. Get recursive tree
  const tree = await getRecursiveTree(storageRepo, branch, token);
  const shareFiles = tree.filter((entry) => SHARE_PATH_RE.test(entry.path));

  // 3. Fetch each share file metadata in parallel
  const shares: ShareMetadata[] = [];
  
  // Use Promise.all with chunking or simple parallel fetch
  await Promise.all(
    shareFiles.map(async (entry) => {
      const match = entry.path.match(SHARE_PATH_RE);
      if (!match) return;
      const key = match[1];

      try {
        const fileData = await getFile(storageRepo, entry.path, token);
        if (fileData && fileData.content) {
          const rawJson = Buffer.from(fileData.content, 'base64').toString('utf8');
          const parsed = JSON.parse(rawJson);

          // Discard ct and iv, keep only metadata
          shares.push({
            key,
            title: typeof parsed.title === 'string' ? parsed.title : '',
            description: typeof parsed.description === 'string' ? parsed.description : '',
            created_at: typeof parsed.created_at === 'string' ? parsed.created_at : '',
            updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : '',
            url: `${appBaseUrl.replace(/\/$/, '')}/u/${owner}/${repoName}/s/${key}`,
          });
        }
      } catch (e) {
        // Skip corrupted or unreadable files silently
      }
    })
  );

  return shares;
}

export async function listCommand(options: {
  sort?: 'created' | 'updated' | 'title';
  limit?: number;
  storageRepo?: string;
  appUrl?: string;
}): Promise<void> {
  const config = loadConfig();
  const storageRepo = options.storageRepo || config.storage_repo;
  const appBaseUrl = options.appUrl || config.app_base_url || 'https://share.alanshum.org';

  if (!storageRepo) {
    console.error(
      `\x1b[31mError: No storage repository configured. Please run 'md-share init' or provide '--storage-repo <owner/repo>'.\x1b[0m`
    );
    process.exit(1);
  }

  const token = requireGitHubToken();

  try {
    console.log(`Fetching shares from \x1b[36m${storageRepo}\x1b[0m...`);
    const shares = await fetchAllShares(storageRepo, appBaseUrl, token);

    if (shares.length === 0) {
      console.log('No shares found.');
      return;
    }

    // Sort
    const sortField = options.sort || 'updated';
    shares.sort((a, b) => {
      if (sortField === 'title') {
        return a.title.localeCompare(b.title);
      } else if (sortField === 'created') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else {
        // Default 'updated' desc
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    // Limit
    const limit = options.limit || 50;
    const sliced = shares.slice(0, limit);

    // Output as formatted table
    console.log(`\nFound ${shares.length} share(s) (showing top ${sliced.length}):\n`);
    
    // Header
    const colWidths = {
      created: 20,
      updated: 20,
      key: 12,
      title: 35,
    };

    console.log(
      `${'Created At'.padEnd(colWidths.created)} | ${'Updated At'.padEnd(colWidths.updated)} | ${'Key'.padEnd(colWidths.key)} | ${'Title'.padEnd(colWidths.title)} | URL`
    );
    console.log(
      `${'-'.repeat(colWidths.created)}-+-${'-'.repeat(colWidths.updated)}-+-${'-'.repeat(colWidths.key)}-+-${'-'.repeat(colWidths.title)}-+-${'-'.repeat(30)}`
    );

    for (const s of sliced) {
      const created = s.created_at ? new Date(s.created_at).toLocaleString().slice(0, 19) : 'N/A';
      const updated = s.updated_at ? new Date(s.updated_at).toLocaleString().slice(0, 19) : 'N/A';
      const truncatedTitle = s.title.length > colWidths.title
        ? s.title.slice(0, colWidths.title - 3) + '...'
        : s.title;

      console.log(
        `${created.padEnd(colWidths.created)} | ${updated.padEnd(colWidths.updated)} | ${s.key.padEnd(colWidths.key)} | ${truncatedTitle.padEnd(colWidths.title)} | ${s.url}`
      );
    }
  } catch (e) {
    console.error(`\x1b[31mError listing shares: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
