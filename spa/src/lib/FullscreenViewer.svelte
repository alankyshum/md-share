<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Markmap } from 'markmap-view';

  interface Props {
    open: boolean;
    kind: 'mermaid' | 'markmap' | null;
    sourceEl: HTMLElement | null;
    onClose: () => void;
  }

  let { open = $bindable(), kind, sourceEl, onClose }: Props = $props();

  let containerEl: HTMLDivElement | null = $state(null);
  let viewportEl: HTMLDivElement | null = $state(null);
  let mountedNode: SVGSVGElement | HTMLElement | null = null;
  let mmInstance: any = null;

  // Pan/zoom state (only used for mermaid; markmap has its own)
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let isDragging = false;
  let lastX = 0, lastY = 0;

  // Search (mind map only)
  let searchQuery = $state('');
  let matchCount = $state(0);
  let matchIndex = $state(0);
  let matches: SVGGElement[] = [];

  $effect(() => {
    if (open && kind && sourceEl && viewportEl) {
      mountContent();
    }
    if (!open && mountedNode) {
      cleanup();
    }
  });

  async function mountContent() {
    if (!viewportEl || !sourceEl) return;
    await tick();
    if (kind === 'mermaid') {
      const svg = sourceEl.querySelector('svg');
      if (!svg) return;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.style.width = '100%';
      clone.style.height = '100%';
      clone.style.maxWidth = 'none';
      clone.style.maxHeight = 'none';
      viewportEl.innerHTML = '';
      viewportEl.appendChild(clone);
      mountedNode = clone;
      // Reset pan/zoom
      scale = 1; tx = 0; ty = 0;
      applyTransform();
    } else if (kind === 'markmap') {
      // Re-create markmap instance into a fresh, large SVG
      const root = (sourceEl as any).__markmapRoot;
      if (!root) return;
      viewportEl.innerHTML = '';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.width = '100%';
      svg.style.height = '100%';
      viewportEl.appendChild(svg);
      mmInstance = Markmap.create(svg, { fitRatio: 0.95, duration: 200 } as any, root);
      mountedNode = svg;
      // Reset search
      searchQuery = '';
      matches = [];
      matchCount = 0;
      matchIndex = 0;
    }
  }

  function cleanup() {
    if (viewportEl) viewportEl.innerHTML = '';
    mountedNode = null;
    mmInstance = null;
  }

  function applyTransform() {
    if (!mountedNode || kind !== 'mermaid') return;
    (mountedNode as SVGSVGElement).style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    (mountedNode as SVGSVGElement).style.transformOrigin = '0 0';
  }

  function handleWheel(e: WheelEvent) {
    if (kind !== 'mermaid') return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.max(0.2, Math.min(8, scale * factor));
    // Zoom toward cursor
    if (viewportEl) {
      const r = viewportEl.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      tx = px - (px - tx) * (next / scale);
      ty = py - (py - ty) * (next / scale);
    }
    scale = next;
    applyTransform();
  }

  function handleMouseDown(e: MouseEvent) {
    if (kind !== 'mermaid') return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function resetView() {
    if (kind === 'mermaid') {
      scale = 1; tx = 0; ty = 0;
      applyTransform();
    } else if (kind === 'markmap' && mmInstance) {
      mmInstance.fit();
    }
  }

  function zoomBy(factor: number) {
    if (kind === 'mermaid') {
      scale = Math.max(0.2, Math.min(8, scale * factor));
      applyTransform();
    } else if (kind === 'markmap' && mmInstance) {
      mmInstance.rescale(factor);
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === '0') resetView();
    else if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-') zoomBy(1 / 1.2);
  }

  // --- Mind map search ---
  function runSearch() {
    if (kind !== 'markmap' || !mountedNode) {
      matches = [];
      matchCount = 0;
      return;
    }
    const svg = mountedNode as SVGSVGElement;
    const all = svg.querySelectorAll<SVGGElement>('g.markmap-node');
    all.forEach((n) => n.classList.remove('search-match', 'search-current'));
    if (!searchQuery.trim()) {
      matches = [];
      matchCount = 0;
      matchIndex = 0;
      return;
    }
    const q = searchQuery.toLowerCase();
    const found: SVGGElement[] = [];
    all.forEach((n) => {
      const text = (n.textContent || '').toLowerCase();
      if (text.includes(q)) {
        n.classList.add('search-match');
        found.push(n);
      }
    });
    matches = found;
    matchCount = found.length;
    matchIndex = 0;
    focusMatch();
  }

  function focusMatch() {
    if (!matches.length || !mmInstance) return;
    matches.forEach((n) => n.classList.remove('search-current'));
    const node = matches[matchIndex];
    node.classList.add('search-current');
    // Use markmap's ensureView to pan to the node's data
    const datum = (node as any).__data__;
    if (datum && mmInstance.ensureView) {
      mmInstance.ensureView(datum, { left: 80, right: 80, top: 80, bottom: 80 });
    } else {
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  function nextMatch() {
    if (!matches.length) return;
    matchIndex = (matchIndex + 1) % matches.length;
    focusMatch();
  }
  function prevMatch() {
    if (!matches.length) return;
    matchIndex = (matchIndex - 1 + matches.length) % matches.length;
    focusMatch();
  }

  $effect(() => {
    // re-run when query changes
    searchQuery;
    if (open && kind === 'markmap') {
      // Defer to ensure DOM is ready
      queueMicrotask(runSearch);
    }
  });
</script>

<svelte:window onkeydown={open ? handleKey : null} onmouseup={handleMouseUp} onmousemove={handleMouseMove} />

{#if open}
  <div
    bind:this={containerEl}
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Fullscreen diagram viewer"
  >
    <div class="toolbar">
      <span class="kind-label">{kind === 'markmap' ? 'Mind map' : 'Mermaid'}</span>
      {#if kind === 'markmap'}
        <input
          class="search-input"
          type="search"
          placeholder="Search nodes…"
          bind:value={searchQuery}
        />
        {#if matchCount > 0}
          <span class="match-count">{matchIndex + 1}/{matchCount}</span>
          <button class="tb-btn" onclick={prevMatch} title="Previous match (Shift+Enter)">↑</button>
          <button class="tb-btn" onclick={nextMatch} title="Next match (Enter)">↓</button>
        {:else if searchQuery}
          <span class="match-count">no matches</span>
        {/if}
      {/if}
      <div class="tb-spacer"></div>
      <button class="tb-btn" onclick={() => zoomBy(1 / 1.2)} title="Zoom out (-)">−</button>
      <button class="tb-btn" onclick={resetView} title="Reset (0)">⊙</button>
      <button class="tb-btn" onclick={() => zoomBy(1.2)} title="Zoom in (+)">+</button>
      <button class="tb-btn close" onclick={onClose} title="Close (Esc)">✕</button>
    </div>
    <div
      bind:this={viewportEl}
      class="viewport"
      class:pan-cursor={kind === 'mermaid'}
      onwheel={handleWheel}
      onmousedown={handleMouseDown}
      role="presentation"
    ></div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--bg, #fff);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    flex-shrink: 0;
  }

  .kind-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }

  .search-input {
    flex: 0 0 280px;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--fg);
    font-size: 0.85rem;
  }
  .search-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
    border-color: transparent;
  }

  .match-count {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .tb-spacer {
    flex: 1;
  }

  .tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 0.4rem;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .tb-btn:hover {
    background: var(--border);
    color: var(--fg);
  }
  .tb-btn.close {
    border-color: transparent;
  }
  .tb-btn.close:hover {
    background: rgba(220, 50, 50, 0.15);
    color: #c33;
  }

  .viewport {
    flex: 1;
    overflow: hidden;
    position: relative;
    background: var(--bg);
  }
  .viewport.pan-cursor {
    cursor: grab;
  }
  .viewport.pan-cursor:active {
    cursor: grabbing;
  }

  /* Mind map search highlights */
  :global(g.markmap-node.search-match > line),
  :global(g.markmap-node.search-match > circle) {
    stroke: #f5a623 !important;
    stroke-width: 3 !important;
  }
  :global(g.markmap-node.search-current > line),
  :global(g.markmap-node.search-current > circle) {
    stroke: #d97706 !important;
    stroke-width: 4 !important;
  }
  :global(g.markmap-node.search-match foreignObject) {
    background: rgba(245, 166, 35, 0.15);
  }
</style>
