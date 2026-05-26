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

`md-share` supports a fully automated, CLI-driven self-hosting provisioning flow that forks the canonical repository and connects your own Cloudflare Worker to your fork.

### Prerequisites

1. **GitHub** — already authenticated via `gh auth login` or via `md-share login`.
2. **`cf` Cloudflare CLI** — `brew install cloudflare/cloudflare/cf` (or download from https://github.com/cloudflare/cli/releases).
3. **`CLOUDFLARE_API_TOKEN`** in your environment with `Account > Cloudflare Workers Scripts: Edit` scope.

### Setup

Execute the initialization flow with the `--self-host` flag:

```bash
export CLOUDFLARE_API_TOKEN="..."
md-share init --self-host --project-name my-md-share
```
