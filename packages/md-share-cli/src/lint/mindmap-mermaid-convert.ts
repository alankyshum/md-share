/**
 * Copy of packages/markdown-renderer/src/client/mindmap-mermaid.ts
 * (the pure-logic half, no DOM). Kept in sync manually — small, stable.
 *
 * The CLI's smoke validator needs to run the same mermaid-mindmap →
 * markmap-source conversion the renderer runs, so it can validate the
 * post-conversion content (which is what the browser ultimately renders).
 */
const SHAPE_PATTERNS: { open: string; close: string }[] = [
  { open: '((',  close: '))'  },
  { open: '))',  close: '(('  },
  { open: '{{',  close: '}}'  },
  { open: ')',   close: '('   },
  { open: '(',   close: ')'   },
  { open: '[',   close: ']'   },
  { open: '{',   close: '}'   },
];

function stripShape(raw: string): string {
  let s = raw.trim();
  const idMatch = s.match(/^[A-Za-z0-9_-]+(?=[\[\(\{])/);
  if (idMatch) s = s.slice(idMatch[0].length);
  for (const { open, close } of SHAPE_PATTERNS) {
    if (s.startsWith(open) && s.endsWith(close) && s.length >= open.length + close.length) {
      s = s.slice(open.length, s.length - close.length).trim();
      break;
    }
  }
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function leadingWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w++;
    else if (ch === '\t') w += 4;
    else break;
  }
  return w;
}

export function mermaidMindmapToMarkdown(source: string): string | null {
  const rawLines = source.split(/\r?\n/);
  let i = 0;
  while (i < rawLines.length && rawLines[i].trim() === '') i++;
  if (i >= rawLines.length) return null;
  if (!/^\s*mindmap\b/i.test(rawLines[i])) return null;
  i++;

  type Node = { depth: number; text: string };
  const nodes: Node[] = [];
  for (; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) continue;
    if (/^\s*%%/.test(line)) continue;
    nodes.push({ depth: leadingWidth(line), text: stripShape(line) });
  }
  if (nodes.length === 0) return null;

  const sortedIndents = Array.from(new Set(nodes.map(n => n.depth))).sort((a, b) => a - b);
  const indentMap = new Map(sortedIndents.map((w, idx) => [w, idx]));
  const normalised = nodes.map(n => ({ level: indentMap.get(n.depth)!, text: n.text }));

  const out: string[] = [];
  let rootEmitted = false;
  for (const { level, text } of normalised) {
    if (level === 0 && !rootEmitted) {
      out.push(`# ${text}`);
      rootEmitted = true;
    } else if (level === 0) {
      out.push(`## ${text}`);
    } else {
      out.push(`${'  '.repeat(level - 1)}- ${text}`);
    }
  }
  return out.join('\n');
}

export function isMermaidMindmap(source: string): boolean {
  return /^\s*(?:%%[^\n]*\n\s*)*mindmap\b/i.test(source);
}
