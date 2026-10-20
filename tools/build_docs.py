#!/usr/bin/env python3
"""Convert the Markdown documentation (docs/en/**/*.md, docs/de/**/*.md) to Confluence storage format (XHTML).

Derived from the web-authenticator. The planning documents (docs/planning/) are not converted.

Output: docs/confluence/<lang>/<path>.xhtml -- paste into the Confluence source editor or
upload via the REST API (representation "storage"). The page title is the first heading of
the Markdown file and is not part of the body.

Conversions:
  * fenced code blocks          -> code macro
  * > **Note:** / **Hinweis:**  -> info macro, > **Warning:** / **Warnung:** -> warning macro
  * links to other .md files    -> links to the corresponding Confluence page (by title)
  * images                      -> attachments with the same file name (attach docs/images/<lang>/*.png)
  * links to headings (#...)    -> plain text (Confluence uses its own anchor names)
  * a table of contents macro is inserted at the top

Usage: python3 tools/build_docs.py [--check]   (requires the "Markdown" package, see requirements.txt)
"""
import html
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "confluence"

HEADER = "<!-- Generated from {src} by tools/build_docs.py - do not edit. Confluence page title: {title} -->\n"
TOC = '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">3</ac:parameter></ac:structured-macro>\n'
CODE_LANGUAGES = {"sh": "bash", "shell": "bash", "python": "py", "javascript": "js", "json": "js", "html": "xml"}
PANELS = {"note": "info", "hinweis": "info", "tip": "tip", "tipp": "tip", "warning": "warning", "warnung": "warning"}


def title_of(md_path):
    for line in md_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return md_path.stem


def code_macro(match):
    lang = CODE_LANGUAGES.get(match.group(1), match.group(1)) or ""
    code = html.unescape(match.group(2)).replace("]]>", "]]]]><![CDATA[>")
    param = f'<ac:parameter ac:name="language">{lang}</ac:parameter>' if lang else ""
    return (f'<ac:structured-macro ac:name="code">{param}'
            f"<ac:plain-text-body><![CDATA[{code.rstrip()}]]></ac:plain-text-body></ac:structured-macro>")


def panel_macro(match):
    body = match.group(1).strip()
    m = re.match(r"<p><strong>([^<:]+):?</strong>:?\s*", body)
    kind = PANELS.get(m.group(1).strip().lower(), "info") if m else "info"
    if m:
        body = "<p>" + body[m.end():]
    return f'<ac:structured-macro ac:name="{kind}"><ac:rich-text-body>{body}</ac:rich-text-body></ac:structured-macro>'


def convert(md_path, titles):
    text = md_path.read_text(encoding="utf-8")
    text = re.sub(r"\A# .*\n+", "", text)  # title is the Confluence page title
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"], output_format="xhtml")
    body = re.sub(r'<pre><code(?: class="language-([\w-]+)")?>(.*?)</code></pre>', code_macro, body, flags=re.S)
    body = re.sub(r"<blockquote>\s*(.*?)\s*</blockquote>", panel_macro, body, flags=re.S)

    def link(m):
        target, label = m.group(1), m.group(2)
        page = titles.get((md_path.parent / target.split("#")[0]).resolve())
        if not page:
            return m.group(0)
        return (f'<ac:link><ri:page ri:content-title="{html.escape(page)}" />'
                f"<ac:plain-text-link-body><![CDATA[{html.unescape(label)}]]></ac:plain-text-link-body></ac:link>")
    body = re.sub(r'<a href="([^":]+\.md(?:#[^"]*)?)">(.*?)</a>', link, body)
    # in-page anchors differ in Confluence: keep the link text only
    body = re.sub(r'<a href="#[^"]*">(.*?)</a>', r"\1", body)
    # images become page attachments with the same file name
    body = re.sub(r'<img alt="([^"]*)" src="[^"]*?([^"/]+)" />',
                  r'<ac:image ac:alt="\1"><ri:attachment ri:filename="\2" /></ac:image>', body)
    # Confluence storage is XML: only the predefined XML entities are allowed
    body = re.sub(r"&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)(\w+);",
                  lambda m: html.unescape(m.group(0)), body)
    result = HEADER.format(src=md_path.relative_to(ROOT).as_posix(), title=titles[md_path.resolve()]) + TOC + body + "\n"
    ET.fromstring('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">' + result.split("\n", 1)[1] + "</root>")  # well-formed?
    return result


LANGUAGES = ("en", "de")


def main():
    sources = sorted(s for lang in LANGUAGES for s in (DOCS / lang).glob("**/*.md"))
    titles = {s.resolve(): title_of(s) for s in sources}
    outdated = []
    for src in sources:
        target = OUT / src.relative_to(DOCS).with_suffix(".xhtml")
        content = convert(src, titles)
        if "--check" in sys.argv:
            if not target.exists() or target.read_text(encoding="utf-8") != content:
                outdated.append(target.relative_to(ROOT).as_posix())
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)}")
    if outdated:
        print("out of date, run: python3 tools/build_docs.py\n  " + "\n  ".join(outdated))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
