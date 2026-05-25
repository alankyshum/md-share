import { ImageResponse, loadGoogleFont } from 'workers-og';
import { deriveMeta, parseShareJson } from '../../../../_meta';

interface Env {
  // No KV needed here!
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

/** True if string contains any CJK ideograph, fullwidth punctuation,
 *  or other glyphs not covered by Inter / system sans. */
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
  fontFamily: string
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
        `<div style="display:flex;">md-share-kut.pages.dev/u/${escapeHtml(owner)}/${escapeHtml(repo)}/s/${escapeHtml(key)}</div>`,
        `<div style="display:flex;background:${accent};color:${to};padding:6px 14px;border-radius:999px;font-weight:700;font-size:18px;">interactive markdown</div>`,
      `</div>`,
    `</div>`,
  ].join('');
}

export const onRequestGet: PagesFunction<Env> = async ({ params }) => {
  const owner = params.owner as string;
  const repo = params.repo as string;
  let key = (params.key as string).replace(/\.png$/i, '');

  if (!owner || !repo || !key || !/^[0-9a-f]{8,64}$/i.test(key)) {
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
    const interText = `md-share-kut.pages.dev/u/${owner}/${repo}/s/${key} interactive markdown M ${meta.siteName}`;
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

  const html = buildOgHtml(meta.title, meta.description, owner, repo, key, meta.siteName, fontFamily);

  return new ImageResponse(html, {
    width: WIDTH,
    height: HEIGHT,
    format: 'png',
    fonts: fonts.length > 0 ? fonts : undefined,
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
};
