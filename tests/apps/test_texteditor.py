"""Text editor (apps/texteditor)."""
import re
import pytest
from playwright.sync_api import expect

from helpers.paths import dist_url

OPEN = """async ([name, bytes]) => {
  await TE.app.openPicked([{ file: new File([new Uint8Array(bytes)], name), handle: null }]);
  const d = TE.app.docs[TE.app.active];
  return { name: d.name, text: d.state.doc.toString(), encoding: d.encoding, bom: d.bom, eol: d.eol, language: d.language };
}"""


def open_bytes(page, name, data):
    return page.evaluate(OPEN, [name, list(data)])


def save_download(page, tmp_path, selector="[data-testid=save]"):
    with page.expect_download() as download:
        page.click(selector)
    path = tmp_path / download.value.suggested_filename
    download.value.save_as(path)
    return path


def test_type_and_languages(app_page):
    page = app_page("texteditor")
    assert page.title() == "Text editor"
    page.click(".cm-content")
    page.keyboard.type("hello")
    assert page.locator("[data-testid=dirty]").count() == 1
    assert open_bytes(page, "script.py", b"def f():\n    return 1\n")["language"] == "python"
    assert page.locator(".cm-content .tok-keyword, .cm-content span").count() > 0
    for name, language in [("a.ts", "typescript"), ("Dockerfile", "dockerfile"), ("x.ps1", "powershell"), ("q.sql", "sql"), ("c.yml", "yaml"),
                           ("m.cs", "csharp"), ("p.rs", "rust"), ("README", "text")]:
        assert open_bytes(page, name, b"x\n")["language"] == language, name
    page.select_option("[data-testid=lang-select]", "json")
    assert page.evaluate("TE.app.docs[TE.app.active].language") == "json"
    assert page.errors == [] and page.requests == []


@pytest.mark.parametrize("name, data, encoding, bom, eol, text", [
    ("utf8.txt", "Grüße\n€\n".encode(), "utf-8", False, "lf", "Grüße\n€\n"),
    ("bom.txt", b"\xef\xbb\xbf" + "Grüße\r\nZeile\r\n".encode(), "utf-8", True, "crlf", "Grüße\nZeile\n"),
    ("le.txt", b"\xff\xfe" + "äöü\r\n".encode("utf-16-le"), "utf-16le", True, "crlf", "äöü\n"),
    ("be.txt", b"\xfe\xff" + "x€\n".encode("utf-16-be"), "utf-16be", True, "lf", "x€\n"),
    ("ansi.txt", "Größe 5€\r".encode("cp1252"), "windows-1252", False, "cr", "Größe 5€\n"),
])
def test_encodings_round_trip(app_page, tmp_path, name, data, encoding, bom, eol, text):
    page = app_page("texteditor")
    doc = open_bytes(page, name, data)
    assert (doc["encoding"], doc["bom"], doc["eol"], doc["text"]) == (encoding, bom, eol, text)
    assert save_download(page, tmp_path).read_bytes() == data  # unchanged file -> identical bytes


def test_undo_redo_buttons(app_page):
    page = app_page("texteditor")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.click(".cm-content")
    page.keyboard.type("hello")
    page.click("[data-testid=undo]")
    expect(page.locator(".cm-content")).to_have_text("")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.click("[data-testid=redo]")
    expect(page.locator(".cm-content")).to_have_text("hello")
    expect(page.locator("[data-testid=redo]")).to_be_disabled()


def test_change_encoding_and_line_endings(app_page, tmp_path):
    page = app_page("texteditor")
    open_bytes(page, "convert.txt", "ä\nb\n".encode())
    page.select_option("[data-testid=encoding]", "utf-16le")
    page.check("[data-testid=bom]")
    page.select_option("[data-testid=eol]", "crlf")
    assert save_download(page, tmp_path).read_bytes() == b"\xff\xfe" + "ä\r\nb\r\n".encode("utf-16-le")
    # characters that Windows-1252 cannot store: warning
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    page.keyboard.type("日本")
    page.select_option("[data-testid=encoding]", "windows-1252")
    page.click("[data-testid=save]")
    assert "cannot be stored in Windows-1252" in page.text_content("[data-testid=confirm]")
    page.click("[data-testid=confirm-cancel]")


def test_banner_after_download_save(app_page, tmp_path):
    page = app_page("texteditor")
    open_bytes(page, "notes.txt", b"a")
    page.click(".cm-content")
    page.keyboard.type("b")
    save_download(page, tmp_path)
    assert "Replace the original file" in page.text_content("[data-testid=banner]")
    assert page.locator("[data-testid=dirty]").count() == 0


NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def test_new_document_save_as(app_page, tmp_path):
    page = app_page("texteditor", init_script=NO_PICKERS)  # download path (the picker path: test_write_back_...)
    page.click(".cm-content")
    page.keyboard.type("neu")
    path = save_download(page, tmp_path)  # a new document is saved with "save as"
    assert path.name == "Untitled-1.txt" and path.read_text() == "neu"


def test_tabs_and_closing(app_page):
    page = app_page("texteditor")
    open_bytes(page, "one.txt", b"1")
    open_bytes(page, "two.txt", b"2")
    assert page.locator("[data-testid=tab]").count() == 2  # the empty untitled document was replaced
    page.locator("[data-testid=tab]").nth(0).click()
    assert page.evaluate("TE.app.view.state.doc.toString()") == "1"
    page.click(".cm-content")
    page.keyboard.type("x")
    page.locator("[data-testid=close-tab]").nth(0).click()
    assert "unsaved changes" in page.text_content("[data-testid=confirm]")
    page.click("[data-testid=confirm-cancel]")
    assert page.locator("[data-testid=tab]").count() == 2
    page.locator("[data-testid=close-tab]").nth(0).click()
    page.click("[data-testid=confirm-ok]")
    assert page.locator("[data-testid=tab]").count() == 1 and page.evaluate("TE.app.view.state.doc.toString()") == "2"
    page.click("[data-testid=new]")
    assert page.locator("[data-testid=tab]").count() == 2


def test_search_replace_and_goto(app_page):
    page = app_page("texteditor")
    open_bytes(page, "s.txt", b"foo bar foo\nline2\nline3 foo\n")
    page.click(".cm-content")
    page.keyboard.press("Control+f")
    page.fill(".cm-search input[name=search]", "foo")
    page.fill(".cm-search input[name=replace]", "baz")
    page.click(".cm-search button[name=replaceAll]")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "baz bar baz\nline2\nline3 baz\n"
    page.keyboard.press("Escape")
    page.click(".cm-content")
    page.keyboard.press("Control+g")
    page.fill(".cm-goto-line input[name=line]", "3")
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=position]")).to_have_text(re.compile(r"^Ln 3,"))


def test_multiple_cursors(app_page):
    page = app_page("texteditor")
    open_bytes(page, "m.txt", b"alpha\nbeta\ngamma\n")
    lines = page.locator(".cm-line")
    # Ctrl+click adds a cursor
    lines.nth(0).click(position={"x": 2, "y": 5})
    page.keyboard.press("Home")
    lines.nth(1).click(position={"x": 2, "y": 5}, modifiers=["Control"])
    assert page.text_content("[data-testid=cursors]") == "2 cursors"
    page.keyboard.press("Home")
    page.keyboard.type("> ")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "> alpha\n> beta\ngamma\n"
    # Alt+drag selects a column (rectangular selection)
    box0, box2 = lines.nth(0).bounding_box(), lines.nth(2).bounding_box()
    page.keyboard.down("Alt")
    page.mouse.move(box0["x"] + 1, box0["y"] + box0["height"] / 2)
    page.mouse.down()
    page.mouse.move(box2["x"] + 1, box2["y"] + box2["height"] / 2, steps=5)
    page.mouse.up()
    page.keyboard.up("Alt")
    assert page.evaluate("TE.app.view.state.selection.ranges.length") == 3
    page.keyboard.type("#")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "#> alpha\n#> beta\n#gamma\n"
    # Ctrl+D selects the word, then its next occurrence
    open_bytes(page, "d.txt", b"foo x foo y foo")
    page.evaluate("TE.app.view.dispatch({ selection: { anchor: 1 } }); TE.app.view.focus()")
    page.keyboard.press("Control+d")
    page.keyboard.press("Control+d")
    assert page.evaluate("TE.app.view.state.selection.ranges.map((r) => [r.from, r.to])") == [[0, 3], [6, 9]]
    page.keyboard.type("bar")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "bar x bar y foo"

def test_view_preferences_are_remembered(app_page):
    page = app_page("texteditor")
    page.click("[data-testid=wrap]")
    page.click("[data-testid=zoom-in]")
    page.click("[data-testid=whitespace]")
    assert page.locator(".cm-lineWrapping").count() == 1
    page.reload()
    page.wait_for_selector("body[data-ready]")
    prefs = page.evaluate("TE.app.prefs")
    assert prefs["wrap"] and prefs["whitespace"] and prefs["fontSize"] == 15
    assert page.locator(".cm-lineWrapping").count() == 1


def test_german_interface(app_page):
    page = app_page("texteditor", init_script="localStorage.setItem('suite.lang', 'de');")
    assert page.text_content("[data-testid=app-title]") == "Texteditor"
    assert page.text_content("[data-testid=save]") == "Speichern"
    assert page.locator("[data-testid=tab]").first.text_content().startswith("Unbenannt-1.txt")


def test_mobile_layout(app_page):
    page = app_page("texteditor", mobile=True)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")  # no horizontal page scrolling
    page.tap(".cm-content")
    page.keyboard.type("on the phone")
    assert page.evaluate("TE.app.view.state.doc.toString()") == "on the phone"
    for testid in ("new", "open", "save", "save-as", "find", "wrap"):
        page.locator(f"[data-testid={testid}]").scroll_into_view_if_needed()
        assert page.locator(f"[data-testid={testid}]").is_visible(), testid
    page.locator("[data-testid=find]").tap()
    assert page.locator(".cm-search").is_visible()
    assert page.errors == []


STUB_PICKERS = """
window.showOpenFilePicker = async () => { const root = await navigator.storage.getDirectory(); return [await root.getFileHandle('code.js')]; };
window.showSaveFilePicker = async (o) => { const root = await navigator.storage.getDirectory(); return await root.getFileHandle(o.suggestedName, { create: true }); };
"""


def test_write_back_and_recent_files(browser, dist_server):
    if browser.browser_type.name != "chromium":
        pytest.skip("File System Access API only in Chromium")
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');" + STUB_PICKERS)
    page = context.new_page()
    page.goto(f"{dist_server}/texteditor.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => { const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle('code.js', { create: true })).createWritable(); await w.write('let a = 1;\\r\\n'); await w.close(); }""")
    page.click("[data-testid=open]")
    page.wait_for_selector("[data-testid=tab][title='code.js']")
    assert page.evaluate("TE.app.docs[TE.app.active].language") == "javascript"
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    page.keyboard.type("let b = 2;")
    page.keyboard.press("Control+s")
    page.wait_for_selector("[data-testid=toast]:has-text('Saved to “code.js”')")
    content = page.evaluate("async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('code.js')).getFile()).text()")
    assert content == "let a = 1;\r\nlet b = 2;"  # CRLF kept
    assert "code.js" in page.locator("[data-testid=recent]").text_content()
    context.close()


def test_text_tools(app_page):
    page = app_page("texteditor")
    text = lambda: page.evaluate("TE.app.view.state.doc.toString()")
    select = lambda a, b: page.evaluate("([a, b]) => TE.app.view.dispatch({ selection: { anchor: a, head: b } })", [a, b])
    open_bytes(page, "list.txt", b"pear  \nApple\nbanana\napple\n\nfig 10\nfig 9\nApple")
    # whole document (no selection)
    page.select_option("[data-testid=tools]", "sortAsc")
    assert text() == "\nApple\napple\nApple\nbanana\nfig 9\nfig 10\npear  "  # natural order, case-insensitive, stable
    expect(page.locator("[data-testid=tools]")).to_have_value("")
    page.select_option("[data-testid=tools]", "unique")
    page.select_option("[data-testid=tools]", "removeEmpty")
    page.select_option("[data-testid=tools]", "trimTrailing")
    assert text() == "Apple\napple\nbanana\nfig 9\nfig 10\npear"
    page.keyboard.press("Control+z")
    assert text() == "Apple\napple\nbanana\nfig 9\nfig 10\npear  "
    # line tools act on the lines touched by the selection
    select(8, 14)  # inside "apple" to inside "banana"
    page.select_option("[data-testid=tools]", "sortDesc")
    assert text().startswith("Apple\nbanana\napple\nfig 9")
    # text tools act on the selection only
    select(0, 5)
    page.select_option("[data-testid=tools]", "upper")
    assert text().startswith("APPLE\nbanana")  # only the selection
    assert page.evaluate("TE.app.view.state.sliceDoc(TE.app.view.state.selection.main.from, TE.app.view.state.selection.main.to)") == "APPLE"
    # encoders and formatters (whole document)
    cases = [
        ("Grüße & <Tag>", "base64Encode", "R3LDvMOfZSAmIDxUYWc+"),
        ("R3LDvMOfZSAmIDxUYWc+", "base64Decode", "Grüße & <Tag>"),
        ("a b&c=ü", "urlEncode", "a%20b%26c%3D%C3%BC"),
        ("a+b%26c", "urlDecode", "a b&c"),
        ("<a href=\"x\">&</a>", "htmlEscape", "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"),
        ("&lt;b&gt;&#228;&#x1F600;&nbsp;", "htmlUnescape", "<b>ä😀 "),
        ("hello wORLD o'neil", "title", "Hello World O'neil"),
        ('{"a":[1,2],"b":{"c":null}}', "jsonFormat", '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}'),
        ('{\n  "a": [1, 2]\n}', "jsonMinify", '{"a":[1,2]}'),
        ('<?xml version="1.0"?><r a="1"><b>t</b><c/><!--x--></r>', "xmlFormat", '<?xml version="1.0"?>\n<r a="1">\n  <b>t</b>\n  <c/>\n  <!--x-->\n</r>'),
        ("one\n  two \nthree", "joinLines", "one two three"),
    ]
    for source, tool, expected in cases:
        page.evaluate("(s) => TE.app.view.dispatch({ changes: { from: 0, to: TE.app.view.state.doc.length, insert: s }, selection: { anchor: 0 } })", source)
        page.select_option("[data-testid=tools]", tool)
        assert text() == expected, tool
    # invalid input: message, text unchanged
    page.evaluate("TE.app.view.dispatch({ changes: { from: 0, to: TE.app.view.state.doc.length, insert: '{oops' }, selection: { anchor: 0 } })")
    page.select_option("[data-testid=tools]", "jsonFormat")
    expect(page.locator(".suite-toast")).to_contain_text("not valid JSON")
    assert text() == "{oops"
    assert page.errors == []


def test_compare_long_texts_with_many_changes(app_page):
    """Many changes spread over a long text are found one by one (the character diff of @codemirror/merge alone gave up
    and reported one change from the first difference to the end)."""
    import random
    rng = random.Random(3)
    words = "the quick brown fox jumps over lazy dog and runs into forest while birds sing songs about summer".split()
    lines = [" ".join(rng.choice(words) for _ in range(rng.randint(6, 12))) for _ in range(1000)]
    edited = [line + " edited" if i % 20 == 0 else line for i, line in enumerate(lines)]
    edited.insert(510, "a new line")  # (not next to an edited line)
    page = app_page("texteditor", init_script="window.showOpenFilePicker = undefined;")
    open_bytes(page, "old.txt", ("\n".join(lines) + "\n").encode())
    open_bytes(page, "new.txt", ("\n".join(edited) + "\n").encode())
    page.click("[data-testid=compare-start]")
    page.locator("[data-testid=compare-doc]", has_text="old.txt").click()
    expect(page.locator("[data-testid=diff-count]")).to_have_text("51 difference(s)")
    if page.viewport_size["width"] >= 760:
        # only the changed words are marked, not the whole line
        expect(page.locator(".cm-merge-b .cm-changedText").first).to_have_text(" edited")
    assert page.errors == []


def test_compare(app_page, tmp_path):
    page = app_page("texteditor", init_script="window.showOpenFilePicker = undefined;")
    open_bytes(page, "old.txt", b"one\ntwo\nthree\nfour\n")
    open_bytes(page, "new.txt", b"one\n2\nthree\nfour\nfive\n")
    page.click("[data-testid=compare-start]")
    page.locator("[data-testid=compare-doc]", has_text="old.txt").click()
    expect(page.locator("[data-testid=compare]")).to_be_visible()
    expect(page.locator("[data-testid=diff-count]")).to_have_text("2 difference(s)")
    if page.viewport_size["width"] >= 760:
        expect(page.locator(".cm-mergeView")).to_be_visible()
        # copy the left version of a change over to the right ("two" back instead of "2")
        page.locator(".cm-merge-revert button").first.click()
        expect(page.locator("[data-testid=diff-count]")).to_have_text("1 difference(s)")
    else:
        expect(page.locator(".cm-deletedChunk").first).to_be_visible()  # one view with the changes inline
        page.evaluate("() => { const v = TE.app.compare.unified; v.dispatch({ changes: { from: 4, to: 5, insert: 'two' } }); }")
        expect(page.locator("[data-testid=diff-count]")).to_have_text("1 difference(s)")
    page.click("[data-testid=diff-next]")
    page.click("[data-testid=compare-done]")
    expect(page.locator("[data-testid=compare]")).to_have_count(0)
    assert page.evaluate("TE.app.view.state.doc.toString()") == "one\ntwo\nthree\nfour\nfive\n"
    page.keyboard.press("Control+z")  # one undo step
    assert page.evaluate("TE.app.view.state.doc.toString()") == "one\n2\nthree\nfour\nfive\n"
    # identical texts, and a file from disk
    other = tmp_path / "same.txt"
    other.write_bytes(b"one\n2\nthree\nfour\nfive\n")
    page.click("[data-testid=compare-start]")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=compare-file]")
    chooser.value.set_files(str(other))
    expect(page.locator("[data-testid=diff-count]")).to_have_text("The texts are identical.")
    page.click("[data-testid=compare-start]")  # ends the comparison too
    expect(page.locator("[data-testid=compare]")).to_have_count(0)
    assert page.errors == []


def test_find_in_files(app_page):
    page = app_page("texteditor")
    open_bytes(page, "a.py", b"import os\nprint(os.name)\n")
    open_bytes(page, "b.txt", b"OS notes\nnothing here\n")
    page.click("[data-testid=find-all-open]")
    page.fill("[data-testid=find-all-input]", "os")
    expect(page.locator("[data-testid=find-all-summary]")).to_have_text("3 match(es) in 2 file(s)")
    page.click("[data-testid=find-all-case]")
    expect(page.locator("[data-testid=find-all-summary]")).to_have_text("2 match(es) in 1 file(s)")
    page.click("[data-testid=find-all-regex]")
    page.fill("[data-testid=find-all-input]", r"os\.\w+")
    expect(page.locator("[data-testid=find-all-summary]")).to_have_text("1 match(es) in 1 file(s)")
    # a click opens the document and selects the match
    page.locator("[data-testid=tab]", has_text="b.txt").click()
    page.locator("[data-testid=find-all-match]").first.click()
    expect(page.locator("[data-testid=tab][aria-selected=true]")).to_contain_text("a.py")
    assert page.evaluate("(() => { const s = TE.app.view.state; return s.sliceDoc(s.selection.main.from, s.selection.main.to); })()") == "os.name"
    page.fill("[data-testid=find-all-input]", "(")
    expect(page.locator("[data-testid=find-all-summary]")).to_contain_text("Invalid regular expression")
    page.click("[data-testid=find-all-close]")
    expect(page.locator("[data-testid=find-all]")).to_have_count(0)
    page.locator(".cm-content").click()
    page.keyboard.press("Control+Shift+F")
    expect(page.locator("[data-testid=find-all-input]")).to_be_focused()
    assert page.errors == []


def test_find_in_folder(browser, dist_server, tmp_path):
    """Chromium only: a folder through the File System Access API (an OPFS directory stands in for the picker)."""
    if browser.browser_type.name != "chromium":
        pytest.skip("folders need showDirectoryPicker")
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');")
    page = context.new_page()
    page.goto(dist_server + "/texteditor.html")
    page.wait_for_selector("body[data-ready]")
    page.evaluate("""async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('proj', { create: true });
      const write = async (d, name, text) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
      await write(dir, 'main.py', 'TODO: first\\nok\\n');
      const sub = await dir.getDirectoryHandle('lib', { create: true });
      await write(sub, 'util.js', '// TODO second\\n');
      await write(sub, 'image.bin', new Uint8Array([0, 1, 2, 84, 79, 68, 79]));
      const git = await dir.getDirectoryHandle('.git', { create: true });
      await write(git, 'HEAD', 'TODO never');
      window.showDirectoryPicker = async () => dir;
    }""")
    page.click("[data-testid=find-all-open]")
    page.click("[data-testid=find-in-folder]")
    page.fill("[data-testid=find-all-input]", "TODO")
    expect(page.locator("[data-testid=find-all-summary]")).to_have_text("2 match(es) in 2 file(s)")
    page.locator("[data-testid=find-all-match]").last.click()
    expect(page.locator("[data-testid=tab][aria-selected=true]")).to_contain_text("util.js")
    context.close()


def test_split_view(app_page):
    page = app_page("texteditor")
    open_bytes(page, "a.txt", b"first\nsecond\n")
    page.click("[data-testid=split-view]")
    expect(page.locator("[data-testid=split] .cm-content")).to_contain_text("second")
    main = lambda: page.evaluate("TE.app.view.state.doc.toString()")
    other = lambda: page.evaluate("TE.app.split.view.state.doc.toString()")
    # typing in the second view changes the document, and the other way round
    page.evaluate("() => { const v = TE.app.split.view; v.focus(); v.dispatch({ selection: { anchor: 0 } }); }")
    page.keyboard.type("A ")
    assert main() == other() == "A first\nsecond\n"
    page.evaluate("() => { const v = TE.app.view; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.length } }); }")
    page.keyboard.type("third")
    assert other() == main() == "A first\nsecond\nthird"
    # one undo history: Ctrl+Z in the second view undoes both
    page.evaluate("TE.app.split.view.focus()")
    page.keyboard.press("Control+z")
    page.keyboard.press("Control+z")
    assert main() == other() == "first\nsecond\n"
    assert page.locator("[data-testid=dirty]").count() == 0
    # the second view follows the active tab; ◫ closes it
    open_bytes(page, "b.txt", b"other file\n")
    expect(page.locator("[data-testid=split] .cm-content")).to_contain_text("other file")
    page.click("[data-testid=split-view]")
    expect(page.locator("[data-testid=split]")).to_have_count(0)
    assert page.errors == []


SQL = ("select a.id, b.name, count(*) as n from orders a inner join customers b on a.cust_id = b.id "
       "where a.total > 100 and b.country = 'AT' group by a.id, b.name order by n desc")


def test_sql_format_and_minify(app_page):
    page = app_page("texteditor")
    text = lambda: page.evaluate("TE.app.view.state.doc.toString()")
    assert open_bytes(page, "query.sql", SQL.encode())["language"] == "sql"
    page.select_option("[data-testid=tools]", "sqlFormat")
    dialog = page.locator("[data-testid=sql-dialog]")
    expect(dialog).to_contain_text("Formats the whole document.")
    preview = page.locator("[data-testid=sql-preview]")
    expect(preview).to_contain_text("SELECT\n  a.id,\n  b.name,\n  COUNT(*) AS n\nFROM")
    # the options change the preview
    page.select_option("[data-testid=sql-keyword-case]", "lower")
    expect(preview).to_contain_text("select\n  a.id,")
    page.select_option("[data-testid=sql-keyword-case]", "upper")
    page.select_option("[data-testid=sql-indent]", "4")
    page.select_option("[data-testid=sql-dialect]", "transactsql")
    page.select_option("[data-testid=sql-indent-style]", "tabularLeft")
    expect(preview).to_contain_text("SELECT    a.id,")
    page.select_option("[data-testid=sql-indent-style]", "standard")
    page.click("[data-testid=sql-format]")
    expect(dialog).to_have_count(0)
    assert text() == ("SELECT\n    a.id,\n    b.name,\n    COUNT(*) AS n\nFROM\n    orders a\n    INNER JOIN customers b ON a.cust_id = b.id\n"
                      "WHERE\n    a.total > 100\n    AND b.country = 'AT'\nGROUP BY\n    a.id,\n    b.name\nORDER BY\n    n DESC")
    # the options are remembered
    page.select_option("[data-testid=tools]", "sqlFormat")
    expect(page.locator("[data-testid=sql-indent]")).to_have_value("4")
    expect(page.locator("[data-testid=sql-dialect]")).to_have_value("transactsql")
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    # on one line: comments and whitespace go, strings and optimizer hints stay
    page.evaluate("(s) => TE.app.view.dispatch({ changes: { from: 0, to: TE.app.view.state.doc.length, insert: s } })",
                  "select  a, -- first\n  'x  y' /* note */ ,\"Col  1\"\nfrom t;\n\nselect /*+ index(t) */ ( 1 )")
    page.select_option("[data-testid=tools]", "sqlMinify")
    assert text() == "select a, 'x  y',\"Col  1\" from t; select /*+ index(t) */ (1)"  # (no space added where there was none)
    # only the selection, and invalid SQL: a message, the text stays
    page.evaluate("TE.app.view.dispatch({ selection: { anchor: 0, head: 9 } })")
    page.select_option("[data-testid=tools]", "sqlFormat")
    expect(dialog).to_contain_text("Formats the selection.")
    page.click("[data-testid=sql-format]")
    assert text().startswith("SELECT\n    a, 'x  y'")
    page.evaluate("TE.app.view.dispatch({ changes: { from: 0, to: TE.app.view.state.doc.length, insert: \"select 'open\" } })")
    page.select_option("[data-testid=tools]", "sqlFormat")
    expect(preview).to_contain_text("could not be formatted")
    page.click("[data-testid=sql-format]")
    expect(page.locator(".suite-toast")).to_contain_text("The SQL could not be formatted")
    assert text() == "select 'open"
    assert page.errors == []


SAS = """/* demo */
%let lib = work;
data &lib..out;
  set sashelp.class end=last;
  * a statement comment;
  if age > 12 then do;
    bmi = weight / height**2;
    dt = '01jan2024'd;
  end;
  format dt date9.;
run;
data x;
  input a b;
  datalines;
1 2
;
run;
"""


def test_sas_language(app_page):
    page = app_page("texteditor")
    assert open_bytes(page, "demo.sas", SAS.encode())["language"] == "sas"
    expect(page.locator("[data-testid=lang-select]")).to_have_value("sas")
    style = lambda text: page.evaluate("""(t) => { const s = Array.from(document.querySelectorAll('.cm-content .cm-line span')).find((e) => e.textContent === t);
      return s ? getComputedStyle(s).color : null; }""", text)
    # statements, comments, strings, macro variables, formats; words used as names are not keywords
    assert style("data") and style("data") == style("run") == style("set") == style("then")
    assert style("/* demo */") == style("* a statement comment;")
    assert style("'01jan2024'd") and style("'01jan2024'd") == style("1 2")  # data lines
    assert style("&lib.") and style("date9.") and style("%let")
    assert style("weight") is None and style("x") is None  # a variable, a data set name
    assert style("end") is not None and page.locator(".cm-content span", has_text="last").count() == 0  # end= is an option
    assert page.errors == []


def test_sas_completion_and_indentation(app_page):
    page = app_page("texteditor")
    open_bytes(page, "new.sas", b"%let cutoff = 10;\n")
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    options = page.locator(".cm-tooltip-autocomplete li")
    # procedures after PROC (case as typed)
    page.keyboard.type("proc so")
    expect(options.first).to_contain_text("sort")
    page.wait_for_timeout(150)  # (a completion is accepted only a moment after the list opened)
    page.keyboard.press("Enter")
    page.keyboard.type(" data=a;")
    page.keyboard.press("Enter")
    page.keyboard.type("by")
    page.keyboard.press("Escape")
    assert page.evaluate("TE.app.view.state.doc.toString()").endswith("proc sort data=a;\n    by")  # indented in the step (4 spaces)
    page.keyboard.type(" x;")
    page.keyboard.press("Enter")
    page.keyboard.type("run;")  # back to the left margin
    page.keyboard.press("Enter")
    page.keyboard.type("PROC PRI")
    expect(options.filter(has_text=re.compile(r"^PRINTprocedure$"))).to_have_count(1)  # upper case like the typed word
    page.keyboard.press("Escape")
    page.keyboard.press("Enter")
    # macro statements after %, macro variables after & (the program's own and automatic ones), functions
    page.keyboard.type("%sysf")
    expect(options.first).to_contain_text("sysfunc")
    page.keyboard.press("Escape")
    page.keyboard.type("(today()) &cu")
    expect(options.first).to_contain_text("cutoff")
    page.keyboard.press("Escape")
    page.keyboard.type(" &sysd")
    expect(options.filter(has_text="sysdate9")).to_have_count(1)
    page.keyboard.press("Escape")
    page.keyboard.type(" catx")
    expect(options.first).to_contain_text("catx")
    page.keyboard.press("Escape")
    text = page.evaluate("TE.app.view.state.doc.toString()")
    assert "proc sort data=a;\n    by x;\nrun;\n" in text, text
    assert page.errors == []


def test_indentation_and_tab_key(app_page):
    page = app_page("texteditor")
    text = lambda: page.evaluate("TE.app.view.state.doc.toString()")
    indent = page.locator("[data-testid=indent]")
    expect(indent).to_have_value("s4")
    page.click(".cm-content")
    # Tab inserts spaces up to the next stop and keeps the focus in the editor
    page.keyboard.type("a")
    page.keyboard.press("Tab")
    page.keyboard.type("b")
    assert text() == "a   b"
    assert page.evaluate("document.activeElement.classList.contains('cm-content')")
    # Ctrl+Alt+I: a tab character in any case
    page.keyboard.press("Control+Alt+i")
    assert text() == "a   b\t"
    # selected lines are indented, Shift+Tab outdents
    page.keyboard.press("Enter")
    page.keyboard.type("c")
    page.keyboard.press("Control+a")
    page.keyboard.press("Tab")
    assert text() == "    a   b\t\n    c"
    page.keyboard.press("Shift+Tab")
    assert text() == "a   b\t\nc"
    # tabs: Tab inserts a tab character; the choice is the default for new documents
    indent.select_option("t4")
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    page.keyboard.press("Tab")
    assert text() == "a   b\t\nc\t"
    assert page.evaluate("TE.app.prefs.indent") == "t4"
    page.click("[data-testid=new]")
    expect(indent).to_have_value("t4")
    # Esc, then Tab moves the focus on (keyboard users are not trapped)
    page.click(".cm-content")
    page.keyboard.press("Escape")
    page.keyboard.press("Tab")
    assert not page.evaluate("document.activeElement.classList.contains('cm-content')")
    # the indentation of opened files is detected
    open_bytes(page, "two.py", b"def f():\n  if x:\n    return 1\n")
    expect(indent).to_have_value("s2")
    open_bytes(page, "tabs.c", b"int main() {\n\treturn 0;\n}\n")
    expect(indent).to_have_value("t4")
    assert page.errors == []


def test_newer_version_of_an_open_file(app_page):
    """A dropped file with the name of an unchanged tab (no file handle): the same text switches to the tab, a newer version
    replaces it."""
    from helpers.hostile import drop_file
    page = app_page("texteditor", init_script=NO_PICKERS)
    drop_file(page, "notes.txt", b"one")
    page.wait_for_function("() => TE.app.docs.some((d) => d.name === 'notes.txt')")
    drop_file(page, "other.txt", b"x")
    drop_file(page, "notes.txt", b"one")
    page.wait_for_function("() => TE.app.docs[TE.app.active].name === 'notes.txt'")
    drop_file(page, "notes.txt", b"two")
    page.wait_for_function("() => TE.app.view.state.doc.toString() === 'two'")
    assert page.evaluate("TE.app.docs.filter((d) => d.name === 'notes.txt').length") == 1
    assert page.errors == []
