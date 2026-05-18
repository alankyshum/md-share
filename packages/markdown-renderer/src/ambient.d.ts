// Ambient declarations for untyped peer deps.
// These libraries have JS-only distributions; we use minimal shapes here.
declare module 'frappe-gantt' {
  export interface Task { id: string; name: string; start: string; end: string; progress?: number; dependencies?: string; custom_class?: string; }
  export type ViewMode = 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month';
  export interface GanttOptions {
    view_mode?: ViewMode;
    bar_height?: number;
    bar_corner_radius?: number;
    padding?: number;
    [key: string]: unknown;
  }
  export default class Gantt {
    constructor(wrapper: HTMLElement | string | SVGElement, tasks: Task[], options?: GanttOptions);
    change_view_mode(mode: ViewMode): void;
    refresh(tasks: Task[]): void;
  }
}

declare module 'tabulator-tables' {
  export interface TabulatorOptions {
    [key: string]: unknown;
  }
  export class Tabulator {
    constructor(el: HTMLElement | string, options?: TabulatorOptions);
    destroy(): void;
    redraw(force?: boolean): void;
  }
  export class TabulatorFull extends Tabulator {}
}
