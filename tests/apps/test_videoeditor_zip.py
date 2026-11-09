"""Video editor: a project saved with its media as one ZIP and opened again (nothing to relink)."""
import json
import zipfile

import pytest
from PIL import Image
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, make_color_webm
from test_videoeditor import add, center_pixel, clips, import_media, ready

pytestmark = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")


def test_project_zip_with_media(app_page, tmp_path):
    Image.new("RGB", (64, 36), (0, 200, 0)).save(tmp_path / "gruen.png")
    page = ready(app_page)
    import_media(page, make_color_webm(tmp_path / "rot.webm", "red", seconds=1), tmp_path / "gruen.png")
    add(page, "rot.webm")
    add(page, "gruen.png")
    with page.expect_download() as d:
        page.click("[data-testid=save-project-zip]")
    assert d.value.suggested_filename.endswith(".zip")
    out = tmp_path / "projekt.zip"
    d.value.save_as(out)
    z = zipfile.ZipFile(out)
    names = z.namelist()
    assert "project.json" in names and sum(n.startswith("media/") for n in names) == 2
    assert any(n.endswith("/rot.webm") for n in names) and json.loads(z.read("project.json"))["app"] == "videoeditor"
    page2 = ready(app_page)
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=open-project]")
    chooser.value.set_files(str(out))
    expect(page2.locator("[data-testid=media]")).to_have_count(2)
    assert clips(page2) == clips(page)
    assert page2.evaluate("[...VE.state.sources.values()].every((s) => !s.missing)")
    r, g, b = center_pixel(page2, 0.5)
    assert r > 180 and g < 80
    r, g, b = center_pixel(page2, 2)
    assert g > 150 and r < 80
    expect(page2.locator("[data-testid=file-name]")).to_contain_text(".zip")
    assert page.errors == [] and page2.errors == []
