import pytest


@pytest.fixture
def app_page(browser):
    """Factory: open a built app in English; mobile=True emulates a phone (touch, small viewport)."""
    contexts = []

    def open_app(name, mobile=False, init_script="", **context_options):
        from helpers.paths import dist_url
        options = {"accept_downloads": True, **context_options}
        if mobile:
            from helpers.devices import phone_options
            options.update(phone_options(browser))
        context = browser.new_context(**options)
        context.add_init_script("try { localStorage.setItem('suite.lang', 'en'); } catch (e) {}" + init_script)
        contexts.append(context)
        page = context.new_page()
        page.errors, page.requests = [], []
        page.on("pageerror", lambda e: page.errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and page.errors.append(m.text))
        page.on("request", lambda r: not r.url.startswith(("file:", "data:", "blob:")) and page.requests.append(r.url))
        page.goto(dist_url(name))
        page.wait_for_selector("body[data-ready]", timeout=30000)
        return page

    yield open_app
    for context in contexts:
        context.close()
