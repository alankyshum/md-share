import { execSync } from 'node:child_process';

const SERVICE = 'md-share';
const ACCOUNT = 'oauth-token';

export function getStoredToken(): string | null {
  try {
    const stdout = execSync(
      `security find-generic-password -a "${ACCOUNT}" -s "${SERVICE}" -w`,
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function storeToken(token: string): boolean {
  try {
    execSync(
      `security add-generic-password -a "${ACCOUNT}" -s "${SERVICE}" -w "${token}" -U`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

export function deleteToken(): boolean {
  try {
    execSync(
      `security delete-generic-password -a "${ACCOUNT}" -s "${SERVICE}"`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}
