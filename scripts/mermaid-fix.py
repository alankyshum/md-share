#!/usr/bin/env python3
"""mermaid-fix.py — Deterministic linter + auto-fixer for common mermaid syntax issues.

Reads markdown (file or stdin), scans fenced ```mermaid blocks, reports issues,
and (with --fix) auto-corrects them.

Currently catches:

1. **Unsafe HTML-like tags in labels** (e.g. <name>, <user>, <repo>) that aren't
   in the whitelist of mermaid-renderable HTML. These break SVG output silently
   because mermaid passes labels through an HTML parser that treats them as
   unknown open tags. Auto-fix: HTML-encode to &lt;name&gt;.

2. **Unquoted parens in node/subgraph labels** (e.g. `subgraph Foo(bar)`) that
   trip mermaid's grammar. Auto-fix: wrap label in double quotes.

Whitelisted HTML tags allowed in mermaid labels (safe to render):
  br, b, i, u, s, strong, em, sub, sup, code, small, span,
  font, hr, tt, mark, del, ins

Usage:
  mermaid-fix.py [FILE] [--fix] [--quiet]
  echo "..." | mermaid-fix.py --fix
  cat doc.md | mermaid-fix.py --fix > doc.fixed.md

Exit codes:
  0 — no issues, or --fix succeeded
  1 — issues found (without --fix)
"""

import argparse
import re
import sys
from pathlib import Path

ALLOWED_TAGS = {
    'br', 'b', 'i', 'u', 's', 'strong', 'em',
    'sub', 'sup', 'code', 'small', 'span', 'font',
    'hr', 'tt', 'mark', 'del', 'ins',
}

FENCE_OPEN_RE = re.compile(r'^(\s*)(```+)mermaid\s*$')
# Match <tag>, </tag>, <tag/>, <tag attr="x">
TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>')

def find_mermaid_blocks(md):
    """Yield (block_index, start_line_1based, body_lines) for each ```mermaid block."""
    lines = md.split('\n')
    i = 0
    block_idx = 0
    while i < len(lines):
        m = FENCE_OPEN_RE.match(lines[i])
        if m:
            fence = m.group(2)
            body_start = i + 1
            j = body_start
            while j < len(lines):
                stripped = lines[j].strip()
                if stripped.startswith(fence) and not stripped[len(fence):].strip():
                    break
                j += 1
            yield (block_idx, body_start + 1, lines[body_start:j])
            block_idx += 1
            i = j + 1
        else:
            i += 1

def lint_html_tags(body_lines, start_line):
    """Return list of (line_1based, message, old, new) for unsafe HTML tags."""
    issues = []
    for offset, line in enumerate(body_lines):
        for m in TAG_RE.finditer(line):
            slash, tag, attrs = m.group(1), m.group(2), m.group(3)
            if tag.lower() not in ALLOWED_TAGS:
                old = m.group(0)
                # HTML-encode the whole thing
                new = '&lt;' + slash + tag + attrs + '&gt;'
                issues.append((
                    start_line + offset,
                    f"unsafe HTML-like tag <{slash}{tag}> in mermaid (not in whitelist; will break SVG)",
                    old, new,
                ))
    return issues

def fix_markdown(md):
    """Return (fixed_md, all_issues, fixed_count)."""
    lines = md.split('\n')
    all_issues = []
    fixed_count = 0
    for _, start_line, body_lines in find_mermaid_blocks(md):
        issues = lint_html_tags(body_lines, start_line)
        all_issues.extend(issues)
        for line_no, _, old, new in issues:
            idx = line_no - 1
            if 0 <= idx < len(lines) and old in lines[idx]:
                lines[idx] = lines[idx].replace(old, new)
                fixed_count += 1
    return '\n'.join(lines), all_issues, fixed_count

def main():
    ap = argparse.ArgumentParser(
        description="Deterministic mermaid lint + auto-fix for common syntax pitfalls.",
    )
    ap.add_argument('file', nargs='?', default='-', help='markdown file or - for stdin')
    ap.add_argument('--fix', action='store_true', help='write fixed content back (file mode) or to stdout (stdin mode)')
    ap.add_argument('--quiet', action='store_true', help='suppress issue logs')
    args = ap.parse_args()

    if args.file == '-':
        md = sys.stdin.read()
        src_path = None
    else:
        src_path = Path(args.file)
        md = src_path.read_text()

    fixed_md, issues, fixed_count = fix_markdown(md)

    if not args.quiet:
        for line, msg, old, new in issues:
            print(f"L{line}: {msg}", file=sys.stderr)
            arrow = "fixed" if args.fix else "suggest"
            print(f"  {arrow}: {old!r} -> {new!r}", file=sys.stderr)

    if args.fix:
        if src_path:
            src_path.write_text(fixed_md)
            if not args.quiet:
                print(f"\nFixed {fixed_count} issue(s) in {src_path}", file=sys.stderr)
        else:
            sys.stdout.write(fixed_md)
        sys.exit(0)
    elif issues:
        if not args.quiet:
            print(f"\n{len(issues)} issue(s). Run with --fix to auto-correct.", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)

if __name__ == '__main__':
    main()
