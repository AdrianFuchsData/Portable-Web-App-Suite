"""Keyboard shortcut overview: build.py embeds the "Keyboard shortcuts" / "Tastenkürzel" tables of the user documentation;
F1 (or ? outside of text fields) opens the about dialog that lists them."""
import pathlib
import re

import pytest
from playwright.sync_api import expect

from helpers.paths import ROOT

APPS = sorted(p.parent.parent.name for p in (ROOT / "apps").glob("*/src/index.html"))


def documented(app, lang):
    md = (ROOT / "docs" / lang / "apps" / f"{app}.md").read_text(encoding="utf-8")
    head = "## Keyboard shortcuts" if lang == "en" else "## Tastenkürzel"
    section = md.split(head, 1)[1].split("\n## ", 1)[0]
    return [line for line in section.splitlines() if line.startswith("| `")]


@pytest.mark.parametrize("app", APPS)
def test_shortcut_list(app, app_page):
    page = app_page(app)
    page.locator("body").click(position={"x": 2, "y": 2})
    page.keyboard.press("F1")
    rows = page.locator("[data-testid=about-dialog] [data-testid=shortcut]")
    expect(rows).to_have_count(len(documented(app, "en")))
    expect(rows.last).to_contain_text("F1")
    page.keyboard.press("Escape")
    page.click("[data-testid=about-dialog] footer button")
    # German
    page.click("[data-testid=language]")
    page.keyboard.press("F1")
    expect(page.locator("[data-testid=shortcuts] summary")).to_contain_text("Tastenkürzel")
    expect(rows).to_have_count(len(documented(app, "de")))
    assert not [e for e in page.errors if "ResizeObserver" not in e]
