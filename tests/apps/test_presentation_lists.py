"""Presentation: bulleted and numbered lists in text boxes (list buttons, Tab / Shift+Tab, Enter; a:buChar / a:buAutoNum and lvl in PPTX)."""
from lxml import etree
from playwright.sync_api import expect
from pptx import Presentation

from test_presentation import ready

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def markers(page):
    return page.evaluate("[...document.querySelectorAll('[data-testid=text-editor] p')].map((p) => [(p.querySelector('.bullet') || {}).textContent || '', p.dataset.level, p.textContent.replace((p.querySelector('.bullet') || {}).textContent || '', '')])")


def paragraphs(page):
    return page.evaluate("PR.state.deck.slides[PR.state.current].elements.at(-1).text.paragraphs.map((p) => [p.runs.map((r) => r.text).join(''), p.level, p.bullet])")


def test_lists_while_editing_and_in_pptx(app_page, tmp_path):
    page = ready(app_page)
    page.click("[data-testid=add-text]")
    editor = page.locator("[data-testid=text-editor]")
    expect(editor).to_be_focused()
    page.keyboard.press("Control+a")
    page.keyboard.type("First")
    page.keyboard.press("Enter")
    page.keyboard.type("Second")
    page.keyboard.press("Enter")
    page.keyboard.type("Third")
    page.keyboard.press("Control+a")
    page.click("[data-testid=list-number]")  # (the buttons keep the editing)
    expect(editor).to_be_focused()
    assert [m[0] for m in markers(page)] == ["1.", "2.", "3."]
    # Tab on the second paragraph: one level down, numbered on its own
    editor.locator("p").nth(1).click()
    page.keyboard.press("End")
    page.keyboard.press("Tab")
    assert [(m[0], m[1]) for m in markers(page)] == [("1.", "0"), ("1.", "1"), ("2.", "0")]
    page.keyboard.press("Shift+Tab")
    assert [(m[0], m[1]) for m in markers(page)] == [("1.", "0"), ("2.", "0"), ("3.", "0")]
    page.keyboard.press("Tab")
    # Enter continues the list; Enter on an empty list paragraph ends it
    editor.locator("p").nth(2).click()
    page.keyboard.press("End")
    page.keyboard.press("Enter")
    page.keyboard.type("Fourth")
    assert [m[0] for m in markers(page)] == ["1.", "1.", "2.", "3."]
    page.keyboard.press("Enter")
    page.keyboard.press("Enter")
    page.keyboard.type("After the list")
    assert markers(page)[-1][0] == "" and markers(page)[-1][2] == "After the list"
    page.locator("[data-testid=stage]").click(position={"x": 5, "y": 5})  # (the editing ends)
    paras = paragraphs(page)
    assert [(p[0], p[1], p[2]) for p in paras] == [
        ("First", 0, {"auto": "arabicPeriod"}), ("Second", 1, {"auto": "arabicPeriod"}), ("Third", 0, {"auto": "arabicPeriod"}),
        ("Fourth", 0, {"auto": "arabicPeriod"}), ("After the list", 0, None)]

    # the whole element: bullets for all paragraphs, again: off
    page.locator("[data-testid=stage] .el").last.click()
    page.click("[data-testid=list-bullet]")
    assert {str(p[2]) for p in paragraphs(page)} == {"{'char': '•'}"}
    page.click("[data-testid=list-number]")
    page.click("[data-testid=list-indent]")
    assert [p[1] for p in paragraphs(page)] == [1, 2, 1, 1, 1]
    page.click("[data-testid=list-outdent]")

    # PPTX: numbering and levels
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    path = tmp_path / "lists.pptx"
    d.value.save_as(path)
    shape = [s for s in Presentation(str(path)).slides[0].shapes if s.has_text_frame and "Fourth" in s.text_frame.text][0]
    ps = etree.fromstring(etree.tostring(shape._element)).iter(f"{A}p")
    props = [(p.find(f"{A}pPr").get("lvl", "0"), p.find(f"{A}pPr/{A}buAutoNum") is not None) for p in ps]
    assert props == [("0", True), ("1", True), ("0", True), ("0", True), ("0", True)]
    assert page.errors == []


def test_list_buttons_on_a_phone(app_page):
    page = ready(app_page, mobile=True)
    page.click("[data-testid=add-text]")
    expect(page.locator("[data-testid=text-editor]")).to_be_focused()
    page.keyboard.press("Control+a")
    page.keyboard.type("Item")
    page.locator("[data-testid=stage]").click(position={"x": 5, "y": 5})
    page.locator("[data-testid=stage] .el").last.tap()
    page.click("[data-testid=toggle-panels]")
    page.locator("[data-testid=list-bullet]").tap()  # (after editing and tapping the element: Moveable once swallowed this tap)
    assert paragraphs(page)[0][2] == {"char": "•"}
    expect(page.locator("[data-testid=stage] .el").last.locator(".bullet")).to_have_text("•")
    assert page.errors == []
