# md-share

Share encrypted markdown with rich interactive viewers — your own GitHub repo as the backend, no servers or KV.

---

## 1. Architecture

```
                                            [ Client-Side Decryption Key (#k=) ]
                                                            │
                                                            ▼ (Fragment stays in browser)
┌──────────────┐   Encrypted JSON    ┌────────────────┐           ┌──────────────────┐
│  md-share    │ ──────────────────> │  GitHub Repos  │  ======>  │ Cloudflare Pages │
│  CLI Tool    │   (AES-256-GCM)     │ (Storage Repo) │           │ SPA Viewer App   │
└──────────────┘                     └────────────────┘           └──────────────────┘
                                                                            ▲
                                                                            │ (Fetch encrypted payload)
                                                                            │
                                                                   [ Public GitHub API ]
```

Every share is client-side encrypted before uploading. The cryptographic key is appended to the URL as a fragment identifier (`#k=<base64url_key>`). Because browsers do not transmit URL fragments to servers in HTTP requests, your markdown remains 100% private to you and whoever you share the link with.

---

## 2. Quickstart — Shared Canonical Deployment

Use the pre-deployed public client at `https://md-share-kut.pages.dev` to share your notes instantly. *Note: If the canonical URL currently serves legacy routes, it may require a manual Cloudflare Pages build trigger from the master branch to fully reflect the latest SPA.*

```bash
# 1. Install the CLI globally
npm install -g @alankyshum/md-share

# 2. Login to your GitHub account (authorizes via OAuth)
md-share login

# 3. Create your storage repository (e.g. <username>/md-share--cms)
md-share init

# 4. Share any markdown file!
md-share README.md
```

The CLI will encrypt the file, upload it as an idempotent JSON schema to your storage repo, and output a shareable URL similar to:
`https://md-share-kut.pages.dev/u/<owner>/<repo>/s/<key>#k=<base64url_key>`

---

## 3. Quickstart — Self-Hosting

You can host your own frontend instance on Cloudflare Pages for complete independence. It auto-updates directly from the canonical repository.

### Prerequisites
1. A **Cloudflare Account**.
2. A **Cloudflare API Token** with `Account > Cloudflare Pages > Edit` scope.
3. **GitHub Cloudflare Pages App Access**: Authorize the [Cloudflare Pages GitHub App](https://github.com/apps/cloudflare-pages/installations/new) to access the canonical `alankyshum/md-share` repo.

### Setup Command
Execute the initialization flow with the `--self-host` flag:

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
md-share init --self-host --project-name my-custom-md-viewer
```

### Auto-Update Model
Self-hosted Pages projects provisioned this way are linked to the master branch of `alankyshum/md-share`. Whenever a new version is pushed to the canonical repository, Cloudflare automatically rebuilds and deploys your custom SPA. You get all bug fixes, features, and optimizations instantly without maintaining a fork.

---

## 4. Encryption Model

### Symmetric Encryption
- **AES-256-GCM** client-side encryption.
- **Initialization Vector (IV)**: 12 random bytes generated per file/share.
- **Secret Key**: 32 cryptographically secure random bytes generated locally.
- **Quantum Resistance**: Symmetric AES-256 is highly quantum-resistant; Grover’s algorithm reduces the security margin to a still-unbreakable 128 bits. Shor’s algorithm is not applicable to symmetric primitives.

### URL Fragment Security
The encryption key is stored in the URL fragment (`#k=<base64url>`). Because fragments are client-side only, they are never sent to Cloudflare, GitHub, or any intermediary servers. The SPA running in the user's browser reads the key from the fragment to decrypt the payload entirely client-side.

### Plaintext Metadata
To enable rich social previews (Open Graph) and CLI management commands (`list`, `search`), the **Title** and **Description** are saved as plaintext in the repository JSON. The markdown body, frontmatter, and assets are completely ciphertext. 
*Do not put highly confidential PII in your document titles or descriptions.*

### Password Derivation (PBKDF2)
Standard PBKDF2/password-based encryption is intentionally **not supported**. Secure, cryptographically random keys are generated to guarantee maximum entropy and prevent brute-force attacks.

---

## 5. Storage Repo Layout

Shared files are committed to a dedicated public GitHub repository (defaulting to `<user>/md-share--cms`).

```
<user>/md-share--cms/
  shares/
    ab/
      abcdef123456...json   ← Files are sharded by the first 2 hex chars of the key
```

### Schema Definition
Each `.json` share file adheres to the following structure:

| Field | Type | Description |
|---|---|---|
| `v` | `string` | Schema version (e.g. `"1.0.0"`) |
| `title` | `string` | Plaintext title (extracted from first H1 or frontmatter) |
| `description` | `string` | Plaintext summary/description (extracted from frontmatter or first paragraph) |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `updated_at` | `string` | ISO 8601 last update timestamp |
| `alg` | `string` | Symmetric algorithm utilized (`"aes-256-gcm"`) |
| `iv` | `string` | Base64URL-encoded initialization vector |
| `ct` | `string` | Base64URL-encoded ciphertext (encrypted gzip-compressed markdown) |

---

## 6. URL Shapes

### Storage-Backed Share (New)
The standard URL shape for secure storage shares:
`https://<app_base_url>/u/<owner>/<repo>/s/<key>#k=<base64url_key>`

### Legacy Fragment Share (Offline/No-Storage)
For ad-hoc shares without GitHub repository storage, the CLI can emit compressed fragment URLs:
- **Single-part URL**: `https://<app_base_url>/#v1.<gzip+base64url(markdown)>`
- **Multi-part URL**: `https://<app_base_url>/#v1.NofM.<gzip+base64url(chunk_markdown)>` (for large payloads up to ~100KB split across multiple links).

### Legacy KV Short URLs
Historical KV-backed short links like `https://md-share-kut.pages.dev/s/<8charkey>` will continue resolving via the old Cloudflare Workers KV functions until their 1-year sliding TTL prunes them. The new CLI does not generate KV-backed short URLs.

---

## 7. CLI Command Reference

Execute commands with `--help` for additional flags (e.g., `md-share list --help`).

| Command | Action | Key Flags |
|---|---|---|
| `md-share [file]` | Securely encrypt and share a markdown file (or stdin via `-`) | `--text`, `--no-copy`, `--stats`, `--no-short`, `--always-short`, `--update <key>`, `--no-lint` |
| `md-share init` | Bootstrap configuration, login, and provision storage repo | `--self-host`, `--project-name <name>` |
| `md-share login` | Authenticate with GitHub via browser-based device flow | None |
| `md-share init-storage` | Manually initialize/verify the GitHub storage repository | None |
| `md-share list` / `ls` | List all active shares in your storage repo | `--json` |
| `md-share search <query>` | Query shares by matching plaintext title or description | None |
| `md-share delete <key>` / `rm` | Remove a shared file from your storage repo | None |
| `md-share mermaid-fix <file>`| Automatically check and fix common syntax errors in Mermaid blocks | None |

---

## 8. Rich Content Support

The renderer dynamically detects and upgrades advanced diagramming, mapping, and charting formats:

### Interactive Tables (Tabulator)
GFM tables are automatically upgraded with per-column filtering, client-side sorting, column dragging, and persistence. Currencies like `$1,234.56` are correctly sorted as numbers. Markdown links inside cells function flawlessly.

### Mermaid Mindmap → Markmap (D3-powered interactive)
Mermaid mindmaps are intercepted and converted into highly interactive Markmaps with pan, zoom, expand/collapse, and fullscreen support.

### Interactive Timelines & Gantt (frappe-gantt)
Standard Mermaid `gantt` fences are transformed into native Gantt charts with interactive toolbars, scaling levels (Day/Week/Month), and visual status colors.

### Map Fences (` ```map `)
Render interactive multi-day itineraries using MapLibre:
```map
days:
  - color: "#3b82f6"
    profile: driving-car
    stops:
      - { lng: -122.41, lat: 37.78, label: "SFO Airport" }
      - { lng: -121.89, lat: 37.33, label: "San Jose" }
```

### Chart Fences (` ```chart `)
Generate customizable line, bar, pie, doughnut, and polarArea charts utilizing Chart.js:
```chart
{
  "type": "line",
  "data": {
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [{"label": "MAU", "data": [120, 190, 270], "borderColor": "#3b82f6"}]
  }
}
```

### Floating Selection Menu & "Add to LLM"
Selecting text in the viewer triggers a floating menu:
- **⤴ Add to LLM**: Copies the selection prefixed with source context `[page <key>, lines <start>-<end>]`. You can paste this directly into an LLM chat to contextually request changes.
- **⧉ Copy**: Copies plaintext.

---

## 9. Open Graph & Social Previews

Opening a storage-backed link on platforms like iMessage, Discord, Slack, or Twitter fetches a customized preview card:
- **Title**: Extracted from your document frontmatter or H1.
- **Description**: Sourced from frontmatter or first paragraph (max 200 chars).
- **Dynamic Image**: A 1200×630 PNG automatically generated at `/u/<owner>/<repo>/og/<key>.png` using one of 8 gorgeous, deterministic gradient backgrounds matching the hash of your share key.

*To bust aggressive caches on Slack or Telegram after editing, append a query parameter like `?v=2` to your share link.*

---

## 10. Local Publish Flow

The monorepo uses `lefthook` and `bin/publish-on-version-bump.sh` to handle npm publication of updated packages.

```
                  ┌──────────────────────────────┐
                  │ Git Commit (version bump)    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼ (Triggers post-commit)
                  ┌──────────────────────────────┐
                  │ Lefthook post-commit hook    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼ (Checks version differences)
                  ┌──────────────────────────────┐
                  │ bin/publish-on-version-bump.sh│
                  └──────────────┬───────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        [ Yes: Version Diff ]        [ No: No Version Diff ]
                   │                           │
                   ▼                           ▼
         npm publish --access public         Exit 0
```

*Note: Since npm publication requires a 2-Factor Authentication (2FA) One-Time Password (OTP), local commits from the command line that trigger this hook will prompt for your OTP.*

---

## 11. Legacy Boundary

The legacy `share--markdown` skill has been moved and renamed to `share--markdown-legacy`. It remains fully operational for accessing and updating pre-existing Workers-KV shares until the 1-year sliding TTL naturally prunes them. New shares should adopt the modern `md-share` CLI.

---

## 12. Troubleshooting

- **Wrong key fragment**: If the key fragment `#k=...` is altered, missing, or corrupted, the viewer will display a decryption failure.
- **GitHub API Rate Limits**: Listing or searching extensive shares might trigger rate limiting. Authenticated CLI commands receive generous rate-limit ceilings.
- **Cloudflare Pages Deployment Fails**: Ensure your self-hosted Cloudflare Pages has authorized the `alankyshum/md-share` repository.
- **Aggregation / Chunking issues**: If an offline share requires splitting into more than 100 URL chunks, the CLI will error. Please use standard storage mode instead.

---

## 13. License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
