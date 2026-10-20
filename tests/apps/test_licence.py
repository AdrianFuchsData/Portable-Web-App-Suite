"""Licence of the suite in every app (about dialog, from build.py): EUPL-1.2, notice, third-party components with their texts,
and the visible marks of a modified version (file MODIFIED)."""
import os
import subprocess
import sys

from playwright.sync_api import expect

from helpers.paths import ROOT


def open_licence(page):
    page.keyboard.press("F1")
    page.click("[data-testid=licence] > summary")
    expect(page.locator("[data-testid=licence-components]")).to_be_visible()


def test_licence_in_about_dialog(app_page):
    page = app_page("document")
    open_licence(page)
    expect(page.locator("[data-testid=licence-summary]")).to_contain_text("© 2026 Adrian Fuchs · Licensed under the EUPL-1.2")
    expect(page.locator("[data-testid=licence-summary] a")).to_have_attribute("href", "https://software.adrianfuchs.at/local-tools/portable-web-app-suite/")
    page.click("[data-testid=licence-text] > summary")
    expect(page.locator("[data-testid=licence-text] pre")).to_contain_text("EUROPEAN UNION PUBLIC LICENCE v. 1.2")
    page.click("[data-testid=licence-notice] > summary")
    expect(page.locator("[data-testid=licence-notice] pre")).to_contain_text("Modified versions must say so")
    # third-party components with their licence texts: the German dictionary (GPL) and Hunspell (LGPL)
    page.click("[data-testid=licence-components] > summary")
    components = page.locator("[data-testid=component]")
    german = components.filter(has_text="dictionary-de")
    expect(german).to_have_count(1)
    german.locator("summary").click()
    expect(german.locator("pre").first).to_contain_text("igerman98")
    expect(components.filter(has_text="Hunspell (compiled into")).to_contain_text("LGPL-2.1")
    assert components.count() > 50
    # German interface: German licence text
    page.keyboard.press("Escape")
    expect(page.locator("[data-testid=about-dialog]")).to_have_count(0)
    page.click("[data-testid=language]")
    open_licence(page)
    expect(page.locator("[data-testid=licence-summary]")).to_contain_text("Lizenziert unter der EUPL-1.2")
    page.click("[data-testid=licence-text] > summary")
    expect(page.locator("[data-testid=licence-text] pre")).to_contain_text("OPEN-SOURCE-LIZENZ FÜR DIE EUROPÄISCHE UNION v. 1.2")
    assert page.errors == []


def test_small_app_lists_its_components(app_page):
    page = app_page("hexeditor")
    open_licence(page)
    page.click("[data-testid=licence-components] > summary")
    names = page.locator("[data-testid=component] summary").all_inner_texts()
    assert any(n.startswith("htm ") for n in names) and any(n.startswith("Pico CSS") for n in names)
    assert not any("dictionary" in n for n in names)  # only what the app contains
    expect(page.locator("[data-testid=modified-badge]")).to_have_count(0)


def test_modified_version_is_marked(tmp_path, browser):
    marker = tmp_path / "MODIFIED"
    marker.write_text("Modified by Example Ltd, 2027-03-01: own presets\n", encoding="utf-8")
    env = {**os.environ, "SUITE_DIST": str(tmp_path / "dist"), "SUITE_MODIFIED_FILE": str(marker)}
    subprocess.run([sys.executable, str(ROOT / "build.py"), "apps/hexeditor"], cwd=ROOT, env=env, check=True, capture_output=True)
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');")
    page = context.new_page()
    page.goto((tmp_path / "dist" / "hexeditor.html").as_uri())
    page.wait_for_selector("body[data-ready]")
    assert page.title() == "Hex editor (modified version)"
    expect(page.locator("[data-testid=modified-badge]")).to_have_text("modified version")
    page.keyboard.press("F1")
    expect(page.locator("[data-testid=modified-notice]")).to_have_text("Modified version: Modified by Example Ltd, 2027-03-01: own presets")
    context.close()
