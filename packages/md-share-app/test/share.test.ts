import { describe, it, expect } from 'vitest';
import { parseShareJson, deriveMeta } from '../functions/_meta';
import sampleShare from './fixtures/sample-share.json';

// Helper function to simulate GH URL construction as requested by deliverables
function constructGhUrl(owner: string, repo: string, key: string): string {
  const prefix = key.slice(0, 2);
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/shares/${prefix}/${key}.json`;
}

describe('Phase 1.1 - Storage, Routing and Meta Tests', () => {
  it('should parse plaintext share JSON correctly', () => {
    const jsonStr = JSON.stringify(sampleShare);
    const parsed = parseShareJson(jsonStr);

    expect(parsed.v).toBe(1);
    expect(parsed.title).toBe('Sample Plaintext Title');
    expect(parsed.description).toBe('This is a sample plaintext description from the fixture.');
    expect(parsed.content).toContain('# Sample Plaintext Title');
  });

  it('should throw an error for invalid share JSON versions or structures', () => {
    const invalidVersion = JSON.stringify({ ...sampleShare, v: 2 });
    expect(() => parseShareJson(invalidVersion)).toThrow('Unsupported share version: 2');

    const missingContent = JSON.stringify({ v: 1, title: 'No content' });
    expect(() => parseShareJson(missingContent)).toThrow('Missing or invalid content field');
  });

  it('should construct correct GitHub Raw URL matching convention', () => {
    const owner = 'alankyshum';
    const repo = 'md-share-repo';
    const key = 'abcdef123456'; // 12-char key

    const url = constructGhUrl(owner, repo, key);
    expect(url).toBe('https://raw.githubusercontent.com/alankyshum/md-share-repo/main/shares/ab/abcdef123456.json');
  });

  it('should extract OG meta from plaintext share correctly', () => {
    const jsonStr = JSON.stringify(sampleShare);
    const meta = deriveMeta(jsonStr, 'abcdef123456');

    expect(meta.title).toBe('Sample Plaintext Title');
    expect(meta.description).toBe('This is a sample plaintext description from the fixture.');
    expect(meta.siteName).toBe('md-share');
  });

  it('should fall back to deriving title/description from content when they are missing in JSON share', () => {
    const rawJson = {
      v: 1,
      title: '',
      description: '',
      content: '# Dynamic Heading\n\nThis is the dynamic paragraph description.'
    };
    const meta = deriveMeta(JSON.stringify(rawJson), 'key123');

    expect(meta.title).toBe('Dynamic Heading');
    expect(meta.description).toBe('This is the dynamic paragraph description.');
  });
});
