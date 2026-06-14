#!/usr/bin/env python3
"""Render a Markdown file to a styled, self-contained HTML page and open it.

Reusable across all consolidation deliverables (spec, salvage report, summary).
The Markdown file remains the git-tracked source of truth; the generated HTML is
a disposable, browser-friendly view.

Usage:
    python3 render.py <input.md> [--output <file.html>] [--no-open] [--title "..."]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import markdown

MARKDOWN_EXTENSIONS = [
    "extra",        # tables, fenced code, footnotes, attr lists
    "sane_lists",
    "toc",
    "admonition",
]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
:root {{
  --bg: #f6f7f9;
  --surface: #ffffff;
  --ink: #1f2430;
  --muted: #5b6472;
  --accent: #2f6df6;
  --border: #e3e7ee;
  --code-bg: #f1f3f7;
  --good: #1f9d6b;
  --warn: #c47f17;
  --risk: #c0392b;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}}
.wrap {{ max-width: 880px; margin: 0 auto; padding: 48px 24px 96px; }}
.banner {{
  background: linear-gradient(135deg, #2f6df6 0%, #5b3df6 100%);
  color: #fff;
  border-radius: 14px;
  padding: 28px 32px;
  margin-bottom: 36px;
  box-shadow: 0 8px 24px rgba(47, 109, 246, 0.18);
}}
.banner h1 {{ margin: 0; font-size: 26px; border: none; color: #fff; }}
.banner .meta {{ margin-top: 8px; font-size: 13px; opacity: 0.9; }}
.content {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 8px 40px 40px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
}}
h1, h2, h3, h4 {{ line-height: 1.3; font-weight: 650; }}
h1 {{ font-size: 24px; border-bottom: 2px solid var(--border); padding-bottom: 8px; }}
h2 {{ font-size: 20px; margin-top: 34px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }}
h3 {{ font-size: 17px; margin-top: 26px; color: #2b3242; }}
a {{ color: var(--accent); text-decoration: none; }}
a:hover {{ text-decoration: underline; }}
p, li {{ color: var(--ink); }}
code {{
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 5px;
  font: 13.5px/1.5 "SF Mono", ui-monospace, Menlo, Consolas, monospace;
}}
pre {{
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
}}
pre code {{ background: none; padding: 0; }}
table {{
  border-collapse: collapse;
  width: 100%;
  margin: 18px 0;
  font-size: 14.5px;
}}
th, td {{ border: 1px solid var(--border); padding: 9px 12px; text-align: left; vertical-align: top; }}
th {{ background: #eef2fb; font-weight: 650; }}
tr:nth-child(even) td {{ background: #fafbfd; }}
blockquote {{
  margin: 18px 0;
  padding: 4px 18px;
  border-left: 4px solid var(--accent);
  background: #f4f8ff;
  color: var(--muted);
  border-radius: 0 8px 8px 0;
}}
hr {{ border: none; border-top: 1px solid var(--border); margin: 32px 0; }}
ul, ol {{ padding-left: 24px; }}
li {{ margin: 4px 0; }}
strong {{ color: #161b26; }}
.footer {{ margin-top: 40px; text-align: center; color: var(--muted); font-size: 12px; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="banner">
    <h1>{title}</h1>
    <div class="meta">{subtitle}</div>
  </div>
  <div class="content">
{body}
  </div>
  <div class="footer">Generated from {source_name} &middot; source of truth is the Markdown file</div>
</div>
</body>
</html>
"""


def derive_title(md_text: str, fallback: str) -> str:
    """Use the first level-one heading as the page title when present."""
    for line in md_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def render_html(md_path: Path, title_override: str | None) -> str:
    md_text = md_path.read_text(encoding="utf-8")
    body = markdown.markdown(md_text, extensions=MARKDOWN_EXTENSIONS)
    title = title_override or derive_title(md_text, md_path.stem)
    return PAGE_TEMPLATE.format(
        title=title,
        subtitle=f"feeschedule-hub consolidation &middot; {md_path.name}",
        body=body,
        source_name=md_path.name,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render Markdown to styled HTML and open it.")
    parser.add_argument("input", type=Path, help="Path to the Markdown file")
    parser.add_argument("--output", type=Path, default=None, help="Output HTML path")
    parser.add_argument("--title", default=None, help="Override the page title")
    parser.add_argument("--no-open", action="store_true", help="Write the file but do not open it")
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        return 1

    output_path = args.output or args.input.with_suffix(".html")
    try:
        html = render_html(args.input, args.title)
        output_path.write_text(html, encoding="utf-8")
    except OSError as exc:
        print(f"error: failed to write HTML: {exc}", file=sys.stderr)
        return 1

    print(f"rendered: {output_path}")

    if not args.no_open:
        try:
            subprocess.run(["open", str(output_path)], check=True)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            print(f"warning: could not auto-open the file: {exc}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
