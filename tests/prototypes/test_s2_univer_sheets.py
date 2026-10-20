"""S-2: Univer Sheets (Apache-2.0) from a single HTML file opened via file://."""
from helpers.paths import dist_url

VALUE = "a => S2.univerAPI.getActiveWorkbook().getActiveSheet().getRange(a).getValue()"


def open_sheet(page):
    page.goto(dist_url("s2-univer-sheets"))
    page.wait_for_selector("body[data-ready]", timeout=60000)
    page.wait_for_selector("canvas")


def test_formula_and_api(page):
    open_sheet(page)
    page.wait_for_timeout(1000)  # formula engine runs asynchronously
    assert page.evaluate(VALUE, "B4") == 7.5
    page.evaluate("S2.univerAPI.getActiveWorkbook().getActiveSheet().getRange('B2').setValue(10)")
    page.wait_for_timeout(1000)
    assert page.evaluate(VALUE, "B4") == 14.5
    assert page.errors == []
    assert page.requests == []


def test_typing_into_cell(page):
    open_sheet(page)
    page.evaluate("S2.univerAPI.getActiveWorkbook().getActiveSheet().getRange('C2').activate()")
    page.keyboard.type("=B2*2")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1000)
    assert page.evaluate(VALUE, "C2") == 6
    assert page.errors == []
