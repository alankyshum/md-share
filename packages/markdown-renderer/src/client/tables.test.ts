import { describe, expect, it, vi } from 'vitest';
import { fillInitialTableWidth } from './table-layout.js';

function column(width: number, saved = false, visible = true) {
  return {
    getDefinition: () => saved ? { width } : {},
    getWidth: () => width,
    isVisible: () => visible,
    setWidth: vi.fn(),
  };
}

describe('initial table width', () => {
  const host = { clientWidth: 800 } as HTMLElement;

  it('fills only the unused space in the last visible column', () => {
    const first = column(200);
    const last = column(250);
    const hidden = column(100, false, false);
    fillInitialTableWidth(host, [first, last, hidden]);
    expect(first.setWidth).not.toHaveBeenCalled();
    expect(last.setWidth).toHaveBeenCalledWith(600);
    expect(hidden.setWidth).not.toHaveBeenCalled();
  });

  it('fills spare space after restoring persisted widths, preserving earlier columns', () => {
    const saved = column(200, true);
    const other = column(250, true);
    const hidden = column(100, true, false);
    fillInitialTableWidth(host, [saved, other, hidden]);
    expect(saved.setWidth).not.toHaveBeenCalled();
    expect(other.setWidth).toHaveBeenCalledWith(600);
    expect(hidden.setWidth).not.toHaveBeenCalled();
  });

  it('does not shrink persisted columns that already fill or overflow the host', () => {
    const saved = column(200, true);
    const other = column(600, true);
    fillInitialTableWidth(host, [saved, other]);
    expect(saved.setWidth).not.toHaveBeenCalled();
    expect(other.setWidth).not.toHaveBeenCalled();

    const overflow = column(650, true);
    fillInitialTableWidth(host, [saved, overflow]);
    expect(saved.setWidth).not.toHaveBeenCalled();
    expect(overflow.setWidth).not.toHaveBeenCalled();
    fillInitialTableWidth(host, []);
  });
});
