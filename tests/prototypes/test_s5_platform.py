"""S-5: platform capabilities of a single HTML file opened via file:// (embedded WASM, workers, storage)."""
import json
import shutil

from helpers.paths import DIST, dist_url


def probe(page, url):
    page.goto(url)
    page.wait_for_selector("body[data-ready]")
    return page.evaluate("window.S5")


def test_embedded_wasm_and_worker(page):
    result = probe(page, dist_url("s5-platform"))
    print(page.context.browser.browser_type.name, json.dumps(result, indent=1))
    assert result["wasmAdd"] == 5
    assert result["workerSquare"] == 49
    assert result["isSecureContext"] is True
    assert result["crossOriginIsolated"] is False  # no WASM threads on file://
    assert result["decompressionStream"] is True
    assert page.errors == []
    assert page.requests == []


def test_local_storage_between_files(page, tmp_path):
    """Is localStorage shared between different HTML files opened via file://?"""
    other = tmp_path / "other.html"
    shutil.copy(DIST / "s5-platform.html", other)
    probe(page, dist_url("s5-platform"))
    page.evaluate("localStorage.setItem('shared-test', 'written by s5-platform.html')")
    probe(page, other.as_uri())
    seen = page.evaluate("localStorage.getItem('shared-test')")
    browser = page.context.browser.browser_type.name
    print(browser, "other file sees:", seen)
    # Chromium and Firefox (Playwright builds) share one storage area for all file:// pages, so any
    # local HTML file can read what another one stored: never keep secrets in browser storage (D-006).
    assert seen == "written by s5-platform.html"
