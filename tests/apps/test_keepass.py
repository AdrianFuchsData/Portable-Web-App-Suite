"""KeePass editor (apps/keepass); databases are created and checked with pykeepass."""
import base64
import re
import hashlib
import hmac
import struct
import time

import pytest
from playwright.sync_api import expect
from pykeepass import PyKeePass, create_database

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
TOTP_SECRET = "JBSWY3DPEHPK3PXP"


@pytest.fixture
def sample_db(tmp_path):
    path = tmp_path / "sample.kdbx"
    kp = create_database(str(path), password="secret")
    banking = kp.add_group(kp.root_group, "Banking")
    web = kp.add_group(kp.root_group, "Web")
    bank = kp.add_entry(banking, "Bank", "anna", "pw-bank", url="https://bank.example", notes="Account")
    bank.set_custom_property("PIN", "1234", protect=True)
    bank.otp = f"otpauth://totp/Bank:anna?secret={TOTP_SECRET}&issuer=Bank"
    kp.add_entry(web, "Mail", "anna@example.org", "pw-mail")
    kp.add_entry(web, "Forum", "anna", "pw-forum", tags=["social"])
    kp.save()
    return path


def choose(page, selector, path):
    with page.expect_file_chooser() as chooser:
        page.click(selector)
    chooser.value.set_files(str(path))


def unlock(page, path, password="secret", key_file=None):
    choose(page, "[data-testid=choose-db]", path)
    if key_file:
        choose(page, "[data-testid=choose-keyfile]", key_file)
    page.fill("[data-testid=password]", password)
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=workspace]")).to_be_visible(timeout=30000)


def save_download(page, tmp_path, name=None):
    with page.expect_download() as download:
        page.click("[data-testid=save]")
    path = tmp_path / (name or ("saved-" + download.value.suggested_filename))
    download.value.save_as(path)
    return path


def open_entry(page, group, title):
    page.locator("[data-testid=group]", has_text=group).click()
    page.locator("[data-testid=entry]", has_text=title).click()
    expect(page.locator("[data-testid=field-Title]")).to_have_value(title)


def totp(secret, at):
    key = base64.b32decode(secret)
    digest = hmac.new(key, struct.pack(">Q", int(at) // 30), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return "%06d" % ((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000)


def test_unlock_browse_search_totp(app_page, sample_db):
    page = app_page("keepass", init_script=NO_PICKERS)
    assert page.title() == "KeePass"
    choose(page, "[data-testid=choose-db]", sample_db)
    page.fill("[data-testid=password]", "wrong")
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=error]")).to_be_visible(timeout=30000)
    page.fill("[data-testid=password]", "secret")
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=workspace]")).to_be_visible(timeout=30000)
    expect(page.locator("[data-testid=group]")).to_have_count(3)

    page.locator("[data-testid=group]", has_text="Web").click()
    expect(page.locator("[data-testid=entry]")).to_have_count(2)
    page.fill("[data-testid=search]", "anna")
    expect(page.locator("[data-testid=entry]")).to_have_count(3)  # search covers all groups
    page.fill("[data-testid=search]", "social")  # tags are searched too
    expect(page.locator("[data-testid=entry]")).to_have_count(1)
    expect(page.locator("[data-testid=entry]")).to_contain_text("Forum")
    page.fill("[data-testid=search]", "nothing-matches")
    expect(page.locator("[data-testid=no-entries]")).to_be_visible()
    page.fill("[data-testid=search]", "")

    open_entry(page, "Banking", "Bank")
    expect(page.locator("[data-testid=field-UserName]")).to_have_value("anna")
    password = page.locator("[data-testid=field-Password]")
    expect(password).to_have_attribute("type", "password")
    page.click("[data-testid=field-Password-reveal]")
    expect(password).to_have_attribute("type", "text")
    expect(password).to_have_value("pw-bank")
    expect(page.locator("[data-testid=custom-PIN]")).to_have_attribute("type", "password")
    code = page.text_content("[data-testid=otp-code]")
    assert code in {totp(TOTP_SECRET, time.time() + d) for d in (-30, 0, 30)}
    assert page.errors == [] and page.requests == []


def test_edit_entries_and_groups_round_trip(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Banking", "Bank")
    page.fill("[data-testid=field-Password]", "changed-pw")
    page.fill("[data-testid=field-Notes]", "New notes")
    page.fill("[data-testid=field-tags]", "money, important")
    page.press("[data-testid=field-tags]", "Enter")
    page.fill("[data-testid=new-field-name]", "Card")
    page.fill("[data-testid=new-field-value]", "4111")
    page.check("[data-testid=new-field-protected]")
    page.click("[data-testid=add-field]")
    expect(page.locator("[data-testid=custom-Card]")).to_have_attribute("type", "password")
    page.click("[data-testid=custom-PIN-delete]")
    expect(page.locator("[data-testid=custom-PIN]")).to_have_count(0)

    # a new group (renamed inline) and a new entry moved into it
    page.click("[data-testid=new-group]")
    page.fill("[data-testid=group-name-input]", "Shopping")
    page.press("[data-testid=group-name-input]", "Enter")
    expect(page.locator("[data-testid=group]", has_text="Shopping")).to_be_visible()
    page.click("[data-testid=new-entry]")
    page.fill("[data-testid=field-Title]", "Shop")
    page.fill("[data-testid=field-UserName]", "buyer")
    expect(page.locator("[data-testid=entry]", has_text="Shop")).to_have_count(1)  # on phones the list is behind the editor

    open_entry(page, "Web", "Forum")
    page.select_option("[data-testid=entry-group]", label="Banking")
    expect(page.locator("[data-testid=entry]", has_text="Forum")).to_be_visible()  # the list follows the entry

    saved = save_download(page, tmp_path)
    kp = PyKeePass(str(saved), password="secret")
    bank = kp.find_entries(title="Bank", first=True)
    assert bank.password == "changed-pw" and bank.notes == "New notes"
    assert sorted(t.strip() for t in bank.tags) == ["important", "money"]  # kdbxweb writes "a, b"; pykeepass does not trim
    assert bank.get_custom_property("Card") == "4111" and bank.get_custom_property("PIN") is None
    assert bank.is_custom_property_protected("Card")
    assert bank.otp  # untouched fields are kept
    assert len(bank.history) == 1 and bank.history[0].password == "pw-bank"  # one history item per editing session
    shop = kp.find_entries(title="Shop", first=True)
    assert shop.username == "buyer" and shop.group.name == "Shopping" and shop.history == []
    assert kp.find_entries(title="Forum", first=True).group.name == "Banking"
    assert page.errors == []


def test_history_restore(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Web", "Mail")
    page.fill("[data-testid=field-UserName]", "other@example.org")
    open_entry(page, "Web", "Forum")
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=history] summary")
    expect(page.locator("[data-testid=history-item]")).to_have_count(1)
    page.click("[data-testid=restore]")
    expect(page.locator("[data-testid=field-UserName]")).to_have_value("anna@example.org")
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    mail = kp.find_entries(title="Mail", first=True)
    assert mail.username == "anna@example.org"
    assert [h.username for h in mail.history] == ["anna@example.org", "other@example.org"]


def test_undo_redo(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    open_entry(page, "Web", "Mail")
    page.fill("[data-testid=field-UserName]", "typed@example.org")  # typing is one step
    page.click("[data-testid=delete-entry]")
    page.click("[data-testid=confirm-ok]")
    page.locator("[data-testid=group]", has_text="Web").click()
    expect(page.locator("[data-testid=entry]", has_text="Mail")).to_have_count(0)

    page.locator("body").click(position={"x": 1, "y": 1})
    page.keyboard.press("Control+z")
    expect(page.locator("[data-testid=entry]", has_text="Mail")).to_be_visible()
    page.click("[data-testid=undo]")
    page.locator("[data-testid=entry]", has_text="Mail").click()
    expect(page.locator("[data-testid=field-UserName]")).to_have_value("anna@example.org")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    page.click("[data-testid=redo]")
    expect(page.locator("[data-testid=field-UserName]")).to_have_value("typed@example.org")

    # editing after undo keeps a correct entry history; protected fields survive the snapshots
    page.fill("[data-testid=field-Title]", "Mail 2")
    expect(page.locator("[data-testid=redo]")).to_be_disabled()
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    mail = kp.find_entries(title="Mail 2", first=True)
    assert mail.username == "typed@example.org" and mail.password == "pw-mail"
    assert [h.username for h in mail.history] == ["anna@example.org", "typed@example.org"]
    assert kp.find_entries(title="Bank", first=True).get_custom_property("PIN") == "1234"
    assert page.errors == []


def test_recycle_bin_and_group_delete(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=delete-entry]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=entry]", has_text="Mail")).to_have_count(0)
    page.locator("[data-testid=group]", has_text="Recycle Bin").click()
    expect(page.locator("[data-testid=entry]", has_text="Mail")).to_be_visible()
    page.click("[data-testid=empty-bin]")
    page.click("[data-testid=confirm-ok]")
    page.locator("[data-testid=group]", has_text="Banking").click()
    page.click("[data-testid=delete-group]")
    page.click("[data-testid=confirm-ok]")
    bin_item = page.locator("li", has=page.locator("> [data-testid=group]", has_text="Recycle Bin"))
    expect(bin_item.locator("[data-testid=group]", has_text="Banking")).to_have_count(1)  # moved into the bin
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    assert kp.find_entries(title="Mail", first=True) is None
    assert kp.find_groups(name="Banking", first=True).parentgroup.name == kp.recyclebin_group.name
    assert kp.find_entries(title="Bank", first=True).group.name == "Banking"  # still restorable from the bin


def test_create_database_with_key_file(app_page, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    page.click("[data-testid=create]")
    page.fill("[data-testid=create-name]", "Team")
    page.fill("[data-testid=create-password]", "pw1")
    page.fill("[data-testid=create-repeat]", "pw2")
    page.click("[data-testid=create-submit]")
    expect(page.locator("[data-testid=error]")).to_have_text("The passwords do not match.")
    page.fill("[data-testid=create-repeat]", "pw1")
    page.check("[data-testid=create-keyfile]")
    with page.expect_download() as key_download:
        page.click("[data-testid=create-submit]")
    key_file = tmp_path / key_download.value.suggested_filename
    key_download.value.save_as(key_file)
    assert key_file.name == "Team.keyx"
    expect(page.locator("[data-testid=workspace]")).to_be_visible(timeout=30000)
    page.click("[data-testid=new-entry]")
    page.fill("[data-testid=field-Title]", "First")
    saved = save_download(page, tmp_path)
    assert saved.name.endswith("Team.kdbx")
    with pytest.raises(Exception):
        PyKeePass(str(saved), password="pw1")  # the key file is required
    kp = PyKeePass(str(saved), password="pw1", keyfile=str(key_file))
    assert [e.title for e in kp.entries] == ["First"]

    # unlocking with password + key file in the app
    page.click("[data-testid=lock]")
    page2 = app_page("keepass", init_script=NO_PICKERS)
    unlock(page2, saved, password="pw1", key_file=key_file)
    expect(page2.locator("[data-testid=entry]", has_text="First")).to_be_visible()


def test_change_master_key(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    page.click("[data-testid=db-settings]")
    page.fill("[data-testid=new-master]", "new-secret")
    page.fill("[data-testid=new-master-repeat]", "new-secret")
    page.click("[data-testid=change-key]")
    expect(page.locator("[data-testid=settings]")).to_have_count(0)
    saved = save_download(page, tmp_path)
    assert PyKeePass(str(saved), password="new-secret").find_entries(title="Bank", first=True).password == "pw-bank"


def test_generator_and_attachments(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=generate]")
    page.fill("[data-testid=gen-length]", "32")
    page.uncheck("[data-testid=gen-symbols]")
    expect(page.locator("[data-testid=gen-value]")).to_have_text(re.compile(r"^[A-Za-z0-9]{32}$"))  # regenerated on the next frame
    value = page.text_content("[data-testid=gen-value]")
    page.click("[data-testid=gen-use]")
    page.click("[data-testid=field-Password-reveal]")
    expect(page.locator("[data-testid=field-Password]")).to_have_value(value)

    attachment = tmp_path / "note.txt"
    attachment.write_bytes(b"attached content")
    page.set_input_files("[data-testid=add-attachment]", str(attachment))
    expect(page.locator("[data-testid=attachment]")).to_have_count(1)
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    mail = kp.find_entries(title="Mail", first=True)
    assert mail.password == value
    assert [(a.filename, a.data) for a in mail.attachments] == [("note.txt", b"attached content")]


def test_lock_and_auto_lock(app_page, sample_db):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Web", "Mail")
    page.fill("[data-testid=field-Notes]", "unsaved")
    page.click("[data-testid=lock]")
    page.click("[data-testid=confirm-cancel]")  # unsaved changes: locking needs confirmation
    expect(page.locator("[data-testid=workspace]")).to_be_visible()
    page.click("[data-testid=lock]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=unlock-form]")).to_be_visible()

    page.clock.install()
    unlock(page, sample_db)
    page.locator("[data-testid=group]", has_text="Web").click()  # restarts the (now fake) inactivity timer
    page.clock.fast_forward("16:00")
    expect(page.locator("[data-testid=unlock-form]")).to_be_visible()
    expect(page.locator("[data-testid=toast]").last).to_contain_text("locked after 15 minutes")


def test_german_interface(app_page, sample_db):
    page = app_page("keepass", init_script=NO_PICKERS + "localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=unlock]")).to_have_text("Entsperren")
    unlock(page, sample_db)
    expect(page.locator("[data-testid=new-entry]")).to_contain_text("Neuer Eintrag")


def test_mobile_layout(app_page, sample_db):
    page = app_page("keepass", mobile=True, init_script=NO_PICKERS)
    unlock(page, sample_db)
    groups, entries, editor = (page.locator(f"[data-testid={x}]") for x in ("groups", "entries", "editor"))
    expect(entries).to_be_visible()
    expect(groups).to_be_hidden()
    page.click("[data-testid=show-groups]")
    expect(groups).to_be_visible()
    page.locator("[data-testid=group]", has_text="Web").tap()
    expect(entries).to_be_visible()
    page.locator("[data-testid=entry]", has_text="Mail").tap()
    expect(editor).to_be_visible()
    expect(entries).to_be_hidden()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.click("[data-testid=back-to-entries]")
    expect(entries).to_be_visible()
    assert page.errors == []


def test_typing_survives_periodic_rerender(app_page, sample_db, tmp_path):
    """The entry view re-renders every second (TOTP); half-typed values in uncommitted fields must stay."""
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Banking", "Bank")  # has a TOTP field
    page.fill("[data-testid=field-tags]", "alpha, beta")
    page.locator("[data-testid=group]", has_text="Web").click()
    page.click("[data-testid=rename-group]")  # works on phones too (a double-click is not a phone gesture)
    page.fill("[data-testid=group-name-input]", "Internet")
    page.wait_for_timeout(1500)
    expect(page.locator("[data-testid=group-name-input]")).to_have_value("Internet")
    page.press("[data-testid=group-name-input]", "Enter")
    expect(page.locator("[data-testid=group]", has_text="Internet")).to_be_visible()


def test_merge_copy_and_other_database(app_page, sample_db, tmp_path):
    import shutil
    # a copy of the same database, changed elsewhere: synchronized
    copy = tmp_path / "copy.kdbx"
    shutil.copy(sample_db, copy)
    kp = PyKeePass(str(copy), password="secret")
    kp.add_entry(kp.find_groups(name="Web", first=True), "Shop", "anna", "pw-shop-long-and-strong-123!")
    mail = kp.find_entries(title="Mail", first=True)
    mail.username = "changed@example.org"
    mail.mtime = mail.mtime + __import__("datetime").timedelta(minutes=5)  # newer than the original (pykeepass does not touch it)
    kp.save()
    # another database: imported into a group
    other = tmp_path / "work.kdbx"
    kpo = create_database(str(other), password="work")
    kpo.root_group.uuid = __import__("uuid").uuid4()  # pykeepass creates every database from one template (same root)
    kpo.add_entry(kpo.add_group(kpo.root_group, "Servers"), "Router", "admin", "router-pw")
    kpo.save()

    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    choose(page, "[data-testid=merge]", copy)
    page.fill("[data-testid=merge-password]", "wrong")
    page.click("[data-testid=merge-ok]")
    expect(page.locator("[data-testid=merge-error]")).to_contain_text("Wrong password")
    page.fill("[data-testid=merge-password]", "secret")
    page.click("[data-testid=merge-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("synchronized")
    choose(page, "[data-testid=merge]", other)
    page.fill("[data-testid=merge-password]", "work")
    page.click("[data-testid=merge-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("1 entries were imported")
    saved = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    assert saved.find_entries(title="Shop", first=True) is not None
    assert saved.find_entries(title="Mail", first=True).username == "changed@example.org"
    router = saved.find_entries(title="Router", first=True)
    assert router.password == "router-pw" and router.group.name == "Servers"
    assert len(saved.find_entries(title="Bank")) == 1  # nothing duplicated
    # undo removes the import
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=group]", has_text="Servers")).to_have_count(0)
    assert page.errors == []


def test_password_report(app_page, tmp_path):
    from datetime import datetime, timedelta, timezone
    path = tmp_path / "report.kdbx"
    kp = create_database(str(path), password="secret")
    g = kp.add_group(kp.root_group, "Accounts")
    kp.add_entry(g, "Strong", "a", "Xk9$mQ2#vL7!pR4&zT8w")
    kp.add_entry(g, "Weak", "a", "hallo")
    kp.add_entry(g, "Reuse 1", "a", "Same-Password-For-Two-Sites-77")
    kp.add_entry(g, "Reuse 2", "b", "Same-Password-For-Two-Sites-77")
    kp.add_entry(g, "Empty", "a", "")
    expired = kp.add_entry(g, "Expired", "a", "Expired-But-Long-Password-1234")
    expired.expires = True
    expired.expiry_time = datetime.now(timezone.utc) - timedelta(days=3)
    old = kp.add_entry(g, "Old", "a", "Old-But-Long-Password-98765!")
    old.mtime = datetime.now(timezone.utc) - timedelta(days=500)
    kp.save()
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, path)
    page.click("[data-testid=report]")
    expect(page.locator("[data-testid=report-summary]")).to_have_text("7 entries checked · 6 with problems")
    rows = page.locator("[data-testid=report-row]")
    texts = {r.locator("a").inner_text(): r.inner_text() for r in rows.all()}
    assert "Weak password" in texts["Weak"] and "Used in 2 entries" in texts["Reuse 1"] and "Empty password" in texts["Empty"]
    assert "Expired" in texts["Expired"] and "Unchanged for" in texts["Old"] and "Strong" not in texts
    rows.filter(has_text="Weak").locator("a").click()
    expect(page.locator("[data-testid=field-Title]")).to_have_value("Weak")
    assert page.errors == []
