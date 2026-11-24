interface Column {
  getDefinition(): { width?: number | string };
  getWidth(): number;
  isVisible(): boolean;
  setWidth(width: number): void;
}

/** Fill spare space once, without overriding previously persisted column widths. */
export function fillInitialTableWidth(host: HTMLElement, columns: Column[]): void {
  if (columns.some(column => column.getDefinition().width != null)) return;
  const visible = columns.filter(column => column.isVisible());
  const last = visible[visible.length - 1];
  if (!last) return;
  const remaining = host.clientWidth - visible.reduce((sum, column) => sum + column.getWidth(), 0);
  if (remaining > 0) last.setWidth(last.getWidth() + remaining);
}
