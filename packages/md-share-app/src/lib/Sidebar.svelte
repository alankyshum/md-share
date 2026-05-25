<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { getStoredTheme, setStoredTheme, resolveTheme, type ThemeMode } from '$lib/theme';
  import { formatAbsoluteDate, formatBytes, formatRelativeTime } from '$lib/timeago';

  interface Stats {
    words: number;
    chars: number;
    lines: number;
    readingMinutes: number;
    headings: number;
    codeBlocks: number;
    tables: number;
    links: number;
    images: number;
  }

  interface Props {
    stats: Stats | null;
    contentReady?: boolean;
  }

  let { stats, contentReady = false }: Props = $props();

  // Server-injected share metadata (only present for KV-backed short URLs)
  let shareMeta = $state<MdShareMeta | null>(null);
  let expiresAtDate = $derived.by(() => {
    if (!shareMeta) return null;
    const d = new Date(shareMeta.expiresAt);
    return isNaN(d.getTime()) ? null : d;
  });
  let expiresAbsolute = $derived(expiresAtDate ? formatAbsoluteDate(expiresAtDate) : null);
  let expiresRelative = $derived(expiresAtDate ? formatRelativeTime(expiresAtDate.getTime() - Date.now()) : null);

  // Default: all headings expanded (collapseDepth=6 means tocbot never collapses since max heading depth is h6)
  let collapseDepth = $state(6);
  let drawerOpen = $state(false);

  // Theme toggle state
  let themeMode = $state<ThemeMode>(getStoredTheme());
  let resolvedTheme = $derived(resolveTheme(themeMode));

  // Resizable sidebar
  const SIDEBAR_WIDTH_KEY = 'md-share-sidebar-width';
  const MIN_W = 200;
  const MAX_W = 600;
  const DEFAULT_W = 256;
  let sidebarWidth = $state(DEFAULT_W);
  let isResizing = $state(false);

  // Stats panel collapse state — persists across sessions, default collapsed
  const STATS_OPEN_KEY = 'md-share-stats-open';
  let statsOpen = $state(false);

  function loadStatsOpen() {
    if (typeof localStorage === 'undefined') return;
    statsOpen = localStorage.getItem(STATS_OPEN_KEY) === '1';
  }
  function toggleStats() {
    statsOpen = !statsOpen;
    try { localStorage.setItem(STATS_OPEN_KEY, statsOpen ? '1' : '0'); } catch {}
  }

  function loadStoredWidth() {
    if (typeof localStorage === 'undefined') return;
    const v = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || '', 10);
    if (!isNaN(v) && v >= MIN_W && v <= MAX_W) sidebarWidth = v;
  }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, ev.clientX));
      sidebarWidth = w;
    };
    const onUp = () => {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function cycleTheme() {
    const next: ThemeMode = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
    themeMode = next;
    setStoredTheme(next);
  }

  const tocConfig = {
    tocSelector: '#toc',
    contentSelector: '#article',
    headingSelector: 'h1, h2, h3, h4, h5, h6',
    scrollSmooth: false,
    hasInnerContainers: true,
    orderedList: false,
  };

  let tocbot: typeof import('tocbot') | null = null;

  function addCollapseToggles(maxDepth: number = 3) {
    const tocEl = document.getElementById('toc');
    if (!tocEl) return;

    // Remove any existing chevrons to avoid duplicates on re-init
    tocEl.querySelectorAll<HTMLElement>('.toc-chevron').forEach(el => el.remove());

    const items = tocEl.querySelectorAll<HTMLElement>('li.toc-list-item');
    items.forEach((li) => {
      const link = li.querySelector(':scope > a');
      const subList = li.querySelector<HTMLElement>(':scope > ul.toc-list');
      if (!link || !subList) return; // leaf item

      // Determine depth by counting ancestor .toc-list elements
      let depth = 0;
      let parent: HTMLElement | null = li.parentElement;
      while (parent) {
        if (parent.classList.contains('toc-list')) depth++;
        parent = parent.parentElement;
      }
      if (depth > maxDepth) return;

      const chevron = document.createElement('button');
      chevron.type = 'button';
      chevron.className = 'toc-chevron';
      chevron.setAttribute('aria-label', 'Toggle section');
      chevron.innerHTML = `<svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M3 4l3 4 3-4z"/></svg>`;
      chevron.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collapsed = subList.classList.toggle('manually-collapsed');
        chevron.classList.toggle('is-collapsed', collapsed);
      });
      link.parentElement?.insertBefore(chevron, link);
    });
  }

  async function initToc(depth: number) {
    if (!tocbot) return;
    tocbot.destroy();
    await tick();
    tocbot.init({ ...tocConfig, collapseDepth: depth });
    // Add collapse toggles after tocbot renders
    queueMicrotask(() => addCollapseToggles(3));
  }

  $effect(() => {
    if (contentReady && tocbot) {
      initToc(collapseDepth);
    }
  });

  onMount(async () => {
    loadStoredWidth();
    loadStatsOpen();

    // Read server-injected share metadata (KV-backed short URLs only)
    if (typeof window !== 'undefined' && window.__MD_META) {
      shareMeta = window.__MD_META;
    }

    const mod = await import('tocbot');
    tocbot = mod;
    if (contentReady) {
      await tick();
      initToc(collapseDepth);
    }
  });

  onDestroy(() => {
    tocbot?.destroy();
  });

  function expandAll() {
    // Reveal every nested toc-list and clear all chevron collapsed states.
    // No tocbot re-init needed — we just toggle our own classes.
    const root = document.querySelector('.toc-nav');
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.manually-collapsed').forEach(el => {
      el.classList.remove('manually-collapsed');
    });
    root.querySelectorAll<HTMLElement>('.toc-chevron.is-collapsed').forEach(el => {
      el.classList.remove('is-collapsed');
    });
    // Also clear tocbot's own auto-collapse state
    root.querySelectorAll<HTMLElement>('.is-collapsed').forEach(el => {
      el.classList.remove('is-collapsed');
    });
    collapseDepth = 6;
  }

  function collapseAll() {
    // Add `manually-collapsed` to every NESTED toc-list (not the top-level
    // root list — we keep root entries visible). Mark every chevron collapsed.
    const root = document.querySelector('.toc-nav');
    if (!root) return;
    // Nested lists: any ul.toc-list inside another ul.toc-list
    root.querySelectorAll<HTMLElement>('ul.toc-list ul.toc-list').forEach(el => {
      el.classList.add('manually-collapsed');
    });
    root.querySelectorAll<HTMLElement>('.toc-chevron').forEach(el => {
      el.classList.add('is-collapsed');
    });
    collapseDepth = 1;
  }

  function fmt(n: number) {
    return n.toLocaleString();
  }
</script>

<!-- Hamburger button (mobile only) -->
<button
  class="hamburger md:hidden"
  onclick={() => (drawerOpen = !drawerOpen)}
  aria-label="Toggle table of contents"
>
  ☰
</button>

<!-- Backdrop (mobile) -->
{#if drawerOpen}
  <div
    class="drawer-backdrop md:hidden"
    role="button"
    tabindex="-1"
    aria-label="Close sidebar"
    onclick={() => (drawerOpen = false)}
    onkeydown={(e) => e.key === 'Escape' && (drawerOpen = false)}
  ></div>
{/if}

<!-- Sidebar -->
<aside
  id="sidebar"
  class="sidebar"
  class:drawer-open={drawerOpen}
  class:is-resizing={isResizing}
  style="width: {sidebarWidth}px;"
>
  <div class="sidebar-inner">
    <div class="sidebar-top">
      <div class="toc-header">
        <div class="toc-header-left">
          <span class="toc-title">Contents</span>
          <div class="toc-actions">
            <button onclick={expandAll} class="icon-btn" title="Expand all" aria-label="Expand all sections">
              <!-- unfold_more -->
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"/>
              </svg>
            </button>
            <button onclick={collapseAll} class="icon-btn" title="Collapse all" aria-label="Collapse all sections">
              <!-- unfold_less -->
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M7.41 18.59 8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zM16.59 5.41 15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z"/>
              </svg>
            </button>
          </div>
        </div>
        <button
          onclick={cycleTheme}
          class="icon-btn"
          title="Theme: {themeMode}{themeMode === 'auto' ? ` (${resolvedTheme})` : ''}"
          aria-label="Toggle theme: currently {themeMode}"
        >
          {#if themeMode === 'auto'}
            <!-- Monitor/system icon -->
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M3 4h18v12H3V4zm0 14h18v2H3v-2zm6-2h6v-2H9v2z"/>
            </svg>
          {:else if themeMode === 'light'}
            <!-- Sun icon -->
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="2" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="22"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="2" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="22" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          {:else}
            <!-- Moon icon -->
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          {/if}
        </button>
      </div>
      <nav id="toc" class="toc-nav"></nav>
    </div>

    {#if stats}
      <div class="stats-panel" class:is-open={statsOpen}>
        <button
          type="button"
          class="stats-title"
          aria-expanded={statsOpen}
          aria-controls="stats-list"
          onclick={toggleStats}
        >
          <span class="stats-chevron" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><path d="M3 4l3 4 3-4z"/></svg>
          </span>
          <span>Statistics</span>
          {#if !statsOpen}
            <span class="stats-summary">{fmt(stats.words)} words · ~{stats.readingMinutes} min</span>
          {/if}
        </button>
        {#if statsOpen}
          <dl id="stats-list" class="stats-list">
            <div class="stat-row">
              <dt>Words</dt><dd>{fmt(stats.words)}</dd>
            </div>
            <div class="stat-row">
              <dt>Read time</dt><dd>~{stats.readingMinutes} min</dd>
            </div>
            {#if stats.headings > 0}
              <div class="stat-row">
                <dt>Headings</dt><dd>{stats.headings}</dd>
              </div>
            {/if}
            {#if stats.images > 0}
              <div class="stat-row">
                <dt>Images</dt><dd>{stats.images}</dd>
              </div>
            {/if}
            {#if shareMeta && expiresAbsolute}
              <div class="stat-row" title={`Stored in Cloudflare KV.\nExpires: ${expiresAbsolute} (${expiresRelative})\nTTL refreshes on every visit (sliding ${Math.round(shareMeta.ttlSeconds / 86400)} days).\nKey: ${shareMeta.key}\nSize: ${formatBytes(shareMeta.sizeBytes)}`}>
                <dt>Expires <span class="ttl-icon" aria-label="sliding TTL — renews on every visit">↻</span></dt>
                <dd>{expiresAbsolute}</dd>
              </div>
              <div class="stat-row" title="Storage size in Cloudflare KV">
                <dt>Stored size</dt><dd>{formatBytes(shareMeta.sizeBytes)}</dd>
              </div>
            {/if}
          </dl>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Resize handle (desktop only) -->
  <div
    class="resizer"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize sidebar"
    style="left: {sidebarWidth - 3}px;"
    onpointerdown={startResize}
  ></div>
</aside>

<style>
  .hamburger {
    position: fixed;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 50;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 1.1rem;
    color: var(--fg);
    cursor: pointer;
    line-height: 1;
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 30;
  }

  .sidebar {
    position: sticky;
    top: 0;
    /* `dvh` = dynamic viewport height; respects mobile browser chrome
       (URL bar / tab bar) and updates as it shows/hides. Fallback for
       browsers without dvh: regular vh. */
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    background: var(--bg-elevated);
    border-right: 1px solid var(--border);
    flex-shrink: 0;
    /* width set inline via style="width: {sidebarWidth}px" */
  }
  .sidebar-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem 0;
  }

  .sidebar.is-resizing {
    user-select: none;
  }

  /* Resize handle: pinned at right edge of sidebar via inline style */
  .resizer {
    position: fixed;
    top: 0;
    height: 100vh;
    height: 100dvh;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    z-index: 5;
    touch-action: none;
  }
  .resizer:hover,
  .sidebar.is-resizing .resizer {
    background: var(--accent);
    opacity: 0.4;
  }
  @media (max-width: 767px) {
    .resizer { display: none; }
  }

  /* Mobile: drawer behavior — fully hidden by default, slides in via toggle */
  @media (max-width: 767px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      /* Override inline style="width: …px" — desktop sizes don't apply on mobile */
      width: min(85vw, 320px) !important;
      max-width: 320px;
      z-index: 40;
      /* Use dvh on mobile too — Chrome/Safari URL bar can shrink the viewport */
      height: 100vh;
      height: 100dvh;
      border-right: 1px solid var(--border);
      box-shadow: 2px 0 12px rgba(0,0,0,0.15);
      /* Fully off-screen by default — translateX is bulletproof regardless of width */
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      will-change: transform;
    }
    .sidebar.drawer-open {
      transform: translateX(0);
    }
  }

  .sidebar-top {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.75rem;
  }

  .toc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.25rem;
  }

  .toc-header-left {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .toc-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    white-space: nowrap;
  }

  .toc-actions {
    display: flex;
    gap: 0.15rem;
  }

  /* Icon button: theme toggle + expand/collapse share this style */
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    border-radius: 5px;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .icon-btn:hover {
    background: var(--border);
    color: var(--fg);
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toc-nav :global(.toc-list) {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .toc-nav :global(.toc-list-item) {
    margin: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .toc-nav :global(.toc-list-item > ul.toc-list) {
    width: 100%;
  }

  /* Leaf items (no chevron): align link flush with chevron items */
  .toc-nav :global(.toc-list-item:not(:has(> .toc-chevron)) > a) {
    margin-left: 18px;
  }

  .toc-nav :global(.toc-link) {
    display: block;
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
    text-decoration: none;
    border-radius: 4px;
    line-height: 1.4;
    flex: 1;
    min-width: 0;
  }

  .toc-nav :global(.toc-link:hover) {
    background: var(--border);
    color: var(--fg);
  }

  .toc-nav :global(.is-active-link) {
    color: var(--accent);
    font-weight: 500;
  }

  /* Nested indentation */
  .toc-nav :global(.toc-list .toc-list) {
    padding-left: 0.75rem;
  }

  /* Collapse chevron */
  .toc-nav :global(.toc-chevron) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 0.2rem;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    border-radius: 3px;
    transition: transform 0.15s, background 0.15s, color 0.15s;
    padding: 0;
  }
  .toc-nav :global(.toc-chevron:hover) {
    background: var(--border);
    color: var(--fg);
  }
  .toc-nav :global(.toc-chevron.is-collapsed) {
    transform: rotate(-90deg);
  }
  .toc-nav :global(.manually-collapsed) {
    display: none !important;
  }

  /* Divider before stats */
  .stats-panel {
    border-top: 1px solid var(--border);
    padding: 0.5rem 0.75rem 0.75rem;
    margin-top: 0.5rem;
  }

  .stats-title {
    /* Reset button styles */
    background: transparent;
    border: none;
    padding: 0.25rem 0;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font: inherit;

    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    transition: color 0.15s;
  }
  .stats-title:hover {
    color: var(--fg);
  }
  .stats-title:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .stats-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
    /* Default (collapsed) = pointing right */
    transform: rotate(-90deg);
    opacity: 0.65;
    flex-shrink: 0;
  }
  .stats-panel.is-open .stats-chevron {
    /* Expanded = pointing down (the SVG natively points down) */
    transform: rotate(0deg);
  }

  /* Compact summary shown only when collapsed — gives users key info at a glance */
  .stats-summary {
    margin-left: auto;
    font-weight: normal;
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.7rem;
    color: var(--muted);
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .stats-list {
    margin: 0.4rem 0 0;
    padding: 0;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.6;
  }

  .stat-row dt {
    font-weight: normal;
  }

  .ttl-icon {
    display: inline-block;
    margin-left: 4px;
    font-size: 0.85em;
    opacity: 0.55;
    transform: translateY(-0.5px);
    cursor: help;
  }

  .stat-row dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
