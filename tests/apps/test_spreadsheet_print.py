"""Spreadsheet: Print / PDF (apps/spreadsheet/src/js/print.js) – the printed HTML of the selection, a sheet or all sheets."""
import re

from playwright.sync_api import expect

# catch the print frame before it loads (Firefox under Playwright blocks the page in print())
CATCH = """() => { window.printed = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
  if (n.tagName === 'IFRAME' && n.dataset.testid === 'print-frame') { window.printed.push(n.srcdoc); n.onload = null; } }))).observe(document.body, { childList: true }); }"""

FILL = """() => {
  const wb = SS.workbook, ws = wb.getActiveSheet();
  const rows = [['Item', 'Price', 'Note']];
  for (let i = 1; i <= 60; i++) rows.push([`Item ${i}`, i * 1.5, i % 2 ? 'odd' : 'even']);
  ws.getRange(0, 0, rows.length, 3).setValues(rows);
  ws.getRange('A1:C1').setFontWeight('bold').setBackgroundColor('#ffeeaa');
  ws.getRange('B2:B61').setNumberFormat('0.00');
  ws.setColumnWidth(0, 200);
  ws.getRange('E2:F3').merge();
  ws.getRange('E2').setValue('merged');
  ws.setRowHidden ? ws.setRowHidden(5) : ws.hideRows(5);
  ws.setFrozenRows(1);
  wb.insertSheet('Second').getRange('B2').setValue('on the second sheet');
  wb.setActiveSheet(ws);
  ws.getRange('A1').activate();
}"""


def printed(page):
    page.click("[data-testid=print-ok]")
    page.wait_for_function("() => window.printed.length === 1")
    return page.evaluate("window.printed.pop()")


def test_print_sheet_selection_and_all(app_page):
    page = app_page("spreadsheet")
    page.evaluate(FILL)
    page.evaluate(CATCH)
    page.click("[data-testid=print]")
    dialog = page.locator("[data-testid=print-dialog]")
    expect(dialog).to_be_visible()
    # the frozen header row is repeated by default
    expect(page.locator("[data-testid=print-repeat]")).to_have_value("1")
    expect(page.locator("[data-testid=print-what]")).to_have_value("sheet")
    page.select_option("[data-testid=print-paper]", "A4")
    page.select_option("[data-testid=print-orientation]", "landscape")
    html = printed(page)
    assert "@page { size: 297mm 210mm;" in html
    assert html.count('<section class="sheet"') == 1
    head = html.split("<thead>")[1].split("</thead>")[0]
    assert ">Item<" in head and "font-weight:bold" in head and "background:#ffeeaa" in head
    body = html.split("<tbody>")[1]
    assert ">Item 1<" in body and ">1.50<" in body and ">90.00<" in body  # (display values with the number format)
    assert ">Item 5<" not in body and ">Item 6<" in body  # hidden row 6 (index 5)
    assert 'rowspan="2" colspan="2"' in body and ">merged<" in body
    assert '<col style="width:200px">' in html
    assert "on the second sheet" not in html
    assert page.evaluate("JSON.parse(localStorage.getItem('suite.spreadsheet.print')).orientation") == "landscape"

    # all sheets: each on new pages
    page.click("[data-testid=print]")
    expect(page.locator("[data-testid=print-orientation]")).to_have_value("landscape")  # (remembered)
    page.select_option("[data-testid=print-what]", "all")
    page.check("[data-testid=print-gridlines]")
    html = printed(page)
    assert html.count('<section class="sheet"') == 2 and "on the second sheet" in html and 'class="grid"' in html

    # the selection, fitted to the page width (the zoom is below 1 only when the columns are wider than the page)
    page.evaluate("SS.workbook.getActiveSheet().setColumnWidth(2, 1500); SS.workbook.getActiveSheet().getRange('A10:C12').activate()")
    page.keyboard.press("Control+p")
    expect(page.locator("[data-testid=print-what]")).to_have_value("selection")
    page.fill("[data-testid=print-repeat]", "0")
    html = printed(page)
    assert "<thead>" not in html
    body = html.split("<tbody>")[1]
    assert ">Item 9<" in body and ">Item 11<" in body and ">Item 12<" not in body and ">Item 8<" not in body
    zoom = float(re.search(r"zoom:([0-9.]+)", html).group(1))
    assert 0.3 < zoom < 0.7
    assert page.errors == []


def test_empty_and_mobile(app_page):
    page = app_page("spreadsheet", mobile=True)
    page.evaluate(CATCH)
    page.locator("[data-testid=print]").tap()
    box = page.locator("[data-testid=print-dialog] article").bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    page.locator("[data-testid=print-ok]").tap()
    expect(page.locator("[data-testid=toast]").last).to_contain_text("nothing to print")
    assert page.evaluate("window.printed.length") == 0
    assert page.errors == []
