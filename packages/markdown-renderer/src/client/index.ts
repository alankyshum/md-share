// Default barrel: only the orchestrator. Rich renderers are not re-exported here
// because they would defeat the dynamic-import strategy (importing this barrel
// would eagerly pull mermaid, maplibre-gl, chart.js, etc. into the consumer bundle).
// Use the specific subpath imports if you need a single renderer directly.
export { enhance, type EnhanceOptions } from './enhance.js';
