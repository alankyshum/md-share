export interface FrontmatterResult {
  frontmatter: Record<string, string> | null;
  content: string;
  /** 1-indexed line number where `content` starts in the original markdown.
   *  1 if there's no frontmatter, otherwise the line after the closing `---`. */
  contentStartLine: number;
}

export function extractFrontmatter(md: string): FrontmatterResult {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { frontmatter: null, content: md, contentStartLine: 1 };

  const block = match[1];
  const rest = md.slice(match[0].length);
  // Count newlines consumed by the frontmatter delimiter block to get content start
  const consumedLines = match[0].split('\n').length; // includes the trailing \n
  const contentStartLine = consumedLines; // 1-indexed line of first content char
  const result: Record<string, string> = {};

  const lines = block.split('\n');
  let currentKey: string | null = null;
  let currentVal: string[] = [];

  function flush() {
    if (currentKey) {
      result[currentKey] = currentVal.join('\n').trim();
    }
    currentKey = null;
    currentVal = [];
  }

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      flush();
      currentKey = kvMatch[1];
      currentVal = [kvMatch[2]];
    } else if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
      // Continuation line
      currentVal.push(line.trim());
    }
  }
  flush();

  if (Object.keys(result).length === 0) {
    return { frontmatter: null, content: md, contentStartLine: 1 };
  }
  return { frontmatter: result, content: rest, contentStartLine };
}
