"""Hex editor: statistics – byte histogram, entropy (file, selection, along the data)."""
import os
import re

from playwright.sync_api import expect

from test_hexeditor import NO_PICKERS, load


def test_stats(app_page):
    page = app_page("hexeditor", init_script=NO_PICKERS)
    r = page.evaluate("""() => { const z = HE.byteStats(new Uint8Array(1000)); const all = HE.byteStats(Uint8Array.from({ length: 256 * 40 }, (_, i) => i % 256));
      const two = HE.byteStats(Uint8Array.from({ length: 1000 }, (_, i) => (i % 2 ? 65 : 66)));
      return [z.entropy, z.zeros, all.entropy, two.entropy, two.printable, two.top]; }""")
    assert r[0] == 0 and r[1] == 1000 and abs(r[2] - 8) < 1e-9 and abs(r[3] - 1) < 1e-9 and r[4] == 1000 and r[5] == [[65, 500], [66, 500]]
    # text, then random bytes: the curve rises in the second half
    data = b"hello world, " * 400 + os.urandom(5200)
    load(page, data)
    page.click("[data-testid=stats]")
    expect(page.locator("[data-testid=stats-dialog]")).to_be_visible()
    ent = float(page.inner_text("[data-testid=stats-entropy]"))
    assert 4 < ent < 8
    blocks = page.evaluate("HE.app.state.stats.s.blocks.map((b) => b.entropy)")
    assert blocks[0] < 4 and max(blocks) > 7 and blocks[-2] > 6.5
    expect(page.locator("[data-testid=stats-histogram]")).to_be_visible()
    page.check("[data-testid=stats-log]")
    # a click on the curve at 3/4 goes into the random part
    box = page.locator("[data-testid=stats-blocks]").bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.75, box["y"] + box["height"] / 2)
    expect(page.locator("[data-testid=stats-dialog]")).to_have_count(0)
    assert page.evaluate("HE.app.state.cursor") > len(data) * 0.6
    # the selection only: just the text
    page.evaluate("() => { HE.app.moveTo(0); HE.app.moveTo(1299, true); }")
    page.click("[data-testid=stats]")
    expect(page.locator("[data-testid=stats-dialog] header small")).to_contain_text(re.compile(r"1[.,]300"))
    assert float(page.inner_text("[data-testid=stats-entropy]")) < 4
    expect(page.locator("[data-testid=stats-printable]")).to_have_text("100.0 %")
    page.click("[data-testid=stats-close]")
    assert page.errors == []
