import { describe, it, expect } from 'vitest';
import { smokeTestRender } from '../src/lint/render-smoke.js';

// Regression tests for the two bugs that escaped publication of share
// 34e79b8979fc (2026-05-29). Both should now fail the smoke test BEFORE
// upload, not after sharing to readers.

describe('smokeTestRender', () => {
  it('passes a clean document with no diagrams', async () => {
    const md = '# Hello\n\nJust prose, no diagrams.\n';
    const errs = await smokeTestRender(md);
    expect(errs).toEqual([]);
  });

  it('passes a well-formed mermaid flowchart', async () => {
    const md = [
      '```mermaid',
      'flowchart LR',
      '    A["Old frame"] --> B{"PACELC reframe"}',
      '    B --> C["New frame: P? then C|A; Else? then L|C"]',
      '```',
    ].join('\n');
    const errs = await smokeTestRender(md);
    expect(errs).toEqual([]);
  });

  // ------- Regression: Error 2 (real-world) -------
  // The published share had:
  //   C[New frame:<br/>P? then C|A<br/>Else? then L|C]
  // The bare `|` inside unquoted `[...]` triggers mermaid Jison:
  //   "Parse error on line 3: ... got 'PIPE'"
  it('catches bare pipe inside unquoted flowchart node label', async () => {
    const md = [
      '```mermaid',
      'flowchart LR',
      '    A[Old frame] --> B{PACELC reframe}',
      '    B --> C[New frame:<br/>P? then C|A<br/>Else? then L|C]',
      '```',
    ].join('\n');
    const errs = await smokeTestRender(md);
    expect(errs).toHaveLength(1);
    expect(errs[0].kind).toBe('mermaid');
    // extract.ts reports the 1-indexed line of the OPENING fence (not body).
    expect(errs[0].startLine).toBe(1);
    expect(errs[0].message.toLowerCase()).toMatch(/parse|pipe|syntax/);
  });

  // ------- Regression: Error 1 (real-world) -------
  // The published share had a mermaid `mindmap` block. The viewer's auto-
  // upgrade pipeline pushed it through markmap, which threw the SVGLength
  // NotSupportedError at render time. After the markmaps.ts renderer fix
  // (explicit numeric width/height), this content renders cleanly — and the
  // smoke test verifies that by actually mounting Markmap in jsdom with the
  // SAME absolute-dim contract the renderer uses.
  it('passes a well-formed mermaid mindmap (post-fix)', async () => {
    const md = [
      '```mermaid',
      'mindmap',
      '  root((Consistency for<br/>Collaborative Storage))',
      '    Models',
      '      Linearizable',
      '      Causal',
      '    Mechanisms',
      '      Quorum/Raft',
      '      CRDTs',
      '```',
    ].join('\n');
    const errs = await smokeTestRender(md);
    expect(errs).toEqual([]);
  });

  it('passes an explicit ```markmap fence', async () => {
    const md = [
      '```markmap',
      '# Root',
      '## Branch A',
      '- Leaf 1',
      '## Branch B',
      '- Leaf 2',
      '```',
    ].join('\n');
    const errs = await smokeTestRender(md);
    expect(errs).toEqual([]);
  });

  it('reports the correct startLine when the bad block is not the first', async () => {
    const md = [
      '# Intro',
      '',
      'Prose here.',
      '',
      '```mermaid',
      'flowchart LR',
      '    A --> B',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      '    X[bad|label] --> Y',
      '```',
    ].join('\n');
    const errs = await smokeTestRender(md);
    expect(errs).toHaveLength(1);
    // 2nd block's OPENING fence is on line 10 (1-indexed).
    expect(errs[0].startLine).toBe(10);
  });
});
