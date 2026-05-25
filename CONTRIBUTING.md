# Contributing to md-share

Thank you for your interest in contributing! This document guides you through the local development workflow, project architecture, test conventions, versioning flow, and security guidelines.

---

## 1. Local Development Setup

This project is a monorepo managed with `pnpm`.

### Prerequisites
- Node.js >= 20
- pnpm >= 8

### Initial Bootstrap

```bash
# Clone the repository
git clone https://github.com/alankyshum/md-share.git
cd md-share

# Install dependencies and link workspace packages
pnpm install

# Run build across all workspace packages
pnpm -r build

# Run vitest across all packages to verify installation
pnpm -r test
```

---

## 2. Per-Package Development

To run commands in specific sub-packages, use `pnpm` filtering:

```bash
# Run the SvelteKit SPA in development mode
pnpm --filter @alankyshum/md-share-app dev

# Run CLI build on file changes
pnpm --filter @alankyshum/md-share build --watch

# Build the markdown renderer package
pnpm --filter @alankyshum/markdown-renderer build
```

---

## 3. Adding and Running Tests

All testing is standardizing around **Vitest**. We maintain at least one test suite per package (excluding Svelte/SPA frontend pages where appropriate, though components can still be unit-tested).

- **Run tests globally**: `pnpm -r test`
- **Run tests for a single package**: `pnpm --filter @alankyshum/<pkg-name> test`

When adding new features or fixing bugs, ensure you add corresponding tests in the respective package's `tests/` or `*.test.ts` directory.

---

## 4. Versioning & Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage package versioning and changelogs.

### Creating a Changeset
Whenever you make a user-facing change in any publishable package, you must generate a changeset:

```bash
# Run changesets CLI to declare which packages changed and how (patch, minor, major)
pnpm changeset
```

This generates a file under `.changeset/<slug>.md`. Commit this file along with your changes.

---

## 5. Lefthook & Publish Flow

We automate our package release checks using `lefthook` hooks.

### Git Post-Commit Hook
When a commit is made, Lefthook fires a `post-commit` hook that executes `bin/publish-on-version-bump.sh`. This script compares package versions in `packages/*/package.json` between the current `HEAD` and the previous commit `HEAD~1`.

- If a version bump is detected on a public package, it initiates:
  ```bash
  npm publish --access public
  ```
- **2FA OTP Requirement**: Publishing public packages under `@alankyshum` requires a 2-Factor Authentication (2FA) One-Time Password (OTP).
- **Execution Patterns**:
  1. **Option A (Manual Publish first)**: Manually run `npm publish --access public` inside the package directory providing your OTP, then commit the version change. The post-commit script will notice the version is already published on npm and gracefully proceed.
  2. **Option B (Re-run on hook failure)**: Let the post-commit hook fail because of the missing OTP, then manually run the publish command inside the package directory, supply the OTP, and push the branch.

---

## 6. Cloudflare Preview Deployments

Each Pull Request created on GitHub automatically triggers a Cloudflare Pages Preview deployment. The link is posted as a PR status check. Always verify your changes on the preview deployment link before requesting a review.

---

## 7. Security Guidelines

### Secret Management
- **Never commit `~/.config/md-share/config.json`** or any other local CLI configuration files.
- **Never commit credentials** or authentication tokens (such as npm tokens, Cloudflare API tokens, or GitHub OAuth tokens).
- Use the **macOS Keychain** to securely store sensitive tokens locally.
  ```bash
  # Example: Adding your GitHub OAuth token to keychain
  security add-generic-password -s md-share -a oauth-token -w "your-token"
  ```
- All Cloudflare secrets must be set as encrypted environment variables in the Cloudflare Pages dashboard, never written in plaintext in configuration files (like `wrangler.toml`).
