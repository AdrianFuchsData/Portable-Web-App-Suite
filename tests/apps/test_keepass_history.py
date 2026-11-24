"""KeePass editor: entry history – what changed, viewing a version, deleting versions, the maximum number of versions."""
from playwright.sync_api import expect
from pykeepass import PyKeePass

from test_keepass import NO_PICKERS, open_entry, sample_db, save_download, unlock  # noqa: F401 (fixture)


def edit(page, group, title, field, value):
    open_entry(page, group, title)
    page.fill(f"[data-testid=field-{field}]", value)
    page.locator("[data-testid=entry]").first.click()  # (another entry: the next change is a new version)


def test_history_view_and_delete(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    edit(page, "Web", "Mail", "Password", "pw-mail-2")
    edit(page, "Web", "Mail", "URL", "https://mail.example")
    edit(page, "Web", "Mail", "Password", "pw-mail-3")
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=history] summary")
    items = page.locator("[data-testid=history-item]")
    expect(items).to_have_count(3)
    # newest first; each says what changed afterwards
    expect(items.nth(0).locator("[data-testid=history-changes]")).to_have_text("Password changed afterwards")
    expect(items.nth(1).locator("[data-testid=history-changes]")).to_have_text("URL changed afterwards")
    expect(items.nth(2).locator("[data-testid=history-changes]")).to_have_text("Password changed afterwards")
    # the oldest version: fields, the ones that differ from now highlighted, the password hidden until revealed
    items.nth(2).locator("[data-testid=history-open]").click()
    version = page.locator("[data-testid=history-version]")
    rows = version.locator("[data-testid=history-field]")
    expect(rows.filter(has_text="Password")).to_contain_text("••••")
    expect(rows.filter(has_text="Password")).to_have_class("kp-differs")
    expect(rows.filter(has_text="User name")).not_to_have_class("kp-differs")
    page.click("[data-testid=history-reveal]")
    expect(rows.filter(has_text="Password")).to_contain_text("pw-mail")
    expect(rows.filter(has_text="Password")).not_to_contain_text("pw-mail-")
    # deleting one version, then the history stays open
    page.click("[data-testid=history-delete]")
    expect(items).to_have_count(2)
    expect(page.locator("[data-testid=history]")).to_have_attribute("open", "")
    page.keyboard.press("Control+z")
    expect(items).to_have_count(3)
    page.keyboard.press("Control+y")
    expect(items).to_have_count(2)
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    mail = kp.find_entries(title="Mail", first=True)
    assert [h.password for h in mail.history] == ["pw-mail-2", "pw-mail-2"] and mail.password == "pw-mail-3"
    # the whole history
    page.click("[data-testid=history-clear]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=history]")).to_have_count(0)
    kp = PyKeePass(str(save_download(page, tmp_path, "cleared.kdbx")), password="secret")
    assert kp.find_entries(title="Mail", first=True).history == []
    assert page.errors == []


def test_history_max_items(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    for i in range(4):
        edit(page, "Web", "Forum", "Password", f"pw-forum-{i}")
    page.click("[data-testid=db-settings]")
    page.fill("[data-testid=history-max]", "2")
    page.locator("[data-testid=history-max]").dispatch_event("change")
    page.locator("[data-testid=settings] button", has_text="Close").click()
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    forum = kp.find_entries(title="Forum", first=True)
    assert [h.password for h in forum.history] == ["pw-forum-1", "pw-forum-2"] and forum.password == "pw-forum-3"
    assert page.errors == []
