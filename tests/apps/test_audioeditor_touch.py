"""Audio editor on a touch screen: one finger moves the view, a tap sets the cursor, a long press and drag selects, two fingers zoom."""
import pytest
from playwright.sync_api import expect

from helpers.touch import Touch
from test_audioeditor import make_wav, open_files, ready


def test_touch_gestures(app_page, tmp_path, browser):
    if browser.browser_type.name != "chromium":
        pytest.skip("touch input through the DevTools protocol (Chromium)")
    page = ready(app_page, mobile=True)
    open_files(page, make_wav(tmp_path / "long.wav", seconds=20))
    page.evaluate("AE.state.view.pps = 100; AE.state.view.start = 0")
    lane = page.locator("[data-testid=lane]").first.bounding_box()
    y = lane["y"] + lane["height"] * 0.7  # (below the clip's title bar)
    touch = Touch(page)
    # one finger to the left: later in time
    touch.drag((lane["x"] + lane["width"] * 0.8, y), (lane["x"] + lane["width"] * 0.2, y))
    start = page.evaluate("AE.state.view.start")
    assert abs(start - lane["width"] * 0.6 / 100) < 0.3, start
    assert page.evaluate("AE.state.sel.end - AE.state.sel.start") == 0  # no selection
    # a tap: the cursor
    touch.tap((lane["x"] + 100, y))
    page.wait_for_timeout(100)
    assert abs(page.evaluate("AE.state.sel.start") - (start + 1.0)) < 0.1
    # a long press, then drag: a selection
    touch.drag((lane["x"] + 50, y), (lane["x"] + 150, y), hold=600)
    page.wait_for_timeout(100)
    a, b = page.evaluate("[AE.state.sel.start, AE.state.sel.end]")
    assert abs((b - a) - 1.0) < 0.15 and abs(a - (start + 0.5)) < 0.15, (a, b)
    # two fingers apart: zoom in
    touch.pinch((lane["x"] + lane["width"] / 2, y), 60, 180)
    page.wait_for_timeout(100)
    assert page.evaluate("AE.state.view.pps") > 200
    expect(page.locator("[data-testid=hscroll]")).to_be_visible()
    assert page.errors == []
