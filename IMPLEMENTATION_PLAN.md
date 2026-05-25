# md-share Public Toolkit Migration — Implementation Plan

**Status:** PLAN ONLY — no code snippets, function bodies, or diffs in this document. Describe WHAT changes and WHERE (file paths, symbol names, file:line refs); the `code` sub-agent writes the HOW.
**Audience:** `orchestrate--implementation` and delegated sub-agents.
**Source-of-truth inputs:** `~/.claude/skills/share--markdown/SKILL.md`; `scripts/share-md.py`; `scripts/md-lint/`; `scripts/mermaid-fix.py`; `config.example.json`; `config.json`; `spa/package.json`; `spa/svelte.config.js`; `spa/vite.config.ts`; `spa/wrangler.toml`; `spa/tsconfig.json`; `spa/functions/api/keys.ts`; `spa/functions/api/save.ts`; `spa/functions/og/[key].ts`; `spa/functions/s/[key].ts`; `spa/functions/_meta.ts`; `spa/src/routes/+page.svelte`; `spa/src/lib/codec.ts`; `spa/src/lib/render.ts`; `spa/src/lib/selection-menu.ts`; `spa/src/lib/FullscreenViewer.svelte`; `spa/src/lib/Sidebar.svelte`; `spa/src/lib/Frontmatter.svelte`; `packages/markdown-renderer/package.json`; `packages/markdown-renderer/src/index.ts`; `packages/markdown-renderer/src/server.ts`; `packages/markdown-renderer/src/client/index.ts`; `packages/markdown-renderer/src/client/*.ts`; `packages/markdown-renderer/src/styles/renderer.css`.

## 1. Goal & success criteria

**Goal.** Migrate the existing `share--markdown` skill from a Cloudflare-KV-backed, dotfiles-bundled, Python-CLI tool into a publicly-installable, KV-free, encrypted, npm-published toolkit. The new system replaces Cloudflare KV with public GitHub repo storage at `<owner>/<repo>/shares/<hash[:2]>/<hash>.json`, preserves all current viewer and CLI UX features, encrypts every share by default with a per-share URL-fragment AES key, ships three npm packages from a pnpm-workspaces monorepo, supports shared and self-hosted Cloudflare Pages tiers, and uses GitHub OAuth Device Flow with `gh auth token` fallback for write auth.

**Current implementation anchors:**
- Current skill documents short URL, renderer, OG, lint, and multi-part behavior in `SKILL.md:10-315`.
- Current Python CLI handles gzip/base64url, chunking, lint, shortener upload, update parsing, clipboard, and browser open in `scripts/share-md.py:24-380`.
- Current KV write endpoint is `spa/functions/api/save.ts:1-73`; current KV resolver/meta injector is `spa/functions/s/[key].ts:1-102`.
- Current dynamic OG PNG generator with 8 deterministic palettes is `spa/functions/og/[key].ts:1-150`.
- Current fragment codec uses standard gzip plus base64url in `spa/src/lib/codec.ts:1-59`.
- Current renderer package is private and locally named `@local/markdown-renderer` in `packages/markdown-renderer/package.json:1-30`.
- Current SPA imports renderer through local package refs in `spa/package.json:11-29` and `spa/src/lib/render.ts:1-82`.

**Success criteria (binary, all must be true at merge of final phase):**
1. `npm i -g @alankyshum/md-share` installs a working CLI.
2. `md-share init` walks first-time setup, bootstraps the user's public storage repo, writes `app_base_url` plus `storage_repo` to local config, and `md-share <file.md>` produces a working short URL on the canonical shared deployment.
3. New URLs resolve at `https://<domain>/u/<owner>/<repo>/s/<key>`, render the markdown with full feature parity to today.
4. Every share is encrypted by default with a per-share random AES-256 key embedded in the URL fragment. The key never reaches the server. Reader sees no prompt — decryption is automatic when the URL contains `#k=`.
5. Encrypted shares still produce rich OG previews: title/description are plaintext, body is ciphertext; Slack/Telegram/Twitter unfurls show real title plus dynamic gradient PNG.
6. `--update <key>` overwrites the existing share via a GitHub commit to the same path.
7. `md-share init --self-host` provisions a Cloudflare Pages project connected to the canonical `alankyshum/md-share` repo, captures its `<name>.pages.dev` URL as `app_base_url`, and serves correctly without a repo fork.
8. `@alankyshum/markdown-renderer` v1.0.0 is published; `alankyshum/alanshum-web` consumes it from npm, with `file:` refs eliminated.
9. Old `~/.claude/skills/share--markdown/` is renamed to `share--markdown-legacy` with a deprecation banner; a new `share--markdown` skill wraps the new CLI.
10. Old `md-share-kut.pages.dev` short URLs continue resolving; legacy infra stays running with natural sunset through the existing 1-year sliding KV TTL.
11. `md-share list`, `md-share search <query>`, and `md-share delete <key>` work against the canonical test storage repo and respect `--limit` / `--sort` / `--yes` semantics.
12. The plan document `IMPLEMENTATION_PLAN.md` itself is committed into the new `alankyshum/md-share` repo (Phase 1), then published as a share via `md-share IMPLEMENTATION_PLAN.md` against the canonical deployment (Phase F dogfood). The resulting URL renders correctly, the page returns `<meta property="og:title">` matching the plan's title, `<meta property="og:description">` matching the description, and `<meta property="og:image">` pointing at a `/u/<owner>/<repo>/og/<key>.png` route that returns HTTP 200 with a valid PNG. Body remains AES-encrypted (URL fragment carries the key); OG meta is plaintext.

**Locked decisions to include in every implementation prompt:**
- CLI language is TypeScript, in `packages/md-share-cli/`.
- Every share is encrypted by default. There is no encryption opt-out.
- Canonical shared deployment URL is not hardcoded in the plan or CLI; discover it from the existing Cloudflare Pages project and store/read it as `app_base_url` in `~/.config/md-share/config.json`.
- npm scope is `@alankyshum/*`; Phase 1 must check/create the org.
- New standalone repo is `alankyshum/md-share`, extracted via `git subtree split` from the current dotfiles skill subdirectory.
- CLI generates a fresh random 256-bit AES key per share; the key is embedded only in the URL fragment as `#k=<base64url(32 bytes)>` and is never transmitted to the server.
- Encryption is AES-256-GCM via WebCrypto in Node and browser; use a 12-byte IV per share. No KDF fields are used because keys are random per share.
- Storage JSON fields are exactly `v`, `title`, `description`, `created_at`, `updated_at`, `alg`, `iv`, and `ct`. Title and description are plaintext for OG previews and storage-repo manageability; only `ct` is ciphertext.
- Storage key is `sha256(content)[:12]`, sharded to `shares/<hash[:2]>/<hash>.json`.
- Routes are `GET /u/<owner>/<repo>/s/<key>`, `GET /u/<owner>/<repo>/og/<key>.png`, `GET /api/config`, and `GET /api/keys`.
- Writer auth is GitHub OAuth Device Flow with public baked-in `GITHUB_OAUTH_CLIENT_ID = "Ov23liCeBKLwRl7AwGjR"`, with `gh auth token` fallback.
- Default storage repo created by `md-share init` is `<user>/md-share--cms`; `--storage-name <name>` overrides it.
- Reader UX: if `#k=` is absent or invalid, render “Decryption failed — this URL is missing or has an invalid key”; do not fall back to plaintext or “not found”.
- AES-256 remains appropriate in a post-quantum setting: Grover’s algorithm reduces the effective security to 128 bits, still sufficient; NIST PQC work targets asymmetric crypto, not AES replacement.
- Existing Cloudflare account is `fbe46925529a77537b36114bed4e1ae1`; verify the existing Pages project linked to `alankyshum/md-share` and keep `md-share-kut` running.

**Final storage JSON schema:**

| Field | Type | Notes |
|---|---|---|
| `v` | int | Schema version, start at 1 |
| `title` | string | Plaintext, for OG meta and repo management |
| `description` | string | Plaintext, for OG meta and repo management |
| `created_at` | ISO 8601 string | Set by CLI at create time |
| `updated_at` | ISO 8601 string | Set by CLI at update time |
| `alg` | string | Literal `AES-256-GCM` |
| `iv` | string | base64url, 12 bytes |
| `ct` | string | base64url of AES-GCM(gzip(markdown body)) |

## 2. Execution model — sub-agent delegation

### 2.1 Available sub-agent types

| Agent type | Use in this plan | Expected output |
|---|---|---|
| `explore` | Ground unfamiliar code, locate consumer repos, validate line refs, inspect existing deploy/npm/GitHub state before edits | Concise findings with file:line refs, repo paths, commands run, and implementation recommendations |
| `code` | Make all source, config, docs, workflow, packaging, and skill-file changes | Commits or working-tree changes matching the phase scope, plus phase-local verification results |
| `code-reviewer` | Review implementation for correctness, maintainability, test coverage, and plan adherence | PASS/FAIL review with blocking findings and non-blocking notes |
| `code-skeptic` | Adversarially check high-risk changes: extraction/publish, encryption/auth, CLI UX, skill swap, final acceptance | PASS/FAIL with exploit paths, edge cases, downgrade risks, and required fixes |
| `general` | Execute repository/admin tasks that are not code authoring: npm org checks, Cloudflare project setup, GitHub repo settings, manual acceptance runs | Audit log of commands, links, and binary outcomes |

### 2.2 Phase-by-phase delegation table

| Phase | Primary agent | Verification agent | Key inputs | Pass criteria |
|---|---|---|---|---|
| Phase 1 — Monorepo extraction + local publish wiring | `code` plus `general` for npm/GitHub admin | `code-skeptic` | Locked decisions; current skill tree; renderer files; npm scope state | New repo exists, subtree history preserved, pnpm workspace builds, and lefthook publish-on-version-bump is wired |
| Phase 1.1 — GH-backed storage swap | `explore` then `code` | `code-reviewer` | `api/save.ts`, `s/[key].ts`, `_meta.ts`, OG route, codec | Temporary plaintext GitHub-backed create/read/update works on branch; old legacy remains untouched |
| Phase 2 — Encryption layer | `explore` then `code` | `code-skeptic` | Storage format lock, codec, SPA route, CLI package direction | Default encrypted fragment-key flow, missing/invalid-key error, and OG plaintext metadata pass browser and CLI tests |
| Phase 3 — TypeScript CLI | `explore` then `code` | `code-skeptic` | `scripts/share-md.py`, `scripts/md-lint/`, config files, locked CLI flags and management commands | Global package installs; `md-share init/login/init-storage/list/search/delete` work; flags preserve current behavior |
| Phase 4 — Self-host infra | `explore` then `code` plus `general` for Cloudflare verification | `code-reviewer` | App package, README draft, Cloudflare API provisioning, `/api/config` | `md-share init --self-host` provisions a Pages project connected to canonical repo and writes `app_base_url` |
| Phase 5 — Docs + canonical deployment | `general` plus `code` for docs | `code-reviewer` | Existing Cloudflare Pages project, package metadata, README, release settings | Existing canonical Pages project builds new code, routes work, and docs cover shared/self-host quickstarts |
| Phase 6a — Legacy rename | `code` | `code-skeptic` | Current skill dir, legacy Python CLI/config/infra | Legacy skill moved, deprecation banner added, existing legacy update path still works |
| Phase 6b — New skill wrapper | `code` | `code-reviewer` | New CLI help, success criteria, legacy boundary | New `share--markdown/SKILL.md` wraps CLI and documents legacy-only update guidance |
| Phase 6c — Consumer migration | `explore` then `code` | `code-reviewer` | `~/Documents/obsidian-notes/external/alanshum-web` and known renderer file ref | `alankyshum/alanshum-web` file ref/imports removed and `pnpm build` passes |
| Phase E.1 — Fix bugs until tests pass | `code` | `code-skeptic` | Known Bugs list, all failing tests/checks | Zero unresolved Known Bugs, or each moved to Upstream Deferred with issue-style note |
| Phase F — End-to-end acceptance | `general` | `code-skeptic` | Final branch, npm, Cloudflare, GitHub repos, legacy infra | All 12 success criteria independently verified, including the dogfood publish of `IMPLEMENTATION_PLAN.md` to the canonical deployment with OG preview verification |
| Phase G — Out of scope | `general` | `code-reviewer` | Non-goals list | Review confirms deferred items are documented and not accidentally partially shipped |

### 2.3 Sub-agent prompt construction rules

- Every sub-agent prompt must include: the locked decisions list from §1, the relevant phase scope, the phase deliverables, acceptance criteria, verification commands, and this prohibition: no changes outside the phase unless explicitly approved by the orchestrator.
- Every prompt that touches storage, routes, encryption, publishing, or skill files must include the 12 success criteria verbatim.
- Every prompt that touches current source must include the source file paths and line refs from §1 and §4.
- Every prompt must ask the sub-agent to report: files changed, commands run, PASS/FAIL acceptance checks, and open follow-ups.
- Prompts to `code` agents must not include implementation pseudocode. Describe desired contracts, paths, and behavior only.
- Prompts to `explore` agents must ask for exact file:line and symbol names, not broad summaries.

### 2.4 Verification workflow rules

- Gate with `code-skeptic` for Phase 1, Phase 2, Phase 3, Phase 6a, Phase E.1, and Phase F because these can break publishing, auth, crypto, old URLs, or final acceptance.
- Use `code-reviewer` for GH-backed storage, self-host infra, docs/deployment, new skill wrapper, and consumer migrations unless a security/auth regression appears.
- No phase is complete until the verification agent issues an explicit PASS or the orchestrator records an approved deferment in `## Upstream Deferred`.
- If verification fails, the orchestrator delegates fixes to `code`; it does not edit files directly.
- Re-run the exact verification commands after every fix batch.

### 2.5 `explore`-first discipline

- Phase 1.1 must start with `explore` to map Cloudflare Pages Functions behavior, Svelte SPA injection points, and current meta/OG assumptions.
- Phase 2 must start with `explore` to identify all decode/render entry points, URL-fragment parsing, missing/invalid-key error handling, and how theme/sidebar state currently works.
- Phase 3 must start with `explore` to map every Python CLI behavior and every md-lint validator before rewriting in TypeScript.
- Phase 6c must start with `explore` to inspect how `alanshum-web` currently resolves its broken `file:./external/markdown-renderer` dependency in local and Cloudflare builds.
- If a `code` agent encounters an ungrounded path or symbol, it must stop and request an `explore` pre-task rather than guessing.

### 2.6 Parallelization opportunities

- After Phase 1 establishes the monorepo, documentation skeletons and package metadata can be drafted in parallel with Phase 1.1, but they must not claim features before acceptance.
- Phase 2 encryption library work can proceed in parallel across CLI-side crypto, browser-side crypto, and storage-schema tests after a shared `explore` result locks the contracts.
- Phase 3 CLI command groups can be split between setup/auth commands and share/update/render-preserving flags once the shared config contract is stable.
- Phase 4 self-host provisioning/docs can proceed while Phase 3 CLI polish continues, provided package names and app routes are already fixed.
- Phase 6b skill wrapper and Phase 6c consumer discovery can run in parallel after Phase 5 canonical deployment is live.

### 2.7 Orchestrator's responsibilities (allowed)

- Create and sequence sub-agent tasks.
- Run verification commands and collect evidence.
- Perform administrative operations that are not source-code edits: GitHub repo creation/settings, npm org checks, Cloudflare project creation, release/tag verification, and package install smoke tests.
- Maintain an audit log of phase PASS records, command output summaries, URLs, package versions, and deployment links.
- Decide whether a failed check returns to `code`, escalates to `code-skeptic`, or is documented as Upstream Deferred.
- Ensure only `IMPLEMENTATION_PLAN.md` is treated as the locked plan source during execution.

### 2.8 Orchestrator's prohibitions (must NOT do)

- Do not write application, CLI, workflow, renderer, or skill code directly; delegate to `code`.
- Do not change locked decisions without explicit user approval.
- Do not delete or modify legacy Cloudflare KV data or the `md-share-kut` deployment.
- Do not publish npm packages through CI; publishing is local-only via the lefthook version-bump hook and the user's local `~/.npmrc` auth.
- Do not expose secrets from `config.json`, Keychain, npm, GitHub, or Cloudflare in logs or committed files.
- Do not merge final changes while any Known Bug remains unresolved outside `## Upstream Deferred`.
- Do not convert the storage repo to private/authenticated access for v1.

## 3. Phase-by-phase deliverables

### Phase 1 — Monorepo extraction + local publish wiring

**Scope.** Create the standalone `alankyshum/md-share` repo from the current dotfiles skill subdirectory, preserve renderer history, scaffold pnpm workspaces, rename the renderer package, wire local lefthook-based npm publishing, and leave the existing dotfiles Python CLI/Pages deployment operational until Phase 6.

**Deliverables.**
- Confirm npm org/scope `@alankyshum` exists or create it; record the result in the phase audit log.
- Confirm existing GitHub repo `alankyshum/md-share` is reachable and has the intended visibility/settings.
- Run `git subtree split` against `~/.claude/skills/share--markdown/` from the dotfiles repo and push the split branch into `alankyshum/md-share`.
- If subtree history is unusably noisy, record evidence and switch to `git filter-repo` only after `code-skeptic` approval.
- Copy `IMPLEMENTATION_PLAN.md` from its dotfiles origin (`~/.claude/skills/share--markdown/IMPLEMENTATION_PLAN.md`) into the new `alankyshum/md-share` repo root. The file is the canonical record of what's being built; it travels with the new repo as the source of truth. Do NOT delete the dotfiles copy yet — Phase 6a handles that as part of the legacy rename.
- Create root monorepo files: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`, and repository README placeholder.
- Move current `spa/` into `packages/md-share-app/` without breaking its build.
- Keep `packages/markdown-renderer/` as a package but rename it from `@local/markdown-renderer` to `@alankyshum/markdown-renderer`, make it publishable, and add package build/type metadata.
- Add changesets infrastructure for changelog generation and version bumping only; do not add CI publish workflow.
- Add `lefthook.yml` plus `bin/publish-on-version-bump.sh`; choose `post-commit` so a committed version bump immediately publishes from the developer machine before it can be pushed. The hook diffs each `packages/*/package.json` between HEAD and HEAD~1 and runs `npm publish --access public` inside packages whose `version` changed, using local `~/.npmrc` auth.
- Update app imports/package refs from `@local/markdown-renderer` to `@alankyshum/markdown-renderer` while preserving file history.
- Confirm old dotfiles path still runs the existing Python CLI and existing Pages functions unchanged during this phase.

**Acceptance criteria.**
- `alankyshum/md-share` has a commit history rooted in the subtree split and includes the renderer source history.
- `pnpm install` and `pnpm -r build` pass in the new repo.
- `pnpm -r pack --dry-run` includes the expected renderer files, CSS, client subpaths, and type declarations.
- A local version-bump commit triggers lefthook publish for `@alankyshum/markdown-renderer@1.0.0` using local npm auth.
- Dotfiles `~/.claude/skills/share--markdown/scripts/share-md.py` still produces a legacy short URL.

**Dependencies.** None.

**Verification commands.**
- `git log --follow -- packages/markdown-renderer/src/server.ts`
- `pnpm install --frozen-lockfile`
- `pnpm -r build`
- `pnpm --filter @alankyshum/markdown-renderer pack --dry-run`
- `bin/publish-on-version-bump.sh --dry-run`
- `npm view @alankyshum/markdown-renderer@1.0.0 version`
- `python3 ~/.claude/skills/share--markdown/scripts/share-md.py --text "# legacy smoke" --always-short --print-only --no-copy`

### Phase 1.1 — GH-backed storage swap (temporary plaintext branch)

**Scope.** Replace KV writes/reads with GitHub-backed JSON storage using a temporary plaintext branch only to prove storage/routing before Phase 2 encryption lands. This branch must not ship canonically.

**Deliverables.**
- Replace `packages/md-share-app/functions/api/save.ts` behavior with a GitHub-storage write boundary or remove server-side write dependency once CLI direct-to-GitHub writes exist; do not keep Cloudflare KV in the new app.
- Add route `packages/md-share-app/functions/u/[owner]/[repo]/s/[key].ts` to fetch JSON from `raw.githubusercontent.com/<owner>/<repo>/main/shares/<hash[:2]>/<key>.json`, inject OG tags from plaintext metadata, and serve the SPA shell.
- Add route `packages/md-share-app/functions/u/[owner]/[repo]/og/[key].png.ts` or equivalent Pages-compatible path by porting the existing OG generator behavior from `spa/functions/og/[key].ts:1-150`.
- Adapt `_meta.ts` so metadata comes from share JSON title/description for GH-backed shares, while legacy meta derivation remains available where needed.
- Adapt `+page.svelte` to consume server-injected share JSON instead of `window.__MD_INLINE` only, while keeping fragment `#v1...` rendering.
- Preserve `/api/keys` behavior from `spa/functions/api/keys.ts:1-24`.
- Add initial storage JSON reader/writer tests for temporary plaintext storage; Phase 2 replaces this with the final encrypted-only schema.
- Implement new route shape `/u/<owner>/<repo>/s/<key>`; the old `/s/<key>` remains legacy-only and should not be introduced in the new app as a primary route.
- Ensure `--update <key>` semantics overwrite the same GitHub path and produce a commit to that path.

**Acceptance criteria.**
- A temporary plaintext markdown share is written to `shares/<prefix>/<key>.json` in a public GitHub repo for branch-only verification.
- `GET /u/<owner>/<repo>/s/<key>` renders the sample in the SPA and shows full renderer feature parity for tables, charts, gantt, mindmaps, maps, fullscreen, theme, sidebar, and selection menu.
- `GET /u/<owner>/<repo>/og/<key>.png` returns a 1200×630 PNG with title/description and a deterministic gradient.
- No new app code depends on `MD_STORE`, KV bindings, or `SHARE_MD_TOKEN`.
- Legacy app remains untouched.

**Dependencies.** Phase 1 monorepo scaffold.

**Verification commands.**
- `pnpm --filter @alankyshum/md-share-app build`
- `pnpm --filter @alankyshum/md-share-app test`
- `curl -I https://<preview>/u/<owner>/<repo>/s/<key>`
- `curl -I https://<preview>/u/<owner>/<repo>/og/<key>.png`
- `gh api repos/<owner>/<repo>/contents/shares/<prefix>/<key>.json --jq .sha`

### Phase 2 — Encryption layer

**Scope.** Add the final encrypted-only storage and render model across CLI and SPA. Every share is encrypted by default with a fresh per-share URL-fragment AES key; title/description remain plaintext for OG previews and storage-repo management.

**Deliverables.**
- Create shared crypto/codec package or internal modules for AES-256-GCM, gzip, base64url, per-share 256-bit key generation, and per-share 12-byte IV generation.
- Ensure CLI-side crypto uses Node WebCrypto, not a separate incompatible crypto stack.
- Ensure browser-side crypto uses WebCrypto and decrypts only in the client.
- Add final storage JSON handling with exactly: `v`, `title`, `description`, `created_at`, `updated_at`, `alg`, `iv`, and `ct`; `alg` is literal `AES-256-GCM`, `iv` is base64url of 12 bytes, and `ct` is base64url of AES-GCM(gzip(markdown body)).
- Ensure share URLs append `#k=<base64url(32 bytes)>`; the fragment key is never sent to Cloudflare, GitHub, raw.githubusercontent.com, or OG routes.
- Add SPA automatic decryption from `#k=`. If absent or invalid, render exactly “Decryption failed — this URL is missing or has an invalid key” and do not fall back to plaintext or “not found”.
- Ensure OG meta and PNG routes use plaintext title/description from JSON for every share.
- Add a documentation note that plaintext title/description are intentional for rich previews and repo manageability, and are not suitable for enterprise PII scenarios.
- Add a documentation note that AES-256 remains quantum-resistant enough for this use case because Grover’s algorithm leaves 128-bit effective security.
- Add cache controls so encrypted share responses are safe and cache busting varies on `?v=` for updated OG previews.

**Acceptance criteria.**
- Every GitHub-backed share uses the final encrypted-only JSON shape; no plaintext `content` field and no KDF fields exist.
- A URL containing the correct `#k=` decrypts automatically with no prompt.
- A URL missing `#k=` or containing an invalid key shows the required decryption-failed error.
- Title/description and OG PNG previews work before and without body decryption.
- No plaintext markdown body is present in HTML, share JSON, logs, or OG routes for encrypted shares.

**Dependencies.** Phase 1.1 storage schema and routes.

**Verification commands.**
- `pnpm -r test -- --grep encryption`
- `pnpm --filter @alankyshum/md-share-app build`
- `pnpm --filter @alankyshum/md-share test`
- `curl -s https://raw.githubusercontent.com/<owner>/<repo>/main/shares/<prefix>/<key>.json | jq '{v,title,description,alg,iv,hasCt:has("ct"),keys:keys}'`
- Browser acceptance: open encrypted URL with correct `#k=`, then open the same URL without the fragment and verify the required decryption-failed error.

### Phase 3 — TypeScript CLI in `packages/md-share-cli/`

**Scope.** Rewrite the Python CLI in TypeScript as the globally installable `@alankyshum/md-share` package while preserving current CLI UX and adding init/auth/storage/self-host/share-management commands.

**Deliverables.**
- Create `packages/md-share-cli/` with package name `@alankyshum/md-share`, binary name `md-share`, TypeScript build pipeline, tests, and npm publish metadata.
- Port current Python CLI features from `scripts/share-md.py:24-380`: config loading, input modes, gzip/base64url encoding, safe chunking, clipboard, browser open, stats, lint, update target parsing, short threshold, and fragment fallback.
- Preserve flags: file, `--text`, `--update`, `--always-short`, `--no-short`, `--short-threshold`, `--stats`, `--open`, `--copy`, `--no-copy`, `--print-only`, `--no-lint`, and `--base`.
- Add hosting flags `--app-url` and `--storage-repo`.
- Implement `md-share init` wizard with shared default, `--self-host` Cloudflare provisioning, and custom URL modes.
- In default `init`, write the discovered shared canonical `app_base_url`, authenticate with GitHub, create the public storage repo `<user>/md-share--cms` unless it already exists, pre-populate `shares/.gitkeep`, write a minimal README explaining encrypted shares plus plaintext title/description, and store `storage_repo` in `~/.config/md-share/config.json`; `--storage-name <name>` overrides the default repo name.
- Implement `md-share login` using GitHub OAuth Device Flow with `GITHUB_OAUTH_CLIENT_ID = "Ov23liCeBKLwRl7AwGjR"` embedded in `packages/md-share-cli/src/auth/oauth.ts` or equivalent, falling back to `gh auth token` if available and authenticated; Keychain stores OAuth tokens only.
- Keep `md-share init-storage` as an explicit re-run/repair command for the same public storage repo bootstrap behavior used by `init`.
- Implement `md-share list` with alias `ls`; output columns are `created_at`, `updated_at`, 12-char key, truncated title, and URL. Support `--sort created|updated|title` and `--limit N` with default 50.
- Implement `md-share search <query>` by fetching all share JSON files through the GitHub Contents API and doing client-side fuzzy search across plaintext title and description. Lock this approach for v1 because it is simple and acceptable up to a few hundred shares; benchmark and document the soft cap from §6.
- Implement `md-share delete <key|url>` with alias `rm`; require confirmation unless `--yes`, delete via GitHub Contents API against `shares/<hash[:2]>/<key>.json`, and leave empty shard directories alone.
- Ensure `list` and `search` parse only metadata fields needed for display/search and discard `ct`; they must never attempt body decryption.
- Require GitHub auth for `list`, `search`, and `delete`, including read-only operations, because they hit the user’s configured storage repo.
- Call out the dependency on plaintext title/description: management commands rely on metadata being readable without the URL-fragment key.
- Prefer minimal-change md-lint packaging: bundle the existing TypeScript linter from `scripts/md-lint/src/*` into the CLI package, preserving validators for mermaid, chart, map, markmap, and tables.
- Assess `scripts/mermaid-fix.py` and either port it as a documented auxiliary CLI subcommand or explicitly deprecate it if md-lint coverage makes it unnecessary.
- Create a config migration path from old `config.json` shape to the new config, without reading or committing the old `api_token`.
- Ensure `--no-short` still supports single-part and multi-part fragment fallback for offline/no-storage cases.

**Acceptance criteria.**
- `npm i -g @alankyshum/md-share` installs `md-share` and `md-share --help` works.
- `md-share init` completes first-time setup on macOS and writes config without secrets in the repo.
- `md-share <file.md>` writes GitHub-backed JSON and prints/copies a `/u/<owner>/<repo>/s/<key>` URL.
- `md-share --update <key> <file.md>` commits over the same share path.
- `md-share list` and `md-share ls` show metadata-only rows for the configured repo and respect `--sort` plus `--limit`.
- `md-share search <query>` finds shares by title/description without decrypting bodies.
- `md-share delete <key>` and `md-share rm <url>` delete the expected JSON path and respect `--yes`.
- `md-share --no-short <file.md>` emits compatible `#v1...` fragment URLs and multi-part fallback.
- `--stats`, `--open`, `--copy`, `--no-copy`, `--print-only`, and `--no-lint` match current behavior.
- Lint failures exit with code 2 and include the same categories documented in `SKILL.md:200-213`.
- The package does not require Cloudflare credentials for default shared use.

**Dependencies.** Phase 2 crypto/schema contracts; Phase 1 package infrastructure.

**Verification commands.**
- `pnpm --filter @alankyshum/md-share build`
- `pnpm --filter @alankyshum/md-share test`
- `pnpm --filter @alankyshum/md-share pack --dry-run`
- `npm i -g ./packages/md-share-cli/<packed-tarball>`
- `md-share --help`
- `md-share init --dry-run`
- `md-share fixtures/smoke.md --storage-repo <owner>/<repo> --app-url https://<preview> --print-only --no-copy`
- `md-share --update <key> fixtures/smoke-updated.md --print-only --no-copy`
- `md-share list --storage-repo <owner>/<repo> --sort updated --limit 5`
- `md-share search smoke --storage-repo <owner>/<repo> --limit 5`
- `md-share delete <key> --storage-repo <owner>/<repo> --yes`

### Phase 4 — Self-host infra

**Scope.** Implement CLI-driven Cloudflare Pages provisioning for self-hosters without requiring repo forks.

**Deliverables.**
- Add `md-share init --self-host`; prompt for or read Cloudflare API token from `CLOUDFLARE_API_TOKEN`, then store it in macOS Keychain under service `md-share-cf`.
- Use Cloudflare API to create a Pages project in the user's account connected to canonical repo `alankyshum/md-share` on production branch `master`; no fork is created.
- Use `explore` to confirm Pages build command and output directory, then bake them into the CLI provisioning flow.
- Capture the resulting `<name>.pages.dev` URL and write it as `app_base_url` in `~/.config/md-share/config.json`.
- Implement `/api/config` to return app metadata: package version, build commit, canonical/self-host metadata, and configured app base URL where available.
- Add build-time version injection for the SPA and Pages Functions.
- Ensure `/api/keys` preserves current behavior; public referrer-restricted MapTiler/ORS keys may be empty or defaults-safe for self-host deployments without blocking app boot.
- Document `md-share init --self-host` in README and CLI help; default `md-share init` skips Cloudflare provisioning and writes the shared canonical `app_base_url`.

**Acceptance criteria.**
- `md-share init --self-host` creates a Cloudflare Pages project connected to `alankyshum/md-share` and writes its Pages URL to config.
- Self-hosted projects auto-update from pushes to canonical `alankyshum/md-share` production branch without fork sync workflows.
- `/api/config` returns valid metadata on local preview, preview deployment, canonical deployment, and self-host deployment.
- Default `md-share init` writes the shared canonical `app_base_url` without asking for Cloudflare credentials.

**Dependencies.** Phase 1 monorepo; Phase 3 CLI package skeleton.

**Verification commands.**
- `pnpm --filter @alankyshum/md-share-app build`
- `curl -s https://<preview>/api/config | jq .version`
- `curl -s https://<preview>/api/keys | jq 'has("maptiler") and has("ors")'`
- `md-share init --self-host --dry-run`
- Cloudflare API smoke: provision a disposable Pages project connected to canonical repo, open `/` and `/api/config`, then delete the disposable project.

### Phase 5 — Docs + canonical deployment

**Scope.** Publish docs, verify the existing canonical Cloudflare Pages project builds and serves the app, and publish packages via local lefthook flow.

**Deliverables.**
- Write README with shared quickstart, `md-share init --self-host` quickstart, encryption guide, GitHub storage explanation, URL shapes, local publish flow, legacy boundary, and troubleshooting.
- Add `CONTRIBUTING.md` with local dev, tests, changesets/versioning, lefthook publish process, Cloudflare preview, and security notes.
- Verify the existing Cloudflare Pages project in account `fbe46925529a77537b36114bed4e1ae1` is linked to `alankyshum/md-share`, auto-builds on production-branch push, and serves expected routes.
- Discover the canonical Pages subdomain via Cloudflare API and store it as `app_base_url`; do not hardcode it in docs, CLI defaults, or tests.
- Publish `@alankyshum/md-share-app@1.0.0` via local lefthook version-bump flow and ensure all three intended packages have coherent package metadata.
- Tag v1.0.0 release.
- Add social preview docs showing encrypted rich OG behavior and `?v=` cache busting.

**Acceptance criteria.**
- Existing canonical Pages deployment serves `/`, `/api/config`, `/api/keys`, `/u/<owner>/<repo>/s/<key>`, and `/u/<owner>/<repo>/og/<key>.png`.
- README quickstart from a clean machine reaches a working shared URL.
- `npm view @alankyshum/md-share-app@1.0.0 version` succeeds.
- GitHub release and locally published npm package versions align.

**Dependencies.** Phases 1 through 4.

**Verification commands.**
- `npm view @alankyshum/md-share version`
- `npm view @alankyshum/markdown-renderer version`
- `npm view @alankyshum/md-share-app version`
- `APP_BASE_URL=$(jq -r .app_base_url ~/.config/md-share/config.json)`
- `curl -I "$APP_BASE_URL/api/config"`
- `curl -I "$APP_BASE_URL/u/<owner>/<repo>/s/<key>"`
- `curl -I "$APP_BASE_URL/u/<owner>/<repo>/og/<key>.png"`

### Phase 6 — Skill swap + consumer migration

#### Phase 6a — Rename legacy skill and preserve old infra

**Scope.** Move the old skill implementation aside without breaking old `md-share-kut.pages.dev` shares or legacy update flows.

**Deliverables.**
- Rename `~/.claude/skills/share--markdown/` to `~/.claude/skills/share--markdown-legacy/`.
- Add a deprecation banner near the top of `share--markdown-legacy/SKILL.md` explaining that it is only for legacy KV-backed shares and old `--update <legacy-key>` flows.
- Keep `share-md.py`, `config.json`, `config.example.json`, `spa/wrangler.toml`, KV functions, and existing Cloudflare project behavior unchanged except for docs/banner.
- Verify `md-share-kut.pages.dev/s/<old-key>` still resolves and legacy `--update` still writes to KV.

**Acceptance criteria.**
- Legacy skill directory exists and loads by name if explicitly invoked.
- Deprecation banner is visible in first 30 lines of legacy `SKILL.md`.
- An old KV-backed short URL still resolves.
- Legacy Python `--update <old-key>` still works with the existing config/token.

**Dependencies.** Phase 5 canonical deployment live.

**Verification commands.**
- `test -d ~/.claude/skills/share--markdown-legacy`
- `grep -n "DEPRECATED" ~/.claude/skills/share--markdown-legacy/SKILL.md`
- `python3 ~/.claude/skills/share--markdown-legacy/scripts/share-md.py --update <legacy-key> --text "# legacy update smoke" --print-only --no-copy`
- `curl -I https://md-share-kut.pages.dev/s/<legacy-key>`

#### Phase 6b — Create new `share--markdown` skill wrapper

**Scope.** Replace the default skill with a lightweight wrapper around the new npm CLI.

**Deliverables.**
- Create `~/.claude/skills/share--markdown/SKILL.md` with updated metadata and usage.
- Cover installation: `npm i -g @alankyshum/md-share`.
- Cover first-time setup: default `md-share init` for shared hosting and `md-share init --self-host` for Cloudflare Pages provisioning without a fork.
- Cover new URL shape `/u/<owner>/<repo>/s/<key>`.
- Cover default encrypted URL-fragment-key behavior, plaintext title/description rationale, missing/invalid-key error UX, and share-management commands.
- Cover full flags reference from Phase 3.
- Explicitly state: use `share--markdown-legacy` only for updating legacy KV keys or old `md-share-kut.pages.dev/s/<key>` links.
- Preserve response guidance: short URLs may be echoed; long multi-part fragments should be copied but not echoed.

**Acceptance criteria.**
- New skill loads from `~/.claude/skills/share--markdown/SKILL.md`.
- Skill docs invoke `md-share`, not Python `share-md.py`, for new shares.
- Skill docs include legacy boundary and new encrypted behavior.

**Dependencies.** Phase 6a.

**Verification commands.**
- `head -40 ~/.claude/skills/share--markdown/SKILL.md`
- `grep -n "md-share init" ~/.claude/skills/share--markdown/SKILL.md`
- `grep -n "share--markdown-legacy" ~/.claude/skills/share--markdown/SKILL.md`

#### Phase 6c — Migrate alanshum-web renderer consumer

**Scope.** Replace the broken local/file renderer consumption in `alankyshum/alanshum-web` with the published npm renderer package.

**Explore pre-task.** Inspect `~/Documents/obsidian-notes/external/alanshum-web`, `.github/workflows/deploy.yml`, and `external/` to understand how the current broken `file:./external/markdown-renderer` dependency resolves locally and in Cloudflare builds.

**Deliverables.**
- In `~/Documents/obsidian-notes/external/alanshum-web/package.json`, replace `"@local/markdown-renderer": "file:./external/markdown-renderer"` with `"@alankyshum/markdown-renderer": "^1.0.0"`.
- Update every import from `@local/markdown-renderer` to `@alankyshum/markdown-renderer`.
- Update lockfiles using each repo’s package manager.
- Add or update Dependabot/Renovate config so renderer updates are proposed automatically.
- Run `pnpm install && pnpm build` from `~/Documents/obsidian-notes/external/alanshum-web/`.

**Acceptance criteria.**
- `alanshum-web` package manifest and lockfile contain no `@local/markdown-renderer` or `file:./external/markdown-renderer` dependency.
- `alanshum-web` imports use `@alankyshum/markdown-renderer`.
- `pnpm install && pnpm build` passes in `~/Documents/obsidian-notes/external/alanshum-web/`.
- Update bot config covers `@alankyshum/markdown-renderer`.

**Dependencies.** Phase 1 renderer published; Phase 5 docs/release complete.

**Verification commands.**
- `rg "@local/markdown-renderer|file:.*markdown-renderer" ~/Documents/obsidian-notes/external/alanshum-web` returns no matches.
- `cd ~/Documents/obsidian-notes/external/alanshum-web && pnpm install && pnpm build`

### Phase E.1 — Fix bugs until tests pass

**Scope.** Stabilize the full system before final acceptance. Every Known Bug must be resolved or explicitly deferred upstream.

**Deliverables.**
- Maintain a temporary `## Known Bugs` section in the orchestrator audit log, not in user docs unless user-facing.
- For each failing test, lint, build, auth, deploy, render, crypto, package, or legacy check, delegate a focused fix to `code`.
- Re-run the narrow failing verification first, then the broader phase verification.
- If a bug cannot be fixed in scope, move it to `## Upstream Deferred` with owner, impact, reproduction, reason for deferral, and follow-up issue/task link.

**Acceptance criteria.**
- `## Known Bugs` is empty at merge.
- Every deferred item has a JIRA-style note and is demonstrably outside this plan’s scope.
- All phase verification commands pass or have approved deferrals.

**Dependencies.** All implementation phases.

**Verification commands.**
- `pnpm -r lint`
- `pnpm -r test`
- `pnpm -r build`
- `pnpm -r pack --dry-run`
- `npm view @alankyshum/md-share version`
- `npm view @alankyshum/markdown-renderer version`
- `npm view @alankyshum/md-share-app version`

### Phase F — End-to-end acceptance (reviewer's runbook)

**Scope.** Independently verify all 12 success criteria from a clean environment and record evidence.

**Runbook.**
1. Verify global install: `npm uninstall -g @alankyshum/md-share || true`, then `npm i -g @alankyshum/md-share`, then `md-share --version` and `md-share --help`.
2. Verify first-time setup: create a clean temp home/config profile if safe, run `md-share init --storage-name md-share--cms-test`, complete GitHub auth, confirm storage repo creation and `app_base_url` config, and share `fixtures/smoke.md`.
3. Verify new URL shape: confirm printed URL matches `https://<domain>/u/<owner>/<repo>/s/<key>` and opens successfully.
4. Verify feature parity: open a fixture containing interactive tables, Chart.js chart fences, mermaid pie/xychart, frappe-gantt, mermaid mindmap auto-upgrade, markmap fence, map fence, fullscreen diagrams, sidebar, theme, frontmatter, and selection-menu “Add to LLM”.
5. Verify default encryption: share without any encryption flags, confirm the URL contains `#k=`, inspect JSON for the final encrypted-only schema, and verify the same URL without `#k=` shows the required decryption-failed error.
6. Verify encrypted OG: paste or fetch the encrypted URL metadata and `og/<key>.png`; confirm plaintext title/description and PNG response while JSON body lacks plaintext markdown.
7. Verify update: run `md-share --update <key> fixtures/smoke-updated.md`, confirm GitHub commit overwrote `shares/<prefix>/<key>.json`, and reload URL with `?v=<new>`.
8. Verify self-host provisioning: run `md-share init --self-host --storage-name md-share--cms-test` in a clean config profile, confirm a Cloudflare Pages project connected to canonical `alankyshum/md-share` is created, and open its `/api/config`.
9. Verify renderer consumer: in `~/Documents/obsidian-notes/external/alanshum-web`, confirm npm renderer version, no file refs, and passing `pnpm install && pnpm build`.
10. Verify legacy continuity: open an old `md-share-kut.pages.dev/s/<legacy-key>` and run legacy Python `--update` against it from `share--markdown-legacy`.
11. Verify management commands: run `md-share list --limit 5 --sort updated`, `md-share search <query> --limit 5`, and `md-share delete <key> --yes` against the canonical test storage repo and confirm expected output/effects.
12. **Dogfood verification (success criterion #12).** Against the canonical deployment URL from `app_base_url`, `cd` into a fresh checkout of `alankyshum/md-share`, run `md-share init --storage-name md-share--cms-test` if needed, then `md-share IMPLEMENTATION_PLAN.md --storage-repo alankyshum/md-share--cms-test --print-only --no-copy`, strip the `#k=...` fragment for server-side OG checks, confirm the HTML contains non-empty `og:title`, `og:description`, and `og:image` pointing at `/u/<owner>/<repo>/og/<key>.png`, verify that OG image URL returns HTTP 200 with `content-type: image/png`, open the original URL with fragment in a browser to confirm body decrypts and renders, and record the URL, OG image URL, and key in the PR description.

**Acceptance criteria.**
- All 12 runbook items are PASS with links or command evidence.
- `code-skeptic` signs off final acceptance.

**Dependencies.** Phase E.1 complete.

**Verification commands.** Use the commands embedded in the runbook plus phase-specific commands above.

### Phase G — Out of scope (explicit non-goals)

- Authenticated/private GitHub storage repos; v1 storage repos are public only.
- Custom domains beyond `*.pages.dev`; defer custom domain docs/automation.
- Fork-based self-host model.
- In-SPA update banner.
- Deploy to Cloudflare button.
- Collaborative real-time editing.
- Migration of legacy KV shares to GH-backed storage; old shares prune naturally through legacy sliding TTL.
- Image/binary attachments; v1 is markdown-only.
- Password-based encryption; the locked model is a single URL-fragment-key mode because password mode adds complexity for marginal gain.
- Encrypted title/description; plaintext metadata is intentional for OG previews and repo manageability, and this design is explicitly not for enterprise PII scenarios.
- Server-side decryption or key recovery.
- Server-side search index; defer an index file or hosted index to v2 if needed.
- Bulk operations on shares; no `md-share delete --all` and no `md-share export` in v1.
- Full replacement of GitHub as a storage backend.

## 4. File-by-file changes

| File | Action (create/move/edit/delete/rename) | Size estimate (lines) | Acceptance check |
|---|---|---:|---|
| `~/.claude/skills/share--markdown/IMPLEMENTATION_PLAN.md` | Create | 500-650 | Plan exists and contains §§1-7 |
| `~/.claude/skills/share--markdown/` | Rename in Phase 6a | n/a | Directory becomes `share--markdown-legacy/` |
| `~/.claude/skills/share--markdown-legacy/SKILL.md` | Edit | +10-30 | Deprecation banner in first 30 lines |
| `~/.claude/skills/share--markdown-legacy/scripts/share-md.py` | Move only | 380 existing | Legacy smoke and legacy update pass |
| `~/.claude/skills/share--markdown-legacy/scripts/md-lint/` | Move only | existing | Legacy linter still callable through Python script |
| `~/.claude/skills/share--markdown-legacy/scripts/mermaid-fix.py` | Move only | 140 existing | File preserved for legacy users |
| `~/.claude/skills/share--markdown-legacy/config.example.json` | Move/edit banner optional | 5 existing | Legacy config docs remain accurate |
| `~/.claude/skills/share--markdown-legacy/config.json` | Move only; do not commit/expose | 5 existing | Not copied into public repo |
| `~/.claude/skills/share--markdown/SKILL.md` | Create | 220-350 | New skill wraps `md-share` CLI |
| `package.json` | Create in new repo root | 40-80 | Workspaces, scripts, changesets configured |
| `pnpm-workspace.yaml` | Create | 5-20 | Includes `packages/*` |
| `pnpm-lock.yaml` | Create | generated | `pnpm install --frozen-lockfile` passes |
| `tsconfig.base.json` | Create | 20-60 | Shared TS config used by packages |
| `.npmrc` | Create | 3-15 | Public scoped packages publish correctly |
| `.gitignore` | Create/edit from existing `.gitignore` | 20-80 | Excludes node_modules, build outputs, local config |
| `.changeset/config.json` | Create | 10-40 | Changesets version/changelog flow works without CI publish |
| `.changeset/*.md` | Create | 5-30 each | Pending changesets consumed by local version bump |
| `lefthook.yml` | Create | 20-60 | `post-commit` publish-on-version-bump hook configured |
| `bin/publish-on-version-bump.sh` | Create | 80-180 | Publishes packages whose `version` changed using local `~/.npmrc` auth |
| `.github/workflows/ci.yml` | Create | 50-140 | Runs install/lint/test/build/pack |
| `README.md` | Create | 350-700 | Shared quickstart and `md-share init --self-host` provisioning verified |
| `CONTRIBUTING.md` | Create | 150-300 | Local dev and release process documented |
| `SECURITY.md` | Create | 80-160 | Crypto/auth/storage reporting path documented |
| `packages/markdown-renderer/package.json` | Edit | 50-100 | Name `@alankyshum/markdown-renderer`, version 1.0.0, publishable exports |
| `packages/markdown-renderer/src/index.ts` | Edit | 2-20 | Exports remain valid after build output change |
| `packages/markdown-renderer/src/server.ts` | Edit | 60-120 | Builds to publishable JS/types; server render parity maintained |
| `packages/markdown-renderer/src/client/index.ts` | Edit | 5-30 | Client barrel remains lazy-import safe |
| `packages/markdown-renderer/src/client/enhance.ts` | Edit | 95-160 | Renderer enhancement parity preserved |
| `packages/markdown-renderer/src/client/charts.ts` | Edit | 580-650 | Chart.js and chart-ext behavior preserved |
| `packages/markdown-renderer/src/client/gantt.ts` | Edit | 360-430 | frappe-gantt behavior preserved |
| `packages/markdown-renderer/src/client/maps.ts` | Edit | 165-230 | `/api/keys` behavior remains configurable |
| `packages/markdown-renderer/src/client/tables.ts` | Edit | 340-420 | Tabulator feature parity preserved |
| `packages/markdown-renderer/src/client/markmaps.ts` | Edit | 35-80 | Markmap render and fullscreen data preserved |
| `packages/markdown-renderer/src/client/mermaid-init.ts` | Edit | 20-60 | Mermaid init remains dark-mode aware or reinit-safe |
| `packages/markdown-renderer/src/client/mindmap-mermaid.ts` | Edit | 105-160 | Mermaid mindmap auto-upgrade preserved |
| `packages/markdown-renderer/src/client/fullscreen.ts` | Edit | 310-380 | Published renderer fullscreen remains optional |
| `packages/markdown-renderer/src/client/frappe-gantt.css` | Move/edit | existing | Included in renderer package tarball |
| `packages/markdown-renderer/src/styles/renderer.css` | Edit | 136-220 | Included via package export |
| `packages/markdown-renderer/src/ambient.d.ts` | Edit | 30-80 | Type declarations build cleanly |
| `packages/markdown-renderer/tsconfig.json` | Create | 20-60 | `tsc` or bundler emits declarations |
| `packages/markdown-renderer/tsup.config.ts` | Create | 20-80 | ESM build output and CSS asset handling verified |
| `packages/markdown-renderer/README.md` | Create | 120-250 | npm package docs cover server/client/css exports |
| `packages/md-share-app/package.json` | Move/edit from `spa/package.json` | 60-120 | Name `@alankyshum/md-share-app`, no `file:` renderer ref |
| `packages/md-share-app/svelte.config.js` | Move/edit | 11-30 | Static fallback still works with Pages Functions |
| `packages/md-share-app/vite.config.ts` | Move/edit | 40-100 | Workspace resolution no longer relies on old path hacks unless needed |
| `packages/md-share-app/wrangler.toml` | Move/edit | 5-40 | No KV binding; Pages output correct |
| `packages/md-share-app/tsconfig.json` | Move/edit | 13-40 | Strict app typecheck passes |
| `packages/md-share-app/functions/api/keys.ts` | Move/edit | 25-60 | Public keys endpoint preserved |
| `packages/md-share-app/functions/api/config.ts` | Create | 40-100 | Returns version/build/canonical or self-host metadata |
| `packages/md-share-app/functions/api/save.ts` | Delete or replace with non-KV compatibility response | 0-80 | New app has no KV write dependency |
| `packages/md-share-app/functions/u/[owner]/[repo]/s/[key].ts` | Create | 120-240 | GH-backed share fetch, OG injection, SPA shell |
| `packages/md-share-app/functions/u/[owner]/[repo]/og/[key].png.ts` | Create | 160-260 | Dynamic PNG parity with old generator |
| `packages/md-share-app/functions/s/[key].ts` | Delete or legacy-redirect only | 0-80 | Primary route is `/u/.../s/...` |
| `packages/md-share-app/functions/og/[key].ts` | Move/adapt | 150-240 | Old hardcoded URL replaced with new route context |
| `packages/md-share-app/functions/_meta.ts` | Edit | 90-160 | Supports share JSON meta and markdown-derived fallback |
| `packages/md-share-app/src/routes/+page.svelte` | Edit | 230-390 | Share JSON decrypt-from-fragment integrated |
| `packages/md-share-app/src/lib/codec.ts` | Edit | 100-220 | Standard gzip/base64url plus share JSON decode helpers |
| `packages/md-share-app/src/lib/crypto.ts` | Create | 80-160 | Browser WebCrypto decrypt/import helpers for URL-fragment keys |
| `packages/md-share-app/src/lib/share-json.ts` | Create | 60-120 | Schema validation for final encrypted-only shares |
| `packages/md-share-app/src/lib/render.ts` | Edit | 82-140 | Imports `@alankyshum/markdown-renderer` and preserves line attrs |
| `packages/md-share-app/src/lib/selection-menu.ts` | Edit | 213-260 | Page key uses owner/repo/key route context |
| `packages/md-share-app/src/lib/FullscreenViewer.svelte` | Move/edit | 369-430 | Existing fullscreen UX preserved or replaced by renderer export after review |
| `packages/md-share-app/src/lib/Sidebar.svelte` | Edit | 693-780 | Remove KV TTL assumptions; show GH/update/encryption metadata |
| `packages/md-share-app/src/lib/Frontmatter.svelte` | Move/edit | 65-90 | Frontmatter display preserved |
| `packages/md-share-app/src/app.d.ts` | Edit/create | 20-80 | `window.__MD_SHARE` and metadata globals typed |
| `packages/md-share-app/tests/*` | Create | 200-500 | Route, schema, crypto, render smoke tests pass |
| `packages/md-share-cli/package.json` | Create | 80-140 | Name `@alankyshum/md-share`, bin `md-share`, publishable |
| `packages/md-share-cli/src/index.ts` | Create | 80-180 | CLI entry dispatches commands |
| `packages/md-share-cli/src/commands/share.ts` | Create | 180-350 | Main share/update flow parity |
| `packages/md-share-cli/src/commands/init.ts` | Create | 160-320 | First-time wizard implemented |
| `packages/md-share-cli/src/commands/login.ts` | Create | 120-260 | Device Flow and `gh` fallback implemented |
| `packages/md-share-cli/src/commands/init-storage.ts` | Create | 120-240 | Storage repo validation/creation |
| `packages/md-share-cli/src/commands/list.ts` | Create | 120-240 | `list`/`ls` metadata table, `--sort`, and `--limit` work |
| `packages/md-share-cli/src/commands/search.ts` | Create | 140-280 | Metadata-only fuzzy search works within documented soft cap |
| `packages/md-share-cli/src/commands/delete.ts` | Create | 100-220 | `delete`/`rm` removes JSON path and honors `--yes` |
| `packages/md-share-cli/src/config.ts` | Create | 120-240 | New config plus legacy migration |
| `packages/md-share-cli/src/github.ts` | Create | 240-420 | GitHub API commits, contents listing/search/delete, and raw path helpers |
| `packages/md-share-cli/src/auth/oauth.ts` | Create | 80-160 | Embeds `GITHUB_OAUTH_CLIENT_ID = "Ov23liCeBKLwRl7AwGjR"` and implements Device Flow |
| `packages/md-share-cli/src/cloudflare.ts` | Create | 160-320 | CF Pages project provisioning for `md-share init --self-host` |
| `packages/md-share-cli/src/keychain.ts` | Create | 60-140 | macOS Keychain OAuth token storage/lookup only |
| `packages/md-share-cli/src/codec.ts` | Create | 100-200 | Node gzip/base64url compatible with SPA |
| `packages/md-share-cli/src/crypto.ts` | Create | 80-180 | Node WebCrypto encrypt with fresh per-share key and IV |
| `packages/md-share-cli/src/lint.ts` | Create | 80-160 | Bundled md-lint invocation/library bridge |
| `packages/md-share-cli/src/chunk.ts` | Create | 80-160 | Multi-part `--no-short` fallback parity |
| `packages/md-share-cli/src/meta.ts` | Create | 80-160 | Title/description derivation compatible with `_meta.ts` |
| `packages/md-share-cli/src/open-copy.ts` | Create | 50-120 | macOS open/pbcopy behavior with safe fallback |
| `packages/md-share-cli/src/stats.ts` | Create | 40-100 | Stats output parity |
| `packages/md-share-cli/tests/*` | Create | 300-800 | CLI unit/integration tests pass |
| `packages/md-share-lint/package.json` | Create if linter split into package | 50-100 | Optional package builds or omitted by explicit decision |
| `packages/md-share-lint/src/*` | Move from `scripts/md-lint/src/*` if split | existing | Validators preserved |
| `scripts/md-lint/src/*` | Move into CLI or lint package | existing | No duplicate stale source unless intentional |
| `scripts/md-lint.mjs` | Move or regenerate as package asset | generated | CLI includes working linter |
| `scripts/mermaid-fix.py` | Port, preserve, or deprecate | 0-160 | Decision recorded; no undocumented orphan |
| `config.example.json` | Replace with new public example or move legacy only | 20-80 | No `api_token`; includes app/storage defaults |
| `config.json` | Do not move to public repo | n/a | Secret token absent from commits |
| `~/Documents/obsidian-notes/external/alanshum-web/package.json` | Edit after explore | unknown | Uses `@alankyshum/markdown-renderer` from npm |
| `~/Documents/obsidian-notes/external/alanshum-web/**` imports | Edit after explore | unknown | No `@local/markdown-renderer` imports |
| `~/Documents/obsidian-notes/external/alanshum-web` lockfile/config | Edit after explore | unknown | Build passes and renderer updates automated |

## 5. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GitHub raw rate limits around 1000-2000 requests/hour per IP | Popular shares may fail to load | Add Cloudflare edge caching on raw JSON fetches; respect `?v=` cache busting for updates; document expected consistency window |
| npm scope name collision or missing org | Publish blocks final success criteria | Phase 1 prerequisite checks `@alankyshum`; create org or resolve account permissions before code-heavy work |
| OAuth Device Flow public `client_id` visible in package | Reviewers may treat it as secret leak | Document that public client_id is expected for device flow; never embed client secret; keep scopes limited to `public_repo` |
| Cloudflare Pages Functions or asset size limit around OG generator/deps | OG route may exceed limits | Port existing `workers-og` route carefully, measure function bundle size, keep font loading dynamic/subsetted as current code does |
| Encrypted share cache poisoning or stale OG after update | Readers may see old ciphertext or preview | Edge cache key must vary on full URL including `?v=`; CLI should recommend/update with cache-busting URL after overwrite |
| Git subtree split history bloat or poor history quality | New repo may be hard to maintain | Validate `git log --follow`; use `git filter-repo` only if subtree split is demonstrably inadequate and reviewer approves |
| CF API token security for self-host provisioning | Token exposure could mutate the user's Cloudflare account | Read from `CLOUDFLARE_API_TOKEN` or prompt, store in macOS Keychain service `md-share-cf`, never commit/log it, and document least-privilege token scopes |
| Local lefthook publish can fail silently if hooks are disabled | Version bump may not publish to npm | `bin/publish-on-version-bump.sh` must be runnable manually; Phase F verifies `npm view` for all packages after version bumps |
| Browser and Node WebCrypto incompatibility | Creator output may not decrypt in reader | Shared test vectors for 32-byte fragment key, 12-byte IV, plaintext, ciphertext, gzip/base64url, and invalid-key failure cases |
| Public GitHub repo storage exposes metadata | Title/description are readable in the repo | Make plaintext metadata explicit in docs; state this is intentional for OG previews and repo manageability, not enterprise PII |
| URL fragment key loss | Share body becomes undecryptable | Make CLI output/copy include `#k=`, show explicit missing/invalid-key error, and document that no recovery is possible without the full URL |
| Client-side fuzzy search scales poorly | `md-share search` may become slow for large repos | Benchmark 100/500/2000 synthetic shares, document v1 soft cap, and defer server-side index to v2 |
| Existing renderer package exports `.ts` source | npm consumers may fail without transpilation | Phase 1 must publish JS/types artifacts and verify with a clean consumer install |
| Current maps depend on `/api/keys` public keys | Self-host deployments without keys may show broken maps | Preserve endpoint shape; provide safe empty/default behavior and clear map error if keys absent |
| Legacy skill config contains a real token | Secret exposure during subtree extraction | Ensure `config.json` is excluded from public repo before push; rotate token if accidentally exposed |

## 6. Open questions to resolve before coding (≤ 7)

1. **md-lint packaging boundary.** Resolve via Phase 3 `explore`: decide whether to bundle existing `scripts/md-lint/src/*` directly inside `@alankyshum/md-share` or split a third package; prefer bundled-in-CLI unless it blocks DX or package size.
2. **Subtree split quality.** Resolve via Phase 1 `code-skeptic`: inspect split history for renderer files and decide whether `git subtree split` is clean enough or `git filter-repo` is justified.
3. **Canonical Pages subdomain.** Resolve via Phase 5 `general` with Cloudflare API: discover the existing Pages project subdomain for `alankyshum/md-share` and write it to config as `app_base_url`; do not hardcode a domain in code or docs.
4. **Cloudflare Pages build config.** Resolve via Phase 4 `explore`: confirm the build command and output directory for creating Pages projects connected to canonical `alankyshum/md-share` before baking them into `md-share init --self-host`.
5. **alanshum-web broken file dependency resolution.** Resolve via Phase 6c `explore`: inspect `.github/workflows/deploy.yml` and `external/` to learn how current builds resolve `file:./external/markdown-renderer`.
6. **Search implementation upper bound.** Resolve via Phase 3 `code` with a synthetic benchmark at 100, 500, and 2000 shares to identify when client-side fuzzy search exceeds roughly 3 seconds round-trip. Lean: document a 500-share soft cap in CLI help; if exceeded, recommend manual `--sort` plus `--limit` workflow until v2 adds an index file.

## 7. Definition of Done

- [ ] `npm i -g @alankyshum/md-share` installs a working `md-share` CLI.
- [ ] `md-share init` completes first-time setup, creates `<user>/md-share--cms` or configured storage repo, writes `app_base_url` and `storage_repo`, and `md-share <file.md>` produces a working short URL on the canonical shared deployment.
- [ ] New URLs resolve at `https://<domain>/u/<owner>/<repo>/s/<key>` and render markdown with full current feature parity.
- [ ] Every share is encrypted by default with a per-share random AES-256 key embedded in `#k=`, and the key never reaches the server.
- [ ] URLs with correct `#k=` decrypt automatically with no prompt; URLs missing or carrying an invalid key show the required decryption-failed error.
- [ ] Encrypted shares produce rich OG previews with plaintext title/description and dynamic 1200×630 gradient PNG.
- [ ] `--update <key>` overwrites the same GitHub-backed share path via a commit.
- [ ] `md-share list`, `md-share search <query>`, and `md-share delete <key>` work against the canonical test storage repo and respect `--limit`, `--sort`, and `--yes` semantics.
- [ ] `md-share init --self-host` provisions a Cloudflare Pages project connected to canonical `alankyshum/md-share`, writes the self-host `app_base_url`, and serves correctly.
- [ ] `@alankyshum/markdown-renderer@1.0.0` is published and consumed by `alankyshum/alanshum-web` from npm with no `file:` refs.
- [ ] Old `~/.claude/skills/share--markdown/` has been renamed to `share--markdown-legacy/` with a deprecation banner.
- [ ] New `~/.claude/skills/share--markdown/SKILL.md` wraps the new `md-share` CLI.
- [ ] Old `md-share-kut.pages.dev` URLs continue resolving and legacy Python `--update` against an old KV key still works.
- [ ] Changesets has consumed all pending changesets before final merge, and lefthook/local publish has published version-bumped packages.
- [ ] All three packages have valid npm versions: `@alankyshum/md-share`, `@alankyshum/markdown-renderer`, and `@alankyshum/md-share-app`.
- [ ] Canonical Cloudflare deployment is live and serves fresh default-encrypted fragment-key shares end-to-end.
- [ ] `/api/config`, `/api/keys`, `/u/<owner>/<repo>/s/<key>`, and `/u/<owner>/<repo>/og/<key>.png` work on canonical and self-host deployments.
- [ ] Final `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`, and `pnpm -r pack --dry-run` pass.
- [ ] `code-skeptic` signs off Phase F final acceptance.
- [ ] `## Known Bugs` is empty, or every remaining item is moved to `## Upstream Deferred` with an owner, impact, reproduction, reason, and follow-up link.
- [ ] Success criterion #12 verified: `IMPLEMENTATION_PLAN.md` is committed in the new repo root, published as the first canonical dogfood share, and the resulting URL has valid OG meta tags plus a 200-OK dynamic PNG.
