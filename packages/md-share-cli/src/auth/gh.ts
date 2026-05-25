import { execSync } from 'node:child_process';

export function getGhCliToken(): string | null {
  try {
    // First verify gh is installed and authed
    execSync('gh auth status', { stdio: 'ignore' });
    const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
    return token || null;
  } catch {
    return null;
  }
}
