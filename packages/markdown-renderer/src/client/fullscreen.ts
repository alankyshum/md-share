// Vanilla TS fullscreen viewer for mermaid diagrams, markmap mind maps, and Chart.js charts.
// Opt-in via enhance({ fullscreen: true }).

export interface FullscreenOptions {
  dark?: boolean;
}

type ContentKind = 'mermaid' | 'markmap' | 'chart';

interface OverlayState {
  overlay: HTMLDivElement;
  teardown: () => void;
  chartInstance: any | null;
}

let activeOverlay: OverlayState | null = null;

function safeCloneChartConfig(cfg: any): any {
  try {
    return structuredClone(cfg);
  } catch {
    // structuredClone fails on functions (e.g. pie tooltip.callbacks.label).
    // Fall back to JSON roundtrip which silently drops functions — acceptable
    // for fullscreen view (tooltips degrade gracefully to defaults).
    return JSON.parse(JSON.stringify(cfg));
  }
}

function closeActive() {
  if (!activeOverlay) return;
  activeOverlay.teardown();
  activeOverlay = null;
}

function kindLabel(kind: ContentKind): string {
  if (kind === 'markmap') return 'Mind Map';
  if (kind === 'chart') return 'Chart';
  return 'Diagram';
}

function openOverlay(sourceEl: HTMLElement, kind: ContentKind, dark: boolean) {
  closeActive();

  // Fix 4: validate stash presence before creating overlay DOM
  if (kind === 'chart') {
    const cfg = (sourceEl as any).__chartConfig;
    if (!cfg) {
      console.warn('[md-renderer] fullscreen: chart has no stashed config; skipping');
      return;
    }
  }
  if (kind === 'markmap') {
    const root = (sourceEl as any).__markmapRoot;
    if (!root) {
      console.warn('[md-renderer] fullscreen: markmap has no __markmapRoot; skipping');
      return;
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'md-fullscreen-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Fullscreen viewer');

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'md-fs-toolbar';

  const kindSpan = document.createElement('span');
  kindSpan.className = 'md-fs-kind';
  kindSpan.textContent = kindLabel(kind);
  toolbar.appendChild(kindSpan);

  const spacer = document.createElement('div');
  spacer.className = 'md-fs-spacer';
  toolbar.appendChild(spacer);

  const btnZoomOut = makeBtn('−', 'Zoom out (-)');
  const btnReset = makeBtn('⊙', 'Reset (0)');
  const btnZoomIn = makeBtn('+', 'Zoom in (+)');
  const btnClose = makeBtn('✕', 'Close (Esc)');
  btnClose.classList.add('md-fs-close');

  toolbar.appendChild(btnZoomOut);
  toolbar.appendChild(btnReset);
  toolbar.appendChild(btnZoomIn);
  toolbar.appendChild(btnClose);
  overlay.appendChild(toolbar);

  // Viewport
  const viewport = document.createElement('div');
  viewport.className = 'md-fs-viewport';
  overlay.appendChild(viewport);

  document.body.appendChild(overlay);
  // Fix 3: stable ref to detect if overlay was closed before async import resolves
  const myOverlay = overlay;

  // Pan/zoom state (used for mermaid + chart; markmap manages its own)
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let mountedNode: HTMLElement | SVGSVGElement | null = null;
  let mmInstance: any = null;

  function applyTransform() {
    if (!mountedNode) return;
    (mountedNode as HTMLElement).style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    (mountedNode as HTMLElement).style.transformOrigin = '0 0';
  }

  function resetView() {
    if (kind === 'markmap' && mmInstance) {
      mmInstance.fit?.();
    } else {
      scale = 1; tx = 0; ty = 0;
      applyTransform();
    }
  }

  function zoomBy(factor: number) {
    if (kind === 'markmap' && mmInstance) {
      mmInstance.rescale?.(factor);
    } else {
      scale = Math.max(0.1, Math.min(10, scale * factor));
      applyTransform();
    }
  }

  btnZoomOut.addEventListener('click', () => zoomBy(1 / 1.2));
  btnReset.addEventListener('click', resetView);
  btnZoomIn.addEventListener('click', () => zoomBy(1.2));
  btnClose.addEventListener('click', closeActive);

  // Wheel zoom (toward cursor)
  function onWheel(e: WheelEvent) {
    if (kind === 'markmap') return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.max(0.1, Math.min(10, scale * factor));
    const r = viewport.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    applyTransform();
  }

  // Pan drag
  function onMouseDown(e: MouseEvent) {
    if (kind === 'markmap') return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  }

  function onMouseUp() {
    isDragging = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeActive();
    else if (e.key === '0') resetView();
    else if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-') zoomBy(1 / 1.2);
  }

  if (kind !== 'markmap') {
    viewport.classList.add('md-fs-pan');
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
  window.addEventListener('keydown', onKeyDown);

  // Mount content
  if (kind === 'mermaid') {
    const svg = sourceEl.querySelector('svg');
    if (svg) {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.style.cssText = 'width:100%;height:100%;max-width:none;max-height:none;display:block;';
      viewport.appendChild(clone);
      mountedNode = clone;
    }
  } else if (kind === 'markmap') {
    const root = (sourceEl as any).__markmapRoot;
    if (root) {
      import('markmap-view').then(({ Markmap }) => {
        if (!myOverlay.isConnected) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
        svg.style.cssText = 'width:100%;height:100%;display:block;';
        viewport.appendChild(svg);
        mmInstance = Markmap.create(svg, { fitRatio: 0.95, duration: 200 } as any, root);
        mountedNode = svg;
      }).catch(err => console.error('[md-renderer] fullscreen markmap:', err));
    }
  } else if (kind === 'chart') {
    const cfg = (sourceEl as any).__chartConfig;
    if (cfg) {
      import('chart.js/auto').then(({ Chart }) => {
        if (!myOverlay.isConnected) return;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:100%;height:100%;display:block;';
        const canvas = document.createElement('canvas');
        wrap.appendChild(canvas);
        viewport.appendChild(wrap);

        const clonedCfg = safeCloneChartConfig(cfg);
        if (clonedCfg.options) {
          clonedCfg.options.responsive = true;
          clonedCfg.options.maintainAspectRatio = false;
        }
        activeOverlay!.chartInstance = new Chart(canvas, clonedCfg);
        mountedNode = wrap;
      }).catch(err => console.error('[md-renderer] fullscreen chart:', err));
    }
  }

  function teardown() {
    if (activeOverlay && activeOverlay.chartInstance) {
      try { activeOverlay.chartInstance.destroy(); } catch {}
      activeOverlay.chartInstance = null;
    }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    overlay.remove();
  }

  activeOverlay = { overlay, teardown, chartInstance: null };
}

function makeBtn(label: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'md-fs-btn';
  btn.textContent = label;
  btn.title = title;
  btn.type = 'button';
  return btn;
}

function detectKind(el: HTMLElement): ContentKind | null {
  if (el.classList.contains('chart-host')) return 'chart';
  if (el.classList.contains('markmap') && el.hasAttribute('data-source')) return 'markmap';
  if (el.classList.contains('mermaid')) return 'mermaid';
  return null;
}

/**
 * Wire click-to-fullscreen onto all diagrams/charts within `target`.
 * Returns a teardown function that removes all handlers and closes any open overlay.
 */
export function enableFullscreen(target: HTMLElement, opts: FullscreenOptions = {}): () => void {
  const dark = opts.dark ?? false;
  const handlers: Array<{ el: HTMLElement; fn: (e: MouseEvent) => void }> = [];

  const candidates = target.querySelectorAll<HTMLElement>(
    'div.mermaid, div.markmap[data-source], .chart-host'
  );

  candidates.forEach(el => {
    if ((el as any).__fsAttached) return;

    const kind = detectKind(el);
    if (!kind) return;

    // Markmap nodes have inline interactivity — don't intercept inner g.markmap-node clicks
    // But we DO want the outer wrapper click to open fullscreen
    const handler = (e: MouseEvent) => {
      // Let markmap's own node clicks work inline (they don't bubble past the SVG normally,
      // but guard anyway)
      if ((e.target as Element)?.closest('g.markmap-node')) return;
      e.stopPropagation();
      openOverlay(el, kind, dark);
    };

    el.addEventListener('click', handler);
    el.classList.add('md-clickable');
    el.title = 'Click to expand fullscreen';
    (el as any).__fsAttached = true;

    handlers.push({ el, fn: handler });
  });

  return () => {
    closeActive();
    handlers.forEach(({ el, fn }) => {
      el.removeEventListener('click', fn);
      el.classList.remove('md-clickable');
      el.removeAttribute('title');
      delete (el as any).__fsAttached;
    });
  };
}
