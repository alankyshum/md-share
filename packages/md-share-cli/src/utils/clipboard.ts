import { execSync } from 'node:child_process';

export function copyToClipboard(text: string): boolean {
  try {
    const process = execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}
