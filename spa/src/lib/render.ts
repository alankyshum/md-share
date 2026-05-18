import { markdownToHtml } from '@local/markdown-renderer/server';
import { enhance } from '@local/markdown-renderer/client';
import hljs from 'highlight.js';

/** Compute (1-indexed) line numbers for top-level marked tokens by walking
 *  source positions. Mutates tokens with __startLine / __endLine. */
function attachLineMeta(md: string, tokens: any[]): void {
  const lineStarts = [0];
  for (let i = 0; i < md.length; i++) {
    if (md[i] === '\n') lineStarts.push(i + 1);
  }
  const lineOf = (charPos: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= charPos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  let pos = 0;
  for (const tok of tokens) {
    if (!tok || !tok.raw) continue;
    const idx = md.indexOf(tok.raw, pos);
    if (idx >= 0) {
      tok.__startLine = lineOf(idx);
      tok.__endLine = lineOf(idx + Math.max(tok.raw.length - 1, 0));
      pos = idx + tok.raw.length;
    }
  }
}

/** After marked.parse, walk top-level children of `target` in order and attach
 *  the line ranges from `tokens` (in matching order). Best-effort: skips
 *  tokens that don't produce DOM (e.g. `space`). */
function applyLineAttrs(target: HTMLElement, tokens: any[]): void {
  const renderable = tokens.filter(t => t && t.type !== 'space' && t.__startLine !== undefined);
  const children = Array.from(target.children) as HTMLElement[];
  const n = Math.min(renderable.length, children.length);
  for (let i = 0; i < n; i++) {
    const tok = renderable[i];
    children[i].setAttribute('data-line-start', String(tok.__startLine));
    children[i].setAttribute('data-line-end', String(tok.__endLine));
  }
}

export async function renderMarkdown(
  md: string,
  target: HTMLElement,
  dark: boolean,
  opts: { lineOffset?: number } = {}
): Promise<void> {
  const slugs = new Map<string, number>();
  const html = await markdownToHtml(md, {
    headingSlugs: slugs,
    highlighter: (text, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        const out = hljs.highlight(text, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
      }
      const auto = hljs.highlightAuto(text).value;
      return `<pre><code class="hljs">${auto}</code></pre>`;
    },
  });
  target.innerHTML = html;

  const { marked } = await import('marked');
  const tokens = marked.lexer(md);
  attachLineMeta(md, tokens);
  const offset = (opts.lineOffset ?? 1) - 1;
  if (offset > 0) {
    for (const t of tokens as any[]) {
      if (t.__startLine !== undefined) t.__startLine += offset;
      if (t.__endLine !== undefined) t.__endLine += offset;
    }
  }
  applyLineAttrs(target, tokens);

  await enhance(target, { dark });
}

export { initMermaid } from '@local/markdown-renderer/client/mermaid';
