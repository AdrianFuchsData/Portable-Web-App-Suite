"""Helpers for "Open with…" (shared/js/bridge.js) tests."""
from playwright.sync_api import expect


def touch(page):
    return page.evaluate("matchMedia('(pointer: coarse)').matches")


def pick_row(page, scope, name):
    """Select one row of the archive manager (scope: its page or frame): a click with a mouse, the checkbox on touch
    screens (where a tap opens the entry)."""
    row = scope.locator("[data-testid=row]", has_text=name)
    if touch(page):
        row.locator("[data-testid=select]").check()
    else:
        row.click()


def open_row(page, scope, name):
    """Open a folder of the archive manager: double-click with a mouse, tap on touch screens."""
    row = scope.locator("[data-testid=row]", has_text=name)
    if touch(page):
        row.click()
    else:
        row.dblclick()


def open_with(page, app, click):
    """Click the "Open with…" control (click()), choose the app; returns the page of the target app (new window)."""
    click()
    expect(page.locator("[data-testid=open-with-dialog]")).to_be_visible()
    with page.context.expect_page() as new_page:
        page.click(f"[data-testid=open-with-dialog] button[data-app={app}]")
    target = new_page.value
    target.errors = []
    target.on("pageerror", lambda e: target.errors.append(str(e)))
    target.on("console", lambda m: m.type == "error" and target.errors.append(m.text))
    target.wait_for_load_state()
    assert target.url.endswith(f"/{app}.html"), target.url
    try:
        target.wait_for_selector("body[data-ready]", timeout=30000)
    except Exception:
        raise AssertionError(f"{app} did not start: {target.errors}")
    return target


def edit_and_save_text(editor, text):
    """Append text in the text editor and save (back to the source app)."""
    editor.click(".cm-content")
    editor.keyboard.press("Control+End")
    editor.keyboard.type(text)
    editor.keyboard.press("Control+s")
