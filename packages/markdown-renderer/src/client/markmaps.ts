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

      // Give the SVG concrete pixel dimensions up front. markmap-view resolves
      // sizes during layout; a bare style="width:100%" on a parent that has not
      // reflowed yet (off-screen, display:none, freshly inserted node) leaves
      // the SVG with no measurable box. The HTML width/height attributes are
      // always absolute, the viewBox carries the same dims so it scales, and
      // style keeps it responsive on wider containers.
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

      // IMPORTANT: create WITHOUT data. `Markmap.create(svg, opts, data)` kicks
      // off an immediate, async `fit()` the moment `setData` resolves. When the
      // SVG is not yet stably laid out (the common case right after innerHTML +
      // enhance, before the browser has painted), that fit() reads a zero /
      // not-yet-resolved box and computes a broken zoom transform
      // (`translate(NaN,NaN)` or `scale(0)`), leaving an invisible markmap that
      // the post-render sweep then replaces with a generic error card. We drive
      // setData + fit ourselves so fit only ever runs against a measurable box.
      const mm = Markmap.create(svg as SVGSVGElement);
      (block as any).__markmapRoot = root;
      (block as any).__markmapInstance = mm;
      // Flag as handled immediately so `sweepUnrenderedBlocks` never mistakes a
      // markmap that is still asynchronously fitting for an unrendered block.
      block.dataset.markmapRendered = 'true';

      const svgEl = svg as SVGSVGElement;
      const hasLayout = (): boolean => {
        if (!svgEl.isConnected) return false;
        const r = svgEl.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const safeFit = (): boolean => {
        if (!hasLayout()) return false;
        try {
          mm.fit();
          return true;
        } catch {
          // fit() can throw/produce NaN if the SVG is briefly detached; skip.
          return false;
        }
      };

      // Draw the nodes (fills the <svg> with <g> children immediately, so the
      // sweep sees a rendered block even before the first successful fit).
      await mm.setData(root);

      if (!safeFit()) {
        // Layout not ready yet: retry across a few animation frames...
        let attempts = 0;
        const retry = (): void => {
          if (safeFit() || (attempts += 1) >= 15) return;
          requestAnimationFrame(retry);
        };
        requestAnimationFrame(retry);

        // ...and, for genuinely off-screen blocks, fit once they scroll in.
        if (typeof IntersectionObserver !== 'undefined') {
          const io = new IntersectionObserver((entries, obs) => {
            if (entries.some((en) => en.isIntersecting) && safeFit()) {
              obs.disconnect();
            }
          });
          io.observe(block);
          (block as any).__markmapIntersectionObserver = io;
        }
      }

      // Re-fit on container resize so the diagram reflows when the layout
      // settles (fonts loaded, sidebar collapsed, window resized). Guarded so a
      // detached / zero-size SVG never produces a NaN transform.
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          safeFit();
        });
        ro.observe(block);
        (block as any).__markmapResizeObserver = ro;
      }
    } catch (e) {
      const msg = (e as Error).message;
      // Surface the real reason so the sweep's generic "Handler did not
      // transform this block" card is replaced by the actual parse error.
      block.dataset.mdRenderError = `markmap: ${msg}`;
      block.textContent = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'color:#c33;padding:0.5rem;';
      pre.textContent = `markmap parse error: ${msg}`;
      block.appendChild(pre);
    }
  }
}
