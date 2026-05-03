// Lightweight regex-based markdown linter for share-md.
// Catches common errors before save so users don't ship broken renders.
//
// Returns array of error strings. Empty array = clean.

const MERMAID_DIAGRAMS = [
  'graph', 'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram', 'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirementDiagram',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'architecture-beta',
];

interface Block { lang: string; body: string; startLine: number; }

/** Walk markdown line-by-line and extract fenced code blocks.
 *  Also checks fence balance. */
function extractBlocks(md: string): { blocks: Block[]; unbalancedAt: number | null } {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let inBlock = false;
  let curLang = '';
  let curBody: string[] = [];
  let curStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(\s*)(```+)([^\s`]*)/);
    if (fence) {
      if (!inBlock) {
        inBlock = true;
        curLang = fence[3].trim().toLowerCase();
        curBody = [];
        curStart = i + 1;
      } else {
        blocks.push({ lang: curLang, body: curBody.join('\n'), startLine: curStart });
        inBlock = false;
        curLang = '';
        curBody = [];
      }
    } else if (inBlock) {
      curBody.push(line);
    }
  }
  return { blocks, unbalancedAt: inBlock ? curStart : null };
}

function lintMermaid(block: Block): string[] {
  const errs: string[] = [];
  const trimmed = block.body.replace(/^\s*\n+/, '');
  if (!trimmed.trim()) {
    errs.push(`L${block.startLine}: mermaid block is empty`);
    return errs;
  }
  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  // Strip leading directive comments (%% ...) and frontmatter (--- ... ---)
  if (firstLine.startsWith('%%') || firstLine.startsWith('---')) return errs;
  const firstWord = firstLine.split(/[\s\(]/)[0];
  const matched = MERMAID_DIAGRAMS.some(d =>
    firstWord === d || firstLine.startsWith(d + ' ') || firstLine === d
  );
  if (!matched) {
    errs.push(
      `L${block.startLine}: mermaid block doesn't start with a recognized diagram type (got "${firstWord}"). Expected one of: ${MERMAID_DIAGRAMS.slice(0, 8).join(', ')}, …`
    );
  }
  // Balance braces/brackets/parens (rough check, ignores those inside strings)
  const stripped = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  for (const [open, close, name] of [['{', '}', 'curly braces'], ['[', ']', 'square brackets'], ['(', ')', 'parentheses']] as const) {
    const o = (stripped.match(new RegExp('\\' + open, 'g')) || []).length;
    const c = (stripped.match(new RegExp('\\' + close, 'g')) || []).length;
    if (o !== c) {
      errs.push(`L${block.startLine}: mermaid block has unbalanced ${name} (${o} open, ${c} close)`);
    }
  }
  return errs;
}

function lintMarkmap(block: Block): string[] {
  const errs: string[] = [];
  const hasHeading = block.body.split(/\r?\n/).some(l => /^#{1,6}\s/.test(l.trim()));
  const hasList = block.body.split(/\r?\n/).some(l => /^\s*[-*+]\s/.test(l));
  if (!hasHeading && !hasList) {
    errs.push(
      `L${block.startLine}: markmap block has no headings or list items — markmap needs at least one to render`
    );
  }
  return errs;
}

function lintTables(md: string): string[] {
  const errs: string[] = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) { inFence = !inFence; i++; continue; }
    if (inFence) { i++; continue; }

    // Detect a table: pipe row followed by a separator row
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length) {
      const sep = lines[i + 1];
      if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(sep)) {
        // Count columns in header
        const headerCols = line.trim().replace(/^\||\|$/g, '').split('|').length;
        let row = i + 2;
        while (row < lines.length && /^\s*\|.*\|\s*$/.test(lines[row])) {
          const cols = lines[row].trim().replace(/^\||\|$/g, '').split('|').length;
          if (cols !== headerCols) {
            errs.push(
              `L${row + 1}: table row has ${cols} columns but header has ${headerCols}`
            );
          }
          row++;
        }
        i = row;
        continue;
      }
    }
    i++;
  }
  return errs;
}

export function lintMarkdown(md: string): string[] {
  const errors: string[] = [];

  // 1. Fence balance
  const { blocks, unbalancedAt } = extractBlocks(md);
  if (unbalancedAt !== null) {
    errors.push(`L${unbalancedAt}: unclosed fenced code block (missing closing \`\`\`)`);
  }

  // 2. Per-block checks
  for (const block of blocks) {
    if (block.lang === 'mermaid') {
      errors.push(...lintMermaid(block));
    } else if (block.lang === 'markmap' || block.lang === 'mindmap') {
      errors.push(...lintMarkmap(block));
    }
  }

  // 3. Table column consistency
  errors.push(...lintTables(md));

  return errors;
}
