import { deriveMeta, parseShareJson } from '../../../../_meta';

interface Env {
  ASSETS: Fetcher;
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const owner = params.owner as string;
  const repo = params.repo as string;
  const key = params.key as string;

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

  // Inject meta tags + inline markdown + share metadata before </head>
  const inlineScript = [
    `<script>`,
    `window.__MD_INLINE = ${JSON.stringify(share.content)};`,
    `window.__MD_META = ${JSON.stringify({
      key,
      owner,
      repo,
      ttlMode: 'permanent',
      sizeBytes: new TextEncoder().encode(share.content).length,
    })};`,
    `</script>`,
  ].join('');
  html = html.replace('</head>', `  ${metaTags}\n  ${inlineScript}\n</head>`);

  return new Response(html, {
    status: indexResponse.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
};
