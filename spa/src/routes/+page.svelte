<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { decodeFragment, encodeMarkdown } from '$lib/codec';
  import { renderMarkdown, initMermaid } from '$lib/render';
  import { watchTheme } from '$lib/theme';
  import { extractFrontmatter } from '$lib/frontmatter';
  import { computeStats } from '$lib/stats';
  import Sidebar from '$lib/Sidebar.svelte';
  import Frontmatter from '$lib/Frontmatter.svelte';
  import FullscreenViewer from '$lib/FullscreenViewer.svelte';
  import { installSelectionMenu } from '$lib/selection-menu';

  let mode: 'render' | 'landing' | 'error' = $state('landing');
  let errorMsg = $state('');
  let part: { current: number; total: number } | null = $state(null);
  let isDark = $state(false);
  let renderTarget: HTMLElement | undefined = $state(undefined);
  let textareaValue = $state('');
  let frontmatter: Record<string, string> | null = $state(null);
  let stats = $state<ReturnType<typeof computeStats> | null>(null);
  let contentReady = $state(false);

  // Fullscreen viewer state
  let viewerOpen = $state(false);
  let viewerKind: 'mermaid' | 'markmap' | null = $state(null);
  let viewerSource: HTMLElement | null = $state(null);

  function openViewer(kind: 'mermaid' | 'markmap', el: HTMLElement) {
    viewerKind = kind;
    viewerSource = el;
    viewerOpen = true;
  }
  function closeViewer() {
    viewerOpen = false;
    viewerKind = null;
    viewerSource = null;
  }

  function attachClickHandlers() {
    if (!renderTarget) return;
    renderTarget.querySelectorAll<HTMLElement>('.mermaid').forEach((el) => {
      if ((el as any).__clickAttached) return;
      (el as any).__clickAttached = true;
      el.classList.add('clickable-diagram');
      el.title = 'Click to expand fullscreen';
      el.addEventListener('click', () => openViewer('mermaid', el));
    });
    renderTarget.querySelectorAll<HTMLElement>('div.markmap[data-source]').forEach((el) => {
      if ((el as any).__clickAttached) return;
      (el as any).__clickAttached = true;
      el.classList.add('clickable-diagram');
      el.title = 'Click to expand fullscreen';
      el.addEventListener('click', (e) => {
        if ((e.target as Element).closest('g.markmap-node')) return;
        openViewer('markmap', el);
      });
    });
  }

  async function doRender(md: string, dark: boolean) {
    const { frontmatter: fm, content, contentStartLine } = extractFrontmatter(md);
    frontmatter = fm;
    stats = computeStats(content);
    await tick();
    if (renderTarget) {
      await renderMarkdown(content, renderTarget, dark, { lineOffset: contentStartLine });
      contentReady = true;
      attachClickHandlers();
    }
  }

  onMount(() => {
    // Selection menu — fragment-URL route has no short key, so we use null
    installSelectionMenu({ pageKey: null });

    watchTheme(dark => {
      isDark = dark;
      if (renderTarget && mode === 'render') {
        doRender(rawMarkdown, dark);
      }
    });

    if (typeof window !== 'undefined' && window.__MD_INLINE) {
      rawMarkdown = window.__MD_INLINE;
      mode = 'render';
      part = null;
      queueMicrotask(() => doRender(rawMarkdown, isDark));
      return;
    }

    const hash = location.hash;
    if (hash && hash.length > 1) {
      try {
        const { markdown, part: p } = decodeFragment(hash);
        rawMarkdown = markdown;
        part = p ?? null;
        mode = 'render';
        queueMicrotask(() => doRender(markdown, isDark));
      } catch (e: unknown) {
        errorMsg = e instanceof Error ? e.message : 'decode failed';
        mode = 'error';
      }
    }
  });

  let rawMarkdown = $state('');

  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function onTextareaInput() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      rawMarkdown = textareaValue;
      doRender(textareaValue, isDark);
    }, 300);
  }

  function generateLink() {
    if (!textareaValue.trim()) return;
    const encoded = encodeMarkdown(textareaValue);
    location.hash = encoded;
    rawMarkdown = textareaValue;
    mode = 'render';
    queueMicrotask(() => doRender(textareaValue, isDark));
  }

  function backToLanding() {
    history.pushState('', document.title, location.pathname + location.search);
    mode = 'landing';
    rawMarkdown = '';
    frontmatter = null;
    stats = null;
    contentReady = false;
    part = null;
  }
</script>

<svelte:head>
  <title>md-share</title>
</svelte:head>

{#if mode === 'render'}
  <div class="layout">
    <Sidebar {stats} {contentReady} />
    <div class="layout-main">
      {#if part}
        <div class="fixed top-3 right-3 flex gap-2 no-print z-10">
          <span class="px-3 py-1 rounded text-sm" style="background:var(--bg-elevated);color:var(--muted);border:1px solid var(--border)">
            Part {part.current} of {part.total}
          </span>
        </div>
        <div class="max-w-[900px] mx-auto px-10 pt-6 text-sm no-print" style="color:var(--muted)">
          This document is split across {part.total} URLs. Open the other links to see the full document.
        </div>
      {/if}
      <div class="markdown-body">
        {#if frontmatter}
          <Frontmatter data={frontmatter} />
        {/if}
        <article id="article" bind:this={renderTarget}></article>
      </div>
    </div>
  </div>
  <FullscreenViewer bind:open={viewerOpen} kind={viewerKind} sourceEl={viewerSource} onClose={closeViewer} />
{:else if mode === 'error'}
  <div class="max-w-2xl mx-auto p-12 text-center">
    <h1 class="text-2xl font-bold mb-4">Couldn't decode this link</h1>
    <p class="mb-6" style="color:var(--muted)">{errorMsg}</p>
    <p class="mb-6">The URL may be truncated or corrupted.</p>
    <button onclick={backToLanding} class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
      Paste markdown manually
    </button>
  </div>
{:else}
  <div class="max-w-3xl mx-auto p-8">
    <header class="mb-6">
      <h1 class="text-3xl font-bold">md-share</h1>
      <p style="color:var(--muted)">Render and share markdown with mermaid charts via URL.</p>
    </header>
    <textarea
      bind:value={textareaValue}
      oninput={onTextareaInput}
      placeholder="# Hello&#10;&#10;Paste your markdown here..."
      class="w-full h-96 p-4 font-mono text-sm border rounded resize-y"
      style="background:var(--bg-elevated);color:var(--fg);border-color:var(--border)"
    ></textarea>
    <div class="mt-4 flex gap-2">
      <button onclick={generateLink} class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
        Generate link
      </button>
    </div>
    {#if rawMarkdown}
      <div class="mt-8 border-t pt-6" style="border-color:var(--border)">
        <h2 class="text-sm uppercase tracking-wide mb-4" style="color:var(--muted)">Preview</h2>
        <div class="markdown-body" style="padding:0;max-width:100%">
          {#if frontmatter}
            <Frontmatter data={frontmatter} />
          {/if}
          <article id="article" bind:this={renderTarget}></article>
        </div>
      </div>
    {/if}
  </div>
{/if}
