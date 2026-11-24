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

  it('preserves persisted widths and does not shrink overflowing columns', () => {
    const saved = column(200, true);
    const other = column(250);
    fillInitialTableWidth(host, [saved, other]);
    expect(other.setWidth).not.toHaveBeenCalled();
    const wide = column(850);
    fillInitialTableWidth(host, [wide]);
    expect(wide.setWidth).not.toHaveBeenCalled();
    fillInitialTableWidth(host, []);
  });
});
