import { getStoredToken } from './keychain.js';
import { getGhCliToken } from './gh.js';

export function getGitHubToken(): string | null {
  const keychainToken = getStoredToken();
  if (keychainToken) {
    return keychainToken;
  }
  return getGhCliToken();
}

export function requireGitHubToken(): string {
  const token = getGitHubToken();
  if (!token) {
    console.error(`\x1b[31mError: GitHub authentication required.\x1b[0m`);
    console.error(`Please run \x1b[36mmd-share login\x1b[0m to authenticate via OAuth Device Flow,`);
    console.error(`or make sure the \x1b[36mgh\x1b[0m CLI is installed and authenticated (\x1b[36mgh auth status\x1b[0m).`);
    process.exit(1);
  }
  return token;
}
