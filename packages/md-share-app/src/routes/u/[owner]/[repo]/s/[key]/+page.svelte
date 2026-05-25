<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { decodeFragment } from '$lib/codec';
  import { renderMarkdown } from '$lib/render';
  import { watchTheme } from '$lib/theme';
  import { extractFrontmatter } from '$lib/frontmatter';
  import { computeStats } from '$lib/stats';
  import Sidebar from '$lib/Sidebar.svelte';
  import Frontmatter from '$lib/Frontmatter.svelte';
  import FullscreenViewer from '$lib/FullscreenViewer.svelte';
  import { installSelectionMenu } from '$lib/selection-menu';

  let mode: 'render' | 'loading' | 'error' = $state('loading');
  let errorMsg = $state('');
  let part: { current: number; total: number } | null = $state(null);
  let isDark = $state(false);
  let renderTarget: HTMLElement | undefined = $state(undefined);
  let frontmatter: Record<string, string> | null = $state(null);
  let stats = $state<ReturnType<typeof computeStats> | null>(null);
  let contentReady = $state(false);
  let rawMarkdown = $state('');

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
        // Avoid opening viewer when user is interacting with the inline markmap (e.g., expanding nodes)
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
    // Selection menu — uses /s/<key> or /u/<owner>/<repo>/s/<key> from URL as page identifier
    const keyMatch = location.pathname.match(/(?:\/s\/|\/u\/[^\/]+\/[^\/]+\/s\/)([0-9a-f]{8,64})\b/);
    installSelectionMenu({ pageKey: keyMatch ? keyMatch[1] : null });

    watchTheme(dark => {
      isDark = dark;
      if (rawMarkdown && renderTarget) {
        doRender(rawMarkdown, dark);
      }
    });

    // Primary: server-injected inline markdown from Pages Function
    if (typeof window !== 'undefined' && window.__MD_INLINE) {
      const markdown = window.__MD_INLINE;
      rawMarkdown = markdown;
      part = null;
      mode = 'render';
      queueMicrotask(() => doRender(markdown, isDark));
      return;
    }

    // Fallback: fragment-encoded markdown
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
      return;
    }

    // No content — redirect to landing page
    window.location.replace('/');
  });
</script>

<!-- No <svelte:head><title>...</title></svelte:head> here:
     the server-side function injects a frontmatter-derived <title> + og: tags.
     Overriding it client-side would break social previews and break tab titles. -->

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
      {/if}
      {#if part}
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
    <a href="/" class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
      Back to home
    </a>
  </div>
{/if}
