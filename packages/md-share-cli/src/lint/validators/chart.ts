import { z } from 'zod';
import yaml from 'js-yaml';
import type { FenceValidator } from '../types.js';

const ChartConfig = z.object({
  type: z.enum(['line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter']),
  data: z.object({
    labels: z.array(z.union([z.string(), z.number()])).optional(),
    datasets: z.array(z.object({}).passthrough()).min(1),
  }).passthrough(),
  options: z.object({}).passthrough().optional(),
}).passthrough();

export const chartValidator: FenceValidator = {
  lang: 'chart',
  validate(body, { startLine }) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      try {
        parsed = yaml.load(body);
      } catch (e) {
        return [`L${startLine}: chart block: not valid JSON or YAML`];
      }
    }
    if (parsed === null || typeof parsed !== 'object') {
      return [`L${startLine}: chart block: not valid JSON or YAML`];
    }
    const r = ChartConfig.safeParse(parsed);
    if (r.success) return [];
    return r.error.issues.map(i =>
      `L${startLine}: chart block: ${i.path.join('.') || '(root)'}: ${i.message}`
    );
  }
};
