/** Explicit lifetimes for new public shares; old shares are never backfilled. */
export function expiry(value?: string, purpose?: string, now = new Date()): string {
  if (purpose && purpose !== 'decision') throw new Error('purpose must be decision');
  const input = value ?? (purpose === 'decision' ? '7d' : '365d');
  const duration = input.match(/^([1-9][0-9]*)(m|h|d|w|y)$/);
  let timestamp: number;
  if (duration) {
    const seconds: Record<string, number> = { m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 };
    timestamp = now.getTime() + Number(duration[1]) * seconds[duration[2]] * 1000;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(input)) {
      throw new Error('expiry must be a duration or ISO date/time with timezone');
    }
    timestamp = Date.parse(input);
  }
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) throw new Error('expiry must be a valid future date');
  return new Date(timestamp).toISOString();
}
