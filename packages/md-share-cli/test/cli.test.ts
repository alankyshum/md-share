import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { encodeChunk, decodeChunk } from '../src/encoding.js';
import { chunkMarkdown, encodedLen, MAX_PAYLOAD } from '../src/chunking.js';
import { getShareKey } from '../src/utils/crypto.js';
import { deriveMetaFromMarkdown } from '../src/utils/meta.js';
import { loadConfig, saveConfig } from '../src/config/load.js';
import { parseUpdateTarget } from '../src/commands/share.js';
import { parseKeyFromInput } from '../src/commands/delete.js';
import { lintMarkdown } from '../src/lint/index.js';

describe('Parity Encoding & Compression', () => {
  it('should match the Python output identically for parity.md content', () => {
    const text = '# Test\n\nHello world\n';
    const pyB64 = 'H4sIAAAAAAAC_1NWCEktLuHi8kjNyclXKM8vyknhAgCHksPaFAAAAA';
    
    const encoded = encodeChunk(text);
    expect(encoded).toBe(pyB64);

    const decoded = decodeChunk(encoded);
    expect(decoded).toBe(text);
  });
});

describe('Chunking & Safe splitting', () => {
  it('should split small markdown into exactly 1 part', () => {
    const md = 'Hello world';
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(md);
  });

  it('should chunk large markdown into multiple parts and never split inside fences', () => {
    // Generate a code fence that is very large or long
    const body = '```mermaid\n' + 'flowchart TD\n' + '  A --> B\n'.repeat(1200) + '```';
    const chunks = chunkMarkdown(body);
    
    // Check that each chunk fits inside MAX_PAYLOAD
    for (const chunk of chunks) {
      expect(encodedLen(chunk)).toBeLessThanOrEqual(MAX_PAYLOAD);
      
      // Fences must be balanced in each chunk or a chunk should not split them
      const openMatches = (chunk.match(/```/g) || []).length;
      expect(openMatches % 2).toBe(0);
    }
  });
});

describe('Key derivation & Metadata', () => {
  it('should derive consistent 12-char hex keys from body', () => {
    const md = '# Test content';
    const key = getShareKey(md);
    expect(key).toHaveLength(12);
    expect(key).toMatch(/^[0-9a-f]{12}$/);
    
    // Key should be deterministic
    expect(getShareKey(md)).toBe(key);
  });

  it('should extract correct metadata title and description', () => {
    const md = `---\ntitle: Custom Title\ndescription: Custom Desc\n---\n# Header\nParagraph text`;
    const meta = deriveMetaFromMarkdown(md);
    expect(meta.title).toBe('Custom Title');
    expect(meta.description).toBe('Custom Desc');
  });

  it('should fallback to heading and first paragraph when frontmatter is missing', () => {
    const md = '# Real Header\nThis is the first real paragraph of the shared note.';
    const meta = deriveMetaFromMarkdown(md);
    expect(meta.title).toBe('Real Header');
    expect(meta.description).toBe('This is the first real paragraph of the shared note.');
  });
});

describe('Config & Migration', () => {
  const NEW_CONFIG_DIR = path.join(os.homedir(), '.config', 'md-share');
  const NEW_CONFIG_PATH = path.join(NEW_CONFIG_DIR, 'config.json');

  const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.claude', 'skills', 'share--markdown');
  const LEGACY_CONFIG_PATH = path.join(LEGACY_CONFIG_DIR, 'config.json');

  let oldNewConfig: string | null = null;
  let oldLegacyConfig: string | null = null;

  beforeEach(() => {
    // Backup any existing configs
    if (fs.existsSync(NEW_CONFIG_PATH)) {
      oldNewConfig = fs.readFileSync(NEW_CONFIG_PATH, 'utf8');
      fs.unlinkSync(NEW_CONFIG_PATH);
    }
    if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      oldLegacyConfig = fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8');
      fs.unlinkSync(LEGACY_CONFIG_PATH);
    }
  });

  afterEach(() => {
    // Restore backups
    if (oldNewConfig !== null) {
      fs.mkdirSync(NEW_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(NEW_CONFIG_PATH, oldNewConfig, 'utf8');
    } else if (fs.existsSync(NEW_CONFIG_PATH)) {
      fs.unlinkSync(NEW_CONFIG_PATH);
    }

    if (oldLegacyConfig !== null) {
      fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true });
      fs.writeFileSync(LEGACY_CONFIG_PATH, oldLegacyConfig, 'utf8');
    } else if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      fs.unlinkSync(LEGACY_CONFIG_PATH);
    }
  });

  it('should migrate only base_url and never copy api_token', () => {
    fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(
      LEGACY_CONFIG_PATH,
      JSON.stringify({
        base_url: 'https://my-legacy-app.pages.dev',
        api_token: 'secret_legacy_token',
      }),
      'utf8'
    );

    const config = loadConfig();
    expect(config.app_base_url).toBe('https://my-legacy-app.pages.dev');
    // Ensure storage_repo is empty
    expect(config.storage_repo).toBeUndefined();

    // Verify when saving that api_token is not saved
    saveConfig(config);
    expect(fs.existsSync(NEW_CONFIG_PATH)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(NEW_CONFIG_PATH, 'utf8'));
    expect(saved.app_base_url).toBe('https://my-legacy-app.pages.dev');
    expect(saved.api_token).toBeUndefined();
  });
});

describe('Lint Checks', () => {
  it('should detect unclosed fences and flag them', () => {
    const md = '# Title\n\n```mermaid\nflowchart TD\n';
    const errors = lintMarkdown(md);
    expect(errors).toContain('L3: unclosed fenced code block (missing closing ```)');
  });

  it('should pass on valid markdown', () => {
    const md = '# Title\n\n```mermaid\nflowchart TD\n  A --> B\n```\n';
    const errors = lintMarkdown(md);
    expect(errors).toHaveLength(0);
  });
});

describe('URL and key parsing', () => {
  it('should extract 12-char key from --update args', () => {
    const url = 'https://my-app.pages.dev/u/owner/repo/s/abcdef123456#k=somekey';
    const result = parseUpdateTarget(url);
    expect(result).toEqual({
      shareKey: 'abcdef123456',
      existingKeyB64: 'somekey',
    });

    const bareKey = parseUpdateTarget('abcdef123456');
    expect(bareKey).toEqual({
      shareKey: 'abcdef123456',
    });
  });

  it('should parse full URL with fragment key', () => {
    const url = 'https://share.alanshum.org/u/alankyshum/md-share--cms/s/7bafd34fb516#k=FvZpVR3xg_d3-VdU-s-Ps2an1l9C5fdZloqIx__OAKM';
    const result = parseUpdateTarget(url);
    expect(result).toEqual({
      shareKey: '7bafd34fb516',
      existingKeyB64: 'FvZpVR3xg_d3-VdU-s-Ps2an1l9C5fdZloqIx__OAKM',
    });
  });

  it('should parse URL without fragment key', () => {
    const urlNoFrag = 'https://share.alanshum.org/u/owner/repo/s/abc123def456';
    const resultNoFrag = parseUpdateTarget(urlNoFrag);
    expect(resultNoFrag).toEqual({
      shareKey: 'abc123def456',
    });
  });

  it('should parse bare 12-char key', () => {
    const bareKey = parseUpdateTarget('abc123def456');
    expect(bareKey).toEqual({
      shareKey: 'abc123def456',
    });
  });

  it('should return null for garbage input', () => {
    const garbage = parseUpdateTarget('not-a-share-key');
    expect(garbage).toBeNull();
  });

  it('should extract 12-char key from delete command input', () => {
    const url = 'https://my-app.pages.dev/u/owner/repo/s/123456abcdef';
    const key = parseKeyFromInput(url);
    expect(key).toBe('123456abcdef');

    const bareKey = parseKeyFromInput('123456abcdef');
    expect(bareKey).toBe('123456abcdef');
  });
});
