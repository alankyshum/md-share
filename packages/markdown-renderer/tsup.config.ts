import { defineConfig } from 'tsup';
import { mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    'client/index': 'src/client/index.ts',
    'client/maps': 'src/client/maps.ts',
    'client/charts': 'src/client/charts.ts',
    'client/gantt': 'src/client/gantt.ts',
    'client/tables': 'src/client/tables.ts',
    'client/markmaps': 'src/client/markmaps.ts',
    'client/mermaid-init': 'src/client/mermaid-init.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  external: [
    'chart.js',
    'chartjs-plugin-annotation',
    'frappe-gantt',
    'maplibre-gl',
    'marked',
    'markmap-lib',
    'markmap-view',
    'mermaid',
    'tabulator-tables',
    'highlight.js',
    'js-yaml',
  ],
  async onSuccess() {
    // Copy CSS files to dist
    const destStyleDir = join(__dirname, 'dist/styles');
    await mkdir(destStyleDir, { recursive: true });
    await cp(join(__dirname, 'src/styles/renderer.css'), join(destStyleDir, 'renderer.css'));

    const destClientDir = join(__dirname, 'dist/client');
    await mkdir(destClientDir, { recursive: true });
    await cp(join(__dirname, 'src/client/frappe-gantt.css'), join(destClientDir, 'frappe-gantt.css'));
  }
});
