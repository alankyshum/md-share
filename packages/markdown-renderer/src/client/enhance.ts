export interface EnhanceOptions {
  dark?: boolean;
  keysEndpoint?: string;
  fullscreen?: boolean;
}

type HandlerKey = 'mindmap-mermaid' | 'gantt' | 'chart' | 'map' | 'mermaid' | 'markmap' | 'tables' | 'fullscreen';

/**
 * Defense-in-depth: when an async handler throws, also tag any blocks that
 * looked like its responsibility so the final sweep can render a visible error
 * UI for them instead of leaving raw markdown text on the page.
 */
function tagFailedBlocks(target: HTMLElement, selector: string, handler: HandlerKey, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  target.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (el.dataset.mdRenderError) return;
    el.dataset.mdRenderError = `${handler}: ${message}`;
  });
}

/**
 * Final sweep: any block element that the per-type handlers were supposed to
 * upgrade but did NOT (handler missing, lib unavailable, parse failure, etc.)
 * is replaced with a visible, themed error card. This converts the prior
 * "silently leave raw text on a dark surface = looks blacked out" failure
 * mode into an actionable message.
 *
 * Detection rules:
 *   - `.mermaid` without inner `<svg>` AND without `data-processed` → unrendered
 *   - `.markmap` without inner `<svg>` having children → unrendered
 *   - `.custom-map` with no child elements → unrendered (map renderer mounts canvas/img)
 */
function sweepUnrenderedBlocks(target: HTMLElement): void {
  const candidates: Array<{ el: HTMLElement; kind: string }> = [];

  target.querySelectorAll<HTMLElement>('.mermaid').forEach((el) => {
    const hasSvg = el.querySelector('svg');
    const processed = el.dataset.processed === 'true';
    if (!hasSvg && !processed) candidates.push({ el, kind: 'mermaid' });
  });
  target.querySelectorAll<HTMLElement>('.markmap').forEach((el) => {
    const svg = el.querySelector('svg');
    if (!svg || svg.childElementCount === 0) candidates.push({ el, kind: 'markmap' });
  });
  target.querySelectorAll<HTMLElement>('.custom-map').forEach((el) => {
    if (el.childElementCount === 0) candidates.push({ el, kind: 'map' });
  });

  candidates.forEach(({ el, kind }) => renderErrorCard(el, kind));
}

function renderErrorCard(block: HTMLElement, kind: string): void {
  const source = (block.textContent || '').trim();
  const firstLine = source.split('\n', 1)[0]?.trim() || kind;
  const detail = block.dataset.mdRenderError || 'Handler did not transform this block (library missing or unsupported syntax).';

  const card = document.createElement('div');
  card.className = 'md-render-error';
  card.setAttribute('role', 'alert');
  // Inline styles so the card looks reasonable even when consumers do not load renderer.css.
  card.setAttribute(
    'style',
    [
      'display: block',
      'border: 1px solid color-mix(in srgb, currentColor 30%, transparent)',
      'border-left: 4px solid #ef4444',
      'border-radius: 6px',
      'padding: 12px 14px',
      'margin: 12px 0',
      'font-family: ui-sans-serif, system-ui, -apple-system, sans-serif',
      'font-size: 13px',
      'line-height: 1.5',
      'background: color-mix(in srgb, #ef4444 8%, transparent)',
      'color: inherit',
    ].join('; '),
  );

  const title = document.createElement('div');
  title.setAttribute('style', 'font-weight: 600; margin-bottom: 4px;');
  title.textContent = `Could not render ${kind} block (${firstLine.slice(0, 60)}${firstLine.length > 60 ? '…' : ''})`;
  card.appendChild(title);

  const reason = document.createElement('div');
  reason.setAttribute('style', 'opacity: 0.85; margin-bottom: 8px; font-size: 12px;');
  reason.textContent = detail;
  card.appendChild(reason);

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.setAttribute('style', 'cursor: pointer; font-size: 12px; opacity: 0.8;');
  summary.textContent = 'Show source';
  details.appendChild(summary);
  const pre = document.createElement('pre');
  pre.setAttribute(
    'style',
    'margin: 8px 0 0; padding: 8px 10px; background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 4px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word;',
  );
  pre.textContent = source;
  details.appendChild(pre);
  card.appendChild(details);

  block.replaceWith(card);
}

export async function enhance(target: HTMLElement, opts: EnhanceOptions = {}): Promise<void> {
  const dark = opts.dark ?? false;

  upgradeCodeFallbacks(target);

  try {
    const { isMermaidMindmap, mermaidMindmapToMarkdown } = await import('./mindmap-mermaid.js');
    target.querySelectorAll<HTMLElement>('div.mermaid').forEach((block) => {
      const text = block.textContent || '';
      if (!isMermaidMindmap(text)) return;
      const mm = mermaidMindmapToMarkdown(text);
      if (!mm) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'markmap';
      wrapper.setAttribute('data-source', encodeURIComponent(mm));
      wrapper.innerHTML = '<svg></svg>';
      block.replaceWith(wrapper);
    });
  } catch (e) {
    console.error('[md-renderer] mindmap-mermaid:', e);
    tagFailedBlocks(target, 'div.mermaid', 'mindmap-mermaid', e);
  }

  try {
    const { replaceGanttBlocks } = await import('./gantt.js');
    replaceGanttBlocks(target, dark);
  } catch (e) {
    console.error('[md-renderer] gantt:', e);
    tagFailedBlocks(target, 'div.mermaid', 'gantt', e);
  }

  try {
    const { replaceChartBlocks } = await import('./charts.js');
    replaceChartBlocks(target, dark);
  } catch (e) {
    console.error('[md-renderer] chart:', e);
    tagFailedBlocks(target, 'div.mermaid', 'chart', e);
  }

  try {
    const { replaceMapBlocks } = await import('./maps.js');
    await replaceMapBlocks(target, dark);
  } catch (e) {
    console.error('[md-renderer] map:', e);
    tagFailedBlocks(target, 'div.custom-map', 'map', e);
  }

  try {
    const blocks = target.querySelectorAll<HTMLElement>('.mermaid');
    if (blocks.length > 0) {
      const { initMermaid, runMermaid } = await import('./mermaid-init.js');
      await initMermaid(dark);
      await runMermaid(Array.from(blocks));
    }
  } catch (e) {
    console.error('[md-renderer] mermaid:', e);
    tagFailedBlocks(target, '.mermaid', 'mermaid', e);
  }

  try {
    const { renderMarkmaps } = await import('./markmaps.js');
    await renderMarkmaps(target);
  } catch (e) {
    console.error('[md-renderer] markmap:', e);
    tagFailedBlocks(target, '.markmap', 'markmap', e);
  }

  try {
    const { enhanceTables } = await import('./tables.js');
    enhanceTables(target, dark);
  } catch (e) { console.error('[md-renderer] tables:', e); }

  if (opts.fullscreen) {
    try {
      const { enableFullscreen } = await import('./fullscreen.js');
      enableFullscreen(target, { dark });
    } catch (e) { console.error('[md-renderer] fullscreen:', e); }
  }

  // Final defense-in-depth sweep — convert any chart/diagram block that no
  // handler successfully transformed into a visible error card.
  try {
    sweepUnrenderedBlocks(target);
  } catch (e) {
    console.error('[md-renderer] sweepUnrenderedBlocks:', e);
  }
}

function upgradeCodeFallbacks(target: HTMLElement) {
  target.querySelectorAll<HTMLElement>('pre code.language-mermaid').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent ?? '';
    pre.replaceWith(div);
  });
  target.querySelectorAll<HTMLElement>('pre code.language-markmap, pre code.language-mindmap').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'markmap';
    div.setAttribute('data-source', encodeURIComponent(code.textContent ?? ''));
    div.innerHTML = '<svg></svg>';
    pre.replaceWith(div);
  });
  target.querySelectorAll<HTMLElement>('pre code.language-map').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'custom-map';
    div.setAttribute('data-source', encodeURIComponent(code.textContent ?? ''));
    pre.replaceWith(div);
  });
}
