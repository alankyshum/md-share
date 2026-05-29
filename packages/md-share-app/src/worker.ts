import { deriveMeta, parseShareJson } from './worker/_meta';
import { ImageResponse, loadGoogleFont } from 'workers-og';
import { version, build_commit } from './_build-info.js';

export interface Env {
  ASSETS: Fetcher;
  MAPTILER_KEY?: string;
  ORS_KEY?: string;
  MD_SHARE_DEPLOYMENT_TYPE?: string;
}

const SHARE_ROUTE = new URLPattern({ pathname: '/u/:owner/:repo/s/:key' });
const OG_ROUTE = new URLPattern({ pathname: '/u/:owner/:repo/og/:key' }); // accepts /og/<key>.png — strip .png in handler

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/config') return handleConfig(request, env);
    if (url.pathname === '/api/keys') return handleKeys(request, env);

    const shareMatch = SHARE_ROUTE.exec(url);
    if (shareMatch) return handleShare(request, env, shareMatch.pathname.groups);

    const ogMatch = OG_ROUTE.exec(url);
    if (ogMatch) return handleOg(request, env, ogMatch.pathname.groups);

    return env.ASSETS.fetch(request);
  },
};

async function handleConfig(request: Request, env: Env): Promise<Response> {
  const deploymentType = env.MD_SHARE_DEPLOYMENT_TYPE === 'canonical' ? 'canonical' : 'self-host';
  const appBaseUrl = new URL(request.url).origin;

  const body = {
    version,
    build_commit,
    deployment_type: deploymentType,
    app_base_url: appBaseUrl,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
}

async function handleKeys(request: Request, env: Env): Promise<Response> {
  const maptiler = env.MAPTILER_KEY || "";
  const ors = env.ORS_KEY || "";

  const cacheControl = (maptiler && ors)
    ? 'public, max-age=86400, s-maxage=86400'
    : 'no-store, must-revalidate';

  return new Response(
    JSON.stringify({
      maptiler,
      ors,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': cacheControl,
      },
    }
  );
}

async function handleShare(request: Request, env: Env, params: Record<string, string | undefined>): Promise<Response> {
  const owner = params.owner;
  const repo = params.repo;
  const key = params.key;

  if (!owner || !repo || !key || !/^[0-9a-f]{8,64}$/i.test(key)) {
    return new Response('Invalid request parameters', { status: 400 });
  }

  const prefix = key.slice(0, 2);
  const ghUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/shares/${prefix}/${key}.json`;

  const ghResponse = await fetch(ghUrl);
  if (ghResponse.status === 404) {
    return new Response(
      '<!doctype html><html><head><title>Not found</title></head><body><h1>Snippet not found or expired</h1></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!ghResponse.ok) {
    return new Response(`Failed to fetch from GitHub: ${ghResponse.statusText}`, { status: ghResponse.status });
  }

  const jsonText = await ghResponse.text();
  let share;
  try {
    share = parseShareJson(jsonText);
  } catch (err) {
    return new Response(`Invalid share format: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }

  // Fetch the SPA index.html
  const indexUrl = new URL('/', request.url);
  const indexRequest = new Request(indexUrl.toString(), {
    headers: { 'Accept-Encoding': 'identity' },
  });
  const indexResponse = await env.ASSETS.fetch(indexRequest);
  let html = await indexResponse.text();

  // Derive metadata from the share (which is JSON-backed structure)
  const reqUrl = new URL(request.url);
  const meta = deriveMeta(jsonText, key);
  const shareUrl = `${reqUrl.origin}/u/${owner}/${repo}/s/${key}`;
  const imageUrl = `${reqUrl.origin}/u/${owner}/${repo}/og/${key}.png`;
  const metaTags = buildMetaTags(meta, shareUrl, imageUrl);

  // Strip the SPA's default <title>
  html = html.replace(/<title>[^<]*<\/title>/i, '');

  // Inject meta tags + encrypted metadata before </head>
  const inlineScript = [
    `<script>`,
    `window.__MD_ENCRYPTED = ${JSON.stringify({
      alg: share.alg,
      iv: share.iv,
      ct: share.ct,
      owner,
      repo,
      key,
    })};`,
    `</script>`,
  ].join('');
  html = html.replace('</head>', `  ${metaTags}\n  ${inlineScript}\n</head>`);

  return new Response(html, {
    status: indexResponse.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Vary': 'Accept-Encoding',
    },
  });
}

async function handleOg(request: Request, env: Env, params: Record<string, string | undefined>): Promise<Response> {
  const owner = params.owner;
  const repo = params.repo;
  let key = params.key;

  if (!owner || !repo || !key) {
    return new Response('Invalid request parameters', { status: 400 });
  }

  // Strip .png suffix from params.key
  key = key.replace(/\.png$/i, '');

  if (!/^[0-9a-f]{8,64}$/i.test(key)) {
    return new Response('Invalid request parameters', { status: 400 });
  }

  const prefix = key.slice(0, 2);
  const ghUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/shares/${prefix}/${key}.json`;

  const ghResponse = await fetch(ghUrl);
  if (ghResponse.status === 404) {
    return new Response('Snippet not found or expired', { status: 404 });
  }

  if (!ghResponse.ok) {
    return new Response(`Failed to fetch from GitHub: ${ghResponse.statusText}`, { status: ghResponse.status });
  }

  const jsonText = await ghResponse.text();
  let share;
  try {
    share = parseShareJson(jsonText);
  } catch (err) {
    return new Response(`Invalid share format: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }

  const meta = deriveMeta(jsonText, key);

  const cjkText = [
    meta.title,
    meta.description,
    meta.siteName,
  ].join('');
  const fonts: Array<{ name: string; data: ArrayBuffer; weight: number; style: 'normal' }> = [];
  let fontFamily = "'Inter',system-ui,-apple-system,sans-serif";

  if (hasCJK(cjkText)) {
    const interText = `${new URL(request.url).host}/u/${owner}/${repo}/s/${key} interactive markdown M ${meta.siteName}`;
    const [inter400, inter700, tc400, tc700] = await Promise.all([
      loadCjkFontSubset(interText, 400, 'Inter'),
      loadCjkFontSubset(interText, 700, 'Inter'),
      loadCjkFontSubset(cjkText, 400, 'Noto Sans TC'),
      loadCjkFontSubset(cjkText, 700, 'Noto Sans TC'),
    ]);
    if (inter400) fonts.push({ name: 'Inter', data: inter400, weight: 400, style: 'normal' });
    if (inter700) fonts.push({ name: 'Inter', data: inter700, weight: 700, style: 'normal' });
    if (tc400) fonts.push({ name: 'NotoSansTC', data: tc400, weight: 400, style: 'normal' });
    if (tc700) fonts.push({ name: 'NotoSansTC', data: tc700, weight: 700, style: 'normal' });
    if (fonts.some(f => f.name === 'NotoSansTC')) {
      fontFamily = "'Inter','NotoSansTC',sans-serif";
    }
  }

  const html = buildOgHtml(meta.title, meta.description, owner, repo, key, meta.siteName, fontFamily, new URL(request.url).host);

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    format: 'png',
    fonts: fonts.length > 0 ? fonts : undefined,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMetaTags(
  meta: { title: string; description: string; siteName: string },
  url: string,
  imageUrl: string
): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(url);
  const img = escapeHtml(imageUrl);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:alt" content="${t}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
  ].join('\n  ');
}

function hasCJK(s: string): boolean {
  return /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u30ff]/.test(s);
}

async function loadCjkFontSubset(text: string, weight: number, family: string): Promise<ArrayBuffer | null> {
  if (!text) return null;
  try {
    return await loadGoogleFont({ family, weight, text });
  } catch (err) {
    console.error('loadCjkFontSubset failed', { family, weight, err: String(err) });
    return null;
  }
}

function pickGradient(key: string): { from: string; to: string; accent: string } {
  const palettes = [
    { from: '#0ea5e9', to: '#1e3a8a', accent: '#67e8f9' }, // sky → indigo
    { from: '#10b981', to: '#064e3b', accent: '#6ee7b7' }, // emerald
    { from: '#f59e0b', to: '#7c2d12', accent: '#fde68a' }, // amber → rust
    { from: '#ec4899', to: '#831843', accent: '#fbcfe8' }, // pink
    { from: '#8b5cf6', to: '#3b0764', accent: '#ddd6fe' }, // violet
    { from: '#ef4444', to: '#7f1d1d', accent: '#fecaca' }, // red
    { from: '#06b6d4', to: '#164e63', accent: '#a5f3fc' }, // cyan
    { from: '#84cc16', to: '#365314', accent: '#d9f99d' }, // lime
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

function buildOgHtml(
  title: string,
  description: string,
  owner: string,
  repo: string,
  key: string,
  siteName: string,
  fontFamily: string,
  host: string
): string {
  const { from, to, accent } = pickGradient(key);
  return [
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;padding:70px 80px;background:linear-gradient(135deg,${from} 0%,${to} 100%);color:#ffffff;font-family:${fontFamily};">`,
      `<div style="display:flex;align-items:center;font-size:28px;font-weight:600;opacity:0.95;letter-spacing:0.5px;">`,
        `<span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:${accent};color:${to};border-radius:8px;margin-right:14px;font-size:24px;font-weight:800;">M</span>`,
        `<span style="display:flex;">${escapeHtml(siteName)}</span>`,
      `</div>`,

      `<div style="display:flex;flex-direction:column;flex:1;justify-content:center;margin:30px 0;">`,
        `<div style="display:flex;font-size:64px;font-weight:800;line-height:1.15;letter-spacing:-1.5px;margin-bottom:28px;">${escapeHtml(title)}</div>`,
        `<div style="display:flex;font-size:30px;font-weight:400;line-height:1.4;opacity:0.92;">${escapeHtml(description)}</div>`,
      `</div>`,

      `<div style="display:flex;align-items:center;justify-content:space-between;font-size:22px;opacity:0.85;font-weight:500;border-top:2px solid rgba(255,255,255,0.2);padding-top:24px;">`,
        `<div style="display:flex;">${escapeHtml(host)}/u/${escapeHtml(owner)}/${escapeHtml(repo)}/s/${escapeHtml(key)}</div>`,
        `<div style="display:flex;background:${accent};color:${to};padding:6px 14px;border-radius:999px;font-weight:700;font-size:18px;">interactive markdown</div>`,
      `</div>`,
    `</div>`,
  ].join('');
}
