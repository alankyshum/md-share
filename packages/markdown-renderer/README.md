# @alankyshum/markdown-renderer

Framework-agnostic markdown renderer used by the share-md SPA and alanshum-web blog.

## Exports

- **`markdownToHtml(md, opts?)`** — server-safe (Node, no DOM). Converts markdown to HTML with placeholder divs for interactive fences (mermaid, markmap, chart, map).
- **`enhance(target, opts?)`** — client-side hydration. Finds placeholder divs in a rendered DOM subtree and replaces them with interactive widgets (MapLibre maps, Chart.js charts, frappe-gantt Gantt charts, Mermaid diagrams, Markmap mind maps, Tabulator tables).

## Usage

```ts
// Server (Node-safe)
import { markdownToHtml } from '@alankyshum/markdown-renderer/server';
const html = await markdownToHtml(md, { highlighter, headingSlugs });

// Client hydration
import { enhance } from '@alankyshum/markdown-renderer/client';
await enhance(targetElement, { dark: true });
```

All heavy dependencies (mermaid, maplibre-gl, chart.js, etc.) are peer dependencies and code-split via dynamic import — only loaded when the relevant fence type is present in the rendered content.
