export async function renderMarkmaps(target: HTMLElement): Promise<void> {
  const blocks = target.querySelectorAll<HTMLElement>('div.markmap[data-source]');
  if (blocks.length === 0) return;

  const [{ Transformer }, { Markmap }] = await Promise.all([
    import('markmap-lib'),
    import('markmap-view'),
  ]);
  const transformer = new Transformer();

  for (const block of Array.from(blocks)) {
    if (block.querySelector('svg')?.querySelector('g')) continue; // already rendered
    const source = decodeURIComponent(block.getAttribute('data-source') || '');
    let svg = block.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
      block.appendChild(svg);
    }
    try {
      const { root } = transformer.transform(source);

      // CRITICAL: set ABSOLUTE pixel dimensions on the SVG BEFORE Markmap.create.
      //
      // markmap-view reads `svg.width.baseVal.value` during create(). If the SVG
      // has only `style="width:100%"` and the parent has no laid-out width yet
      // (parent display:none, off-screen container, jsdom test env, or a block
      // that just appeared in the DOM and hasn't reflowed), the browser throws:
      //   NotSupportedError: Failed to read the 'value' property from
      //   'SVGLength': Could not resolve relative length.
      //
      // We resolve a concrete number, set it as an HTML attribute (always
      // absolute), and keep style:width:100% for visual responsiveness on
      // larger containers. The viewBox carries the same dims so the SVG
      // scales correctly.
      const measured =
        block.getBoundingClientRect().width ||
        block.parentElement?.getBoundingClientRect().width ||
        target.getBoundingClientRect().width ||
        0;
      const width = Math.max(Math.round(measured) || 800, 320);
      const height = 320;
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('style', 'width:100%;height:320px;display:block;');

      const mm = Markmap.create(svg as SVGSVGElement, undefined, root);
      (block as any).__markmapRoot = root;
      (block as any).__markmapInstance = mm;

      // Re-fit on container resize so the diagram reflows when the layout
      // settles (e.g. the parent grew after fonts loaded, sidebar collapsed,
      // or the user resized the window).
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          try {
            mm.fit();
          } catch {
            /* fit() can throw if the SVG is briefly detached; ignore */
          }
        });
        ro.observe(block);
        (block as any).__markmapResizeObserver = ro;
      }
    } catch (e) {
      block.textContent = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'color:#c33;padding:0.5rem;';
      pre.textContent = `markmap parse error: ${(e as Error).message}`;
      block.appendChild(pre);
    }
  }
}
