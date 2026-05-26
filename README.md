# md-share

Share encrypted markdown with rich interactive viewers — your own GitHub repo as the backend, no servers or KV.

<img width="1336" height="1290" alt="img" src="https://github.com/user-attachments/assets/41b74e74-b990-4a3d-8ad0-8af103a947cb" />


*The SPA viewer rendering [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): auto-generated TOC sidebar, syntax-highlighted markdown body, and live reading stats — all hydrated client-side after AES-256-GCM decryption.*

---

## 1. Architecture

```mermaid
flowchart LR
    Author(["✍️ Author"])
    Reader(["👁️ Reader"])
    CLI["md-share CLI<br/>(Node)"]
    GH[("GitHub Storage Repo<br/>(user)/md-share--cms")]
    PF["Cloudflare Pages Function<br/>/u/:owner/:repo/s/:key"]
    SPA["SPA Viewer<br/>(browser)"]

    Author -- "markdown file" --> CLI
    CLI -- "1. PUT encrypted JSON<br/>(AES-256-GCM + gzip)" --> GH
    CLI -- "2. share URL<br/>#k=(base64url key)" --> Author
    Author -. "shares link" .-> Reader

    Reader -- "GET /u/:o/:r/s/:key" --> PF
    PF -- "fetch raw JSON" --> GH
    GH -- "encrypted payload" --> PF
    PF -- "HTML + injected ciphertext<br/>+ OG meta tags" --> SPA
    SPA -- "decrypt with #k=…<br/>(fragment never sent to server)" --> Reader
```

Every share is client-side encrypted before uploading. The cryptographic key is appended to the URL as a fragment identifier (`#k=<base64url_key>`). Because browsers do not transmit URL fragments to servers in HTTP requests, your markdown remains 100% private to you and whoever you share the link with.

See [§5 Data Flow](#5-data-flow) for step-by-step sequence diagrams of how the CLI publishes a share and how the reader decrypts and renders it.

---

## 2. Quickstart — Shared Canonical Deployment

Use the pre-deployed public client at `https://share.alanshum.org` to share your notes instantly. *Note: If the canonical URL currently serves legacy routes, it may require a manual Cloudflare Pages build trigger from the master branch to fully reflect the latest SPA.*

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
`https://share.alanshum.org/u/<owner>/<repo>/s/<key>#k=<base64url_key>`

---

## 3. Quickstart — Self-Hosting

Run your own SPA on Cloudflare Pages, sourced from your own fork of this repo. `md-share init --self-host` orchestrates the entire setup.

### Prerequisites

1. **GitHub** — already authenticated via `gh auth login` or via `md-share login`.
2. **`cf` Cloudflare CLI** — `brew install cloudflare/cloudflare/cf` (or download from https://github.com/cloudflare/cli/releases). See our `tool--cloudflare` skill for full reference.
3. **`CLOUDFLARE_API_TOKEN`** in your environment with `Account > Cloudflare Pages: Edit` scope. Mint at https://dash.cloudflare.com/profile/api-tokens.

### Setup

```bash
export CLOUDFLARE_API_TOKEN="..."
md-share init --self-host --project-name my-md-share
```

The wizard will:

1. Fork `alankyshum/md-share` to `<your-user>/md-share` (the app source).
2. Create your storage repo `<your-user>/md-share--cms` (the content source).
3. Use the `cf` CLI to create a Cloudflare Pages project linked to your app fork (production branch `master`, root dir `packages/md-share-app`, build command `pnpm install --frozen-lockfile && pnpm --filter @alankyshum/md-share-app build`, output `build`).
4. Wait for the first build and capture the resulting `<name>.pages.dev` subdomain.
5. Write the URL to `~/.config/md-share/config.json` as `app_base_url`.

### Updating

Your app fork tracks `alankyshum/md-share/master`. When you want upstream changes, sync your fork via the GitHub UI ("Sync fork" button on your fork's page) or `gh repo sync <your-user>/md-share`. Cloudflare Pages auto-rebuilds on each push to your fork's `master` branch.

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

## 5. Data Flow

### 5.1 Create — CLI publishes a new share

How `md-share <file>` turns a local markdown file into a shareable URL.

```mermaid
sequenceDiagram
    actor User
    participant CLI as md-share CLI<br/>(commands/share.ts)
    participant FS as Local FS / stdin
    participant Lint as Linters<br/>(mermaid, chart, map, …)
    participant Crypto as share-crypto<br/>(WebCrypto + pako)
    participant GH as GitHub<br/>Contents API

    User->>CLI: md-share README.md
    CLI->>FS: read file (or stdin / --text)
    FS-->>CLI: markdown
    CLI->>Lint: lintMarkdown(md)
    Lint-->>CLI: errors? (exit 2 if any, unless --no-lint)

    Note over CLI: encodeChunk(md) → tempUrl<br/>shouldShorten = isAlwaysShort OR tempUrl.length > 1024

    alt shouldShorten AND storage_repo configured AND md ≤ 100KB
        CLI->>Crypto: generateKey() → 32 random bytes
        CLI->>Crypto: encryptShare(md, key)
        Note over Crypto: 1. pako.gzip(md)<br/>2. AES-256-GCM encrypt<br/>   (fresh 12-byte IV, 128-bit tag)
        Crypto-->>CLI: { iv, ct }
        CLI->>CLI: deriveMetaFromMarkdown(md)<br/>→ plaintext title + description
        CLI->>CLI: shareKey = sha256(md).slice(0,12)<br/>(or --update [key])<br/>path = shares/[XX]/[key].json
        CLI->>GH: GET /repos/:repo/contents/:path<br/>(reuse SHA + created_at if exists)
        GH-->>CLI: existing file or 404
        CLI->>GH: PUT /repos/:repo/contents/:path<br/>{ v:1, title, description, alg, iv, ct }
        GH-->>CLI: commit OK
        CLI-->>User: https://[app]/u/:o/:r/s/:key<br/>#k=[base64url(key)]
    else fallback — short markdown, --no-short, no repo, over 100KB, or GH error
        CLI->>CLI: chunkMarkdown(md)<br/>each chunk → pako.gzip + base64url
        CLI-->>User: https://[app]/#v1.[data]<br/>or #v1.NofM.[data] (multi-part)
    end

    CLI->>User: copy to clipboard (unless --no-copy)<br/>+ open in browser (if --open)
```

Key invariants:

- The 32-byte symmetric key **never leaves the author's machine** in any HTTP request body. It is only ever placed in the URL fragment, which browsers do not transmit.
- `title` and `description` are **plaintext** in the JSON so OG cards and `md-share list` / `search` work without the key.
- The 12-char `shareKey` is a deterministic SHA-256 prefix of the markdown — repeated `md-share` on unchanged content is idempotent.
- `--update <key|url>` forces the same `shareKey`, preserves the original `created_at`, and bumps `updated_at`.

### 5.2 Read — viewer decrypts and renders

How opening `https://<app>/u/:owner/:repo/s/:key#k=<key>` becomes a rendered page.

```mermaid
sequenceDiagram
    actor Reader
    participant Browser
    participant PF as Pages Function<br/>functions/u/[owner]/[repo]/s/[key].ts
    participant GHraw as raw.githubusercontent.com
    participant Assets as Cloudflare Pages<br/>(SPA static assets)
    participant SPA as SPA<br/>(+page.svelte)
    participant Crypto as share-crypto<br/>(WebCrypto + pako)
    participant Renderer as markdown-renderer<br/>(marked + hljs + enhancers)

    Reader->>Browser: open share URL
    Note over Browser: #k=… stays client-side<br/>(fragment never sent on the wire)
    Browser->>PF: GET /u/:o/:r/s/:key

    PF->>GHraw: GET /:o/:r/main/shares/[XX]/[key].json
    GHraw-->>PF: encrypted JSON { v, title, description, alg, iv, ct }
    PF->>PF: parseShareJson + deriveMeta
    PF->>Assets: fetch / (SPA index.html)
    Assets-->>PF: index.html
    PF->>PF: strip default [title] tag<br/>inject [title] + og:* / twitter:* meta tags<br/>inject inline script setting window.__MD_ENCRYPTED = { iv, ct, key, owner, repo }
    PF-->>Browser: HTML (with ciphertext inline + social-preview meta)

    Note over Browser: Social crawlers (iMessage, Slack, …)<br/>stop here — only plaintext title/description visible

    Browser->>SPA: hydrate +page.svelte
    SPA->>SPA: read kParam from location.hash
    alt kParam present
        SPA->>Crypto: decryptShare(iv, ct, base64UrlToBytes(kParam))
        Note over Crypto: AES-256-GCM decrypt<br/>→ pako.ungzip<br/>→ UTF-8 decode
        Crypto-->>SPA: markdown plaintext
        SPA->>SPA: extractFrontmatter(md)
        SPA->>Renderer: renderMarkdown(content, target, dark)
        Note over Renderer: marked → HTML<br/>+ hljs syntax highlighting<br/>+ enhance: mermaid, markmap,<br/>  chart.js, MapLibre, Tabulator
        Renderer-->>SPA: interactive DOM
        SPA-->>Reader: rendered document<br/>+ selection menu / fullscreen viewer
    else missing / wrong #k=
        SPA-->>Reader: "Decryption failed — invalid key"
    end
```

Fallback paths the reader also handles:

- **Fragment URLs** (`#v1.<data>` or `#v1.NofM.<data>`) — no Pages Function, no GitHub fetch; `decodeFragment` ungzips inline and renders.
- **Legacy KV short links** (`/s/<8charkey>`) — served by the old Workers KV function until their 1-year sliding TTL expires.

---

## 6. Storage Repo Layout

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

## 7. URL Shapes

### Storage-Backed Share (New)
The standard URL shape for secure storage shares:
`https://<app_base_url>/u/<owner>/<repo>/s/<key>#k=<base64url_key>`

### Legacy Fragment Share (Offline/No-Storage)
For ad-hoc shares without GitHub repository storage, the CLI can emit compressed fragment URLs:
- **Single-part URL**: `https://<app_base_url>/#v1.<gzip+base64url(markdown)>`
- **Multi-part URL**: `https://<app_base_url>/#v1.NofM.<gzip+base64url(chunk_markdown)>` (for large payloads up to ~100KB split across multiple links).

### Legacy KV Short URLs
Historical KV-backed short links like `https://md-share-kut.pages.dev/s/<8charkey>` will continue resolving via the old Cloudflare Workers KV functions until their 1-year sliding TTL prunes them. The new CLI does not generate KV-backed short URLs.

### Which URL shape does the CLI emit?

```mermaid
flowchart TD
    A["md-share (file)"] --> B{--no-short?}
    B -- yes --> F["Fragment URL<br/>#v1.(gzip+b64)"]
    B -- no --> C{"tempUrl over 1024 chars<br/>OR --always-short<br/>OR --update?"}
    C -- no --> F
    C -- yes --> D{storage_repo<br/>configured?}
    D -- no --> F1[Fragment URL<br/>+ warning to run<br/>md-share init]
    D -- yes --> E{"markdown<br/>over 100KB?"}
    E -- yes --> F2[Fragment URL<br/>+ size warning]
    E -- no --> G{GitHub PUT<br/>succeeds?}
    G -- no --> F3[Fragment URL<br/>+ error log]
    G -- yes --> H["Storage URL<br/>/u/:o/:r/s/:key#k=(key)"]
```

---

## 8. CLI Command Reference

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

## 9. Rich Content Support

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

## 10. Open Graph & Social Previews

Opening a storage-backed link on platforms like iMessage, Discord, Slack, or Twitter fetches a customized preview card:
- **Title**: Extracted from your document frontmatter or H1.
- **Description**: Sourced from frontmatter or first paragraph (max 200 chars).
- **Dynamic Image**: A 1200×630 PNG automatically generated at `/u/<owner>/<repo>/og/<key>.png` using one of 8 gorgeous, deterministic gradient backgrounds matching the hash of your share key.

*To bust aggressive caches on Slack or Telegram after editing, append a query parameter like `?v=2` to your share link.*

---

## 11. Local Publish Flow

The monorepo uses `lefthook` and `bin/publish-on-version-bump.sh` to handle npm publication of updated packages.

```mermaid
flowchart TD
    A[git commit<br/>version bump in packages/*/package.json] --> B[lefthook<br/>post-commit hook]
    B --> C[bin/publish-on-version-bump.sh]
    C --> D{HEAD~1<br/>exists?}
    D -- no --> Z[exit 0]
    D -- yes --> E[For each packages/*/package.json]
    E --> F{version &ne;<br/>HEAD~1 version?}
    F -- no --> E
    F -- yes --> G{private:&nbsp;true<br/>OR new package?}
    G -- yes --> H[skip — log reason]
    H --> E
    G -- no --> I["cd packages/(pkg)<br/>npm publish --access public"]
    I -.->|2FA OTP prompt| J([User enters OTP])
    J --> E
```

*Note: Since npm publication requires a 2-Factor Authentication (2FA) One-Time Password (OTP), local commits from the command line that trigger this hook will prompt for your OTP — once per published package in the same commit.*

---

## 12. Legacy Boundary

The legacy `share--markdown` skill has been moved and renamed to `share--markdown-legacy`. It remains fully operational for accessing and updating pre-existing Workers-KV shares until the 1-year sliding TTL naturally prunes them. New shares should adopt the modern `md-share` CLI.

---

## 13. Troubleshooting

- **Wrong key fragment**: If the key fragment `#k=...` is altered, missing, or corrupted, the viewer will display a decryption failure.
- **GitHub API Rate Limits**: Listing or searching extensive shares might trigger rate limiting. Authenticated CLI commands receive generous rate-limit ceilings.
- **Cloudflare Pages Deployment Fails**: Ensure your self-hosted Cloudflare Pages has authorized the `alankyshum/md-share` repository.
- **Aggregation / Chunking issues**: If an offline share requires splitting into more than 100 URL chunks, the CLI will error. Please use standard storage mode instead.

---

## 14. License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
