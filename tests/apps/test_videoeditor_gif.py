"""Video editor: export as an animated GIF (shared/js/gif.js GifAnimation)."""
import pytest
from PIL import Image

from helpers.media_samples import HAS_FFMPEG, make_color_webm
from test_videoeditor import add, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")


def test_gif_export(app_page, tmp_path):
    page = ready(app_page)
    import_media(page, make_color_webm(tmp_path / "rot.webm", "red", seconds=1), make_color_webm(tmp_path / "blau.webm", "blue", seconds=1, freq=660))
    add(page, "rot.webm")
    add(page, "blau.webm")
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-what]", "gif")
    page.fill("[data-testid=export-gif-width]", "160")
    page.select_option("[data-testid=export-gif-fps]", "10")
    with page.expect_download(timeout=120000) as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename.endswith(".gif")
    out = tmp_path / "out.gif"
    d.value.save_as(out)
    img = Image.open(out)
    assert img.format == "GIF" and img.size == (160, 90) and img.is_animated and img.n_frames == 20
    assert img.info.get("loop") == 0
    durations = []
    for k in range(img.n_frames):
        img.seek(k)
        durations.append(img.info["duration"])
    assert abs(sum(durations) - 2000) <= 20
    img.seek(3)
    r, g, b = img.convert("RGB").getpixel((80, 45))
    assert r > 180 and b < 80
    img.seek(15)
    r, g, b = img.convert("RGB").getpixel((80, 45))
    assert b > 180 and r < 80
    assert page.errors == []
