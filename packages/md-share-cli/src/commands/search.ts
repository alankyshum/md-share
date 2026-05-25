import { requireGitHubToken } from '../auth/token.js';
import { loadConfig } from '../config/load.js';
import { fetchAllShares } from './list.js';

export async function searchCommand(
  query: string,
  options: {
    storageRepo?: string;
    appUrl?: string;
    limit?: number;
  }
): Promise<void> {
  const config = loadConfig();
  const storageRepo = options.storageRepo || config.storage_repo;
  const appBaseUrl = options.appUrl || config.app_base_url || 'https://md-share-kut.pages.dev';

  if (!storageRepo) {
    console.error(
      `\x1b[31mError: No storage repository configured. Please run 'md-share init' or provide '--storage-repo <owner/repo>'.\x1b[0m`
    );
    process.exit(1);
  }

  if (!query || !query.trim()) {
    console.error(`\x1b[31mError: Search query cannot be empty.\x1b[0m`);
    process.exit(1);
  }

  const token = requireGitHubToken();

  try {
    console.log(`Searching shares in \x1b[36m${storageRepo}\x1b[0m for "${query}"...`);
    const shares = await fetchAllShares(storageRepo, appBaseUrl, token);

    const totalShares = shares.length;
    if (totalShares > 500) {
      console.warn(
        `\x1b[33mWarning: Client-side fuzzy search is limited to the first 500 shares (current repo has ${totalShares} shares).\x1b[0m`
      );
    }

    // Limit fuzzy search scope to 500
    const searchScope = shares.slice(0, 500);

    const lowerQuery = query.toLowerCase();
    const results = searchScope.filter((s) => {
      const titleMatch = s.title.toLowerCase().includes(lowerQuery);
      const descMatch = s.description.toLowerCase().includes(lowerQuery);
      return titleMatch || descMatch;
    });

    if (results.length === 0) {
      console.log('No matching shares found.');
      return;
    }

    const limit = options.limit || 50;
    const sliced = results.slice(0, limit);

    console.log(`\nFound ${results.length} matching share(s) (showing top ${sliced.length}):\n`);

    // Table display
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
    console.error(`\x1b[31mError searching shares: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
