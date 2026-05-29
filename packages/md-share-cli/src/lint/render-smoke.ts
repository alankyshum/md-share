/**
 * Pre-publish render smoke test.
 *
 * Why this exists:
 *   The structural lint validators in ./validators/* check that fenced blocks
 *   are syntactically balanced, but they cannot run the actual chart/diagram
 *   parsers. As a result, real-world bugs reach end users:
 *     - mermaid Parse error (e.g. unquoted `|` inside `[...]` labels)
 *     - markmap NotSupportedError on SVGLength when the SVG has only
 *       `width:100%` and no laid-out parent
 *     - markmap Transformer.transform() throwing on bad source
 *
 * This validator boots a minimal jsdom, then runs the SAME parsers and
 * renderers the browser will use, and reports any failures. The principle:
 * "catch it before publishing, not after sharing it to a mass audience."
 *
 * Trade-offs:
 *   - jsdom is heavy (~3MB) but only loaded when the smoke test runs.
 *   - Some browser APIs (full layout, fonts, Worker) are stubbed/missing in
 *     jsdom — we polyfill the ones that matter (ResizeObserver) and stub the
 *     ones markmap-view touches (svg.getBoundingClientRect width fallback).
 */
import { extractBlocks } from './extract.js';
import { isMermaidMindmap, mermaidMindmapToMarkdown } from './mindmap-mermaid-convert.js';

export interface SmokeError {
  startLine: number;
  kind: 'mermaid' | 'markmap' | 'mindmap';
  message: string;
}

let domReady = false;
/** Set a global, tolerating non-writable existing properties (Node 20+ has a
 *  read-only `globalThis.navigator`; we don't need to override those). */
function setGlobal(name: string, value: unknown): void {
  const g = globalThis as any;
  try {
    g[name] = value;
  } catch {
    try {
      Object.defineProperty(g, name, { value, configurable: true, writable: true });
    } catch {
      // Existing prop is non-configurable — leave Node's built-in alone.
    }
  }
}

async function ensureDom(): Promise<void> {
  if (domReady) return;
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    // Important: NO pretendToBeVisual. With it, jsdom installs its own rAF
    // that bypasses our wrapper — and d3-transition then throws into jsdom's
    // animation loop where errors escape as stderr noise / unhandled events.
    { url: 'http://localhost/' },
  );
  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('navigator', dom.window.navigator);
  setGlobal('HTMLElement', dom.window.HTMLElement);
  setGlobal('SVGElement', dom.window.SVGElement);
  setGlobal('SVGSVGElement', dom.window.SVGSVGElement);
  setGlobal('Element', dom.window.Element);
  setGlobal('Node', dom.window.Node);
  setGlobal('DOMParser', dom.window.DOMParser);
  setGlobal('XMLSerializer', dom.window.XMLSerializer);
  setGlobal('getComputedStyle', dom.window.getComputedStyle);
  // ResizeObserver isn't in jsdom — polyfill with a no-op. Our renderer only
  // uses it to call .fit() on resize, not during the initial render.
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    setGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  }
  // jsdom with pretendToBeVisual usually exposes requestAnimationFrame, but
  // it's missing in some versions / Node combos. markmap-view's setData()
  // schedules a renderData via rAF and CRASHES if rAF is undefined — the
  // throw escapes our try/finally as an unhandled promise rejection. Provide
  // a setTimeout-backed fallback so the renderer can complete its work and
  // any throw lands inside our catch.
  // Install our safe rAF on BOTH globalThis and dom.window so libraries that
  // captured window.rAF at module load time still go through our wrapper.
  const safeRaf = (cb: (t: number) => void) =>
    setTimeout(() => { try { cb(Date.now()); } catch { /* swallow */ } }, 16) as unknown as number;
  const safeCancel = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);
  (dom.window as any).requestAnimationFrame = safeRaf;
  (dom.window as any).cancelAnimationFrame = safeCancel;
  if (typeof (globalThis as any).requestAnimationFrame === 'undefined') {
    // The callback is wrapped so post-render d3-transition animations that
    // touch jsdom's incomplete SVGAnimatedTransformList.baseVal don't escape
    // as unhandled errors — they don't affect our render-time validation.
    setGlobal('requestAnimationFrame', (cb: (t: number) => void) =>
      setTimeout(() => { try { cb(Date.now()); } catch { /* swallow */ } }, 16) as unknown as number);
    setGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as NodeJS.Timeout));
  }
  // Always mark ready so a single bad global doesn't trigger jsdom reinit on
  // every subsequent block (which would be much slower and re-throw the same).
  domReady = true;
}

let mermaidReady = false;
async function ensureMermaid(): Promise<any> {
  await ensureDom();
  const mermaid = (await import('mermaid')).default;
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    mermaidReady = true;
  }
  return mermaid;
}

async function checkMermaid(body: string): Promise<string | null> {
  try {
    const mermaid = await ensureMermaid();
    // mermaid.parse() runs the same Jison/Langium parser the browser uses,
    // without rendering. Throws on syntax error.
    await mermaid.parse(body);
    return null;
  } catch (e) {
    return (e as Error).message.split('\n').slice(0, 5).join(' ').slice(0, 400);
  }
}

async function checkMarkmap(body: string): Promise<string | null> {
  try {
    await ensureDom();
    const { Transformer } = await import('markmap-lib');
    const { Markmap } = await import('markmap-view');

    // Phase 1: parse the source into a tree.
    const t = new Transformer();
    const { root } = t.transform(body);

    // Phase 2: actually mount it. This is where the SVGLength bug fires if
    // the SVG has only relative dimensions. We use absolute attributes —
    // the same fix shipped in markdown-renderer/client/markmaps.ts. If a
    // future regression strips those attributes, this test will catch it.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '320');
    svg.setAttribute('viewBox', '0 0 800 320');
    document.body.appendChild(svg);
    try {
      Markmap.create(svg, undefined, root);
      // markmap schedules a renderData() via rAF on construction — let it
      // run so any sync/async throw it produces lands here, not in vitest's
      // unhandled-rejection trap.
      await new Promise<void>((res) => setTimeout(res, 30));
    } finally {
      svg.remove();
    }
    return null;
  } catch (e) {
    return (e as Error).message.slice(0, 400);
  }
}

export async function smokeTestRender(md: string): Promise<SmokeError[]> {
  const { blocks } = extractBlocks(md);
  const errors: SmokeError[] = [];

  for (const block of blocks) {
    if (block.lang === 'mermaid') {
      // mermaid `mindmap` blocks get auto-upgraded to markmap by the
      // renderer — validate them under BOTH the mermaid parser (in case the
      // upgrade is disabled) AND the markmap pipeline (the path users
      // actually hit). For non-mindmap mermaid, just check mermaid.
      if (isMermaidMindmap(block.body)) {
        const converted = mermaidMindmapToMarkdown(block.body);
        if (!converted) {
          errors.push({
            startLine: block.startLine,
            kind: 'mindmap',
            message: 'mermaid mindmap could not be converted to markmap input',
          });
          continue;
        }
        const mmErr = await checkMarkmap(converted);
        if (mmErr) errors.push({ startLine: block.startLine, kind: 'mindmap', message: mmErr });
      } else {
        const mErr = await checkMermaid(block.body);
        if (mErr) errors.push({ startLine: block.startLine, kind: 'mermaid', message: mErr });
      }
    } else if (block.lang === 'markmap' || block.lang === 'mindmap') {
      const mmErr = await checkMarkmap(block.body);
      if (mmErr) errors.push({ startLine: block.startLine, kind: 'markmap', message: mmErr });
    }
  }

  return errors;
}
