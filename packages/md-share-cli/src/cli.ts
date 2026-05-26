import { Command } from 'commander';
import fs from 'node:fs';
import { shareCommand } from './commands/share.js';
import { initCommand } from './commands/init.js';
import { initStorageCommand } from './commands/init-storage.js';
import { loginCommand } from './commands/login.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { deleteCommand } from './commands/delete.js';
import { fixMermaidMarkdown } from './mermaid-fix.js';

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const program = new Command();

program
  .name('md-share')
  .description(packageJson.description || 'Securely encrypt and share markdown files')
  .version(packageJson.version || '1.0.0');

// Subcommand: init
program
  .command('init')
  .description('Initialize configuration and storage repo')
  .option('--self-host', 'Provision your own Cloudflare Pages self-hosted project')
  .option('--project-name <name>', 'Override the randomly generated Cloudflare Pages project name')
  .option('--dry-run', 'Print the initialization plan without modifying configuration or repos')
  .option('--storage-name <name>', 'Override default storage repository name (md-share--cms)')
  .action(async (options) => {
    await initCommand(options);
  });

// Subcommand: init-storage
program
  .command('init-storage')
  .description('Re-run/repair storage repository bootstrap on GitHub')
  .argument('[repo-name]', 'Override storage repository name')
  .option('--dry-run', 'Print bootstrap plan without writing files')
  .action(async (repoName, options) => {
    await initStorageCommand(repoName, options);
  });

// Subcommand: login
program
  .command('login')
  .description('Authenticate with GitHub via OAuth Device Flow')
  .option('--force', 'Force re-authentication even if already logged in')
  .action(async (options) => {
    await loginCommand(options);
  });

// Subcommand: list (alias ls)
program
  .command('list')
  .alias('ls')
  .description('List shared files in the storage repository')
  .option('--sort <field>', 'Sort by created | updated | title', 'updated')
  .option('--limit <number>', 'Limit the number of rows displayed', (v) => parseInt(v, 10), 50)
  .option('--storage-repo <owner/repo>', 'Override storage repository')
  .option('--app-url <url>', 'Override App Base URL')
  .action(async (options) => {
    await listCommand(options);
  });

// Subcommand: search
program
  .command('search')
  .description('Search shared files by title and description metadata')
  .argument('<query>', 'Search term')
  .option('--limit <number>', 'Limit results display', (v) => parseInt(v, 10), 50)
  .option('--storage-repo <owner/repo>', 'Override storage repository')
  .option('--app-url <url>', 'Override App Base URL')
  .action(async (query, options) => {
    await searchCommand(query, options);
  });

// Subcommand: delete (alias rm)
program
  .command('delete')
  .alias('rm')
  .description('Delete a share from the storage repository')
  .argument('<key-or-url>', '12-character share key or share URL')
  .option('--yes', 'Skip confirmation prompt', false)
  .option('--storage-repo <owner/repo>', 'Override storage repository')
  .action(async (keyOrUrl, options) => {
    await deleteCommand(keyOrUrl, options);
  });

// Subcommand: mermaid-fix
program
  .command('mermaid-fix')
  .description('Deterministic linter and auto-fixer for mermaid syntax issues')
  .argument('[file]', 'Markdown file to check (or "-" for stdin)', '-')
  .option('--fix', 'Write fixed content back to file or stdout')
  .option('--quiet', 'Suppress issue reporting on stderr')
  .action((file, options) => {
    let md = '';
    const isStdin = file === '-';
    
    try {
      md = isStdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`Error reading input: ${(e as Error).message}`);
      process.exit(1);
    }

    const { fixedMd, issues, fixedCount } = fixMermaidMarkdown(md);

    if (!options.quiet) {
      for (const issue of issues) {
        console.error(`L${issue.lineNo}: ${issue.message}`);
        const arrow = options.fix ? 'fixed' : 'suggest';
        console.error(`  ${arrow}: ${JSON.stringify(issue.oldStr)} -> ${JSON.stringify(issue.newStr)}`);
      }
    }

    if (options.fix) {
      if (!isStdin) {
        try {
          fs.writeFileSync(file, fixedMd, 'utf8');
          if (!options.quiet) {
            console.error(`\nFixed ${fixedCount} issue(s) in ${file}`);
          }
        } catch (e) {
          console.error(`Error writing file "${file}": ${(e as Error).message}`);
          process.exit(1);
        }
      } else {
        process.stdout.write(fixedMd);
      }
      process.exit(0);
    } else if (issues.length > 0) {
      if (!options.quiet) {
        console.error(`\n${issues.length} issue(s). Run with --fix to auto-correct.`);
      }
      process.exit(1);
    }

    process.exit(0);
  });

// Default action (sharing command) if no subcommand matches
program
  .argument('[file]', 'Markdown file to share (or "-" for stdin)')
  .option('--text <text>', 'Inline markdown text to share')
  .option('--base <url>', 'Override SPA App Base URL')
  .option('--app-url <url>', 'Override App Base URL')
  .option('--storage-repo <owner/repo>', 'Override storage repository')
  .option('--open', 'Open share URL in default browser (macOS)')
  .option('--copy', 'Copy share URL to clipboard (default: on)')
  .option('--no-copy', 'Disable clipboard copy')
  .option('--stats', 'Print size and compression stats to stderr')
  .option('--print-only', 'Print only the share URL without confirmation banner')
  .option('--no-short', 'Always emit offline fragment URLs')
  .option('--always-short', 'Always write encrypted file to storage repo')
  .option('--short-threshold <N>', 'URL threshold for auto-shortening', (v) => parseInt(v, 10))
  .option('--update <key-or-url>', 'Overwrite an existing share')
  .option('--rotate-key', 'When updating, rotate the decryption key (breaks existing links). Default: reuse the existing key.')
  .option('--no-lint', 'Bypass local markdown linting')
  .action(async (file, options) => {
    // If we have commander subcommands matching args, commander should have run them already.
    // However, if the argument matches a file name, we process it as a share file.
    await shareCommand(file, options);
  });

// Run parser
program.parse(process.argv);
