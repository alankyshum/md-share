import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface CliConfig {
  app_base_url?: string;
  storage_repo?: string;
}

const NEW_CONFIG_DIR = path.join(os.homedir(), '.config', 'md-share');
const NEW_CONFIG_PATH = path.join(NEW_CONFIG_DIR, 'config.json');

const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.claude', 'skills', 'share--markdown');
const LEGACY_CONFIG_PATH = path.join(LEGACY_CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig {
  // 1. Try loading new config
  if (fs.existsSync(NEW_CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(NEW_CONFIG_PATH, 'utf8'));
      return {
        app_base_url: data.app_base_url,
        storage_repo: data.storage_repo,
      };
    } catch {
      // Corrupted file, fallback
    }
  }

  // 2. Try legacy migration
  if (fs.existsSync(LEGACY_CONFIG_PATH)) {
    try {
      const legacyRaw = fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8');
      const legacyData = JSON.parse(legacyRaw);
      
      const app_base_url = legacyData.base_url || 'https://share.alanshum.org';
      
      if (legacyData.api_token) {
        console.error(
          `\x1b[33m[Migration Warning] Legacy 'api_token' found. It is obsolete and will be discarded.\x1b[0m`
        );
      }

      return {
        app_base_url,
      };
    } catch {
      // Legacy parse failed
    }
  }

  // 3. Default fallback
  return {
    app_base_url: 'https://share.alanshum.org',
  };
}

export function saveConfig(config: CliConfig): void {
  try {
    if (!fs.existsSync(NEW_CONFIG_DIR)) {
      fs.mkdirSync(NEW_CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(
      NEW_CONFIG_PATH,
      JSON.stringify(
        {
          app_base_url: config.app_base_url,
          storage_repo: config.storage_repo,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (e) {
    console.error(`Error saving config: ${(e as Error).message}`);
  }
}
