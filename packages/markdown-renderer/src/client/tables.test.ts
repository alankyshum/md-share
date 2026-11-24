import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillInitialTableWidth, observeTableWidth } from './table-layout.js';

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

describe('later host width changes', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(width: number, connected = true) {
    let resize!: () => void;
    let mutate!: (records: MutationRecord[]) => void;
    const stopResize = vi.fn();
    const stopRemoval = vi.fn();
    const observeResize = vi.fn();
    const observeRemoval = vi.fn();
    let frameId = 0;
    const frames = new Map<number, () => void>();
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe = observeResize;
      disconnect = stopResize;
    });
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: (records: MutationRecord[]) => void) { mutate = callback; }
      observe = observeRemoval;
      disconnect = stopRemoval;
    });
    const host = { clientWidth: width, isConnected: connected, ownerDocument: {} };
    const first = column(150, true);
    let lastWidth = 210;
    const last = {
      isVisible: () => true,
      getWidth: () => lastWidth,
      setWidth: vi.fn((next: number) => { lastWidth = next; }),
    };
    const cleanup = observeTableWidth(host as unknown as HTMLElement, () => [first, last]);
    return { host, first, last, resize: () => resize(), mutate: (records: MutationRecord[] = []) => mutate(records), cleanup, stopResize, stopRemoval, observeResize, observeRemoval, frames,
      flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); } };
  }

  it('fills only the last column after a delayed growth without repeated growth or shrinkage', () => {
    const t = setup(360);
    t.resize(); // Initial delivery / height-only resize must not fight manual widths.
    expect(t.last.setWidth).not.toHaveBeenCalled();
    t.host.clientWidth = 818;
    t.resize();
    expect(t.last.setWidth).not.toHaveBeenCalled();
    t.flush();
    expect(t.last.setWidth).toHaveBeenCalledOnce();
    expect(t.last.setWidth).toHaveBeenCalledWith(668);
    expect(t.first.setWidth).not.toHaveBeenCalled();
    t.resize();
    t.host.clientWidth = 320;
    t.resize();
    t.host.clientWidth = 818;
    t.resize();
    t.flush();
    expect(t.last.setWidth).toHaveBeenCalledOnce();
  });

  it('cancels a pending growth when the host shrinks before the frame', () => {
    const t = setup(360);
    t.host.clientWidth = 818;
    t.resize();
    t.host.clientWidth = 320;
    t.resize();
    t.flush();
    expect(t.last.setWidth).not.toHaveBeenCalled();
  });

  it('leaves a manually narrowed column alone on height-only notifications', () => {
    const t = setup(360);
    t.last.setWidth(100);
    t.last.setWidth.mockClear();
    t.resize();
    t.flush();
    expect(t.last.setWidth).not.toHaveBeenCalled();
  });

  it('fills when a hidden table first becomes visible', () => {
    const t = setup(0);
    t.host.clientWidth = 800;
    t.resize();
    t.flush();
    expect(t.last.setWidth).toHaveBeenCalledWith(650);
  });

  it('disconnects both observers on removal or explicit destruction', () => {
    const removed = setup(0);
    expect(removed.observeResize).toHaveBeenCalledWith(removed.host);
    expect(removed.observeRemoval).toHaveBeenCalledWith(removed.host.ownerDocument, { childList: true, subtree: true });
    removed.host.isConnected = false;
    removed.mutate();
    expect(removed.stopResize).toHaveBeenCalledOnce();
    expect(removed.stopRemoval).toHaveBeenCalledOnce();

    const brieflyAttached = setup(0, false);
    brieflyAttached.mutate([{ addedNodes: [brieflyAttached.host] } as unknown as MutationRecord]);
    expect(brieflyAttached.stopResize).toHaveBeenCalledOnce();
    expect(brieflyAttached.stopRemoval).toHaveBeenCalledOnce();

    const destroyed = setup(800);
    destroyed.host.clientWidth = 900;
    destroyed.resize();
    const staleCallback = [...destroyed.frames.values()][0];
    destroyed.cleanup();
    destroyed.cleanup();
    destroyed.flush();
    staleCallback(); // Even an already-queued callback cannot act after destruction.
    expect(destroyed.last.setWidth).not.toHaveBeenCalled();
    expect(destroyed.stopResize).toHaveBeenCalledOnce();
    expect(destroyed.stopRemoval).toHaveBeenCalledOnce();
  });
});
