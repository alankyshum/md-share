import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import worker from '../../md-share-app/src/worker';
import { generateKey, encryptShare, decryptShare, serializeEncryptedShare, base64UrlToBytes } from '@alankyshum/share-crypto';

vi.mock('../../md-share-app/node_modules/workers-og', () => ({ ImageResponse: class {}, loadGoogleFont: vi.fn() }));

describe('large share viewing', () => {
  it('injects and decrypts a near-3 MB encrypted share through the Worker', async () => {
    const markdown = randomBytes(2_250_000).toString('base64').slice(0, 2_999_999);
    const key = await generateKey();
    const { iv, ct } = await encryptShare(markdown, key);
    const share = serializeEncryptedShare({ title: 'Large', description: 'Synthetic', iv, ct });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(share)));
    try {
      const env = { ASSETS: { fetch: async () => new Response('<html><head><title>Default</title></head><body></body></html>') } };
      const response = await worker.fetch(new Request('https://example.test/u/example/shares/s/abcdef123456'), env as any);
      expect(response.status).toBe(200);
      const html = await response.text();
      const injected = JSON.parse(html.match(/window\.__MD_ENCRYPTED = (.*?);<\/script>/)![1]);
      expect(await decryptShare(base64UrlToBytes(injected.iv), base64UrlToBytes(injected.ct), key)).toBe(markdown);
    } finally {
      fetchMock.mockRestore();
    }
  }, 30000);
});
