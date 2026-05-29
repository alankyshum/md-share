import { describe, it, expect } from 'vitest';
import { parseMermaidGantt } from './gantt.js';

describe('gantt parser unit tests', () => {
  it('Task : a1, 2026-01-01, 10m -> end = 2026-01-01 00:10', () => {
    const res = parseMermaidGantt(`gantt
title T
dateFormat YYYY-MM-DD
Task : a1, 2026-01-01, 10m`);
    expect(res.ok).toBe(true);
    expect(res.tasks[0].end).toBe('2026-01-01 00:10:00');
  });

  it('Task : a1, 2026-01-01, 2mo -> end = 2026-03-01', () => {
    const res = parseMermaidGantt(`gantt
title T
dateFormat YYYY-MM-DD
Task : a1, 2026-01-01, 2mo`);
    expect(res.ok).toBe(true);
    expect(res.tasks[0].end).toBe('2026-03-01');
  });

  it('Task : a1, 2026-01-01, 30min -> end = 2026-01-01 00:30', () => {
    const res = parseMermaidGantt(`gantt
title T
dateFormat YYYY-MM-DD
Task : a1, 2026-01-01, 30min`);
    expect(res.ok).toBe(true);
    expect(res.tasks[0].end).toBe('2026-01-01 00:30:00');
  });

  it('Task : a1, 2026-01-01 17:20, 50m -> end = 2026-01-01 18:10', () => {
    const res = parseMermaidGantt(`gantt
title T
dateFormat YYYY-MM-DD
Task : a1, 2026-01-01 17:20, 50m`);
    expect(res.ok).toBe(true);
    expect(res.tasks[0].start).toBe('2026-01-01 17:20:00');
    expect(res.tasks[0].end).toBe('2026-01-01 18:10:00');
  });

  it('Task : a1, 2026-01-01, 1h -> end = 2026-01-01 01:00', () => {
    const res = parseMermaidGantt(`gantt
title T
dateFormat YYYY-MM-DD
Task : a1, 2026-01-01, 1h`);
    expect(res.ok).toBe(true);
    expect(res.tasks[0].end).toBe('2026-01-01 01:00:00');
  });
});
