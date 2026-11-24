interface Column {
  getWidth(): number;
  isVisible(): boolean;
  setWidth(width: number): void;
}

/** Fill spare space once, preserving earlier column widths and never shrinking columns. */
export function fillInitialTableWidth(host: HTMLElement, columns: Column[]): void {
  const visible = columns.filter(column => column.isVisible());
  const last = visible[visible.length - 1];
  if (!last) return;
  const remaining = host.clientWidth - visible.reduce((sum, column) => sum + column.getWidth(), 0);
  if (remaining > 0) last.setWidth(last.getWidth() + remaining);
}
