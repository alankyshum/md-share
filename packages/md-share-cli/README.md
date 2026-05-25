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
