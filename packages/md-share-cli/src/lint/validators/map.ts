import { z } from 'zod';
import yaml from 'js-yaml';
import type { FenceValidator } from '../types.js';

const Stop = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  label: z.string().optional(),
});

const Day = z.object({
  color: z.string().regex(/^#[0-9a-f]{3,8}$/i),
  profile: z.enum(['driving-car', 'foot-walking', 'cycling-regular']).default('driving-car'),
  stops: z.array(Stop).min(1).max(50),
});

const MapSpec = z.object({
  height: z.number().int().positive().max(2000).optional(),
  center: z.tuple([z.number(), z.number()]).optional(),
  zoom: z.number().min(0).max(22).optional(),
  days: z.array(Day).min(1).max(20),
});

export const mapValidator: FenceValidator = {
  lang: 'map',
  validate(body, { startLine }) {
    let parsed;
    try {
      parsed = yaml.load(body);
    } catch (e) {
      return [`L${startLine}: map block: invalid YAML: ${(e as Error).message}`];
    }
    const r = MapSpec.safeParse(parsed);
    if (r.success) return [];
    return r.error.issues.map(i => `L${startLine}: map block: ${i.path.join('.') || '(root)'}: ${i.message}`);
  }
};
