import fs from 'node:fs';
import { requireGitHubToken } from '../auth/token.js';
import { loadConfig } from '../config/load.js';
import { lintMarkdown } from '../lint/index.js';
import { getFile, putFile } from '../github/contents.js';
import {
  generateKey,
  encryptShare,
  bytesToBase64Url,
  serializeEncryptedShare,
} from '@alankyshum/share-crypto';
import { getShareKey } from '../utils/crypto.js';
import { deriveMetaFromMarkdown } from '../utils/meta.js';
import { encodeChunk } from '../encoding.js';
import { chunkMarkdown } from '../chunking.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { openInBrowser } from '../utils/browser.js';
import { printStats } from '../utils/stats.js';

export function parseUpdateTarget(s: string): string | null {
  const trimmed = s.trim();
  // If it's a URL
  const mUrl = trimmed.match(/\/s\/([0-9a-f]{12})\b/);
  if (mUrl) {
    return mUrl[1];
  }
  // If it's a bare key
  const mKey = trimmed.match(/\b([0-9a-f]{12})\b/);
  if (mKey) {
    return mKey[1];
  }
  return null;
}

export async function shareCommand(
  fileArg: string | undefined,
  options: {
    text?: string;
    base?: string;
    appUrl?: string;
    storageRepo?: string;
    open?: boolean;
    copy?: boolean;
    noCopy?: boolean;
    stats?: boolean;
    printOnly?: boolean;
    noShort?: boolean;
    alwaysShort?: boolean;
    shortThreshold?: number;
    update?: string;
    noLint?: boolean;
  }
): Promise<void> {
  // 1. Read markdown input
  let md = '';
  if (options.text) {
    md = options.text.replace(/\\n/g, '\n');
  } else if (fileArg && fileArg !== '-') {
    try {
      md = fs.readFileSync(fileArg, 'utf8');
    } catch (e) {
      console.error(`Error reading file "${fileArg}": ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    // Read from stdin
    md = fs.readFileSync(0, 'utf-8');
  }

  if (!md || !md.trim()) {
    console.error('Error: no markdown input provided');
    process.exit(1);
  }

  // 2. Local markdown linting
  if (!options.noLint) {
    const errs = lintMarkdown(md);
    if (errs.length > 0) {
      console.error('Markdown failed lint checks:');
      for (const err of errs) {
        console.error(`  • ${err}`);
      }
      console.error('\nFix the issues or pass --no-lint to bypass.');
      process.exit(2);
    }
  }

  // 3. Setup configurations
  const config = loadConfig();
  const appBaseUrl = options.appUrl || options.base || config.app_base_url || 'https://md-share-kut.pages.dev';
  const storageRepo = options.storageRepo || config.storage_repo;

  // --update forces always-short and disables --no-short
  let updateKey: string | null = null;
  let isNoShort = !!options.noShort;
  let isAlwaysShort = !!options.alwaysShort;

  if (options.update) {
    updateKey = parseUpdateTarget(options.update);
    if (!updateKey) {
      console.error(`Error: Could not extract a valid 12-char key from update target "${options.update}"`);
      process.exit(1);
    }
    if (isNoShort) {
      console.warn('Warning: --no-short ignored when --update is set');
    }
    isNoShort = false;
    isAlwaysShort = true;
  }

  const shortThreshold = options.shortThreshold || 1024;

  let urls: string[] = [];
  let chunks: string[] = [];
  let isShortUrl = false;

  // 4. Check if we should shorten (default/encrypted storage path)
  let shouldShorten = false;
  if (!isNoShort) {
    const tempEnc = encodeChunk(md);
    const tempUrl = `${appBaseUrl.replace(/\/$/, '')}/#v1.${tempEnc}`;
    shouldShorten = isAlwaysShort || tempUrl.length > shortThreshold;
  }

  if (shouldShorten) {
    if (!storageRepo) {
      console.warn(
        '\x1b[33mWarning: No storage repository configured. Falling back to offline fragment URL.\x1b[0m'
      );
      console.warn("Please run 'md-share init' to configure a GitHub storage repository.\n");
      shouldShorten = false;
    } else if (md.length > 100_000) {
      console.warn('(markdown >100KB, shortener rejected — falling back to fragment URL)');
      shouldShorten = false;
    }
  }

  if (shouldShorten && storageRepo) {
    const token = requireGitHubToken();
    const [owner, repoName] = storageRepo.split('/');
    if (!owner || !repoName) {
      console.error(`Invalid storage repository format: ${storageRepo}. Expected owner/repo`);
      process.exit(1);
    }

    try {
      // Generate WebCrypto key
      const keyBytes = await generateKey();
      const keyBase64Url = bytesToBase64Url(keyBytes);

      // Encrypt
      const { iv, ct } = await encryptShare(md, keyBytes);

      // Derive Metadata
      const { title, description } = deriveMetaFromMarkdown(md);

      // Determine Key and Target Path
      let shareKey = updateKey || getShareKey(md);
      const path = `shares/${shareKey.slice(0, 2)}/${shareKey}.json`;

      let existingSha: string | undefined = undefined;
      let createdAt: string | undefined = undefined;

      // Check if file already exists
      const existingFile = await getFile(storageRepo, path, token);
      if (existingFile) {
        existingSha = existingFile.sha;
        if (existingFile.content) {
          try {
            const rawJson = Buffer.from(existingFile.content, 'base64').toString('utf8');
            const parsed = JSON.parse(rawJson);
            createdAt = parsed.created_at;
          } catch {
            // Use fresh createdAt
          }
        }
      } else if (updateKey) {
        console.error(`Error: --update ${updateKey} failed (share does not exist on GitHub)`);
        process.exit(1);
      }

      // Serialize Encrypted Share
      const shareJson = serializeEncryptedShare({
        title,
        description,
        created_at: createdAt,
        updated_at: new Date().toISOString(),
        iv,
        ct,
      });

      // Write to GitHub
      const commitMsg = updateKey ? `Update share ${shareKey}` : `Create share ${shareKey}`;
      await putFile(
        storageRepo,
        path,
        JSON.stringify(shareJson, null, 2),
        existingSha,
        commitMsg,
        token
      );

      const finalUrl = `${appBaseUrl.replace(/\/$/, '')}/u/${owner}/${repoName}/s/${shareKey}#k=${keyBase64Url}`;
      urls = [finalUrl];
      chunks = [md];
      isShortUrl = true;
    } catch (e) {
      console.error(`\x1b[31mError writing encrypted share to GitHub: ${(e as Error).message}\x1b[0m`);
      console.error('Falling back to offline fragment URL...');
      shouldShorten = false;
    }
  }

  // 5. Fallback to offline fragment URL if needed
  if (!shouldShorten || urls.length === 0) {
    try {
      chunks = chunkMarkdown(md);
      const total = chunks.length;
      urls = chunks.map((chunk, i) => {
        const enc = encodeChunk(chunk);
        const base = appBaseUrl.replace(/\/$/, '');
        if (total > 1) {
          return `${base}/#v1.${i + 1}of${total}.${enc}`;
        }
        return `${base}/#v1.${enc}`;
      });
    } catch (e) {
      console.error(`Error encoding chunks: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // 6. Stats output
  if (options.stats) {
    printStats(md, chunks, urls);
  }

  // 7. Output URLs
  const isTty = process.stdout.isTTY;
  if (isTty && urls.length > 1) {
    for (let i = 0; i < urls.length; i++) {
      console.log(`Part ${i + 1}/${urls.length}: ${urls[i]}`);
    }
  } else {
    for (const url of urls) {
      console.log(url);
    }
  }

  // 8. Copy to clipboard
  const shouldCopy = options.copy !== false && !options.noCopy;
  let copied = false;
  if (shouldCopy) {
    copied = copyToClipboard(urls.join('\n'));
    if (!copied && isTty) {
      console.error('(clipboard copy failed)');
    }
  }

  // 9. Status footer
  if (isTty && !options.printOnly) {
    if (isShortUrl) {
      console.error(`\n[OK] Short URL ready — click above or paste with Cmd+V`);
    } else if (copied) {
      const label = urls.length > 1 ? `${urls.length} URLs` : 'URL';
      console.error(`\n[OK] ${label} copied to clipboard — paste with Cmd+V`);
    }
  }

  // 10. Open in browser
  if (options.open) {
    openInBrowser(urls[0]);
  }
}
export { shareCommand as default };
