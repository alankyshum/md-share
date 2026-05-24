#!/usr/bin/env python3
"""
share-md.py — Generate shareable URLs for markdown content.
Encodes markdown into URL fragments for the md-share Cloudflare Pages SPA.
Supports KV-backed short URLs via Cloudflare Pages Functions.
"""

import argparse
import base64
import gzip
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

MAX_PAYLOAD = 28000  # chars, safe for all browsers
CONFIG_PATH = Path.home() / ".claude" / "skills" / "share--markdown" / "config.json"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"base_url": "https://md-share-kut.pages.dev"}


def lint_local(md: str) -> list[str] | None:
    """Run the local Node-based lint CLI on `md`. Returns:
       - None if `node` is unavailable (graceful skip) — also prints a warning
       - [] (empty list) if the markdown lints clean
       - [errors...] if the lint failed
    """
    script = Path(__file__).parent / "md-lint.mjs"
    if not script.exists():
        return None  # bundle not built yet — skip silently (build-step issue, not user error)
    try:
        result = subprocess.run(
            ["node", str(script), "-"],
            input=md.encode("utf-8"),
            capture_output=True,
            timeout=15,
        )
    except FileNotFoundError:
        print("(node not found on PATH — skipping markdown lint)", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print("(md-lint timed out — skipping)", file=sys.stderr)
        return None
    if result.returncode == 0:
        return []
    # exit 2 = lint errors on stderr; any other code = CLI bug, still surface stderr
    errs = [ln for ln in result.stderr.decode("utf-8", errors="replace").splitlines() if ln.strip()]
    return errs or [f"(md-lint exit {result.returncode} with no stderr)"]


def encode_chunk(text: str) -> str:
    compressed = gzip.compress(text.encode("utf-8"))
    return base64.urlsafe_b64encode(compressed).rstrip(b"=").decode("ascii")


def encoded_len(text: str) -> int:
    return len(encode_chunk(text))


def build_url(base_url: str, encoded: str, part: int = None, total: int = None) -> str:
    base = base_url.rstrip("/")
    if total and total > 1:
        return f"{base}/#v1.{part}of{total}.{encoded}"
    return f"{base}/#v1.{encoded}"


def compute_safe_split_lines(md: str) -> list:
    """Return line indices where splitting is safe (outside code/mermaid blocks)."""
    lines = md.split("\n")
    safe = []
    in_fence = False
    fence_re = re.compile(r"^(`{3,}|~{3,})")

    for i, line in enumerate(lines):
        m = fence_re.match(line)
        if m:
            in_fence = not in_fence

        if not in_fence and i > 0:
            # Prefer headings
            if re.match(r"^#{1,6} ", line):
                safe.append(i)
            # Blank lines
            elif line.strip() == "":
                safe.append(i)
            else:
                safe.append(i)

    # Ensure we have some safe points; fallback to all non-fence lines
    return safe if safe else list(range(1, len(lines)))


def split_into_n_parts(md: str, n: int) -> list:
    lines = md.split("\n")
    safe_lines = compute_safe_split_lines(md)
    if not safe_lines:
        # Hard split by line count
        chunk_size = max(1, len(lines) // n)
        return ["\n".join(lines[i:i + chunk_size]) for i in range(0, len(lines), chunk_size)]

    target_per_chunk = len(lines) / n
    chunks = []
    current_start = 0

    for i in range(1, n):
        ideal = round(i * target_per_chunk)
        # Find nearest safe split line to ideal (that's after current_start)
        candidates = [x for x in safe_lines if x > current_start]
        if not candidates:
            break
        best = min(candidates, key=lambda x: abs(x - ideal))
        chunks.append("\n".join(lines[current_start:best]))
        current_start = best

    chunks.append("\n".join(lines[current_start:]))
    # Filter empty chunks
    return [c for c in chunks if c.strip()] or [md]


def chunk_markdown(md: str) -> list:
    if encoded_len(md) <= MAX_PAYLOAD:
        return [md]

    enc_len = encoded_len(md)
    n_parts = (enc_len // MAX_PAYLOAD) + 1

    while True:
        chunks = split_into_n_parts(md, n_parts)
        if all(encoded_len(c) <= MAX_PAYLOAD for c in chunks):
            return chunks
        n_parts += 1
        if n_parts > 100:
            raise ValueError("markdown too large to chunk reasonably (>100 parts needed)")


def copy_to_clipboard(text: str):
    subprocess.run(["pbcopy"], input=text.encode(), check=True)


def open_in_browser(url: str):
    subprocess.run(["open", url], check=True)


def print_stats(md: str, chunks: list, urls: list):
    raw_bytes = len(md.encode("utf-8"))
    raw_lines = md.count("\n") + 1
    compressed = gzip.compress(md.encode("utf-8"))
    gz_bytes = len(compressed)
    compression_pct = (1 - gz_bytes / raw_bytes) * 100 if raw_bytes else 0
    encoded = encode_chunk(md)
    enc_chars = len(encoded)
    url_len = len(urls[0]) if urls else 0

    print(f"raw:        {raw_bytes:,} bytes ({raw_lines} lines)", file=sys.stderr)
    print(f"gzipped:    {gz_bytes:,} bytes (compression: {compression_pct:.1f}%)", file=sys.stderr)
    print(f"encoded:    {enc_chars:,} chars (base64url)", file=sys.stderr)
    print(f"chunks:     {len(chunks)}", file=sys.stderr)
    print(f"url length: {url_len:,} chars", file=sys.stderr)


def shorten_url(
    base_url: str,
    api_token: str,
    md: str,
    *,
    update_key: str | None = None,
) -> tuple[str | None, list[str] | None]:
    """POST markdown to /api/save and return (short_url, lint_errors).

    On success: returns (url, None).
    On lint failure (422): returns (None, errors) — defensive safety net; server does not lint.
    On other failure: returns (None, None).
    """
    endpoint = base_url.rstrip("/") + "/api/save"
    payload_obj: dict = {"markdown": md}
    if update_key is not None:
        payload_obj["key"] = update_key
    payload = json.dumps(payload_obj).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_token}",
            "User-Agent": "share-md/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("url"), None
    except urllib.error.HTTPError as e:
        if e.code == 422:
            try:
                body = json.loads(e.read().decode("utf-8"))
                return None, body.get("errors") or ["(no error details returned)"]
            except Exception:
                return None, ["(422 returned but body not JSON)"]
        print(f"(shortener HTTP error {e.code}: {e.reason})", file=sys.stderr)
        return None, None
    except Exception as e:
        print(f"(shortener error: {e})", file=sys.stderr)
        return None, None


# Match an 8-char hex key, possibly inside a URL like https://x/s/abcd1234
KEY_RE = re.compile(r"([0-9a-f]{8})\b")


def parse_update_target(s: str) -> str:
    """Extract 8-char hex share key from a URL or raw key."""
    s = s.strip()
    # If it looks like a URL with /s/<key>
    m = re.search(r"/s/([0-9a-f]{8})\b", s)
    if m:
        return m.group(1)
    # Else just match anywhere
    m = KEY_RE.search(s)
    if m:
        return m.group(1)
    # Fallback: compute stable 8-char hex hash from any string
    import hashlib
    hashed = hashlib.sha256(s.encode("utf-8")).hexdigest()[:8]
    print(f"(Mapping custom key '{s}' to stable 8-char hex key '{hashed}')", file=sys.stderr)
    return hashed


def main():
    parser = argparse.ArgumentParser(
        prog="share-md",
        description="Generate shareable URLs for markdown content.",
    )
    parser.add_argument("file", nargs="?", help="markdown file (or '-' for stdin)")
    parser.add_argument("--text", help="inline markdown text")
    parser.add_argument("--base", help="override SPA base URL")
    parser.add_argument("--open", action="store_true", help="open URL in browser (macOS)")
    parser.add_argument("--copy", dest="copy", action="store_true", default=True, help="copy URL(s) to clipboard via pbcopy (default: on, macOS)")
    parser.add_argument("--no-copy", dest="copy", action="store_false", help="disable clipboard copy")
    parser.add_argument("--stats", action="store_true", help="print size breakdown to stderr")
    parser.add_argument("--print-only", action="store_true", help="suppress extra output")
    parser.add_argument("--no-short", action="store_true", help="disable shortener, always emit fragment URL")
    parser.add_argument("--always-short", action="store_true", help="always shorten, even for small content")
    parser.add_argument("--short-threshold", type=int, default=None, help="URL length threshold for auto-shortening (default: from config or 1024)")
    parser.add_argument("--update", metavar="URL_OR_KEY", help="overwrite an existing share (pass URL or 8-char key); implies --always-short")
    parser.add_argument("--no-lint", action="store_true", help="bypass local markdown linting")
    args = parser.parse_args()

    # Load config
    config = load_config()
    base_url = args.base or config.get("base_url", "https://md-share-kut.pages.dev")
    api_token = config.get("api_token")
    short_threshold = args.short_threshold or config.get("short_threshold", 1024)

    # Read markdown
    if args.text:
        # Support \n escapes in --text
        md = args.text.replace("\\n", "\n")
    elif args.file and args.file != "-":
        md = Path(args.file).read_text(encoding="utf-8")
    else:
        md = sys.stdin.read()

    if not md:
        print("Error: no markdown input provided", file=sys.stderr)
        sys.exit(1)

    # Local markdown lint (build-time, replaces server lint)
    if not args.no_lint:
        errs = lint_local(md)
        if errs:  # non-empty list = real errors
            print("Markdown failed lint checks:", file=sys.stderr)
            for err in errs:
                print(f"  • {err}", file=sys.stderr)
            print("\nFix the issues or pass --no-lint to bypass.", file=sys.stderr)
            sys.exit(2)
        # errs is None (node missing) or [] (clean) → continue

    # --update implies always-shorten and disables --no-short
    update_key: str | None = None
    if args.update:
        update_key = parse_update_target(args.update)
        if args.no_short:
            print("Warning: --no-short ignored when --update is set", file=sys.stderr)
        args.no_short = False
        args.always_short = True

    # Attempt shortening if conditions are met
    short_url = None
    lint_errors: list[str] | None = None
    if not args.no_short and api_token:
        # Build fragment URL to check its length (for threshold decision)
        enc = encode_chunk(md)
        fragment_url = build_url(base_url, enc)
        should_shorten = args.always_short or len(fragment_url) > short_threshold

        if should_shorten:
            if len(md) > 100_000:
                print("(markdown >100KB, shortener rejected — falling back to fragment URL)", file=sys.stderr)
            else:
                short_url, lint_errors = shorten_url(
                    base_url, api_token, md,
                    update_key=update_key,
                )

    # Lint failure short-circuits everything
    if lint_errors is not None:
        print("Markdown failed lint checks:", file=sys.stderr)
        for err in lint_errors:
            print(f"  • {err}", file=sys.stderr)
        print("\nFix the issues or pass --no-lint to bypass.", file=sys.stderr)
        sys.exit(2)

    if update_key is not None and short_url is None:
        print(f"Error: --update {update_key} failed (server did not return URL)", file=sys.stderr)
        sys.exit(1)

    if short_url:
        urls = [short_url]
        chunks = [md]  # single chunk for stats display
    else:
        # Chunk + fragment URLs (multi-part fallback)
        chunks = chunk_markdown(md)
        total = len(chunks)
        urls = []
        for i, chunk in enumerate(chunks, 1):
            enc = encode_chunk(chunk)
            url = build_url(base_url, enc, part=i if total > 1 else None, total=total if total > 1 else None)
            urls.append(url)

    # Stats
    if args.stats:
        print_stats(md, chunks, urls)

    # Determine if this is a short URL (single, ~45 chars) — safe to echo
    is_short = short_url is not None
    is_tty = sys.stdout.isatty()

    # Output URLs
    if is_tty and len(urls) > 1:
        for i, url in enumerate(urls, 1):
            print(f"Part {i}/{len(urls)}: {url}")
    else:
        for url in urls:
            print(url)

    # --copy: copy to clipboard
    # For short URLs: also copy (convenient), but we already printed them
    # For long fragment URLs: copy only (don't echo — too long)
    copied = False
    if args.copy:
        try:
            copy_to_clipboard("\n".join(urls))
            copied = True
        except Exception as e:
            print(f"(clipboard copy failed: {e})", file=sys.stderr)

    # Confirmation footer (tty only, not when piped)
    if is_tty and not args.print_only:
        if is_short:
            print(f"\n[OK] Short URL ready — click above or paste with Cmd+V", file=sys.stderr)
        elif copied:
            label = f"{len(urls)} URLs" if len(urls) > 1 else "URL"
            print(f"\n[OK] {label} copied to clipboard — paste with Cmd+V", file=sys.stderr)

    # --open
    if args.open:
        open_in_browser(urls[0])


if __name__ == "__main__":
    main()
