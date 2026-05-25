import { startDeviceFlow } from '../auth/oauth.js';
import { storeToken } from '../auth/keychain.js';
import { getAuthenticatedUser } from '../github/contents.ts';
import { getGhCliToken } from '../auth/gh.js';

export async function loginCommand(options: { force?: boolean }): Promise<void> {
  const existingGhToken = getGhCliToken();
  if (existingGhToken && !options.force) {
    try {
      const user = await getAuthenticatedUser(existingGhToken);
      console.log(`\x1b[32mAlready authenticated via gh CLI as: ${user.login}\x1b[0m`);
      console.log(`No further login required! (Use --force to login via device flow anyway)`);
      return;
    } catch {
      // Token invalid or offline, proceed to device flow
    }
  }

  try {
    const token = await startDeviceFlow();
    if (!token) {
      throw new Error('Device flow completed but no token was returned.');
    }

    const saved = storeToken(token);
    if (!saved) {
      console.warn(`\x1b[33mWarning: Failed to save token to macOS Keychain.\x1b[0m`);
    }

    const user = await getAuthenticatedUser(token);
    console.log(`\n\x1b[32m[OK] Successfully authenticated as: ${user.login}\x1b[0m`);
    if (saved) {
      console.log(`Token has been securely saved to macOS Keychain.`);
    }
  } catch (e) {
    console.error(`\x1b[31mError during login: ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }
}
