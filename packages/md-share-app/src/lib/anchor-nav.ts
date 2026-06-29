/**
 * anchor-nav — keep the AES key alive when navigating in-page headings.
 *
 * The AES-256 key lives ONLY in the URL fragment as `#k=<base64url>`. Heading
 * anchors (rendered `<a href="#slug">` links and the tocbot Table of Contents)
 * navigate by mutating `location.hash`, which would REPLACE `#k=…` with
 * `#slug` and permanently strip the key from the address bar. A user who then
 * copies the URL hands out an undecryptable link (observed in prod: share
 * `ab5d44b34d68`, key clobbered by `#cju-arrival-rental-car-pickup-2300`).
 *
 * This guard intercepts clicks on in-page anchors, scrolls to the target
 * itself, and rewrites the hash so the `k` param is preserved, encoding the
 * heading as a separate `h` param: `#k=<key>&h=<slug>`. The viewer already
 * parses the fragment with URLSearchParams, so this round-trips cleanly.
 *
 * In fragment-encoded markdown mode (no `k` param — the hash carries the whole
 * document) we still intercept and scroll, but never touch the hash, so the
 * document payload is never destroyed either.
 */

let installed = false;

function fragmentParams(): URLSearchParams {
  const h = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  return new URLSearchParams(h);
}

/** Scroll to the element with the given id, if present. Returns true on hit. */
function scrollToSlug(slug: string): boolean {
  if (!slug) return false;
  const target = document.getElementById(slug);
  if (!target) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

/**
 * Install a single delegated click handler that protects the `#k=` fragment.
 * Safe to call multiple times (no-ops after the first install).
 */
export function installAnchorNav(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'click',
    (e) => {
      // Respect modifier clicks (open in new tab, etc.)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('#') || href.length < 2) return; // not an in-page anchor

      const slug = decodeURIComponent(href.slice(1));
      const target = document.getElementById(slug);
      if (!target) return; // unknown anchor — let the browser handle it

      // We own this navigation now.
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const params = fragmentParams();
      if (params.has('k')) {
        // Server-injected encrypted share: preserve the key, track heading in `h`.
        params.set('h', slug);
        history.replaceState(null, '', `${location.pathname}${location.search}#${params.toString()}`);
      }
      // else: fragment-encoded markdown mode — the hash carries the document,
      // so we deliberately leave it untouched and only scroll.
    },
    true, // capture: run before tocbot's own listeners mutate the hash
  );
}

/**
 * On initial load, honor a deep-link heading (`#k=…&h=<slug>`) by scrolling to
 * it after the content has rendered. No-op when there is no `h` param.
 */
export function scrollToDeepLink(): void {
  if (typeof document === 'undefined') return;
  const slug = fragmentParams().get('h');
  if (slug) scrollToSlug(slug);
}
