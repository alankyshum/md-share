import type { FenceValidator } from '../types.js';

export const markmapValidator: FenceValidator = {
  lang: ['markmap', 'mindmap'],
  validate(body, { startLine }) {
    const errs: string[] = [];
    const hasHeading = body.split(/\r?\n/).some(l => /^#{1,6}\s/.test(l.trim()));
    const hasList = body.split(/\r?\n/).some(l => /^\s*[-*+]\s/.test(l));
    if (!hasHeading && !hasList) {
      errs.push(
        `L${startLine}: markmap block has no headings or list items — markmap needs at least one to render`
      );
    }
    return errs;
  }
};
