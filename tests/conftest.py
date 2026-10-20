import pytest
from playwright.sync_api import sync_playwright

from helpers.devices import install_phone_navigation, phone_options

pytest_plugins = ["helpers.relay_fixtures", "helpers.ssh_fixtures", "helpers.http_fixtures"]

BROWSERS = ["chromium", "firefox"]


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--mobile"):
        return
    skip = pytest.mark.skip(reason="spike prototypes are not apps; they are not checked on phone displays")
    for item in items:
        if "/prototypes/" in str(item.fspath).replace("\\", "/"):
            item.add_marker(skip)


def pytest_addoption(parser):
    parser.addoption("--mobile", action="store_true",
                     help="run every browser test on a phone display (393x851, touch; Chromium also emulates a mobile browser)")


@pytest.fixture(scope="session")
def playwright():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session", params=BROWSERS)
def browser(request, playwright):
    browser = getattr(playwright, request.param).launch()
    if request.config.getoption("--mobile"):
        # every context gets the phone display unless a test sets its own viewport
        new_context = browser.new_context

        def mobile_context(**options):
            phone = "viewport" not in options
            if phone:
                options = {**phone_options(browser), **options}
            context = new_context(**options)
            context.__dict__["_suite_mobile"] = phone  # actions open drawers like a user (helpers/devices.py)
            return context

        install_phone_navigation()

        browser.new_context = mobile_context
    yield browser
    browser.close()


@pytest.fixture
def page(browser):
    """A page that records console errors, page errors and every non-file:// request."""
    context = browser.new_context()
    page = context.new_page()
    page.errors = []
    page.requests = []
    page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("request", lambda r: not r.url.startswith(("file:", "data:", "blob:")) and page.requests.append(r.url))
    yield page
    context.close()

