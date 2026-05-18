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
      svg.setAttribute('style', 'width:100%;height:320px;');
      const mm = Markmap.create(svg as SVGSVGElement, undefined, root);
      (block as any).__markmapRoot = root;
      (block as any).__markmapInstance = mm;
    } catch (e) {
      block.textContent = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'color:#c33;padding:0.5rem;';
      pre.textContent = `markmap parse error: ${(e as Error).message}`;
      block.appendChild(pre);
    }
  }
}
