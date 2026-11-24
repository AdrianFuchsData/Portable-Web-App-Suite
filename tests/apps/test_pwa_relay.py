"""Relay mode (relay.py --serve): the apps served by the relay can be installed as a web app: the page links its manifest, the service worker is registered and
keeps the pages, so that an app opens when the relay no longer runs."""
import json
import urllib.request

from playwright.sync_api import expect

from helpers.paths import DIST
from helpers.relay_fixtures import start_relay


def test_served_app_is_installable_and_works_offline(browser, tmp_path):
    relay = start_relay("python", token="pwa-token", serve=str(DIST))
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    try:
        url = f"{relay['url']}/texteditor.html"
        page.goto(url)
        page.wait_for_selector("body[data-ready]", timeout=30000)
        assert page.evaluate("document.querySelector('link[rel=manifest]').getAttribute('href')") == "texteditor.webmanifest"
        manifest = json.loads(urllib.request.urlopen(f"{relay['url']}/texteditor.webmanifest").read())
        assert manifest["name"] == "Text editor" and manifest["icons"][0]["src"] == "texteditor.icon.svg"
        assert urllib.request.urlopen(f"{relay['url']}/texteditor.icon.svg").read().startswith(b"<svg")
        page.evaluate("navigator.serviceWorker.ready.then(() => true)")
        page.reload()
        page.wait_for_selector("body[data-ready]", timeout=30000)
        assert page.evaluate("!!navigator.serviceWorker.controller")
        # the relay stops: the app still opens (from the service worker's cache)
        relay["stop"]()
        relay = None
        page.reload()
        page.wait_for_selector("body[data-ready]", timeout=30000)
        expect(page.locator("[data-testid=app-title]")).to_have_text("Text editor")
        assert not [e for e in errors if "service worker" not in e.lower()], errors
    finally:
        context.close()
        if relay:
            relay["stop"]()
