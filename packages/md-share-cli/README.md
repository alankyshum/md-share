# @alankyshum/md-share

TypeScript CLI to securely encrypt and share markdown files with GitHub backing.

## Installation

```bash
npm install -g @alankyshum/md-share
```

## Quick Start

```bash
# Initialize configuration and storage repo
md-share init

# Share a markdown file
md-share note.md

# Share inline text
md-share --text "# Hello\nWorld"
```

## Features

- **Mandatory Encryption:** All shared contents are encrypted client-side using AES-256-GCM. The decryption key never leaves your machine except in the URL fragment.
- **GitHub Backed:** Shared notes are committed as encrypted JSON files inside your personal, public GitHub repository.
- **Offline Fallback:** Emits legacy `#v1...` fragment URLs when storage mode is offline or fallback is requested.
- **Markdown Linting:** In-depth lint checks for Mermaid diagram syntax, Map config, Chart configurations, and more.
- **Management Commands:** `list`, `search`, and `delete` commands to keep track of your shared files.

## Self-hosting

`md-share` supports a fully automated, CLI-driven self-hosting provisioning flow that connects your own Cloudflare Pages project to the canonical `md-share` repo, giving you auto-updates without managing forks.

### Prerequisites

1. A **Cloudflare Account**.
2. A **Cloudflare API Token** with `Account.Cloudflare Pages:Edit` permission.
3. **GitHub Cloudflare Pages App Access**: Ensure you have granted the [Cloudflare Pages GitHub App](https://github.com/apps/cloudflare-pages/installations/new) access to the canonical `alankyshum/md-share` repository.

### Quick Start

Run the initialization command with the `--self-host` flag:

```bash
md-share init --self-host
```

This one-liner will:
1. Securely request or read your Cloudflare API Token (from `CLOUDFLARE_API_TOKEN` environment variable or keychain).
2. Store the token in the macOS Keychain under service `md-share-cf`.
3. Fetch your Cloudflare accounts and prompt you to select one (if multiple exist).
4. Automatically generate a unique Pages project name (or you can override it with `--project-name <name>`).
5. Provision the Cloudflare Pages project pointing to the canonical `alankyshum/md-share` repository.
6. Retrieve the new `.pages.dev` URL and write it as the `app_base_url` in your local configuration.
7. Continue with the normal initialization wizard to authenticate with GitHub and bootstrap your storage repository.

### Verification

Once provisioning is complete, your self-hosted site will be live at `https://<projectName>.pages.dev`. You can verify your deployment config and metadata at:

```bash
curl https://<projectName>.pages.dev/api/config
```
