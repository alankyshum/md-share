import fs from 'node:fs';

const ALLOWED_TAGS = new Set([
  'br', 'b', 'i', 'u', 's', 'strong', 'em',
  'sub', 'sup', 'code', 'small', 'span', 'font',
  'hr', 'tt', 'mark', 'del', 'ins',
]);

const FENCE_OPEN_RE = /^(\s*)(```+)mermaid\s*$/;
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;

export interface MermaidIssue {
  lineNo: number;
  message: string;
  oldStr: string;
  newStr: string;
}

export function findMermaidBlocks(md: string): { bodyStartLine: number; bodyLines: string[] }[] {
  const lines = md.split(/\r?\n/);
  const blocks: { bodyStartLine: number; bodyLines: string[] }[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const m = lines[i].match(FENCE_OPEN_RE);
    if (m) {
      const fence = m[2];
      const bodyStart = i + 1;
      let j = bodyStart;
      while (j < lines.length) {
        const stripped = lines[j].trim();
        if (stripped.startsWith(fence) && !stripped.slice(fence.length).trim()) {
          break;
        }
        j++;
      }
      blocks.push({
        bodyStartLine: bodyStart + 1, // 1-based
        bodyLines: lines.slice(bodyStart, j),
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return blocks;
}

export function lintHtmlTags(bodyLines: string[], startLine: number): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  for (let offset = 0; offset < bodyLines.length; offset++) {
    const line = bodyLines[offset];
    let match;
    // Reset regex lastIndex just in case
    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(line)) !== null) {
      const slash = match[1];
      const tag = match[2];
      const attrs = match[3];
      if (!ALLOWED_TAGS.has(tag.toLowerCase())) {
        const oldStr = match[0];
        const newStr = '&lt;' + slash + tag + attrs + '&gt;';
        issues.push({
          lineNo: startLine + offset,
          message: `unsafe HTML-like tag <${slash}${tag}> in mermaid (not in whitelist; will break SVG)`,
          oldStr,
          newStr,
        });
      }
    }
  }
  return issues;
}

export function fixMermaidMarkdown(md: string): { fixedMd: string; issues: MermaidIssue[]; fixedCount: number } {
  const lines = md.split(/\r?\n/);
  const allIssues: MermaidIssue[] = [];
  let fixedCount = 0;

  const blocks = findMermaidBlocks(md);
  for (const block of blocks) {
    const issues = lintHtmlTags(block.bodyLines, block.bodyStartLine);
    allIssues.push(...issues);
  }

  // Apply fixes from bottom to top to avoid offset shifting if we replace strings.
  // Actually, since we only replace within the line, if we replace multiple occurrences on the same line,
  // we can do a split and replace or simple string replacement.
  // Let's do line-by-line replacement.
  // For each issue, find the line and replace the exact oldStr with newStr.
  for (const issue of allIssues) {
    const idx = issue.lineNo - 1;
    if (idx >= 0 && idx < lines.length) {
      if (lines[idx].includes(issue.oldStr)) {
        lines[idx] = lines[idx].replace(issue.oldStr, issue.newStr);
        fixedCount++;
      }
    }
  }

  return {
    fixedMd: lines.join('\n'),
    issues: allIssues,
    fixedCount,
  };
}
