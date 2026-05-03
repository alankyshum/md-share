import { marked } from 'marked';
import mermaid from 'mermaid';
import hljs from 'highlight.js';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { enhanceTables } from './tables';
import { replaceGanttBlocks } from './gantt';
import { replaceChartBlocks } from './charts';
import { isMermaidMindmap, mermaidMindmapToMarkdown } from './mindmap-mermaid';

let mermaidInitialized = false;
const markmapTransformer = new Transformer();

export function initMermaid(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'loose'
  });
  mermaidInitialized = true;
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
    return lo + 1; // 1-indexed
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

// marked v15+: use object-literal renderer inside marked.use(), not new marked.Renderer()
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${text}</div>`;
      }
      if (lang === 'markmap' || lang === 'mindmap') {
        // Encode source as data attribute (markmap renders post-DOM)
        const encoded = encodeURIComponent(text);
        return `<div class="markmap" data-source="${encoded}"><svg></svg></div>`;
      }
      if (lang === 'chart') {
        // Chart.js JSON config; renderer parses post-DOM
        const encoded = encodeURIComponent(text);
        return `<div class="chart-json" data-source="${encoded}"></div>`;
      }
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(text, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
      }
      const auto = hljs.highlightAuto(text).value;
      return `<pre><code class="hljs">${auto}</code></pre>`;
    },
    heading({ tokens, depth }: { tokens: marked.Token[]; depth: number }) {
      // Use the parser to get HTML text (handles inline formatting)
      // @ts-ignore – accessing parser from renderer context
      const html = this.parser ? this.parser.parseInline(tokens) : tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
      // Build raw text for slugging (strip any inline markup)
      const raw = tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
      let slug = slugify(raw);
      // Dedup logic: seenHeadings is reset per-render (see renderMarkdown below)
      const count = (globalThis as any).__mdShareSeenHeadings?.get(slug) ?? 0;
      (globalThis as any).__mdShareSeenHeadings?.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      return `<h${depth} id="${slug}">${html}</h${depth}>\n`;
    },
    link({ href, title, tokens }: { href: string; title?: string | null; tokens: marked.Token[] }) {
      // @ts-ignore – accessing parser from renderer context
      const text = this.parser ? this.parser.parseInline(tokens) : tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      // Skip target=_blank for in-page anchors and javascript: protocols
      const isHash = typeof href === 'string' && href.startsWith('#');
      const isJs = typeof href === 'string' && /^javascript:/i.test(href);
      if (isHash || isJs) {
        return `<a href="${href}"${titleAttr}>${text}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    }
  }
});

async function renderMarkmaps(target: HTMLElement) {
  const blocks = target.querySelectorAll<HTMLElement>('div.markmap[data-source]');
  for (const block of blocks) {
    const source = decodeURIComponent(block.getAttribute('data-source') || '');
    const svg = block.querySelector('svg');
    if (!svg) continue;
    try {
      const { root } = markmapTransformer.transform(source);
      // Inline preview size — fullscreen viewer will reinitialize at full size
      svg.setAttribute('style', 'width:100%;height:320px;');
      const mm = Markmap.create(svg as SVGSVGElement, undefined, root);
      // Stash transformer output on element so fullscreen viewer can re-render at larger size
      (block as any).__markmapRoot = root;
      (block as any).__markmapInstance = mm;
    } catch (e) {
      block.innerHTML = `<pre style="color:#c33;padding:0.5rem;">markmap parse error: ${(e as Error).message}</pre>`;
    }
  }
}

export async function renderMarkdown(
  md: string,
  target: HTMLElement,
  dark: boolean,
  opts: { lineOffset?: number } = {}
) {
  if (!mermaidInitialized) initMermaid(dark);

  // Reset heading slug dedup map for this render
  (globalThis as any).__mdShareSeenHeadings = new Map<string, number>();

  // Tokenize so we can compute line numbers per top-level block
  const tokens = marked.lexer(md);
  attachLineMeta(md, tokens);

  // Apply offset (e.g., to compensate for stripped frontmatter lines)
  const offset = (opts.lineOffset ?? 1) - 1;
  if (offset > 0) {
    for (const t of tokens) {
      if (t.__startLine !== undefined) t.__startLine += offset;
      if (t.__endLine !== undefined) t.__endLine += offset;
    }
  }

  target.innerHTML = await marked.parser(tokens);

  // Attach data-line-start/end to top-level rendered children for selection menu
  applyLineAttrs(target, tokens);

  // Fallback: if marked emitted <pre><code class="language-mermaid"> instead of <div class="mermaid">,
  // replace those nodes in-place so mermaid.run() can find them.
  target.querySelectorAll<HTMLElement>('pre code.language-mermaid').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent ?? '';
    pre.replaceWith(div);
  });
  // Same fallback for markmap/mindmap
  target.querySelectorAll<HTMLElement>('pre code.language-markmap, pre code.language-mindmap').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'markmap';
    div.setAttribute('data-source', encodeURIComponent(code.textContent ?? ''));
    div.innerHTML = '<svg></svg>';
    pre.replaceWith(div);
  });

  // Intercept mermaid gantt blocks → frappe-gantt (better UI: pan, view modes)
  // Each step wrapped so one failure doesn't break later renders.
  try { replaceGanttBlocks(target, dark); }
  catch (e) { console.error('[md-share] gantt error:', e); }

  // Intercept mermaid pie/xychart blocks AND ```chart fences → Chart.js (interactive)
  try { replaceChartBlocks(target, dark); }
  catch (e) { console.error('[md-share] chart error:', e); }

  // Intercept mermaid `mindmap` blocks → markmap (interactive: pan/zoom/expand,
  // fullscreen viewer with node search). Mermaid's built-in mindmap is a static
  // SVG with no interactivity; markmap is much richer.
  try {
    target.querySelectorAll<HTMLElement>('div.mermaid').forEach((block) => {
      const text = block.textContent || '';
      if (!isMermaidMindmap(text)) return;
      const md = mermaidMindmapToMarkdown(text);
      if (!md) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'markmap';
      wrapper.setAttribute('data-source', encodeURIComponent(md));
      wrapper.innerHTML = '<svg></svg>';
      block.replaceWith(wrapper);
    });
  } catch (e) { console.error('[md-share] mermaid-mindmap convert error:', e); }

  // render mermaid blocks (whatever's left after gantt+chart+mindmap interception)
  try {
    const mermaidBlocks = target.querySelectorAll<HTMLElement>('.mermaid');
    if (mermaidBlocks.length > 0) {
      await mermaid.run({ nodes: Array.from(mermaidBlocks) });
    }
  } catch (e) { console.error('[md-share] mermaid error:', e); }

  // render markmap blocks
  try { await renderMarkmaps(target); }
  catch (e) { console.error('[md-share] markmap error:', e); }

  // enhance markdown tables with Tabulator (sort/filter/hide/drag/persist)
  try { enhanceTables(target, dark); }
  catch (e) { console.error('[md-share] tables error:', e); }
}
