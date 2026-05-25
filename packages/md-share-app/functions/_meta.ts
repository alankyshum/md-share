// Shared helpers for extracting title/description from markdown.
// Used by /s/[key].ts (HTML meta tag injection) and /og/[key].ts (PNG image generation).

const SITE_NAME = 'md-share';

export interface DerivedMeta {
  title: string;
  description: string;
  siteName: string;
}

export interface ShareJson {
  v: number;
  title: string;
  description: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export function parseShareJson(jsonStr: string): ShareJson {
  const data = JSON.parse(jsonStr);
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON structure');
  }
  if (data.v !== 1) {
    throw new Error(`Unsupported share version: ${data.v}`);
  }
  if (typeof data.content !== 'string') {
    throw new Error('Missing or invalid content field');
  }
  return {
    v: data.v,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    content: data.content,
    created_at: typeof data.created_at === 'string' ? data.created_at : undefined,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  };
}

/** Strip YAML frontmatter and return {fm, body}. */
export function splitFrontmatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return { fm, body: m[2] };
}

/** Extract first H1/H2 heading text (skipping fence/comments). */
export function firstHeading(body: string): string | null {
  let inFence = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = line.match(/^#{1,2}\s+(.+?)\s*#*\s*$/);
    if (h) return stripInline(h[1]);
  }
  return null;
}

/** Strip markdown inline syntax for display. */
export function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

/** Build a description: first non-heading paragraph, max ~200 chars. */
export function firstParagraph(body: string): string {
  let inFence = false;
  const buf: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^```/.test(line)) { inFence = !inFence; if (buf.length) break; continue; }
    if (inFence) continue;
    if (!line) { if (buf.length) break; continue; }
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^---+$/.test(line)) continue;
    if (/^>\s/.test(line)) { buf.push(stripInline(line.replace(/^>\s+/, ''))); continue; }
    if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      buf.push(stripInline(line.replace(/^([-*+]|\d+\.)\s+/, '')));
      continue;
    }
    if (/^\|.+\|/.test(line)) continue;
    buf.push(stripInline(line));
  }
  let text = buf.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length > 200) text = text.slice(0, 197).trimEnd() + '…';
  return text;
}

export function deriveMeta(md: string, key: string): DerivedMeta {
  let title = '';
  let description = '';
  let finalMarkdown = md;

  // Check if it is a JSON-backed share
  if (md.trim().startsWith('{')) {
    try {
      const share = parseShareJson(md);
      title = share.title;
      description = share.description;
      finalMarkdown = share.content;
    } catch {
      // Not a valid share JSON, treat as raw markdown
    }
  }

  const { fm, body } = splitFrontmatter(finalMarkdown);
  const derivedTitle =
    title ||
    fm.title ||
    firstHeading(body) ||
    `Shared note (${key})`;
  const derivedDescription =
    description ||
    fm.description ||
    fm.summary ||
    firstParagraph(body) ||
    `A markdown note shared via ${SITE_NAME}.`;
  return {
    title: derivedTitle.slice(0, 120),
    description: derivedDescription.slice(0, 300),
    siteName: SITE_NAME,
  };
}
