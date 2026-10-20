"""Video editor (apps/videoeditor): media made with ffmpeg (imageio-ffmpeg), exports checked with ffmpeg."""
import json

import pytest
from PIL import Image
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, make_color_webm, make_wav, pixel, streams

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed to create the videos")
NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


@pytest.fixture
def media(tmp_path):
    red = make_color_webm(tmp_path / "rot.webm", "red", seconds=2)
    blue = make_color_webm(tmp_path / "blau.webm", "blue", seconds=1, freq=660)
    green = tmp_path / "gruen.png"
    Image.new("RGB", (64, 48), (0, 200, 0)).save(green)
    tone = make_wav(tmp_path / "ton.wav", seconds=2, freq=880)
    return {"red": red, "blue": blue, "green": green, "tone": tone}


def ready(app_page, **kw):
    return app_page("videoeditor", init_script=NO_PICKERS + kw.pop("init_script", ""), **kw)


def import_media(page, *paths, expected=None):
    items = page.locator("[data-testid=media]")
    expected = items.count() + len(paths) if expected is None else expected
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=import]")
    chooser.value.set_files([str(p) for p in paths])
    expect(items).to_have_count(expected, timeout=15000)


def add(page, name):
    page.locator("[data-testid=media]").filter(has_text=name).locator("[data-testid=add-media]").click()


def clips(page):
    return page.evaluate("VE.state.project.clips.map((c) => [c.track, c.kind, Math.round(c.start * 100) / 100, Math.round((c.out - c.in) * 100) / 100]).sort((a, b) => a[0].localeCompare(b[0]) || a[2] - b[2])")


def center_pixel(page, time):
    """Centre pixel of the preview canvas after seeking (the media elements seek asynchronously)."""
    page.evaluate(f"VE.seek({time})")
    for _ in range(40):
        rgb = page.evaluate("""() => { const c = document.querySelector('[data-testid=preview-canvas]'); VE.compose(c.getContext('2d'), VE.state.time);
          return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3); }""")
        page.wait_for_timeout(100)
        rgb2 = page.evaluate("""() => { const c = document.querySelector('[data-testid=preview-canvas]'); VE.compose(c.getContext('2d'), VE.state.time);
          return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3); }""")
        if rgb == rgb2 and rgb != [0, 0, 0]:
            return rgb
    return rgb2


def build_timeline(page, media):
    import_media(page, media["red"], media["blue"], media["green"], media["tone"])
    expect(page.locator("[data-testid=media]").filter(has_text="rot.webm")).to_contain_text("0:02.0")
    for name in ("rot.webm", "blau.webm", "gruen.png", "ton.wav"):
        add(page, name)
    expect(page.locator("[data-testid=clip]")).to_have_count(4)


def test_import_add_preview(app_page, media):
    page = ready(app_page)
    assert page.title() == "Video editor"
    build_timeline(page, media)
    assert page.evaluate("[...VE.state.sources.values()].every((s) => s.kind === 'audio' || s.thumb.startsWith('data:image/jpeg'))")
    assert clips(page) == [["a1", "audio", 0, 2], ["v1", "video", 0, 2], ["v1", "video", 2, 1], ["v1", "image", 3, 5]]
    expect(page.locator("[data-testid=clock]")).to_contain_text("0:08.00")
    r, g, b = center_pixel(page, 0.5)
    assert r > 200 and g < 60 and b < 60
    r, g, b = center_pixel(page, 2.5)
    assert b > 200 and r < 60
    r, g, b = center_pixel(page, 4)
    assert g > 150 and r < 60
    assert page.errors == [] and page.requests == []


def test_split_ripple_undo_and_drag(app_page, media):
    page = ready(app_page)
    build_timeline(page, media)
    page.evaluate("VE.seek(1)")
    page.locator("[data-testid=clip]").filter(has_text="rot.webm").click()
    page.click("[data-testid=split]")
    assert clips(page)[1:3] == [["v1", "video", 0, 1], ["v1", "video", 1, 1]]
    page.click("[data-testid=ripple]")  # the right part (selected after the split) is deleted, later clips move left
    assert clips(page)[1:] == [["v1", "video", 0, 1], ["v1", "video", 1, 1], ["v1", "image", 2, 5]]
    page.click("[data-testid=undo]")
    page.click("[data-testid=undo]")
    assert clips(page)[1] == ["v1", "video", 0, 2]
    page.click("[data-testid=redo]")
    assert len(clips(page)) == 5

    # drag the image onto V2 at a later time, then trim its right edge
    while page.evaluate("12 * VE.state.pps > innerWidth - 100"):
        page.click("[data-testid=zoom-out]")  # on a phone: zoom out until the end of the moved clip (10 s) is visible
    pps = page.evaluate("VE.state.pps")
    image = page.locator("[data-testid=clip]").filter(has_text="gruen.png")
    box = image.bounding_box()
    v2 = page.locator("[data-testid=lane]").first.bounding_box()
    page.mouse.move(box["x"] + 30, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + 30 + 2 * pps, v2["y"] + v2["height"] / 2, steps=8)
    page.mouse.up()
    c = page.evaluate("VE.state.project.clips.find((c) => c.kind === 'image')")
    assert c["track"] == "v2" and abs(c["start"] - 5) < 0.3
    handle = image.locator("[data-testid=trim-right]")
    hb = handle.bounding_box()
    page.mouse.move(hb["x"] + 3, hb["y"] + 5)
    page.mouse.down()
    page.mouse.move(hb["x"] + 3 - 2 * pps, hb["y"] + 5, steps=6)
    page.mouse.up()
    c = page.evaluate("VE.state.project.clips.find((c) => c.kind === 'image')")
    assert abs((c["out"] - c["in"]) - 3) < 0.3

    # properties: exact values
    page.fill("[data-testid=clip-start]", "4")
    page.press("[data-testid=clip-start]", "Enter")
    page.fill("[data-testid=clip-duration]", "1.5")
    page.press("[data-testid=clip-duration]", "Enter")
    page.wait_for_function("() => { const c = VE.state.project.clips.find((x) => x.kind === 'image'); return c.start === 4 && Math.abs(c.out - c.in - 1.5) < 1e-9; }")
    assert page.errors == []


def test_title_overlay_and_export(app_page, media, tmp_path):
    page = ready(app_page)
    page.select_option("[data-testid=project-size]", "854x480")
    page.select_option("[data-testid=project-fps]", "25")
    import_media(page, media["red"], media["blue"])
    add(page, "rot.webm")
    add(page, "blau.webm")
    page.evaluate("VE.seek(0.2)")
    page.click("[data-testid=add-title]")
    page.fill("[data-testid=title-text]", "████")
    page.locator("[data-testid=title-text]").blur()
    page.fill("[data-testid=title-size]", "200")
    page.press("[data-testid=title-size]", "Enter")
    page.fill("[data-testid=clip-duration]", "1")
    page.press("[data-testid=clip-duration]", "Enter")
    page.fill("[data-testid=clip-fade-in]", "0")
    page.press("[data-testid=clip-fade-in]", "Enter")
    r, g, b = center_pixel(page, 0.6)
    assert r > 200 and g > 200 and b > 200  # white title over the red clip
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "webm-vp8")
    page.select_option("[data-testid=export-quality]", "low")
    page.fill("[data-testid=export-name]", "film")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename == "film.webm"
    out = tmp_path / "film.webm"
    d.value.save_as(out)
    info = streams(out)
    assert info["video"] == "vp8" and info["audio"] == "opus" and info["size"] == (854, 480)
    assert abs(info["duration"] - 3) < 0.15
    r, g, b = pixel(out, 0.1)
    assert r > 180 and g < 80
    r, g, b = pixel(out, 0.7)
    assert min(r, g, b) > 180  # the title
    r, g, b = pixel(out, 2.5)
    assert b > 180 and r < 80
    assert page.errors == []


def test_project_save_open_relink(app_page, media, tmp_path):
    page = ready(app_page)
    build_timeline(page, media)
    page.locator("[data-testid=clip]").filter(has_text="ton.wav").click()
    page.locator("[data-testid=clip-volume]").fill("50")
    page.locator("[data-testid=clip-volume]").dispatch_event("change")
    with page.expect_download() as d:
        page.click("[data-testid=save-project]")
    saved = tmp_path / "projekt.json"
    d.value.save_as(saved)
    data = json.loads(saved.read_text())
    assert data["app"] == "videoeditor" and len(data["project"]["clips"]) == 4 and len(data["sources"]) == 4
    assert next(c for c in data["project"]["clips"] if c["kind"] == "audio")["volume"] == 0.5
    page.click("[data-testid=new-project]")
    expect(page.locator("[data-testid=clip]")).to_have_count(0)

    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-project]")
    chooser.value.set_files(str(saved))
    expect(page.locator("[data-testid=clip]")).to_have_count(4)
    expect(page.locator("[data-testid=locate]")).to_have_count(4)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("missing")
    with page.expect_file_chooser() as chooser:
        page.locator("[data-testid=media]").filter(has_text="gruen.png").locator("[data-testid=locate]").click()
    chooser.value.set_files(str(media["green"]))
    expect(page.locator("[data-testid=locate]")).to_have_count(3)
    import_media(page, media["red"], media["blue"], media["tone"], expected=4)  # imported files with the same names are relinked
    expect(page.locator("[data-testid=locate]")).to_have_count(0)
    expect(page.locator("[data-testid=media]")).to_have_count(4)
    r, g, b = center_pixel(page, 0.5)
    assert r > 200 and g < 60


def test_playback(app_page, media):
    page = ready(app_page)
    import_media(page, media["red"])
    add(page, "rot.webm")
    page.click("[data-testid=play]")
    expect(page.locator("[data-testid=pause]")).to_be_visible()
    page.wait_for_timeout(600)
    page.click("[data-testid=pause]")
    t = page.evaluate("VE.state.time")
    assert 0.3 < t < 2
    page.keyboard.press("Home")
    assert page.evaluate("VE.state.time") == 0
    page.keyboard.press("ArrowRight")
    assert abs(page.evaluate("VE.state.time") - 1 / 30) < 1e-6


def test_german_and_mobile(app_page, media):
    page = app_page("videoeditor", mobile=True, init_script="localStorage.setItem('suite.lang', 'de');" + NO_PICKERS)
    expect(page.locator("[data-testid=app-title]")).to_have_text("Video-Editor")
    expect(page.locator("[data-testid=media-bin]")).to_be_visible()
    expect(page.locator("[data-testid=properties]")).to_be_hidden()
    import_media(page, media["red"])
    add(page, "rot.webm")
    expect(page.locator("[data-testid=clip]")).to_have_count(1)
    page.locator("[data-testid=clip]").tap()
    expect(page.locator("[data-testid=properties]")).to_be_visible()
    expect(page.locator("[data-testid=media-bin]")).to_be_hidden()
    page.click("[data-testid=tab-media]")
    expect(page.locator("[data-testid=media-bin]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_waveforms(app_page, media):
    page = ready(app_page)
    import_media(page, media["tone"], media["red"])
    add(page, "ton.wav")
    add(page, "rot.webm")
    wave = page.locator("[data-testid=clip].audio [data-testid=waveform]")
    expect(wave).to_have_count(1, timeout=15000)
    height = """(sel) => { const c = document.querySelector(sel); const g = c.getContext('2d'); const x = Math.floor(c.width / 2);
      const d = g.getImageData(x, 0, 1, c.height).data; let n = 0; for (let y = 0; y < c.height; y++) if (d[y * 4 + 3] > 0) n++; return [n, c.height]; }"""
    n, h = page.evaluate(height, "[data-testid=clip].audio [data-testid=waveform]")
    assert n > h * 0.2  # the tone fills a good part of the height
    # the volume scales the waveform
    page.evaluate("() => { const c = VE.state.project.clips.find((x) => x.kind === 'audio'); VE.commit({ ...VE.state.project, clips: VE.state.project.clips.map((x) => (x.id === c.id ? { ...x, volume: 0.2 } : x)) }); }")
    page.wait_for_timeout(300)
    n2, _ = page.evaluate(height, "[data-testid=clip].audio [data-testid=waveform]")
    assert 0 < n2 < n * 0.6
    # video clips with sound show a smaller waveform at the bottom
    expect(page.locator("[data-testid=clip].video [data-testid=waveform]")).to_have_count(1)
    assert page.errors == []


def test_transitions(app_page, media):
    page = ready(app_page)
    import_media(page, media["green"])
    add(page, "gruen.png")
    expect(page.locator("[data-testid=clip]")).to_have_count(1)
    page.locator("[data-testid=clip]").first.click()
    page.fill("[data-testid=clip-fade-in]", "1")
    page.press("[data-testid=clip-fade-in]", "Enter")
    pixels = """(t) => { const c = document.querySelector('[data-testid=preview-canvas]'); const g = c.getContext('2d'); VE.compose(g, t);
      const at = (fx, fy) => [...g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data].slice(0, 3);
      return { left: at(0.3, 0.5), right: at(0.7, 0.5), center: at(0.5, 0.5), top: at(0.5, 0.08) }; }"""
    green = lambda rgb: rgb[1] > 150 and rgb[0] < 60
    black = lambda rgb: max(rgb) < 40
    # dissolve (default): half transparent over black in the middle of the fade
    p = page.evaluate(pixels, 0.5)
    assert 60 < p["center"][1] < 140
    # wipe to the right: the left part is already visible
    page.select_option("[data-testid=clip-transition-in]", "wipe-right")
    p = page.evaluate(pixels, 0.5)
    assert green(p["left"]) and black(p["right"])
    # slide to the left: the picture comes in from the right
    page.select_option("[data-testid=clip-transition-in]", "slide-left")
    p = page.evaluate(pixels, 0.5)
    assert black(p["left"]) and green(p["right"])
    # circle: the middle first
    page.select_option("[data-testid=clip-transition-in]", "circle")
    p = page.evaluate(pixels, 0.4)
    assert green(p["center"]) and black(p["top"])
    # fully visible after the fade, and the export draws the same frame
    p = page.evaluate(pixels, 2)
    assert green(p["left"]) and green(p["right"])
    assert page.evaluate("VE.state.project.clips[0].transitionIn") == "circle"
    assert page.errors == []


def test_picture_colour_crop_rotation_and_motion(app_page, media):
    page = ready(app_page)
    import_media(page, media["green"])
    add(page, "gruen.png")
    page.locator("[data-testid=clip]").first.click()
    page.click("[data-testid=picture-section]")
    at = """([t, fx, fy]) => { const c = document.querySelector('[data-testid=preview-canvas]'); const g = c.getContext('2d'); VE.compose(g, t);
      return [...g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data].slice(0, 3); }"""
    def set_field(testid, value):
        page.fill(f"[data-testid={testid}]", str(value))
        page.press(f"[data-testid={testid}]", "Enter")
    assert page.evaluate(at, [1, 0.5, 0.5])[1] > 180
    set_field("clip-brightness", 50)
    assert 80 < page.evaluate(at, [1, 0.5, 0.5])[1] < 120
    set_field("clip-brightness", 100)
    # the 4:3 picture (960 × 720 in the 1280 × 720 frame) turned by 90° is taller than the frame and narrower
    assert page.evaluate(at, [1, 0.2, 0.5])[1] > 150
    set_field("clip-rotation", 90)
    assert max(page.evaluate(at, [1, 0.2, 0.5])) < 40
    set_field("clip-rotation", 0)
    # crop away the left half: a narrower picture
    set_field("clip-crop-left", 50)
    assert max(page.evaluate(at, [1, 0.25, 0.5])) < 40 and page.evaluate(at, [1, 0.5, 0.5])[1] > 150
    page.click("[data-testid=picture-reset]")
    assert page.evaluate(at, [1, 0.25, 0.5])[1] > 150
    # motion: at half size at the end, the edges are black at the end but not at the start
    set_field("clip-end-scale", 50)
    end = page.evaluate("VE.state.project.clips[0].out - VE.state.project.clips[0].in")
    assert page.evaluate(at, [0.01, 0.2, 0.5])[1] > 150
    assert max(page.evaluate(at, [end - 0.01, 0.2, 0.5])) < 40
    assert page.errors == []


def test_picture_settings_in_the_export(app_page, media, tmp_path):
    page = ready(app_page)
    page.select_option("[data-testid=project-size]", "854x480")
    import_media(page, media["red"])
    add(page, "rot.webm")
    page.locator("[data-testid=clip]").first.click()
    page.click("[data-testid=picture-section]")
    page.fill("[data-testid=clip-brightness]", "50")
    page.press("[data-testid=clip-brightness]", "Enter")
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "webm-vp8")
    page.select_option("[data-testid=export-quality]", "low")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    out = tmp_path / "dark.webm"
    d.value.save_as(out)
    r, g, b = pixel(out, 1.0)
    assert 90 < r < 160 and g < 60  # red at half brightness
    assert page.errors == []


SRT = """1
00:00:00,500 --> 00:00:01,800
Hello <i>world</i>

2
00:00:02,000 --> 00:00:03,250
Second line
and more
"""


def test_subtitles(app_page, media, tmp_path):
    page = ready(app_page)
    srt = tmp_path / "film.srt"
    srt.write_text(SRT, encoding="utf-8")
    vtt = tmp_path / "extra.vtt"
    vtt.write_text("WEBVTT\n\n00:04.000 --> 00:05.000 align:start\n<v Anna>Third</v>\n", encoding="utf-8")
    import_media(page, media["red"], srt, vtt, expected=1)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("subtitles imported")
    clips = page.evaluate("VE.state.project.clips.filter((c) => c.kind === 'text').map((c) => [c.start, Math.round((c.out - c.in) * 1000) / 1000, c.text.content, c.text.valign, VE.state.project.tracks.find((t) => t.id === c.track).name])")
    assert clips == [[0.5, 1.3, "Hello world", "bottom", "Subtitles"], [2, 1.25, "Second line\nand more", "bottom", "Subtitles"], [4, 1, "Third", "bottom", "Subtitles"]]
    assert page.evaluate("VE.state.project.tracks[0].name") == "Subtitles"  # on top of the pictures
    # burnt into the picture: white text near the bottom at 1 s
    bright = page.evaluate("""() => { const c = document.querySelector('[data-testid=preview-canvas]'); const g = c.getContext('2d'); VE.compose(g, 1);
      const d = g.getImageData(0, Math.round(c.height * 0.8), c.width, Math.round(c.height * 0.15)).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) n++; return n; }""")
    assert bright > 50
    # SRT export
    with page.expect_download() as d:
        page.click("[data-testid=export-srt]")
    text = open(d.value.path(), encoding="utf-8").read()
    assert text.startswith("1\n00:00:00,500 --> 00:00:01,800\nHello world\n\n2\n00:00:02,000 --> 00:00:03,250\nSecond line\nand more\n")
    assert "00:00:04,000 --> 00:00:05,000\nThird" in text
    assert page.errors == []


def make_red_then_blue(path):
    """Two seconds: red with a tone, then blue and silent."""
    import subprocess
    from helpers.media_samples import FFMPEG
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=320x240:rate=30:duration=1", "-f", "lavfi",
                    "-i", "color=c=blue:size=320x240:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a][3:a]concat=n=2:v=0:a=1[a]",
                    "-map", "[v]", "-map", "[a]", "-c:v", "libvpx", "-b:v", "300k", "-c:a", "libopus", str(path)], check=True)
    return path


def test_speed_and_reverse(app_page, tmp_path):
    page = ready(app_page)
    page.select_option("[data-testid=project-size]", "854x480")
    import_media(page, make_red_then_blue(tmp_path / "rotblau.webm"))
    add(page, "rotblau.webm")
    page.locator("[data-testid=clip]").first.click()
    clip = "VE.state.project.clips[0]"
    # double speed: half as long, the source range stays
    page.fill("[data-testid=clip-speed]", "200")
    page.press("[data-testid=clip-speed]", "Enter")
    assert abs(page.evaluate(f"VE.tl.length({clip})") - 1) < 0.02 and page.evaluate(f"{clip}.in") == 0
    expect(page.locator("[data-testid=clip]").first).to_contain_text("200 %")
    r, g, b = center_pixel(page, 0.25)
    assert r > 180 and b < 80
    r, g, b = center_pixel(page, 0.75)
    assert b > 180 and r < 80
    # backwards: blue first
    page.check("[data-testid=clip-reverse]")
    r, g, b = center_pixel(page, 0.25)
    assert b > 180 and r < 80
    r, g, b = center_pixel(page, 0.75)
    assert r > 180 and b < 80
    # splitting a reversed clip: the left part shows the end of the source
    page.evaluate("VE.seek(0.5)")
    page.click("[data-testid=clip-split]")
    parts = page.evaluate("VE.state.project.clips.map((c) => [c.start, c.in, c.out]).sort((a, b) => a[0] - b[0])")
    assert [[round(v, 2) for v in p] for p in parts] == [[0, 1, 2], [0.5, 0, 1]]
    page.keyboard.press("Control+z")
    expect(page.locator("[data-testid=clip]")).to_have_count(1)
    # trimming the right edge of a reversed clip moves the source start
    page.locator("[data-testid=clip]").first.click()
    page.fill("[data-testid=clip-duration]", "0.75")
    page.press("[data-testid=clip-duration]", "Enter")
    assert [round(v, 2) for v in page.evaluate(f"[{clip}.in, {clip}.out]")] == [0.5, 2]
    page.fill("[data-testid=clip-duration]", "5")
    page.press("[data-testid=clip-duration]", "Enter")
    assert [round(v, 2) for v in page.evaluate(f"[{clip}.in, {clip}.out]")] == [0, 2]
    # playing a reversed clip works (seeking frame by frame)
    page.evaluate("VE.seek(0); VE.play()")
    page.wait_for_timeout(400)
    page.evaluate("VE.stop()")
    # export: 1 s, blue then red, the tone (reversed) at the end
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "webm-vp8")
    page.select_option("[data-testid=export-quality]", "low")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    out = tmp_path / "rueckwaerts.webm"
    d.value.save_as(out)
    info = streams(out)
    assert abs(info["duration"] - 1) < 0.15 and info["audio"] == "opus"
    r, g, b = pixel(out, 0.2)
    assert b > 180 and r < 80
    r, g, b = pixel(out, 0.8)
    assert r > 180 and b < 80
    assert audio_level(out, 0.05, 0.4) < 0.02 < audio_level(out, 0.6, 0.95)
    assert page.errors == []


def audio_level(path, a, b):
    """Peak level (0–1) of the audio between a and b seconds."""
    import struct
    import subprocess
    from helpers.media_samples import FFMPEG
    raw = subprocess.run([FFMPEG, "-v", "error", "-ss", str(a), "-t", str(b - a), "-i", str(path), "-ac", "1", "-f", "s16le", "-"], check=True, capture_output=True).stdout
    samples = struct.unpack(f"<{len(raw) // 2}h", raw)
    return max(abs(v) for v in samples) / 32768 if samples else 0
