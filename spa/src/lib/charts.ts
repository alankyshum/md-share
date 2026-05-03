// Chart.js renderer.
// Replaces:
//   - mermaid `pie` blocks → Chart.js doughnut (interactive: hover tooltips, legend toggle, click)
//   - mermaid `xychart-beta` blocks → Chart.js line/bar
//   - new ```chart fence → arbitrary Chart.js JSON config

import {
  Chart,
  PieController, DoughnutController, BarController, LineController,
  ArcElement, BarElement, PointElement, LineElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend,
  Colors,
} from 'chart.js';

Chart.register(
  PieController, DoughnutController, BarController, LineController,
  ArcElement, BarElement, PointElement, LineElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend, Colors
);

interface ChartContext {
  dark: boolean;
}

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#d946ef',
];

function applyTheme(ctx: ChartContext) {
  Chart.defaults.color = ctx.dark ? '#e6edf3' : '#1f2328';
  Chart.defaults.borderColor = ctx.dark ? '#30363d' : '#d0d7de';
  Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
}

function makeWrapper(title?: string): { wrapper: HTMLElement; canvas: HTMLCanvasElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-host';
  if (title) {
    const h = document.createElement('div');
    h.className = 'chart-title';
    h.textContent = title;
    wrapper.appendChild(h);
  }
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'chart-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvasWrap.appendChild(canvas);
  wrapper.appendChild(canvasWrap);
  return { wrapper, canvas };
}

// ─── Mermaid pie parser ─────────────────────────────────────────────────────
// Syntax:
//   pie [showData] title <text>
//     "Label A" : 30
//     "Label B" : 70
function parseMermaidPie(source: string): { title?: string; labels: string[]; values: number[]; showData: boolean } | null {
  const lines = source.split(/\r?\n/);
  let title: string | undefined;
  let showData = false;
  const labels: string[] = [];
  const values: number[] = [];
  let sawPie = false;

  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trim();
    if (!line) continue;
    if (/^pie\b/i.test(line)) {
      sawPie = true;
      const rest = line.replace(/^pie\b/i, '').trim();
      if (/showData/i.test(rest)) showData = true;
      const tm = rest.match(/title\s+(.+)$/i);
      if (tm) title = tm[1].trim();
      continue;
    }
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim();
      continue;
    }
    if (/^showData/i.test(line)) { showData = true; continue; }
    // Slice: "Label" : value
    const m = line.match(/^"([^"]*)"\s*:\s*([\d.]+)\s*$/);
    if (m) {
      labels.push(m[1]);
      values.push(parseFloat(m[2]));
    }
  }
  if (!sawPie || labels.length === 0) return null;
  return { title, labels, values, showData };
}

// ─── Mermaid xychart parser ─────────────────────────────────────────────────
// Syntax (simplified subset):
//   xychart-beta [horizontal]
//     title "Sales"
//     x-axis [Jan, Feb, Mar, …]   OR   x-axis "label" 0 --> 100
//     y-axis "label" [min --> max]
//     bar [v1, v2, v3, …]
//     line [v1, v2, v3, …]
function parseMermaidXyChart(source: string): {
  title?: string;
  horizontal: boolean;
  xCategories: string[] | null;
  xLabel?: string;
  yLabel?: string;
  series: { type: 'bar' | 'line'; data: number[] }[];
} | null {
  const lines = source.split(/\r?\n/);
  let sawHeader = false;
  let title: string | undefined;
  let horizontal = false;
  let xCategories: string[] | null = null;
  let xLabel: string | undefined;
  let yLabel: string | undefined;
  const series: { type: 'bar' | 'line'; data: number[] }[] = [];

  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trim();
    if (!line) continue;
    if (/^xychart-beta\b/i.test(line)) {
      sawHeader = true;
      if (/horizontal/i.test(line)) horizontal = true;
      continue;
    }
    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim().replace(/^"(.*)"$/, '$1');
      continue;
    }
    const xCat = line.match(/^x-axis\s+\[([^\]]+)\]/i);
    if (xCat) {
      xCategories = xCat[1].split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
      continue;
    }
    const xLab = line.match(/^x-axis\s+"([^"]+)"/i);
    if (xLab) { xLabel = xLab[1]; continue; }
    const yLab = line.match(/^y-axis\s+"([^"]+)"/i);
    if (yLab) { yLabel = yLab[1]; continue; }
    const bar = line.match(/^bar\s+\[([^\]]+)\]/i);
    if (bar) {
      series.push({ type: 'bar', data: bar[1].split(',').map(v => parseFloat(v.trim())) });
      continue;
    }
    const ln = line.match(/^line\s+\[([^\]]+)\]/i);
    if (ln) {
      series.push({ type: 'line', data: ln[1].split(',').map(v => parseFloat(v.trim())) });
      continue;
    }
  }
  if (!sawHeader || series.length === 0) return null;
  // Generate categories if missing
  if (!xCategories) {
    const n = Math.max(...series.map(s => s.data.length));
    xCategories = Array.from({ length: n }, (_, i) => String(i + 1));
  }
  return { title, horizontal, xCategories, xLabel, yLabel, series };
}

// ─── Renderers ──────────────────────────────────────────────────────────────
function renderPie(parsed: ReturnType<typeof parseMermaidPie>, container: HTMLElement, ctx: ChartContext) {
  if (!parsed) return false;
  const { wrapper, canvas } = makeWrapper(parsed.title);
  container.replaceWith(wrapper);

  const total = parsed.values.reduce((a, b) => a + b, 0);
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: parsed.labels,
      datasets: [{
        data: parsed.values,
        backgroundColor: parsed.values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderColor: ctx.dark ? '#0d1117' : '#ffffff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label(item) {
              const v = item.parsed as number;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
              return `${item.label}: ${v.toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });
  return true;
}

function renderXyChart(parsed: ReturnType<typeof parseMermaidXyChart>, container: HTMLElement, ctx: ChartContext) {
  if (!parsed) return false;
  const { wrapper, canvas } = makeWrapper(parsed.title);
  container.replaceWith(wrapper);

  const datasets = parsed.series.map((s, i) => ({
    type: s.type as any,
    label: s.type === 'bar' ? `Series ${i + 1}` : `Series ${i + 1}`,
    data: s.data,
    backgroundColor: s.type === 'bar' ? PALETTE[i % PALETTE.length] : 'transparent',
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: 2,
    tension: 0.3,
    fill: false,
    pointRadius: s.type === 'line' ? 4 : 0,
    pointBackgroundColor: PALETTE[i % PALETTE.length],
  }));

  // Pick a primary type for the chart (use first series)
  const primary = parsed.series[0].type;
  new Chart(canvas, {
    type: primary as any,
    data: {
      labels: parsed.xCategories!,
      datasets: datasets as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: parsed.horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: parsed.series.length > 1, position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { title: { display: !!parsed.xLabel, text: parsed.xLabel } },
        y: { title: { display: !!parsed.yLabel, text: parsed.yLabel } },
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    },
  });
  return true;
}

function renderJsonChart(jsonText: string, container: HTMLElement, ctx: ChartContext): boolean {
  let cfg: any;
  try {
    cfg = JSON.parse(jsonText);
  } catch (e) {
    container.innerHTML = `<pre style="color:#c33;padding:8px;">chart JSON parse error: ${(e as Error).message}</pre>`;
    return false;
  }
  if (!cfg || typeof cfg !== 'object' || !cfg.type) {
    container.innerHTML = `<pre style="color:#c33;padding:8px;">chart JSON missing required "type" field</pre>`;
    return false;
  }

  // Auto-color datasets if not specified
  if (cfg.data && Array.isArray(cfg.data.datasets)) {
    cfg.data.datasets.forEach((ds: any, i: number) => {
      if (!ds.backgroundColor) {
        ds.backgroundColor = ['pie', 'doughnut', 'polarArea'].includes(cfg.type)
          ? (ds.data || []).map((_: any, j: number) => PALETTE[j % PALETTE.length])
          : PALETTE[i % PALETTE.length];
      }
      if (!ds.borderColor) ds.borderColor = PALETTE[i % PALETTE.length];
    });
  }

  const { wrapper, canvas } = makeWrapper(cfg.options?.plugins?.title?.text);
  container.replaceWith(wrapper);

  cfg.options = {
    responsive: true,
    maintainAspectRatio: false,
    ...cfg.options,
  };

  new Chart(canvas, cfg);
  return true;
}

/** Replace pie/xychart mermaid blocks AND ```chart blocks with Chart.js renderings. */
export function replaceChartBlocks(target: HTMLElement, dark: boolean): number {
  applyTheme({ dark });
  let count = 0;

  // 1. Mermaid pie blocks
  target.querySelectorAll<HTMLElement>('div.mermaid').forEach(block => {
    const text = block.textContent || '';
    if (/^\s*(?:%%[^\n]*\n\s*)*pie\b/i.test(text)) {
      const parsed = parseMermaidPie(text);
      if (parsed && renderPie(parsed, block, { dark })) count++;
    } else if (/^\s*(?:%%[^\n]*\n\s*)*xychart-beta\b/i.test(text)) {
      const parsed = parseMermaidXyChart(text);
      if (parsed && renderXyChart(parsed, block, { dark })) count++;
    }
  });

  // 2. ```chart fenced JSON blocks (emitted by render.ts as <div class="chart-json">)
  target.querySelectorAll<HTMLElement>('div.chart-json').forEach(block => {
    const json = decodeURIComponent(block.getAttribute('data-source') || '');
    if (renderJsonChart(json, block, { dark })) count++;
  });

  return count;
}
