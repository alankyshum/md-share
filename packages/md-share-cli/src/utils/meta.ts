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

export function deriveMetaFromMarkdown(md: string): { title: string; description: string } {
  const { fm, body } = splitFrontmatter(md);
  
  const title = fm.title || firstHeading(body) || 'Shared note';
  const description = fm.description || fm.summary || firstParagraph(body) || 'A markdown note shared via md-share.';
  
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
  };
}
