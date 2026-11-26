import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFile } from '../src/github/contents.js';

afterEach(() => vi.unstubAllGlobals());

describe('GitHub Contents API large files', () => {
  it('retrieves raw bytes when the object response omits content', async () => {
    const raw = JSON.stringify({ title: 'Large share', created_at: '2026-01-01', ct: 'a'.repeat(1_100_000) });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ name: 'share.json', path: 'shares/share.json', sha: 'original-sha', encoding: 'none', content: '' }))
      .mockResolvedValueOnce(new Response(raw));
    vi.stubGlobal('fetch', fetchMock);
    const file = await getFile('example/shares', 'shares/share.json', 'fake-token');
    expect(file?.sha).toBe('original-sha');
    expect(Buffer.from(file!.content!, 'base64').toString('utf8')).toBe(raw);
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/vnd.github.object+json');
    expect(fetchMock.mock.calls[1][1].headers.Accept).toBe('application/vnd.github.raw+json');
  });

  it('propagates raw retrieval failures instead of returning empty content', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ sha: 'original-sha', encoding: 'none', content: '' }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503, statusText: 'Unavailable' })));
    await expect(getFile('example/shares', 'shares/share.json', 'fake-token')).rejects.toThrow('503 Unavailable');
  });
});
