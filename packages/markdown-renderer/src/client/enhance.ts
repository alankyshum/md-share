export interface EnhanceOptions {
  dark?: boolean;
  keysEndpoint?: string;
  fullscreen?: boolean;
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
  } catch (e) { console.error('[md-renderer] mindmap-mermaid:', e); }

  try {
    const { replaceGanttBlocks } = await import('./gantt.js');
    replaceGanttBlocks(target, dark);
  } catch (e) { console.error('[md-renderer] gantt:', e); }

  try {
    const { replaceChartBlocks } = await import('./charts.js');
    replaceChartBlocks(target, dark);
  } catch (e) { console.error('[md-renderer] chart:', e); }

  try {
    const { replaceMapBlocks } = await import('./maps.js');
    await replaceMapBlocks(target, dark);
  } catch (e) { console.error('[md-renderer] map:', e); }

  try {
    const blocks = target.querySelectorAll<HTMLElement>('.mermaid');
    if (blocks.length > 0) {
      const { initMermaid, runMermaid } = await import('./mermaid-init.js');
      await initMermaid(dark);
      await runMermaid(Array.from(blocks));
    }
  } catch (e) { console.error('[md-renderer] mermaid:', e); }

  try {
    const { renderMarkmaps } = await import('./markmaps.js');
    await renderMarkmaps(target);
  } catch (e) { console.error('[md-renderer] markmap:', e); }

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
