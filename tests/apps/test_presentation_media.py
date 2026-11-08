"""Presentation: built-in layouts for new slides, video and audio on slides, cropped pictures (PPTX and ODP)."""
import io
import pathlib
import zipfile

from playwright.sync_api import expect
from pptx import Presentation

from test_presentation import open_deck, ready

ROOT = pathlib.Path(__file__).resolve().parents[2]
INIT = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; try { localStorage.setItem('suite.files.archives', '0'); } catch (e) {}"
VIDEO = ROOT / "examples" / "en" / "videoeditor" / "test-pattern.webm"
AUDIO = ROOT / "examples" / "en" / "mediaplayer" / "chord.wav"


def page_of(app_page, **kw):
    page = app_page("presentation", init_script=INIT, **kw)
    expect(page.locator("[data-testid=thumb]")).to_have_count(1)
    return page


def elements(page, slide=None):
    return page.evaluate(f"PR.state.deck.slides[{'PR.state.current' if slide is None else slide}].elements")


def save(page, tmp_path, name="deck.pptx", fmt=None):
    if fmt:
        page.click("[data-testid=save-as]")
        page.fill("[data-testid=save-as-name]", name.rsplit(".", 1)[0])
        page.select_option("[data-testid=save-as-format]", fmt)
        with page.expect_download() as d:
            page.click("[data-testid=save-as-ok]")
    else:
        with page.expect_download() as d:
            page.click("[data-testid=save]")
    path = tmp_path / name
    d.value.save_as(path)
    return path


def insert_media(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=add-media]")
    chooser.value.set_files(str(path))


def test_layouts(app_page, tmp_path):
    page = page_of(app_page)
    for kind, count in [("two", 3), ("title", 2), ("section", 2), ("content", 2), ("titleOnly", 1), ("blank", 0)]:
        page.click("[data-testid=layout-menu] summary")
        page.click(f"[data-testid=layout-{kind}]")
        assert len(elements(page)) == count, kind
    assert page.evaluate("PR.state.deck.slides.length") == 7
    two = elements(page, 1)
    assert [e["placeholder"]["type"] for e in two] == ["title", "body", "body"]
    assert two[1]["x"] < two[2]["x"] and abs(two[1]["w"] - two[2]["w"]) < 1 and two[1]["text"]["paragraphs"][0]["bullet"] == {"char": "•"}
    prs = Presentation(str(save(page, tmp_path)))
    assert sum(1 for s in prs.slides[1].shapes if s.has_text_frame) == 3
    assert page.errors == []


def test_cropped_picture(app_page, tmp_path):
    from PIL import Image
    pic = tmp_path / "halves.png"
    img = Image.new("RGB", (200, 100), "#FF0000")
    img.paste((0, 0, 255), (100, 0, 200, 100))
    img.save(pic)
    page = page_of(app_page)
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=add-image]")
    chooser.value.set_files(str(pic))
    expect(page.locator("[data-testid=crop]")).to_be_visible()
    before = elements(page)[-1]
    page.fill("[data-testid=crop-l]", "50")
    page.locator("[data-testid=crop-l]").press("Tab")
    el = elements(page)[-1]
    assert el["image"]["crop"]["l"] == 0.5 and abs(el["w"] - before["w"] / 2) < 0.5 and abs(el["x"] - (before["x"] + before["w"] / 2)) < 0.5
    width = page.evaluate("parseFloat(document.querySelector('[data-testid=stage] .el:last-child img').style.width)")
    assert abs(width - before["w"]) < 0.5  # (the whole picture, half of it shown)
    # PPTX: a:srcRect; read again
    path = save(page, tmp_path)
    [p] = [s for s in Presentation(str(path)).slides[0].shapes if s.shape_type == 13]
    assert abs(p.crop_left - 0.5) < 0.001 and p.crop_right == 0
    page2 = page_of(app_page)
    open_deck(page2, path)
    assert elements(page2)[-1]["image"]["crop"] == {"l": 0.5, "t": 0, "r": 0, "b": 0}
    # ODP: the cropped part is the picture
    odp = save(page, tmp_path, "deck.odp", "odp")
    with zipfile.ZipFile(odp) as z:
        [name] = [n for n in z.namelist() if n.startswith("Pictures/")]
        picture = Image.open(io.BytesIO(z.read(name))).convert("RGB")
    assert picture.size == (100, 100) and picture.getpixel((50, 50)) == (0, 0, 255)
    page.click("[data-testid=crop-reset]")
    assert "crop" not in elements(page)[-1]["image"] and abs(elements(page)[-1]["w"] - before["w"]) < 0.5
    assert page.errors == [] and page2.errors == []


def test_video_and_audio(app_page, tmp_path):
    page = page_of(app_page)
    insert_media(page, VIDEO)
    page.wait_for_function("() => PR.state.deck.slides[0].elements.some((e) => e.type === 'media')", timeout=20000)
    video = elements(page)[-1]
    assert video["media"]["kind"] == "video" and video["media"]["src"].startswith("data:video/webm;base64,") and video["media"].get("poster", "").startswith("data:image/png")
    assert video["w"] > video["h"] > 0
    insert_media(page, AUDIO)
    page.wait_for_function("() => PR.state.deck.slides[0].elements.filter((e) => e.type === 'media').length === 2")
    assert elements(page)[-1]["media"]["kind"] == "audio"
    expect(page.locator("[data-testid=stage] .el-media video")).to_have_count(1)

    # PPTX: media parts with the poster; read again
    path = save(page, tmp_path)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        rels = z.read("ppt/slides/_rels/slide1.xml.rels").decode()
    assert any(n.endswith(".webm") for n in names) and any(n.endswith(".wav") for n in names) and "relationships/video" in rels
    page2 = page_of(app_page)
    open_deck(page2, path)
    media = [e for e in elements(page2) if e["type"] == "media"]
    assert sorted(m["media"]["kind"] for m in media) == ["audio", "video"]
    assert next(m for m in media if m["media"]["kind"] == "video")["media"]["src"].startswith("data:video/webm")
    # ODP: draw:plugin with the files in Media/
    odp = save(page, tmp_path, "deck.odp", "odp")
    with zipfile.ZipFile(odp) as z:
        assert any(n.startswith("Media/") and n.endswith(".webm") for n in z.namelist())
        assert "draw:plugin" in z.read("content.xml").decode()
    page3 = page_of(app_page)
    open_deck(page3, odp)
    assert sorted(e["media"]["kind"] for e in elements(page3) if e["type"] == "media") == ["audio", "video"]

    # the show plays them (controls)
    page.click("[data-testid=present]")
    expect(page.locator(".el-media.playable video[controls]")).to_have_count(1)
    page.keyboard.press("Escape")
    assert page.errors == [] and page2.errors == [] and page3.errors == []


def test_layout_menu_on_a_phone(app_page):
    page = page_of(app_page, mobile=True)
    page.locator("[data-testid=layout-menu] summary").tap()
    page.locator("[data-testid=layout-content]").tap()
    assert len(elements(page)) == 2
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []
