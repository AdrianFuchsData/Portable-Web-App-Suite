"""Archive manager: comparing with another archive (also of another format), taking a file over."""
import io
import tarfile
import zipfile

from playwright.sync_api import expect

from test_archive import NO_PICKERS, open_archive


def diffs(page, expected=None):
    get = lambda: page.locator("[data-testid=diff]").evaluate_all("(els) => els.map((e) => [e.dataset.path, e.dataset.status])")
    for _ in range(100):
        got = get()
        if expected is None or got == expected:
            return got
        page.wait_for_timeout(50)
    return got


def compare_with(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=compare]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=compare-filter]")).to_be_visible(timeout=15000)


def test_compare(app_page, tmp_path):
    with zipfile.ZipFile(tmp_path / "v1.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("same.txt", "unchanged")
        z.writestr("changed.txt", "old text")
        z.writestr("only-here.txt", "removed later")
        z.writestr("dir/deep.txt", "deep")
    with zipfile.ZipFile(tmp_path / "v2.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("same.txt", "unchanged")
        z.writestr("changed.txt", "new text!")
        z.writestr("dir/deep.txt", "deep")
        z.writestr("dir/new.txt", "added")
    page = app_page("archive", init_script=NO_PICKERS)
    open_archive(page, tmp_path / "v1.zip")
    compare_with(page, tmp_path / "v2.zip")
    assert diffs(page, [["changed.txt", "changed"], ["dir/new.txt", "onlyB"], ["only-here.txt", "onlyA"]]) == [["changed.txt", "changed"], ["dir/new.txt", "onlyB"], ["only-here.txt", "onlyA"]]
    page.select_option("[data-testid=compare-filter]", "same")
    assert diffs(page, [["dir/deep.txt", "same"], ["same.txt", "same"]]) == [["dir/deep.txt", "same"], ["same.txt", "same"]]
    page.select_option("[data-testid=compare-filter]", "differences")
    # take the new file and the other version over; undo works
    page.locator("[data-testid=diff][data-path='dir/new.txt'] [data-testid=take-over]").click()
    page.locator("[data-testid=diff][data-path='changed.txt'] [data-testid=take-over]").click()
    assert diffs(page, [["only-here.txt", "onlyA"]]) == [["only-here.txt", "onlyA"]]
    data = page.evaluate("Array.from(AR.app.state.entries.find((e) => e.path === 'changed.txt').load())")
    assert bytes(data) == b"new text!"
    page.click("[data-testid=compare-close]")
    expect(page.locator("[data-testid=list]")).to_be_visible()
    page.keyboard.press("Control+z")
    assert bytes(page.evaluate("Array.from(AR.app.state.entries.find((e) => e.path === 'changed.txt').load())")) == b"old text"
    # against a TAR.GZ with the same content: compared by content
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, text in (("same.txt", b"unchanged"), ("changed.txt", b"old text"), ("only-here.txt", b"removed later"), ("dir/deep.txt", b"deep")):
            info = tarfile.TarInfo(name)
            info.size = len(text)
            tf.addfile(info, io.BytesIO(text))
    (tmp_path / "copy.tar.gz").write_bytes(buf.getvalue())
    page.keyboard.press("Control+z")  # (back to v1 exactly)
    compare_with(page, tmp_path / "copy.tar.gz")
    expect(page.locator("[data-testid=compare-identical]")).to_contain_text("4")
    assert page.errors == []
