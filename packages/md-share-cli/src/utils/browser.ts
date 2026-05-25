import { execSync } from 'node:child_process';

export function openInBrowser(url: string): boolean {
  try {
    execSync(`open "${url}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
