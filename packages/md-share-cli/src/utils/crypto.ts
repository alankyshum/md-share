import { createHash } from 'node:crypto';

export function getShareKey(md: string): string {
  return createHash('sha256').update(md, 'utf8').digest('hex').slice(0, 12);
}
