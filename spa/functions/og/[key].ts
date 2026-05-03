import { ImageResponse } from 'workers-og';
import { deriveMeta } from '../_meta';

interface Env {
  MD_STORE: KVNamespace;
}

const WIDTH = 1200;
const HEIGHT = 630;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pick a deterministic gradient based on key (so each share has a unique-ish look). */
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

function buildOgHtml(title: string, description: string, key: string, siteName: string): string {
  const { from, to, accent } = pickGradient(key);
  // IMPORTANT: Satori requires every <div> with multiple child nodes
  // (including whitespace text nodes between tags) to have explicit
  // `display: flex` (or `display: none`). Keep all divs flex-y.
  // Compact the HTML (no inter-tag whitespace) to avoid phantom text nodes.
  return [
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;padding:70px 80px;background:linear-gradient(135deg,${from} 0%,${to} 100%);color:#ffffff;font-family:'Inter',system-ui,-apple-system,sans-serif;">`,
      `<div style="display:flex;align-items:center;font-size:28px;font-weight:600;opacity:0.95;letter-spacing:0.5px;">`,
        `<span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:${accent};color:${to};border-radius:8px;margin-right:14px;font-size:24px;font-weight:800;">M</span>`,
        `<span style="display:flex;">${escapeHtml(siteName)}</span>`,
      `</div>`,

      `<div style="display:flex;flex-direction:column;flex:1;justify-content:center;margin:30px 0;">`,
        `<div style="display:flex;font-size:64px;font-weight:800;line-height:1.15;letter-spacing:-1.5px;margin-bottom:28px;">${escapeHtml(title)}</div>`,
        `<div style="display:flex;font-size:30px;font-weight:400;line-height:1.4;opacity:0.92;">${escapeHtml(description)}</div>`,
      `</div>`,

      `<div style="display:flex;align-items:center;justify-content:space-between;font-size:22px;opacity:0.85;font-weight:500;border-top:2px solid rgba(255,255,255,0.2);padding-top:24px;">`,
        `<div style="display:flex;">md-share-kut.pages.dev/s/${escapeHtml(key)}</div>`,
        `<div style="display:flex;background:${accent};color:${to};padding:6px 14px;border-radius:999px;font-weight:700;font-size:18px;">interactive markdown</div>`,
      `</div>`,
    `</div>`,
  ].join('');
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env, request, waitUntil }) => {
  // Strip ".png" suffix if present
  let key = (params.key as string).replace(/\.png$/i, '');
  if (!/^[0-9a-f]{8}$/.test(key)) {
    return new Response('Invalid key', { status: 400 });
  }

  const md = await env.MD_STORE.get(key);
  if (md === null) {
    return new Response('Snippet not found or expired', { status: 404 });
  }

  // Slide TTL on access too (the og fetch counts as a touch)
  waitUntil(env.MD_STORE.put(key, md, { expirationTtl: 31_536_000 }));

  const meta = deriveMeta(md, key);
  const html = buildOgHtml(meta.title, meta.description, key, meta.siteName);

  // Edge cache: 1 day for PNG (titles rarely change)
  return new ImageResponse(html, {
    width: WIDTH,
    height: HEIGHT,
    format: 'png',
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
};
