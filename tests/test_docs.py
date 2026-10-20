"""The documentation exists in all required variants (EN/DE, Markdown/Confluence) and is up to date."""
import re
import subprocess
import sys

from helpers.paths import ROOT

DOCS = {
    "en": ["user-guide", "technical-documentation"],
    "de": ["benutzerhandbuch", "technische-dokumentation"],
}


def test_documentation_complete():
    for lang, names in DOCS.items():
        for name in names:
            assert (ROOT / "docs" / lang / f"{name}.md").is_file()
            assert (ROOT / "docs" / "confluence" / lang / f"{name}.xhtml").is_file()


def test_confluence_docs_up_to_date():
    result = subprocess.run([sys.executable, str(ROOT / "tools" / "build_docs.py"), "--check"], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_links_and_images_exist():
    for md in [*(ROOT / "docs" / "en").glob("**/*.md"), *(ROOT / "docs" / "de").glob("**/*.md")]:
        text = md.read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)#:]+)(?:#[^)]*)?\)", text):
            assert (md.parent / target).exists(), f"{md.relative_to(ROOT)}: missing {target}"


def test_both_languages_have_the_same_structure():
    """German and English documents have the same number of sections."""
    pairs = [("user-guide", "benutzerhandbuch"), ("technical-documentation", "technische-dokumentation")]
    for en, de in pairs:
        count = lambda lang, name: len(re.findall(r"^#{2,3} ", (ROOT / "docs" / lang / f"{name}.md").read_text(encoding="utf-8"), re.M))
        assert count("en", en) == count("de", de), (en, de)


def test_app_documentation_in_both_languages():
    en = sorted(p.name for p in (ROOT / "docs" / "en" / "apps").glob("*.md"))
    de = sorted(p.name for p in (ROOT / "docs" / "de" / "apps").glob("*.md"))
    assert en == de and en
    for name in en:
        sections = lambda lang: len(re.findall(r"^#{2,3} ", (ROOT / "docs" / lang / "apps" / name).read_text(encoding="utf-8"), re.M))
        assert sections("en") == sections("de"), name
        for lang in ("en", "de"):
            assert (ROOT / "docs" / "confluence" / lang / "apps" / name.replace(".md", ".xhtml")).is_file()
