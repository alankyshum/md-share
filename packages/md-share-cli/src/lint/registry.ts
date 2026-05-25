import { mermaidValidator } from './validators/mermaid.js';
import { markmapValidator } from './validators/markmap.js';
import { chartValidator } from './validators/chart.js';
import { mapValidator } from './validators/map.js';
import { tablesValidator } from './validators/tables.js';
import type { FenceValidator, DocValidator } from './types.js';

export const BUILTIN_FENCE_VALIDATORS: FenceValidator[] = [
  mermaidValidator, markmapValidator, chartValidator, mapValidator,
];
export const BUILTIN_DOC_VALIDATORS: DocValidator[] = [tablesValidator];
