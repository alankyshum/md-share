/**
 * Cloudflare Worker proxy that forwards traffic from a *.workers.dev subdomain
 * to the underlying CF Pages project. Deploy with:
 *   wrangler deploy worker.js --name md-share --compatibility-date 2026-05-01
 *
 * Resulting URL: https://md-share.alankyshum.workers.dev → md-share-kut.pages.dev
 *
 * Used when you want a *.workers.dev subdomain to surface a Pages app.
 * (Pages projects only expose *.pages.dev subdomains natively.)
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'md-share-kut.pages.dev';
    url.protocol = 'https:';
    url.port = '';
    const upstreamReq = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    });
    const upstreamRes = await fetch(upstreamReq);
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  },
};
