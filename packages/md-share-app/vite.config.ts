import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const spaRoot = path.resolve(import.meta.dirname);
const packagesRoot = path.resolve(spaRoot, '../packages');

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    // When Vite/Rollup resolves bare specifiers (e.g. 'marked') from a file
    // inside packages/markdown-renderer, it uses the symlink target's real path
    // which is outside spa/node_modules. This plugin re-resolves such imports
    // from the spa root so the spa's node_modules is found.
    {
      name: 'resolve-workspace-pkg-deps',
      resolveId(id, importer) {
        if (!importer) return null;
        if (!importer.startsWith(packagesRoot)) return null;
        // Only intercept bare specifiers (not relative or absolute)
        if (id.startsWith('.') || id.startsWith('/')) return null;
        // Delegate resolution from the spa root
        return this.resolve(id, path.join(spaRoot, '_virtual_entry.js'), { skipSelf: true });
      },
    },
  ],
  resolve: {
    preserveSymlinks: false,
  },
  server: {
    fs: {
      allow: [path.resolve('../packages')],
    },
  },
});
