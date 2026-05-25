import type { ZodSchema } from 'zod';

export interface FenceValidator {
  lang: string | string[];
  schema?: ZodSchema;
  validate?(body: string, ctx: { startLine: number }): string[];
}

export interface DocValidator {
  name: string;
  validate(md: string): string[];
}

export interface Block {
  lang: string;
  body: string;
  startLine: number;
}
