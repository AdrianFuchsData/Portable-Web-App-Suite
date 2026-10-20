"""PDF viewer (apps/pdfviewer)."""
import base64

import pytest
from playwright.sync_api import expect
from pypdf import PdfReader

from helpers import office_samples

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


@pytest.fixture(scope="session")
def pdfs(tmp_path_factory):
    d = tmp_path_factory.mktemp("pdf")
    return {"plain": office_samples.make_pdf(d / "test.pdf"), "secret": office_samples.make_pdf(d / "secret.pdf", password="geheim")}


def open_pdf(page, path):
    # do not wait for the promise: for protected files it only resolves after the password is entered
    page.evaluate("([n, b]) => { void PV.openBytes(n, Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); }", [path.name, base64.b64encode(path.read_bytes()).decode()])


def viewer(app_page, pdfs, **kw):
    page = app_page("pdfviewer", init_script=NO_PICKERS, **kw)
    open_pdf(page, pdfs["plain"])
    page.wait_for_selector(".page[data-page-number='1'] canvas")
    page.wait_for_selector(".page[data-page-number='1'] .textLayer span")
    return page


def show_sidebar(page):
    """Phones start with the thumbnails hidden: open them with ☰ like a user."""
    if page.locator("[data-testid=sidebar]").count() == 0:
        page.click("[data-testid=sidebar-toggle]")


def page_number(page):
    return page.locator("[data-testid=page]")


def test_open_render_text_and_thumbnails(app_page, pdfs):
    page = viewer(app_page, pdfs)
    expect(page.locator("[data-testid=pages]")).to_have_text("of 3")
    assert "Suchwort" in page.locator(".page[data-page-number='1'] .textLayer").text_content()
    show_sidebar(page)
    expect(page.locator("[data-testid=thumbnail]")).to_have_count(3)
    assert page.errors == [] and page.requests == []


def test_open_with_file_input(app_page, pdfs):
    page = app_page("pdfviewer", init_script=NO_PICKERS)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(pdfs["plain"]))
    expect(page.locator("[data-testid=pages]")).to_have_text("of 3")


def test_navigation_outline_and_links(app_page, pdfs):
    page = viewer(app_page, pdfs)
    page.click("[data-testid=next]")
    expect(page_number(page)).to_have_value("2")
    page.click("[data-testid=prev]")
    expect(page_number(page)).to_have_value("1")
    page.fill("[data-testid=page]", "3")
    page.keyboard.press("Enter")
    expect(page_number(page)).to_have_value("3")
    show_sidebar(page)
    page.locator("[data-testid=thumbnail]").nth(0).click()
    expect(page_number(page)).to_have_value("1")
    show_sidebar(page)  # on phones, choosing a page closes the sidebar
    page.click("[data-testid=outline-tab]")
    expect(page.locator("[data-testid=outline-item]")).to_have_text(["Kapitel 1", "Kapitel 2", "Kapitel 3"])
    page.locator("[data-testid=outline-item]").nth(1).click()
    expect(page_number(page)).to_have_value("2")
    show_sidebar(page)
    page.locator("[data-testid=outline-item]").nth(0).click()
    expect(page_number(page)).to_have_value("1")
    page.locator(".page[data-page-number='1'] .annotationLayer .linkAnnotation a").click()  # internal link to the last page
    expect(page_number(page)).to_have_value("3")


def test_zoom_and_rotate(app_page, pdfs):
    page = viewer(app_page, pdfs)
    page.select_option("[data-testid=scale]", "1")
    page.wait_for_timeout(200)
    width = page.locator(".page[data-page-number='1']").bounding_box()["width"]
    page.click("[data-testid=zoom-in]")
    page.wait_for_timeout(300)
    assert page.locator(".page[data-page-number='1']").bounding_box()["width"] > width * 1.2
    page.click("[data-testid=rotate]")
    page.wait_for_timeout(300)
    assert page.evaluate("PV.viewer.pagesRotation") == 90
    box = page.locator(".page[data-page-number='1']").bounding_box()
    assert box["width"] > box["height"]  # portrait page turned to landscape


def test_find(app_page, pdfs):
    page = viewer(app_page, pdfs)
    page.keyboard.press("Control+f")
    page.fill("[data-testid=find-input]", "Suchwort")
    expect(page.locator("[data-testid=matches]")).to_have_text("1 of 3 matches")
    page.click("[data-testid=find-next]")
    expect(page.locator("[data-testid=matches]")).to_have_text("2 of 3 matches")
    page.wait_for_selector(".textLayer .highlight")
    page.fill("[data-testid=find-input]", "nirgends")
    expect(page.locator("[data-testid=matches]")).to_have_text("No matches")


def save_download(page, tmp_path):
    with page.expect_download() as download:
        page.click("[data-testid=save]")
    path = tmp_path / download.value.suggested_filename
    download.value.save_as(path)
    return path


def test_fill_form_and_save(app_page, pdfs, tmp_path):
    page = viewer(app_page, pdfs)
    field = page.locator(".annotationLayer input").first
    field.fill("Anna Muster")
    field.press("Tab")
    expect(page.locator("[data-testid=save]")).not_to_have_class("secondary")  # changes
    path = save_download(page, tmp_path)
    assert PdfReader(path).get_fields()["name"]["/V"] == "Anna Muster"
    assert "Replace the original file" in page.text_content("[data-testid=banner]")


def test_ink_annotation_and_save(app_page, pdfs, tmp_path):
    page = viewer(app_page, pdfs)
    page.select_option("[data-testid=edit-mode]", str(page.evaluate("pdfjsLib.AnnotationEditorType.INK")))
    box = page.locator(".page[data-page-number='1']").bounding_box()
    x, y = box["x"] + box["width"] * 0.3, box["y"] + 350  # inside the visible part of the page
    page.mouse.move(x, y)
    page.mouse.down()
    for i in range(10):
        page.mouse.move(x + i * 15, y + (i % 2) * 20, steps=2)
    page.mouse.up()
    page.select_option("[data-testid=edit-mode]", "0")  # finish drawing
    for _ in range(50):  # the drawing is committed asynchronously
        if page.evaluate("PV.state.doc.annotationStorage.size") > 0:
            break
        page.wait_for_timeout(100)
    path = save_download(page, tmp_path)
    annots = [a.get_object()["/Subtype"] for a in PdfReader(path).pages[0].get("/Annots", [])]
    assert "/Ink" in annots


def test_password_protected(app_page, pdfs):
    page = app_page("pdfviewer", init_script=NO_PICKERS)
    open_pdf(page, pdfs["secret"])
    page.fill("[data-testid=password]", "falsch")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=password-wrong]")).to_be_visible()
    page.fill("[data-testid=password]", "geheim")
    page.click("[data-testid=password-ok]")
    expect(page.locator("[data-testid=pages]")).to_have_text("of 3")
    page.wait_for_selector(".page[data-page-number='1'] .textLayer span")


def test_print_prepares_all_pages(app_page, pdfs):
    page = viewer(app_page, pdfs)
    page.evaluate("window.print = () => { window.__printed = document.querySelectorAll('#pv-print img').length; }")
    page.click("[data-testid=print]")
    for _ in range(50):
        if page.evaluate("window.__printed"):
            break
        page.wait_for_timeout(100)
    assert page.evaluate("window.__printed") == 3


def test_german_interface(app_page, pdfs):
    page = app_page("pdfviewer", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=app-title]")).to_have_text("PDF-Betrachter")
    expect(page.locator("[data-testid=empty]")).to_contain_text("Öffnen Sie eine PDF-Datei")


def test_mobile_layout(app_page, pdfs):
    page = viewer(app_page, pdfs, mobile=True)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.locator("[data-testid=sidebar]").count() == 0  # sidebar closed on small screens
    page.locator("[data-testid=next]").scroll_into_view_if_needed()
    page.locator("[data-testid=next]").tap()
    expect(page_number(page)).to_have_value("2")
    assert page.errors == []


def page_texts(path):
    return [p.extract_text().split("\n")[0][:7] for p in PdfReader(path).pages]


def pages_menu(page, action):
    page.select_option("[data-testid=pages-menu]", action)


def wait_pages(page, n):
    expect(page.locator("[data-testid=pages]")).to_have_text(f"of {n}")
    page.wait_for_selector(".page[data-page-number='1'] canvas")


def test_page_operations(app_page, pdfs, tmp_path):
    page = viewer(app_page, pdfs)
    show_sidebar(page)
    # move page 3 to the front
    page.locator("[data-testid=page-select]").nth(2).check()
    expect(page.locator("[data-testid=pages-menu] option").first).to_have_text("📄 Pages (1)")
    pages_menu(page, "moveTo")
    page.fill("[data-testid=move-position]", "1")
    page.click("[data-testid=move-ok]")
    wait_pages(page, 3)
    expect(page_number(page)).to_have_value("1")
    expect(page.locator("[data-testid=save]")).not_to_have_class("secondary")  # changed
    # rotate the current page, delete page 2, undo the deletion
    pages_menu(page, "selectNone")
    pages_menu(page, "rotateRight")
    wait_pages(page, 3)
    show_sidebar(page)
    page.locator("[data-testid=page-select]").nth(1).check()
    pages_menu(page, "deletePages")
    page.click("[data-testid=confirm-ok]")
    wait_pages(page, 2)
    pages_menu(page, "undo")
    wait_pages(page, 3)
    path = save_download(page, tmp_path)
    reader = PdfReader(path)
    assert page_texts(path) == ["Seite 3", "Seite 1", "Seite 2"]
    assert reader.pages[0].rotation == 90 and reader.pages[1].rotation == 0
    assert reader.get_fields()["name"]  # the form survives
    # append another PDF (merge), then extract pages 1 and 4 into a new file
    with page.expect_file_chooser() as chooser:
        pages_menu(page, "appendPdf")
    chooser.value.set_files(str(pdfs["plain"]))
    wait_pages(page, 6)
    show_sidebar(page)
    page.locator("[data-testid=page-select]").nth(0).check()
    page.locator("[data-testid=page-select]").nth(3).check()
    with page.expect_download() as d:
        pages_menu(page, "extract")
    extracted = tmp_path / "extracted.pdf"
    d.value.save_as(extracted)
    assert page_texts(extracted) == ["Seite 3", "Seite 1"]
    # Ctrl+Z undoes page operations
    page.locator(".pv-container").click(position={"x": 5, "y": 5})
    page.keyboard.press("Control+z")
    wait_pages(page, 3)
    assert page.errors == []


def test_page_operations_need_an_unprotected_pdf(app_page, pdfs):
    page = app_page("pdfviewer", init_script=NO_PICKERS)
    open_pdf(page, pdfs["secret"])
    page.fill("[data-testid=password]", "geheim")
    page.click("[data-testid=password-ok]")
    wait_pages(page, 3)
    pages_menu(page, "rotateRight")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("protected PDF cannot be changed")


def test_sign(app_page, pdfs, tmp_path):
    page = viewer(app_page, pdfs)
    page.click("[data-testid=sign]")
    pad = page.locator("[data-testid=sign-pad]")
    page.click("[data-testid=sign-place]")  # nothing drawn yet
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Draw or type")
    box = pad.bounding_box()
    page.mouse.move(box["x"] + 20, box["y"] + box["height"] * 0.7)
    page.mouse.down()
    for i in range(12):
        page.mouse.move(box["x"] + 20 + i * box["width"] / 16, box["y"] + box["height"] * (0.3 if i % 2 else 0.7), steps=2)
    page.mouse.up()
    page.click("[data-testid=sign-place]")
    expect(page.locator("[data-testid=sign-dialog]")).to_have_count(0)
    canvas = page.locator(".page[data-page-number='1'] .canvasWrapper")
    cb = canvas.bounding_box()
    page.mouse.click(cb["x"] + cb["width"] * 0.3, cb["y"] + min(300, cb["height"] * 0.5))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("signature was added to page 1")
    expect(page.locator("[data-testid=save]")).not_to_have_class("secondary")
    path = save_download(page, tmp_path)
    resources = PdfReader(path).pages[0]["/Resources"]
    images = [x for x in resources.get("/XObject", {}).values() if x.get_object()["/Subtype"] == "/Image"]
    assert len(images) == 1
    # typed signature, cancelled placement
    page.click("[data-testid=sign]")
    page.fill("[data-testid=sign-typed]", "Anna Muster")
    page.click("[data-testid=sign-place]")
    page.keyboard.press("Escape")
    expect(page.locator("[data-testid=sign]")).to_have_class("secondary outline")
    assert page.errors == []


def test_digital_signatures(app_page, pdfs, tmp_path):
    from helpers.pdf_signing import pdf, sign
    signed = sign(pdf(), "rsa")
    files = {"rsa.pdf": signed, "ec.pdf": sign(pdf(), "ec"), "changed.pdf": signed[:200] + bytes([signed[200] ^ 1]) + signed[201:],
             "appended.pdf": signed + b"\n% added later\n"}
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
    page = app_page("pdfviewer", init_script=NO_PICKERS)
    bar = page.locator("[data-testid=signature-bar]")
    for name, state, text in (("rsa.pdf", "ok", "Signed by Anna Test – the signature is valid"), ("ec.pdf", "ok", "valid"),
                              ("changed.pdf", "bad", "is NOT valid"), ("appended.pdf", "changed", "changed after signing")):
        open_pdf(page, tmp_path / name)
        expect(bar).to_have_attribute("data-state", state, timeout=10000)
        expect(bar).to_contain_text(text)
    # details
    open_pdf(page, tmp_path / "rsa.pdf")
    expect(bar).to_have_attribute("data-state", "ok")
    bar.click()
    sig = page.locator("[data-testid=signature]")
    expect(sig).to_have_attribute("data-valid", "true")
    expect(sig).to_contain_text("Document unchanged since signing")
    expect(sig).to_contain_text("Signature matches the certificate")
    expect(page.locator("[data-testid=signature-reason]")).to_have_text("Freigabe")
    expect(page.locator("[data-testid=signature-subject]")).to_have_text("CN=Anna Test, O=Test GmbH")
    expect(sig).to_contain_text("self-signed certificate")
    expect(sig).to_contain_text(str(__import__("datetime").date.today().year))
    open_pdf(page, tmp_path / "changed.pdf")
    expect(sig).to_have_attribute("data-valid", "false")
    expect(sig).to_contain_text("The signed content was changed")
    open_pdf(page, tmp_path / "appended.pdf")
    expect(page.locator("[data-testid=signature-coverage]")).to_contain_text("bytes were added after signing")
    # unsigned files have no bar
    open_pdf(page, pdfs["plain"])
    page.wait_for_selector(".page[data-page-number='1'] canvas")
    expect(bar).to_have_count(0)
    assert page.errors == []
