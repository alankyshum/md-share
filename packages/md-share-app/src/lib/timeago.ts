/** Format a time delta (in milliseconds, can be negative) as a short
 *  human-friendly string: "in 11 months", "in 2 days", "12 hours ago", etc. */
export function formatRelativeTime(deltaMs: number): string {
  const past = deltaMs < 0;
  let abs = Math.abs(deltaMs);
  const sec = abs / 1000;
  const min = sec / 60;
  const hr = min / 60;
  const day = hr / 24;
  const mo = day / 30.4375;
  const yr = day / 365.25;

  let value: number;
  let unit: string;
  if (yr >= 1) { value = Math.round(yr * 10) / 10; unit = pluralize(value, 'year'); }
  else if (mo >= 1) { value = Math.round(mo); unit = pluralize(value, 'month'); }
  else if (day >= 1) { value = Math.round(day); unit = pluralize(value, 'day'); }
  else if (hr >= 1) { value = Math.round(hr); unit = pluralize(value, 'hour'); }
  else if (min >= 1) { value = Math.round(min); unit = pluralize(value, 'minute'); }
  else { value = Math.round(sec); unit = pluralize(value, 'second'); }

  // 1.0 → "1 year"; 1.5 → "1.5 years"
  const num = Number.isInteger(value) ? value.toString() : value.toString();
  return past ? `${num} ${unit} ago` : `in ${num} ${unit}`;
}

function pluralize(n: number, word: string): string {
  return Math.abs(n) === 1 ? word : `${word}s`;
}

/** Format a Date as a short, human-friendly absolute date suitable for
 *  setting a calendar reminder. Examples:
 *    "May 2, 2027"          (when time is exactly midnight or > 6 months away)
 *    "May 2, 2027, 3:42 PM" (default)
 *  Uses the user's local timezone. */
export function formatAbsoluteDate(d: Date, opts: { withTime?: boolean } = {}): string {
  const withTime = opts.withTime ?? true;
  if (withTime) {
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format a byte count: "1.2 KB", "456 B", "2.3 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
