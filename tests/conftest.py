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


# Open and Save as go straight to the file system in the tests; the tests of the choice "File system or archive"
# (shared/js/archive-link.js) switch it on again with localStorage.setItem('suite.files.archives', '1') in an init script
NO_ARCHIVE_CHOICE = "try { localStorage.setItem('suite.files.archives', '0'); } catch (e) {}"


@pytest.fixture(scope="session", params=BROWSERS)
def browser(request, playwright):
    browser = getattr(playwright, request.param).launch()
    plain_context = browser.new_context

    def suite_context(**options):
        context = plain_context(**options)
        context.add_init_script(NO_ARCHIVE_CHOICE)
        return context

    browser.new_context = suite_context
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

