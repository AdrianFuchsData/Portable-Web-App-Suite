"""Web inspector: accessibility check with axe-core (isolated frame, the page's scripts do not run), German messages."""
from playwright.sync_api import expect

from test_webinspector import ready

BAD = """<html><head><title>Shop</title><style>.faint { color: #bbb; background: #fff; }</style></head><body>
<h1>Shop</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<button></button><form><input type="text" name="q"></form><p class="faint">Hard to read text</p>
<script>parent.postMessage({ axeResult: { violations: [], incomplete: [], passes: 0, inapplicable: 0, version: 'fake' } }, '*'); document.title = 'ran';</script>
<a href="javascript:alert(1)" onclick="alert(2)">link</a></body></html>"""

GOOD = """<html lang="en"><head><title>Fine</title></head><body><main><h1>Fine</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Logo">
<label>Search <input type="text" name="q"></label><button>Go</button></main></body></html>"""


def paste(page, html):
    page.click("[data-testid=paste]")
    page.fill("[data-testid=paste-source]", html)
    page.click("[data-testid=paste-ok]")
    expect(page.locator("[data-testid=summary]")).to_contain_text("pasted")
    page.click("[data-testid=sub-a11y]")


def test_accessibility(app_page):
    page = ready(app_page)
    paste(page, BAD)
    page.click("[data-testid=a11y-run]")
    summary = page.locator("[data-testid=a11y-summary]")
    expect(summary).to_contain_text("problems", timeout=60000)
    assert "fake" not in summary.inner_text()  # the page's own script did not run
    rules = page.locator("[data-testid=a11y-violation]")
    ids = {rules.nth(i).get_attribute("data-rule") for i in range(rules.count())}
    assert {"image-alt", "button-name", "label", "html-has-lang", "color-contrast"} <= ids, ids
    img = page.locator("[data-testid=a11y-violation][data-rule=image-alt]")
    img.locator("summary").click()
    expect(img.locator("[data-testid=a11y-node] code")).to_have_text("img")
    expect(img.locator("summary .wi-impact")).to_have_text("critical")
    # most severe first
    assert rules.first.locator(".wi-impact").inner_text() == "critical"
    # a clean page
    paste(page, GOOD)
    expect(page.locator("[data-testid=a11y-summary]")).to_have_count(0)  # (a new page: no old results)
    page.click("[data-testid=a11y-run]")
    expect(page.locator("[data-testid=a11y-summary]")).to_contain_text("No problems found", timeout=60000)
    assert page.errors == []


def test_accessibility_german(app_page):
    page = ready(app_page, init_script="try { localStorage.setItem('suite.lang', 'de'); } catch (e) {}")
    page.click("[data-testid=paste]")
    page.fill("[data-testid=paste-source]", BAD)
    page.click("[data-testid=paste-ok]")
    page.click("[data-testid=sub-a11y]")
    page.click("[data-testid=a11y-run]")
    expect(page.locator("[data-testid=a11y-summary]")).to_contain_text("Probleme", timeout=60000)
    expect(page.locator("[data-testid=a11y-violation][data-rule=image-alt] summary")).to_contain_text("Alternativtext")
    assert page.errors == []
