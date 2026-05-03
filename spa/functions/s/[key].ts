import { deriveMeta } from '../_meta';

interface Env {
  MD_STORE: KVNamespace;
  ASSETS: Fetcher;
}

const ONE_YEAR_SECONDS = 31_536_000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMetaTags(meta: { title: string; description: string; siteName: string },
                       url: string,
                       imageUrl: string): string {
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params, waitUntil }) => {
  const key = params.key as string;
  const md = await env.MD_STORE.get(key);

  if (md === null) {
    return new Response(
      '<!doctype html><html><head><title>Not found</title></head><body><h1>Snippet not found or expired</h1></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Slide TTL: refresh expiration on each access so unread shares prune after 1y of inactivity
  waitUntil(env.MD_STORE.put(key, md, { expirationTtl: ONE_YEAR_SECONDS }));

  // Compute the *new* expiration timestamp (we just refreshed it, so it's now + 1y)
  const expiresAt = new Date(Date.now() + ONE_YEAR_SECONDS * 1000).toISOString();

  // Fetch the SPA index.html (request without Accept-Encoding to avoid compressed response)
  const indexUrl = new URL('/', request.url);
  const indexRequest = new Request(indexUrl.toString(), {
    headers: { 'Accept-Encoding': 'identity' },
  });
  const indexResponse = await env.ASSETS.fetch(indexRequest);
  let html = await indexResponse.text();

  // Derive title + description for social sharing previews
  const reqUrl = new URL(request.url);
  const meta = deriveMeta(md, key);
  const shareUrl = `${reqUrl.origin}/s/${key}`;
  const imageUrl = `${reqUrl.origin}/og/${key}.png`;
  const metaTags = buildMetaTags(meta, shareUrl, imageUrl);

  // Strip the SPA's default <title> so our injected one wins
  html = html.replace(/<title>[^<]*<\/title>/i, '');

  // Inject meta tags + inline markdown + share metadata before </head>
  const inlineScript = [
    `<script>`,
    `window.__MD_INLINE = ${JSON.stringify(md)};`,
    `window.__MD_META = ${JSON.stringify({
      key,
      expiresAt,
      ttlMode: 'sliding',
      ttlSeconds: ONE_YEAR_SECONDS,
      sizeBytes: new TextEncoder().encode(md).length,
    })};`,
    `</script>`,
  ].join('');
  html = html.replace('</head>', `  ${metaTags}\n  ${inlineScript}\n</head>`);

  return new Response(html, {
    status: indexResponse.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
};
