"""Document editor: comments (Univer's thread comments; shared/js/doc-comments.js, read and written in DOCX and ODT)."""
import io
import re
import shutil
import subprocess
import zipfile

import pytest
from docx import Document
from playwright.sync_api import expect

from test_document import NO_PICKERS, click_text, open_file, ready

THREADS = "() => { const d = DOC.doc.save(); const r = d.resources.find((x) => x.name === 'DOC_UNIVER_THREAD_COMMENT_PLUGIN'); " \
          "const deco = new Map((d.body.customDecorations || []).map((x) => [x.id, x])); const all = Object.values(JSON.parse(r && r.data || '{}')).flat(); " \
          "return all.map((t) => ({ ref: t.ref, author: t.authorName || t.personId, resolved: !!t.resolved, text: t.text.dataStream.replace(/\\r\\n$/, '').replace(/\\r/g, '\\n'), " \
          "replies: (t.children || []).map((c) => [c.authorName || c.personId, c.text.dataStream.replace(/\\r\\n$/, '')]), " \
          "range: deco.has(t.id) ? d.body.dataStream.slice(deco.get(t.id).startIndex, deco.get(t.id).endIndex + 1) : null })); }"


def word_file(path):
    """A Word file with two comments (python-docx), one of them over two runs."""
    doc = Document()
    p = doc.add_paragraph("The quarterly ")
    run = p.add_run("figures look good")
    doc.add_comment(run, text="Please check the numbers.\nSecond line.", author="Anna Muster", initials="AM")
    p2 = doc.add_paragraph()
    a, b = p2.add_run("Second "), p2.add_run("paragraph")
    p2.add_run(" ends here.")
    doc.add_comment([a, b], text="Nice", author="Ben", initials="B")
    doc.save(path)
    return path


def save_as(page, fmt):
    page.click("[data-testid=save-as]")
    page.select_option("[data-testid=save-as-format]", fmt)
    with page.expect_download() as d:
        page.click("[data-testid=save-as-ok]")
    return d.value


def test_comments_from_word_and_back(app_page, tmp_path):
    page = ready(app_page)
    open_file(page, word_file(tmp_path / "review.docx"))
    threads = page.evaluate(THREADS)
    assert [(t["ref"], t["author"], t["text"], t["range"]) for t in threads] == [
        ("figures look good", "Anna Muster", "Please check the numbers.\nSecond line.", "figures look good"),
        ("Second paragraph", "Ben", "Nice", "Second paragraph")]
    # the panel lists them
    page.click("[data-testid=comments]")
    expect(page.get_by_text("Please check the numbers.")).to_be_visible()

    # a reply and a resolved thread survive DOCX: Word's commentsExtended (python-docx reads the comments)
    page.evaluate("""() => { const d = DOC.doc.save(); const r = d.resources.find((x) => x.name === 'DOC_UNIVER_THREAD_COMMENT_PLUGIN');
      const data = JSON.parse(r.data); const [first] = data.default_doc;
      first.children.push({ id: 'reply1', threadId: first.id, parentId: first.id, dT: '2026/11/07 10:30', personId: 'Carla', authorName: 'Carla',
        text: { dataStream: 'Done.\\r\\n', paragraphs: [{ startIndex: 5 }], sectionBreaks: [{ startIndex: 6 }] }, unitId: first.unitId, subUnitId: 'default_doc' });
      first.resolved = true; r.data = JSON.stringify(data); d.id = 'doc-reloaded'; DOC.load(d, 'review.docx'); }""")
    page.wait_for_timeout(800)
    download = save_as(page, "docx")
    path = tmp_path / "saved.docx"
    download.save_as(path)
    saved = Document(str(path))
    comments = [(c.author, c.initials, c.text) for c in saved.comments]
    assert comments == [("Anna Muster", "AM", "Please check the numbers.\nSecond line."), ("Carla", "C", "Done."), ("Ben", "B", "Nice")]
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode()
        ext = z.read("word/commentsExtended.xml").decode()
    # the range markers around the commented text (also for the reply), the reference after it
    assert re.search(r'<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/><w:r>.*?figures look good.*?<w:commentRangeEnd w:id="0"/><w:commentRangeEnd w:id="1"/>', xml)
    assert '<w:commentReference w:id="2"/>' in xml
    assert 'w15:paraIdParent=' in ext and 'w15:done="1"' in ext

    # opened again: the reply belongs to its comment, the thread is resolved
    page2 = ready(app_page)
    open_file(page2, path)
    threads = page2.evaluate(THREADS)
    assert threads[0]["replies"] == [["Carla", "Done."]] and threads[0]["resolved"] is True and threads[0]["range"] == "figures look good"
    assert threads[1]["range"] == "Second paragraph" and not threads[1]["resolved"]
    assert page.errors == [] and page2.errors == []


def test_add_comment_and_odt(app_page, tmp_path):
    page = ready(app_page)
    click_text(page)
    page.keyboard.type("Alpha beta gamma")
    page.keyboard.press("Home")
    for _ in range(5):
        page.keyboard.press("Shift+ArrowRight")
    # the first comment asks for the author's name
    page.keyboard.press("Control+Alt+m")
    expect(page.locator("[data-testid=author-dialog]")).to_be_visible()
    page.fill("[data-testid=author-name]", "Dora Test")
    page.click("[data-testid=author-ok]")
    expect(page.get_by_role("button", name="Comment", exact=True)).to_be_visible()
    box = page.get_by_text("Reply or add others with @").bounding_box()  # (the comment editor: a canvas over its placeholder)
    page.mouse.click(box["x"] + 20, box["y"] + box["height"] / 2)
    page.keyboard.type("Is alpha right?")
    page.get_by_role("button", name="Comment", exact=True).click()
    page.wait_for_function("() => (DOC.doc.save().body.customDecorations || []).length === 1")
    threads = page.evaluate(THREADS)
    assert threads == [{"ref": "Alpha", "author": "Dora Test", "resolved": False, "text": "Is alpha right?", "replies": [], "range": "Alpha"}]
    assert page.evaluate("localStorage.getItem('suite.author')") == "Dora Test"
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    # the name can be changed in the settings
    page.keyboard.press("F1")
    page.click("[data-testid=prefs] summary")
    expect(page.locator("[data-testid=pref-author]")).to_have_value("Dora Test")
    page.keyboard.press("Escape")

    # ODT: office:annotation around the text
    download = save_as(page, "odt")
    path = tmp_path / "notes.odt"
    download.save_as(path)
    content = zipfile.ZipFile(path).read("content.xml").decode()
    assert re.search(r'<office:annotation office:name="__Annotation__1"><dc:creator>Dora Test</dc:creator><dc:date>[0-9T:.-]+</dc:date><text:p>Is alpha right\?</text:p></office:annotation>(<text:span[^>]*>)?Alpha(</text:span>)?<office:annotation-end office:name="__Annotation__1"/>', content)
    page2 = ready(app_page)
    open_file(page2, path)
    assert page2.evaluate(THREADS) == threads
    assert page.errors == [] and page2.errors == []


@pytest.mark.skipif(not shutil.which("soffice"), reason="LibreOffice is not installed")
def test_libreoffice_reads_and_writes_the_comments(app_page, tmp_path):
    """Our ODT opens in LibreOffice with its comments; LibreOffice's ODT (converted from Word) opens here with them."""
    page = ready(app_page)
    open_file(page, word_file(tmp_path / "review.docx"))
    download = save_as(page, "odt")
    ours = tmp_path / "ours.odt"
    download.save_as(ours)
    out = tmp_path / "lo"
    subprocess.run(["soffice", "--headless", "--convert-to", "docx", "--outdir", str(out), str(ours)], check=True, capture_output=True, timeout=180)
    converted = Document(str(out / "ours.docx"))
    assert [(c.author, c.text) for c in converted.comments] == [("Anna Muster", "Please check the numbers.\nSecond line."), ("Ben", "Nice")]

    subprocess.run(["soffice", "--headless", "--convert-to", "odt", "--outdir", str(out), str(tmp_path / "review.docx")], check=True, capture_output=True, timeout=180)
    page2 = ready(app_page)
    open_file(page2, out / "review.odt")
    assert [(t["range"], t["author"], t["text"]) for t in page2.evaluate(THREADS)] == [
        ("figures look good", "Anna Muster", "Please check the numbers.\nSecond line."), ("Second paragraph", "Ben", "Nice")]
    assert page.errors == [] and page2.errors == []


def test_comments_on_a_phone(app_page, tmp_path):
    page = ready(app_page, mobile=True)
    open_file(page, word_file(tmp_path / "review.docx"))
    page.locator("[data-testid=comments]").tap()
    note = page.get_by_text("Please check the numbers.")
    expect(note).to_be_visible()
    box = note.bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= page.viewport_size["width"] + 1
    assert page.errors == []
