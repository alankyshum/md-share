// Enhance markdown-rendered <table> elements with Tabulator:
// auto column type detection, sort, search, filter, hide columns,
// drag-reorder columns, persistence (per-table localStorage).
//
// Cells preserve inline HTML (links, code, bold/italic) — extracted via
// innerHTML. Sorting/filtering use the textContent so they ignore markup.

import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';

type ColType = 'currency' | 'number' | 'percent' | 'date' | 'boolean' | 'string';

interface InferredCol {
  field: string;
  title: string;
  type: ColType;
  /** True if at least one cell in this column has inline HTML markup
   *  (anchor, code, bold, etc.) that we should render verbatim. */
  hasHtml: boolean;
  // For currency, store the symbol so we can re-format on display
  symbol?: string;
}

interface CellData {
  text: string;   // plain text — used for sort/filter/type detection
  html: string;   // innerHTML — used for display when richer than text
}

const CURRENCY_RE = /^[\s]*([$€£¥₩₹])\s*-?[\d,]+(?:\.\d+)?\s*$|^-?[\d,]+(?:\.\d+)?\s*([$€£¥₩₹])\s*$/;
const NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;
const PERCENT_RE = /^-?[\d,]+(?:\.\d+)?\s*%$/;
const BOOL_RE = /^(yes|no|true|false|y|n|✓|✗|✔|✘)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/** Strip currency/percent symbols and commas; return float (NaN if unparseable). */
export function parseNumeric(raw: string): number {
  if (!raw) return NaN;
  const s = String(raw).replace(/[$€£¥₩₹,\s%]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function detectColumnType(values: string[]): { type: ColType; symbol?: string } {
  const nonEmpty = values.map(v => (v ?? '').trim()).filter(v => v !== '' && v !== '-' && v !== '—');
  if (nonEmpty.length === 0) return { type: 'string' };

  // Currency: any value has a recognized symbol AND every non-empty value is numeric or has the symbol
  let symbol: string | undefined;
  const allCurrency = nonEmpty.every(v => {
    const m = v.match(CURRENCY_RE);
    if (m) {
      symbol = symbol || m[1] || m[2];
      return true;
    }
    return false;
  });
  if (allCurrency && symbol) return { type: 'currency', symbol };

  if (nonEmpty.every(v => PERCENT_RE.test(v))) return { type: 'percent' };
  if (nonEmpty.every(v => NUMBER_RE.test(v))) return { type: 'number' };
  if (nonEmpty.every(v => BOOL_RE.test(v))) return { type: 'boolean' };
  if (nonEmpty.every(v => DATE_RE.test(v) || !isNaN(Date.parse(v)) && /[-\/]/.test(v))) {
    return { type: 'date' };
  }
  return { type: 'string' };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Stable hash for use as localStorage persistenceID. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Decide if HTML markup adds anything beyond what the plain text already shows.
 *  We only want to render HTML when it has meaningful tags (links, code, formatting). */
function htmlIsRicher(html: string, text: string): boolean {
  if (!html) return false;
  // Quick check: if the HTML literally has no tags, it's text-only.
  if (!/<\/?[a-z][^>]*>/i.test(html)) return false;
  // Strip tags and compare with text — if they differ, the markup matters.
  const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const normalText = (text ?? '').replace(/\s+/g, ' ').trim();
  // Even when stripped == text, the HTML still adds visual semantics (e.g. <a> link)
  // — render HTML whenever any tag is present.
  return true;
}

function buildTabulatorColumn(col: InferredCol, idx: number): any {
  // Tabulator v6: when `sorter` is a function, signature is
  //   (a, b, aRow, bRow, column, dir, sorterParams) => number
  const numericSorter = (a: any, b: any) => {
    const an = parseNumeric(a);
    const bn = parseNumeric(b);
    if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
    if (Number.isNaN(an)) return 1;
    if (Number.isNaN(bn)) return -1;
    return an - bn;
  };
  const dateSorter = (a: any, b: any) => {
    const da = Date.parse(a) || 0;
    const db = Date.parse(b) || 0;
    return da - db;
  };

  /** Look up the raw HTML for this cell from the sibling `<field>_html` field.
   *  Returns null if no rich HTML is stored. */
  const cellHtml = (cell: any): string | null => {
    const row = cell.getRow().getData();
    const html = row[`${col.field}_html`];
    return typeof html === 'string' && html.length ? html : null;
  };

  const base: any = {
    title: col.title,
    field: col.field,
    headerFilter: 'input',
    headerFilterPlaceholder: '🔎',
    resizable: true,
    headerMenu: columnHeaderMenu,
    // Cap initial column width so long-text cells wrap instead of growing
    // unbounded; user can still drag-resize past this.
    minWidth: 80,
    maxInitialWidth: col.type === 'string' ? 320 : 200,
    // formatterParams allow any formatter to opt into HTML rendering — we
    // already produce HTML in custom formatters, but for plain string columns
    // without HTML we still need word-wrap to engage at the CSS level.
    variableHeight: true,
  };
  switch (col.type) {
    case 'currency':
      return {
        ...base,
        sorter: numericSorter,
        sorterParams: { alignEmptyValues: 'bottom' },
        hozAlign: 'right',
        formatter: (cell: any) => {
          const html = cellHtml(cell);
          if (html) return html; // preserve any inline links/code in the currency cell
          const v = cell.getValue();
          if (v === '' || v === null || v === undefined) return '';
          const n = parseNumeric(v);
          if (!Number.isFinite(n)) return escapeHtml(String(v));
          return `<span style="font-variant-numeric:tabular-nums;">${escapeHtml(col.symbol ?? '')}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
        },
      };
    case 'percent':
      return {
        ...base,
        sorter: numericSorter,
        hozAlign: 'right',
        formatter: (cell: any) => {
          const html = cellHtml(cell);
          if (html) return html;
          const v = cell.getValue();
          return v === '' || v === null || v === undefined
            ? ''
            : `<span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(v))}</span>`;
        },
      };
    case 'number':
      return {
        ...base,
        sorter: numericSorter,
        hozAlign: 'right',
        formatter: (cell: any) => {
          const html = cellHtml(cell);
          if (html) return html;
          const v = cell.getValue();
          if (v === '' || v === null || v === undefined) return '';
          return `<span style="font-variant-numeric:tabular-nums;">${escapeHtml(String(v))}</span>`;
        },
      };
    case 'boolean':
      return {
        ...base,
        hozAlign: 'center',
        sorter: 'string',
        formatter: (cell: any) => {
          const html = cellHtml(cell);
          if (html) return html;
          const v = String(cell.getValue() || '').toLowerCase();
          if (['yes', 'true', 'y', '✓', '✔'].includes(v)) return '<span style="color:#10b981;">✓</span>';
          if (['no', 'false', 'n', '✗', '✘'].includes(v)) return '<span style="color:#ef4444;">✗</span>';
          return escapeHtml(String(cell.getValue() ?? ''));
        },
      };
    case 'date':
      return {
        ...base,
        sorter: dateSorter,
        formatter: (cell: any) => cellHtml(cell) ?? escapeHtml(String(cell.getValue() ?? '')),
      };
    default:
      return {
        ...base,
        sorter: 'string',
        // String columns: render HTML verbatim if present, else plain text
        formatter: (cell: any) => cellHtml(cell) ?? escapeHtml(String(cell.getValue() ?? '')),
      };
  }
}

const columnHeaderMenu = function (this: any) {
  const menu: any[] = [];
  const columns = this.getColumns();
  for (const column of columns) {
    // Skip the hidden _html shadow columns from the toggle menu
    if (/_html$/.test(column.getField())) continue;
    const icon = document.createElement('span');
    icon.innerHTML = column.isVisible() ? '☑' : '☐';
    icon.style.marginRight = '6px';
    const label = document.createElement('span');
    const title = document.createElement('span');
    title.textContent = column.getDefinition().title;
    label.appendChild(icon);
    label.appendChild(title);
    menu.push({
      label,
      action: function (e: Event) {
        e.stopPropagation();
        column.toggle();
        icon.innerHTML = column.isVisible() ? '☑' : '☐';
      },
    });
  }
  return menu;
};

function tableSignature(headers: string[], firstRow: string[]): string {
  return hashString(headers.join('|') + '\u0001' + firstRow.join('|'));
}

function extractCell(td: Element): CellData {
  return {
    text: (td.textContent ?? '').trim(),
    html: td.innerHTML.trim(),
  };
}

function extractTable(table: HTMLTableElement): { headers: string[]; rows: CellData[][] } | null {
  const headerCells = table.querySelectorAll('thead th');
  if (headerCells.length === 0) {
    // Try first row as headers
    const firstRow = table.querySelector('tr');
    if (!firstRow) return null;
    const headers = Array.from(firstRow.querySelectorAll('th, td')).map(c => (c.textContent ?? '').trim());
    const rows: CellData[][] = [];
    table.querySelectorAll('tr').forEach((tr, i) => {
      if (i === 0) return;
      rows.push(Array.from(tr.querySelectorAll('td')).map(extractCell));
    });
    return { headers, rows };
  }
  const headers = Array.from(headerCells).map(c => (c.textContent ?? '').trim());
  const rows: CellData[][] = [];
  table.querySelectorAll('tbody tr').forEach(tr => {
    rows.push(Array.from(tr.querySelectorAll('td')).map(extractCell));
  });
  return { headers, rows };
}

export function enhanceTables(target: HTMLElement, dark: boolean) {
  const tables = target.querySelectorAll<HTMLTableElement>('table');
  tables.forEach((table, idx) => {
    if ((table as any).__enhanced) return;
    if (table.dataset.skipEnhance === 'true') return;

    const data = extractTable(table);
    if (!data || data.headers.length === 0) return;

    // Skip very small tables (overhead not worth it)
    if (data.rows.length < 2) return;

    // Build columns with inferred types — type detection uses plain text
    const inferredCols: InferredCol[] = data.headers.map((title, ci) => {
      const textValues = data.rows.map(r => r[ci]?.text ?? '');
      const { type, symbol } = detectColumnType(textValues);
      const hasHtml = data.rows.some(r => htmlIsRicher(r[ci]?.html ?? '', r[ci]?.text ?? ''));
      const field = `c${ci}`;
      return { field, title: title || `Col ${ci + 1}`, type, symbol, hasHtml };
    });

    // Build rowData: store plain text in `cN` (for sort/filter/type formatting)
    // and the HTML in a parallel `cN_html` field (for rich rendering).
    const rowData = data.rows.map(r => {
      const obj: Record<string, string> = {};
      inferredCols.forEach((col, ci) => {
        const cell = r[ci];
        obj[col.field] = cell?.text ?? '';
        if (col.hasHtml && cell?.html && htmlIsRicher(cell.html, cell.text)) {
          obj[`${col.field}_html`] = cell.html;
        }
      });
      return obj;
    });

    // Replace original table with a host div
    const host = document.createElement('div');
    host.className = 'tabulator-host';
    table.replaceWith(host);

    const persistenceID = `mdshare-table-${tableSignature(data.headers, data.rows[0]?.map(c => c.text) || [])}`;

    new Tabulator(host, {
      data: rowData,
      columns: inferredCols.map(buildTabulatorColumn),
      // fitDataFill: size columns to content but distribute remaining width
      // across all columns proportionally — combined with maxInitialWidth on
      // each column (set in buildTabulatorColumn) this prevents one long-text
      // column from blowing past the container.
      layout: 'fitDataFill',
      // Recompute layout when sidebar opens/closes or window resizes.
      layoutColumnsOnNewData: true,
      movableColumns: true,
      resizableColumns: true,
      // Disable virtual row rendering — required for variable row heights
      // (wrapped cells) to render correctly without clipping.
      renderVerticalBuffer: 200,
      pagination: rowData.length > 50,
      paginationSize: 50,
      paginationSizeSelector: [25, 50, 100, 250],
      placeholder: 'No matching rows',
      persistence: {
        sort: true,
        filter: true,
        headerFilter: true,
        columns: ['width', 'visible'],
      },
      persistenceID,
      autoResize: true,
    });

    (host as any).__enhanced = true;
  });
}
