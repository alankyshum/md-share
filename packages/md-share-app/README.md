# @alankyshum/md-share-app

A SvelteKit and Cloudflare Worker with Static Assets Single Page Application (SPA) designed to serve and decrypt secure, encrypted markdown files shared via the `md-share` CLI.

---

## What It Is

`@alankyshum/md-share-app` acts as the frontend viewer for the `md-share` decentralized publishing system. Rather than storing your markdown in centralized databases or standard Key-Value (KV) stores, the viewer dynamically pulls AES-256-GCM encrypted payloads from your public GitHub storage repository and decrypts them 100% client-side.

### Key Features
- **Client-side Decryption**: The decryption key stays inside the `#k=` URL fragment, meaning neither Cloudflare nor GitHub ever receives the plaintext content.
- **Dynamic OG Social Previews**: Dynamically renders standard Open Graph cards and customized 1200×630 PNG previews on Slack, Telegram, Twitter, or Discord.
- **Interactive Upgrades**: Leverages `@alankyshum/markdown-renderer` to dynamically convert plain markdown, Tables, Map fences, Chart fences, and Mermaid blocks into rich interactive components.

---

## Routes Summary

The application exposes the following routes and endpoints:

- `/` — Homepage / landing page.
- `/u/<owner>/<repo>/s/<key>` — Interactive decrypted markdown viewer.
- `/u/<owner>/<repo>/og/<key>.png` — Cloudflare worker endpoint generating high-fidelity, dynamic, 1200×630 OG social preview images.
- `/api/config` — Returns application-specific configuration.
- `/api/keys` — Referrer-restricted API distributing MapLibre and OpenRouteService integration keys.

---

## How to Self-Host

You can host your own custom instance of the SPA directly on your Cloudflare account. The deployment is CLI-driven and auto-updates from the canonical repository on every change to master.

For step-by-step instructions on setting up your own deployment using the `md-share init --self-host` command, refer to the [Root README Self-Hosting section](https://github.com/alankyshum/md-share#readme).

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
