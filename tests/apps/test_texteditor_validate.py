"""Text editor: syntax checks of JSON, XML and YAML (marked while typing, "Check syntax"), YAML formatting and conversions."""
from playwright.sync_api import expect

from test_texteditor import open_bytes

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def text(page):
    return page.evaluate("TE.app.view.state.doc.toString()")


def tool(page, value):
    page.select_option("[data-testid=tools]", value)


def test_checks(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    r = page.evaluate("""() => { const f = TE.app.checkSyntax;
      return [f('json', '{"a": 1,\\n "b": }'), f('json', '{"a": [1, 2]}'), f('xml', '<a>\\n  <b></a>'), f('xml', '<a><b/></a>'),
              f('yaml', 'a: 1\\nb: [1, 2\\nc: 3'), f('yaml', 'a: 1\\nlist:\\n  - x\\n'), f('text', 'anything')]; }""")
    assert len(r[0]) == 1 and r[0][0]["from"] >= 13 and r[1] == []
    assert len(r[2]) == 1 and r[3] == []
    assert len(r[4]) == 1 and r[5] == [] and r[6] == []
    # live: a broken JSON file gets a lint mark; fixing it removes it
    open_bytes(page, "data.json", b'{"name": "x",\n "items": [1, 2,]\n}')
    expect(page.locator(".cm-lintRange-error")).to_have_count(1, timeout=5000)
    expect(page.locator(".cm-gutter-lint .cm-lint-marker-error")).to_have_count(1)
    tool(page, "checkSyntax")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Line 2")
    assert page.evaluate("TE.app.view.state.doc.lineAt(TE.app.view.state.selection.main.head).number") == 2
    page.evaluate("() => { const v = TE.app.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '{\"ok\": true}' } }); }")
    expect(page.locator(".cm-lintRange-error")).to_have_count(0, timeout=5000)
    tool(page, "checkSyntax")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("correct")
    # a language without a check
    open_bytes(page, "notes.txt", b"hello")
    tool(page, "checkSyntax")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("no syntax check")
    assert [e for e in page.errors if "XML Parsing Error" not in e] == []  # (Firefox logs every XML parse error)


def test_yaml_and_xml_tools(app_page):
    page = app_page("texteditor", init_script=NO_PICKERS)
    open_bytes(page, "c.json", b'{"name": "suite", "apps": ["text", "image"], "count": 2}')
    tool(page, "jsonToYaml")
    assert text(page) == "name: suite\napps:\n  - text\n  - image\ncount: 2\n"
    tool(page, "yamlToJson")
    assert text(page) == '{\n  "name": "suite",\n  "apps": [\n    "text",\n    "image"\n  ],\n  "count": 2\n}'
    open_bytes(page, "c.yaml", b"a:   1\nb:\n    - x\n    -   z\n---\nc: {d: 3}\n")
    tool(page, "yamlFormat")
    assert text(page) == "a: 1\nb:\n  - x\n  - z\n---\nc:\n  d: 3\n"
    open_bytes(page, "c.xml", b'<?xml version="1.0"?>\n<a>\n  <b>t</b>\n  <c/>\n</a>\n')
    tool(page, "xmlMinify")
    assert text(page) == '<?xml version="1.0"?><a><b>t</b><c/></a>'
    open_bytes(page, "bad.yaml", b"a: [1\n")
    tool(page, "yamlFormat")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("not valid YAML")
    assert page.errors == []
