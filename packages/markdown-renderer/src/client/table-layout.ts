interface Column {
  getWidth(): number;
  isVisible(): boolean;
  setWidth(width: number): void;
}

/** Fill spare space, preserving earlier column widths and never shrinking columns. */
export function fillInitialTableWidth(host: HTMLElement, columns: Column[]): void {
  const visible = columns.filter(column => column.isVisible());
  const last = visible[visible.length - 1];
  if (!last) return;
  const remaining = host.clientWidth - visible.reduce((sum, column) => sum + column.getWidth(), 0);
  if (remaining > 0) last.setWidth(last.getWidth() + remaining);
}

/** Refill only when the host grows, not when a user resizes a column. */
export function observeTableWidth(host: HTMLElement, getColumns: () => Column[]): () => void {
  let width = host.clientWidth;
  let wasConnected = host.isConnected;
  let frame: number | undefined;
  let disposed = false;
  const resizeObserver = new ResizeObserver(() => {
    if (disposed) return;
    const nextWidth = host.clientWidth;
    if (nextWidth !== width && frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    if (nextWidth > width) {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (!disposed && host.isConnected) fillInitialTableWidth(host, getColumns());
      });
    }
    width = nextWidth;
  });
  // The viewer can replace its HTML without calling Tabulator.destroy().
  const removalObserver = new MutationObserver(records => {
    if (host.isConnected || records.some(record =>
      Array.from(record.addedNodes).some(node => node === host || node.contains(host))
    )) wasConnected = true;
    if (wasConnected && !host.isConnected) cleanup();
  });
  function cleanup() {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    removalObserver.disconnect();
  }
  resizeObserver.observe(host);
  removalObserver.observe(host.ownerDocument, { childList: true, subtree: true });
  return cleanup;
}
