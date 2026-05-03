export function computeStats(md: string) {
  const words = md.trim().split(/\s+/).filter(Boolean).length;
  const chars = md.length;
  const charsNoSpaces = md.replace(/\s/g, '').length;
  const lines = md.split('\n').length;
  const readingMinutes = Math.max(1, Math.round(words / 250));
  const headings = (md.match(/^#{1,6}\s/gm) || []).length;
  const rawBlocks = (md.match(/^```/gm) || []).length;
  const codeBlocks = Math.floor(rawBlocks / 2);
  const tableRows = (md.match(/^\|.+\|$/gm) || []);
  // Count distinct tables by looking for separator rows (|---|)
  const tables = (md.match(/^\|[\s\-:|]+\|$/gm) || []).length;
  const links = (md.match(/(?<!!)\[.+?\]\(.+?\)/g) || []).length;
  const images = (md.match(/!\[.*?\]\(.+?\)/g) || []).length;
  return { words, chars, charsNoSpaces, lines, readingMinutes, headings, codeBlocks, tables, links, images };
}
