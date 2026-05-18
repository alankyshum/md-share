/// <reference path="../ambient.d.ts" />
// Parse mermaid gantt syntax → frappe-gantt task array, then render.
//
// Supported mermaid gantt features:
//   gantt
//   title <text>
//   dateFormat YYYY-MM-DD
//   axisFormat <fmt>          (ignored — frappe-gantt picks one)
//   excludes weekends         (passed through as ignore)
//   section <name>
//   Task name : [status,] [id,] (date | after id1 id2…), (duration | endDate)
// Statuses: done | active | crit | milestone (any combination)
// Durations: 1y | 1m | 1d | 1h | 30min | 30s

import Gantt from 'frappe-gantt';
// frappe-gantt's package.json doesn't expose CSS in `exports`, so we keep a local copy
import './frappe-gantt.css';

interface ParsedTask {
  id: string;
  name: string;
  start: string;       // YYYY-MM-DD
  end: string;         // YYYY-MM-DD
  progress: number;
  dependencies: string;
  custom_class?: string;
  section?: string;
}

interface ParsedGantt {
  title?: string;
  dateFormat: string;
  tasks: ParsedTask[];
  excludes?: string[];
  ok: boolean;
  error?: string;
}

const STATUS_WORDS = new Set(['done', 'active', 'crit', 'critical', 'milestone']);
const DUR_RE = /^(\d+)\s*(y|mo|m|w|d|h|min|s|ms)$/i;
const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

function parseDate(s: string, fmt: string): Date | null {
  // Currently only supports YYYY-MM-DD (default) and a few obvious variants.
  s = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    // assume MM/DD/YYYY
    const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDuration(start: Date, raw: string): Date | null {
  const m = raw.trim().match(DUR_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const out = new Date(start.getTime());
  switch (unit) {
    case 'y': out.setUTCFullYear(out.getUTCFullYear() + n); break;
    case 'mo': out.setUTCMonth(out.getUTCMonth() + n); break;
    case 'm': // mermaid "m" in duration means "minute" only when paired with something explicitly,
              // but in practice "1m" is ambiguous — gantt uses "m" for month. We'll treat "m" as month.
      out.setUTCMonth(out.getUTCMonth() + n); break;
    case 'w': out.setUTCDate(out.getUTCDate() + n * 7); break;
    case 'd': out.setUTCDate(out.getUTCDate() + n); break;
    case 'h': out.setUTCHours(out.getUTCHours() + n); break;
    case 'min': out.setUTCMinutes(out.getUTCMinutes() + n); break;
    case 's': out.setUTCSeconds(out.getUTCSeconds() + n); break;
    case 'ms': out.setUTCMilliseconds(out.getUTCMilliseconds() + n); break;
    default: return null;
  }
  return out;
}

/** Parse a single task line (right of "TaskName :"). Returns parsed task or null. */
function parseTaskFields(
  taskName: string,
  fieldsRaw: string,
  ctx: { byId: Map<string, ParsedTask>; lastEnd: Date | null; dateFormat: string; section?: string; autoIdx: number }
): ParsedTask | null {
  const fields = fieldsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (fields.length === 0) return null;

  const statuses: string[] = [];
  let id: string | null = null;
  let startSpec: string | null = null;
  let endSpec: string | null = null;

  let i = 0;
  // Consume leading statuses
  while (i < fields.length && STATUS_WORDS.has(fields[i].toLowerCase())) {
    statuses.push(fields[i].toLowerCase());
    i++;
  }
  // Possibly id (next field that doesn't look like a date, duration, or "after …")
  if (i < fields.length) {
    const f = fields[i];
    const isDate = DATE_RE.test(f);
    const isDur = DUR_RE.test(f);
    const isAfter = /^after\b/i.test(f);
    // If we have at least 2 fields remaining, the first is likely the id
    if (!isDate && !isDur && !isAfter && (fields.length - i) >= 2) {
      id = f;
      i++;
    }
  }
  // Start
  if (i < fields.length) {
    startSpec = fields[i];
    i++;
  }
  // End
  if (i < fields.length) {
    endSpec = fields[i];
    i++;
  }

  // Resolve start
  let startDate: Date | null = null;
  if (startSpec) {
    if (/^after\b/i.test(startSpec)) {
      const deps = startSpec.replace(/^after\s+/i, '').split(/\s+/);
      let latest: Date | null = null;
      for (const dep of deps) {
        const t = ctx.byId.get(dep);
        if (t) {
          const e = parseDate(t.end, ctx.dateFormat);
          if (e && (!latest || e > latest)) latest = e;
        }
      }
      startDate = latest;
    } else {
      startDate = parseDate(startSpec, ctx.dateFormat);
      if (!startDate) {
        // Maybe startSpec is actually a duration and start is implicit (after lastEnd)
        if (DUR_RE.test(startSpec)) {
          endSpec = startSpec;
          startSpec = null;
          startDate = ctx.lastEnd;
        }
      }
    }
  }
  if (!startDate) startDate = ctx.lastEnd;
  if (!startDate) {
    // Final fallback: today
    startDate = new Date();
  }

  // Resolve end
  let endDate: Date | null = null;
  if (endSpec) {
    if (DUR_RE.test(endSpec)) {
      endDate = addDuration(startDate, endSpec);
    } else {
      endDate = parseDate(endSpec, ctx.dateFormat);
    }
  }
  if (!endDate) {
    // Default 1-day duration
    endDate = new Date(startDate.getTime() + 86_400_000);
  }

  const finalId = id || `task_${++ctx.autoIdx}`;
  const isDone = statuses.includes('done');
  const isCrit = statuses.includes('crit') || statuses.includes('critical');
  const isMilestone = statuses.includes('milestone');

  // frappe-gantt's `custom_class` only accepts a SINGLE CSS class token (calls
  // classList.add() on it, which throws on space-separated strings).
  // We pick the highest-priority status; section-based styling is handled separately.
  const primaryClass = isCrit
    ? 'gantt-crit'
    : isMilestone
      ? 'gantt-milestone'
      : isDone
        ? 'gantt-done'
        : '';

  const task: ParsedTask = {
    id: finalId,
    name: taskName.trim(),
    start: fmtDate(startDate),
    end: fmtDate(endDate),
    progress: isDone ? 100 : (statuses.includes('active') ? 50 : 0),
    dependencies: startSpec && /^after\b/i.test(startSpec)
      ? startSpec.replace(/^after\s+/i, '').split(/\s+/).join(', ')
      : '',
    custom_class: primaryClass,
    section: ctx.section,
  };

  ctx.byId.set(finalId, task);
  ctx.lastEnd = endDate;
  return task;
}

export function parseMermaidGantt(source: string): ParsedGantt {
  const result: ParsedGantt = {
    dateFormat: 'YYYY-MM-DD',
    tasks: [],
    ok: false,
  };
  const lines = source.split(/\r?\n/);

  let sawGantt = false;
  let currentSection: string | undefined;
  const ctx = {
    byId: new Map<string, ParsedTask>(),
    lastEnd: null as Date | null,
    dateFormat: 'YYYY-MM-DD',
    section: undefined as string | undefined,
    autoIdx: 0,
  };

  try {
    for (const raw of lines) {
      const line = raw.replace(/%%.*$/, '').trim();
      if (!line) continue;
      if (/^gantt\b/i.test(line)) { sawGantt = true; continue; }
      if (/^title\s+/i.test(line)) {
        result.title = line.replace(/^title\s+/i, '').trim();
        continue;
      }
      if (/^dateFormat\s+/i.test(line)) {
        result.dateFormat = line.replace(/^dateFormat\s+/i, '').trim();
        ctx.dateFormat = result.dateFormat;
        continue;
      }
      if (/^axisFormat\s+/i.test(line)) continue;
      if (/^excludes\s+/i.test(line)) {
        result.excludes = line.replace(/^excludes\s+/i, '').split(/[,\s]+/).filter(Boolean);
        continue;
      }
      if (/^section\s+/i.test(line)) {
        currentSection = line.replace(/^section\s+/i, '').trim();
        ctx.section = currentSection;
        continue;
      }
      // Task line: "TaskName : fields"
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const taskName = line.substring(0, colonIdx).trim();
        const fields = line.substring(colonIdx + 1).trim();
        const task = parseTaskFields(taskName, fields, ctx);
        if (task) result.tasks.push(task);
      }
    }
    if (!sawGantt) {
      result.error = 'not a gantt block (missing "gantt" keyword)';
      return result;
    }
    if (result.tasks.length === 0) {
      result.error = 'no tasks found';
      return result;
    }
    result.ok = true;
    return result;
  } catch (e) {
    result.error = (e as Error).message;
    return result;
  }
}

/** Render parsed gantt into target div. Returns true on success. */
export function renderGantt(
  parsed: ParsedGantt,
  container: HTMLElement,
  opts: { dark?: boolean } = {}
): boolean {
  if (!parsed.ok) return false;
  // Clear container, build inner structure
  container.innerHTML = '';
  if (parsed.title) {
    const h = document.createElement('div');
    h.className = 'gantt-title';
    h.textContent = parsed.title;
    container.appendChild(h);
  }
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'gantt-toolbar';
  const modes = ['Hour', 'Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'] as const;
  let currentMode: typeof modes[number] = parsed.tasks.length > 30 ? 'Week' : 'Day';

  const modeBtns = modes.map(mode => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gantt-mode-btn';
    btn.textContent = mode;
    btn.dataset.mode = mode;
    btn.addEventListener('click', () => {
      currentMode = mode;
      gantt.change_view_mode(mode as any);
      modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    });
    toolbar.appendChild(btn);
    return btn;
  });
  container.appendChild(toolbar);

  const target = document.createElement('div');
  target.className = 'gantt-target';
  container.appendChild(target);

  const gantt = new (Gantt as any)(target, parsed.tasks, {
    view_mode: currentMode,
    bar_height: 24,
    bar_corner_radius: 4,
    padding: 18,
    arrow_curve: 5,
    popup_on: 'click',
    readonly: true,
  });
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
  return true;
}

/** Walk through rendered DOM, find mermaid blocks where source starts with "gantt",
 *  and replace them with frappe-gantt renders. Run BEFORE mermaid.run(). */
export function replaceGanttBlocks(target: HTMLElement, dark: boolean): number {
  const blocks = target.querySelectorAll<HTMLElement>('div.mermaid');
  let replaced = 0;
  blocks.forEach(block => {
    const source = block.textContent || '';
    if (!/^\s*(?:%%[^\n]*\n\s*)*gantt\b/i.test(source)) return;
    const parsed = parseMermaidGantt(source);
    if (!parsed.ok) {
      // Leave for mermaid to handle (it'll show its own error)
      return;
    }
    // Swap to a frappe-gantt container
    const host = document.createElement('div');
    host.className = 'frappe-gantt-host';
    block.replaceWith(host);
    if (!renderGantt(parsed, host, { dark })) {
      // If render fails for some reason, restore original block
      host.replaceWith(block);
    } else {
      replaced++;
    }
  });
  return replaced;
}
