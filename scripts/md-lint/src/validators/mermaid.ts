import type { FenceValidator } from '../types.js';

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

export const mermaidValidator: FenceValidator = {
  lang: 'mermaid',
  validate(body, { startLine }) {
    const errs: string[] = [];
    const trimmed = body.replace(/^\s*\n+/, '');
    if (!trimmed.trim()) {
      errs.push(`L${startLine}: mermaid block is empty`);
      return errs;
    }
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    if (firstLine.startsWith('%%') || firstLine.startsWith('---')) return errs;
    const firstWord = firstLine.split(/[\s(]/)[0];
    const matched = MERMAID_DIAGRAMS.some(d =>
      firstWord === d || firstLine.startsWith(d + ' ') || firstLine === d
    );
    if (!matched) {
      errs.push(
        `L${startLine}: mermaid block doesn't start with a recognized diagram type (got "${firstWord}"). Expected one of: ${MERMAID_DIAGRAMS.slice(0, 8).join(', ')}, …`
      );
    }
    const stripped = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
    for (const [open, close, name] of [['{', '}', 'curly braces'], ['[', ']', 'square brackets'], ['(', ')', 'parentheses']] as const) {
      const o = (stripped.match(new RegExp('\\' + open, 'g')) || []).length;
      const c = (stripped.match(new RegExp('\\' + close, 'g')) || []).length;
      if (o !== c) {
        errs.push(`L${startLine}: mermaid block has unbalanced ${name} (${o} open, ${c} close)`);
      }
    }
    return errs;
  }
};
