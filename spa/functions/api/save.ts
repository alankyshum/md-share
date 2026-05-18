interface Env {
  MD_STORE: KVNamespace;
  SHARE_MD_TOKEN: string;
}

const ONE_YEAR_SECONDS = 31_536_000;

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function isValidShortKey(s: string): boolean {
  return /^[0-9a-f]{8}$/.test(s);
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  // Auth
  const authHeader = request.headers.get('Authorization') ?? '';
  const expectedToken = env.SHARE_MD_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse body
  let body: { markdown?: string; key?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const markdown = body.markdown;
  if (!markdown || markdown.trim() === '') {
    return new Response('Missing markdown', { status: 400 });
  }
  if (markdown.length > 100_000) {
    return new Response('Payload too large (max 100KB)', { status: 413 });
  }

  // Determine storage key:
  //   - If body.key is provided and valid → overwrite that share (edit-existing)
  //   - Else → content-addressed sha256[:8]
  let key: string;
  let mode: 'create' | 'update';
  if (body.key !== undefined) {
    if (!isValidShortKey(body.key)) {
      return new Response('Invalid key (must be 8 lowercase hex chars)', { status: 400 });
    }
    key = body.key;
    mode = 'update';
  } else {
    const hash = await sha256Hex(markdown);
    key = hash.substring(0, 8);
    mode = 'create';
  }

  await env.MD_STORE.put(key, markdown, { expirationTtl: ONE_YEAR_SECONDS });

  const origin = new URL(request.url).origin;
  return Response.json({ ok: true, key, url: `${origin}/s/${key}`, mode });
};
