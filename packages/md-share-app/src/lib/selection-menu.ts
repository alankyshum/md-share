// Selection menu — when user selects text in the rendered markdown,
// show a floating menu with "Add context to LLM" action that copies:
//   [source <full-share-url-with-#k=>, lines <start>-<end>]
//   <selected text>
// to the clipboard. Mobile-friendly (positions menu within viewport).

interface MenuOptions {
  pageKey: string | null;   // 8-char short URL key, or null for fragment shares
}

let mounted = false;
let menu: HTMLDivElement | null = null;
let opts: MenuOptions = { pageKey: null };
let lastSelectionText = '';
let lastLineRange: { start: number; end: number } | null = null;

function ensureMenu(): HTMLDivElement {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'sel-menu';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = `
    position: absolute;
    z-index: 9999;
    display: none;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    padding: 4px;
    gap: 2px;
    font-size: 13px;
    user-select: none;
    -webkit-user-select: none;
  `;
  menu.innerHTML = `
    <button type="button" class="sel-menu-btn" data-action="llm">
      <span class="sel-menu-icon">⤴</span>
      <span class="sel-menu-label">Add to LLM</span>
    </button>
    <button type="button" class="sel-menu-btn" data-action="copy">
      <span class="sel-menu-icon">⧉</span>
      <span class="sel-menu-label">Copy</span>
    </button>
  `;
  document.body.appendChild(menu);

  menu.addEventListener('mousedown', (e) => e.preventDefault()); // don't lose selection
  menu.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.sel-menu-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'llm') await copyForLLM();
    else if (action === 'copy') await copyPlain();
    flashAndHide(btn);
  });
  return menu;
}

function flashAndHide(btn: HTMLButtonElement) {
  const labelEl = btn.querySelector('.sel-menu-label') as HTMLElement | null;
  if (labelEl) {
    const orig = labelEl.textContent;
    labelEl.textContent = 'Copied!';
    setTimeout(() => { if (labelEl) labelEl.textContent = orig; }, 900);
  }
  setTimeout(hideMenu, 1100);
}

function findLineRange(range: Range): { start: number; end: number } | null {
  // Walk up from the start container until we find a node with data-line-start
  function lineOf(node: Node | null, attr: 'data-line-start' | 'data-line-end'): number | null {
    let el: HTMLElement | null = node?.nodeType === 1
      ? (node as HTMLElement)
      : node?.parentElement ?? null;
    while (el) {
      const v = el.getAttribute?.(attr);
      if (v) return parseInt(v, 10);
      el = el.parentElement;
    }
    return null;
  }
  const start = lineOf(range.startContainer, 'data-line-start');
  const end = lineOf(range.endContainer, 'data-line-end');
  if (start === null && end === null) return null;
  const s = start ?? end!;
  const e = end ?? start!;
  return { start: Math.min(s, e), end: Math.max(s, e) };
}

function getRenderedSelection(): { text: string; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  // Selection must be within the article being rendered
  const article = document.getElementById('article');
  if (!article) return null;
  const ancestor = range.commonAncestorContainer;
  const inside = article === ancestor || article.contains(
    ancestor.nodeType === 1 ? (ancestor as HTMLElement) : ancestor.parentElement
  );
  if (!inside) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  return { text, range };
}

function showMenuAtRange(range: Range) {
  const m = ensureMenu();
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideMenu();
    return;
  }
  m.style.display = 'flex';
  // Measure after display
  const mw = m.offsetWidth || 180;
  const mh = m.offsetHeight || 36;
  const pageX = window.scrollX;
  const pageY = window.scrollY;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: above the selection, centered
  let left = pageX + rect.left + rect.width / 2 - mw / 2;
  let top = pageY + rect.top - mh - 8;

  // Clamp horizontally
  left = Math.max(pageX + 4, Math.min(left, pageX + vw - mw - 4));

  // If above is off-screen, place below
  if (rect.top - mh - 8 < 0) {
    top = pageY + rect.bottom + 8;
  }

  // Mobile: if menu would be obscured by virtual keyboard or off-screen at bottom,
  // pin to safe area at top of viewport
  if (top + mh > pageY + vh - 4) {
    top = pageY + Math.min(rect.top + 8, vh - mh - 8);
  }

  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
}

function hideMenu() {
  if (menu) menu.style.display = 'none';
}

async function copyForLLM() {
  const lineFrag = lastLineRange
    ? `lines ${lastLineRange.start}${lastLineRange.start !== lastLineRange.end ? '-' + lastLineRange.end : ''}`
    : 'no line info';
  // Reference the full shareable URL (including the #k= AES-key fragment) so the
  // pasted prompt actually points the reader's agent at this document — an opaque
  // page id alone gives the LLM no way to know what's being referenced.
  const pageFrag = `source ${location.href}`;
  const header = `[${pageFrag}, ${lineFrag}]`;
  const body = `${header}\n${lastSelectionText}`;
  await navigator.clipboard.writeText(body);
}

async function copyPlain() {
  await navigator.clipboard.writeText(lastSelectionText);
}

function onSelectionChange() {
  // Defer to allow selection to stabilize
  requestAnimationFrame(() => {
    const sel = getRenderedSelection();
    if (!sel) {
      hideMenu();
      return;
    }
    lastSelectionText = sel.text;
    lastLineRange = findLineRange(sel.range);
    showMenuAtRange(sel.range);
  });
}

function onPointerEnd() {
  // Trigger again after pointer release because selectionchange fires earlier
  setTimeout(onSelectionChange, 50);
}

function onScroll() {
  // Reposition (or hide if selection lost)
  const sel = getRenderedSelection();
  if (sel) {
    showMenuAtRange(sel.range);
  } else {
    hideMenu();
  }
}

function onDocPointerDown(e: PointerEvent) {
  // Click outside menu hides it (selectionchange will handle the rest)
  if (menu && menu.contains(e.target as Node)) return;
}

export function installSelectionMenu(options: MenuOptions) {
  opts = options;
  if (mounted) return;
  mounted = true;
  ensureMenu();
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mouseup', onPointerEnd);
  document.addEventListener('touchend', onPointerEnd, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('pointerdown', onDocPointerDown);
}

export function setSelectionMenuPageKey(key: string | null) {
  opts.pageKey = key;
}
