import { Marked } from 'marked';

export interface MarkdownToHtmlOptions {
  highlighter?: (code: string, lang: string | undefined) => string;
  /** Used to dedup heading anchor ids. Pass a fresh Map() per render. */
  headingSlugs?: Map<string, number>;
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function markdownToHtml(md: string, opts: MarkdownToHtmlOptions = {}): Promise<string> {
  const slugs = opts.headingSlugs ?? new Map<string, number>();
  const m = new Marked({
    gfm: true,
    breaks: false,
    async: false,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const firstLang = (lang ?? '').trim().split(/\s+/)[0].toLowerCase();
        if (firstLang === 'mermaid')
          return `<div class="mermaid">${escapeHtml(text)}</div>`;
        if (firstLang === 'markmap' || firstLang === 'mindmap')
          return `<div class="markmap" data-source="${encodeURIComponent(text)}"><svg></svg></div>`;
        if (firstLang === 'chart')
          return `<div class="chart-json" data-source="${encodeURIComponent(text)}"></div>`;
        if (firstLang === 'map')
          return `<div class="custom-map" data-source="${encodeURIComponent(text)}"></div>`;
        if (opts.highlighter)
          return opts.highlighter(text, firstLang || undefined);
        return `<pre><code class="language-${firstLang || 'text'}">${escapeHtml(text)}</code></pre>`;
      },
      heading({ tokens, depth }: any) {
        // @ts-ignore parser binding
        const html: string = (this.parser?.parseInline?.(tokens)) ?? tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
        const raw: string = tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
        let slug = slugify(raw);
        const count = slugs.get(slug) ?? 0;
        slugs.set(slug, count + 1);
        if (count > 0) slug = `${slug}-${count}`;
        return `<h${depth} id="${slug}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }: any) {
        // @ts-ignore parser binding
        const text: string = (this.parser?.parseInline?.(tokens)) ?? tokens.map((t: any) => t.text ?? t.raw ?? '').join('');
        const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        const isHash = typeof href === 'string' && href.startsWith('#');
        const isJs = typeof href === 'string' && /^javascript:/i.test(href);
        if (isHash || isJs) return `<a href="${href}"${titleAttr}>${text}</a>`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
      },
    },
  });
  return m.parse(md) as string;
}
