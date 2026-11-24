"""Web slides: PDF file export (pictures of reveal.js's print view, one page per slide or per fragment step)."""
from playwright.sync_api import expect
from pypdf import PdfReader

from test_reveal import open_file, ready

MD = """# Big title

intro text

---

## Second

- one
- two

---

## Third

Note:
notes are not printed here
"""


def save_pdf(page, tmp_path, item, name):
    page.click("[data-testid=print] summary")
    with page.expect_download(timeout=90000) as d:
        page.click(f"[data-testid=print-{item}]")
    path = tmp_path / name
    d.value.save_as(path)
    return path


def colours(img):
    small = img.convert("RGB").resize((96, 70))
    return len(set(small.getdata()))


def test_pdf_export(app_page, tmp_path):
    page = ready(app_page)
    md = tmp_path / "talk.md"
    md.write_text(MD, encoding="utf-8")
    open_file(page, md)
    expect(page.locator("[data-testid=slide-item]")).to_have_count(3)
    path = save_pdf(page, tmp_path, "pdf", "talk.pdf")
    assert path.name == "talk.pdf"
    pdf = PdfReader(path)
    assert len(pdf.pages) == 3
    w, h = float(pdf.pages[0].mediabox.width), float(pdf.pages[0].mediabox.height)
    assert w > h > 300  # landscape, about the slide size
    imgs = [p.images[0].image for p in pdf.pages]
    assert all(colours(i) > 4 for i in imgs)  # not empty: text and theme drawn
    assert imgs[0].tobytes() != imgs[1].tobytes()
    assert pdf.metadata.title
    # one page per fragment step
    steps = tmp_path / "steps.html"
    steps.write_text('<!doctype html><html><head><title>Steps</title></head><body><div class="reveal"><div class="slides">'
                     '<section><h2>One</h2></section><section><h2>Two</h2><p class="fragment">a</p><p class="fragment">b</p></section>'
                     '</div></div></body></html>', encoding="utf-8")
    open_file(page, steps)
    expect(page.locator("[data-testid=slide-item]")).to_have_count(2)
    assert len(PdfReader(save_pdf(page, tmp_path, "pdf", "plain.pdf")).pages) == 2
    assert len(PdfReader(save_pdf(page, tmp_path, "pdf-steps", "steps.pdf")).pages) == 4  # one, two, two+a, two+a+b
    expect(page.locator("[data-testid=pdf-progress]")).to_have_count(0)
    assert page.errors == []
