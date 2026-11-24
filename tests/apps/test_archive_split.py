"""Archive manager: saving as parts (name.zip.001, .002, …) and opening the parts again."""
import io
import os
import zipfile

from playwright.sync_api import expect

from test_archive import NO_PICKERS, open_archive


def test_split_and_join(app_page, tmp_path):
    with zipfile.ZipFile(tmp_path / "big.zip", "w", zipfile.ZIP_STORED) as z:
        z.writestr("a.bin", os.urandom(15000))
        z.writestr("b.txt", "hello\n" * 2000)
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, tmp_path / "big.zip")
    downloads = []
    page.on("download", lambda d: downloads.append(d))
    page.click("[data-testid=save-as]")
    page.fill("[data-testid=save-as-name]", "parts")
    page.check("[data-testid=save-as-split]")
    page.fill("[data-testid=save-as-part-size]", "0.01")  # (about 10 kB)
    page.click("[data-testid=save-as-ok]")
    page.wait_for_function("() => !AR.app.state.busy")
    page.wait_for_timeout(1500)
    names = sorted(d.suggested_filename for d in downloads)
    assert names == [f"parts.zip.{i:03d}" for i in range(1, len(names) + 1)] and len(names) >= 3
    paths = []
    for d in downloads:
        p = tmp_path / d.suggested_filename
        d.save_as(p)
        paths.append(p)
    joined = b"".join(open(tmp_path / n, "rb").read() for n in names)
    assert all(len(open(tmp_path / n, "rb").read()) == 10486 for n in names[:-1])
    with zipfile.ZipFile(io.BytesIO(joined)) as z:
        assert sorted(z.namelist()) == ["a.bin", "b.txt"]
    # open: all parts selected together (in any order)
    page2 = app_page("archive", init_script=NO_PICKERS)
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=open]")
    chooser.value.set_files([str(p) for p in reversed(paths)])
    expect(page2.locator("[data-testid=name]")).to_have_text(["a.bin", "b.txt"])
    assert page2.evaluate("AR.app.state.name") == "parts.zip"
    # a part missing: a message
    page3 = app_page("archive", init_script=NO_PICKERS)
    with page3.expect_file_chooser() as chooser:
        page3.click("[data-testid=open]")
    chooser.value.set_files([str(tmp_path / names[0]), str(tmp_path / names[2])])
    expect(page3.locator("[data-testid=toast]").last).to_contain_text("002")
    assert page.errors == [] and page2.errors == []
