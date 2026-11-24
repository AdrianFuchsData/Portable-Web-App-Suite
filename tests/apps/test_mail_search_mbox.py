"""Mail client: search in all folders and all accounts, mbox export (with marks) and import into an IMAP folder."""
import mailbox

from playwright.sync_api import expect

from helpers import mail_fake as mf
from test_mail import add_account, ready, servers  # noqa: F401 (fixture)


def add_bob(page, imap2_port, smtp2_port):
    page.click("[data-testid=add-account]")
    page.fill("[data-testid=acc-name]", "Bob")
    page.fill("[data-testid=acc-email]", "bob@example.org")
    page.locator("[data-testid=acc-email]").blur()
    page.fill("[data-testid=acc-user]", "bob")
    page.fill("[data-testid=acc-password]", "pw2")
    page.select_option("[data-testid=acc-imap-security]", "none")
    page.fill("[data-testid=acc-imap-host]", "127.0.0.1")
    page.fill("[data-testid=acc-imap-port]", str(imap2_port))
    page.select_option("[data-testid=acc-smtp-security]", "none")
    page.fill("[data-testid=acc-smtp-host]", "127.0.0.1")
    page.fill("[data-testid=acc-smtp-port]", str(smtp2_port))
    page.click("[data-testid=acc-connect]")


def test_search_all_folders_and_accounts(app_page, relay, servers):  # noqa: F811
    imap, _, ip, sp = servers
    imap.deliver(mf.sample_message(subject="Alte Reise", text="Die Fahrt nach Graz im Mai"), folder="Archiv", flags=["\\Seen"])
    imap2, smtp2 = mf.ImapFake(user="bob", password="pw2"), mf.SmtpFake(user="bob", password="pw2")
    si2, ss2 = mf.start_imap(imap2), mf.start_smtp(smtp2)
    imap2.deliver(mf.sample_message(subject="Graz-Treffen", sender="Carla <carla@example.com>", to="bob@example.org", text="Treffen am Montag"))
    try:
        page = ready(app_page)
        add_account(page, relay, ip, sp)
        rows = page.locator("[data-testid=message]")
        expect(rows).to_have_count(2)
        # this folder: the server search of the inbox
        page.fill("[data-testid=search]", "Graz")
        page.press("[data-testid=search]", "Enter")
        expect(rows).to_have_count(1)
        # all folders of the account
        page.select_option("[data-testid=search-scope]", "folders")
        expect(page.locator("[data-testid=search-info]")).to_contain_text("2 messages found in 5 folders")
        expect(rows.locator("[data-testid=message-subject]")).to_have_text(["Zweite Nachricht", "Alte Reise"])
        expect(rows.nth(1).locator("[data-testid=message-folder]")).to_have_text("Archive")
        rows.nth(1).click()
        expect(page.locator("[data-testid=body-text]")).to_contain_text("Die Fahrt nach Graz")
        page.click("[data-testid=toggle-flag]")
        expect(rows.nth(1).locator("[data-testid=flagged]")).to_be_visible()
        assert "\\Flagged" in imap.folders["Archiv"].messages[0].flags and "\\Flagged" not in imap.folders["INBOX"].messages[1].flags
        # back to the inbox
        page.click("[data-testid=search-close]")
        expect(rows).to_have_count(2)
        expect(page.locator("[data-testid=search-info]")).to_have_count(0)
        # all accounts
        add_bob(page, si2.server_address[1], ss2.server_address[1])
        expect(rows).to_have_count(1)
        page.fill("[data-testid=search]", "graz")
        page.select_option("[data-testid=search-scope]", "accounts")
        expect(page.locator("[data-testid=search-info]")).to_contain_text("3 messages found in 10 folders")
        expect(rows.filter(has_text="Graz-Treffen").locator("[data-testid=message-account]")).to_have_text("Bob")
        # deleting a result moves it into the trash of its account
        rows.filter(has_text="Alte Reise").click()
        page.click("[data-testid=delete]")
        expect(rows).to_have_count(2)
        assert not imap.folders["Archiv"].messages and len(imap.folders["Trash"].messages) == 1
        assert page.errors == []
    finally:
        si2.shutdown()
        ss2.shutdown()


def test_mbox_export_and_import(app_page, relay, servers, tmp_path):  # noqa: F811
    imap, _, ip, sp = servers
    page = ready(app_page)
    add_account(page, relay, ip, sp)
    rows = page.locator("[data-testid=message]")
    expect(rows).to_have_count(2)
    rows.first.click()  # (marks it read)
    page.click("[data-testid=toggle-flag]")
    with page.expect_download() as d:
        page.select_option("[data-testid=mbox-menu]", "export")
    path = tmp_path / d.value.suggested_filename
    d.value.save_as(path)
    assert path.name == "INBOX.mbox"
    box = mailbox.mbox(str(path))
    msgs = list(box)
    assert [m["Subject"] for m in msgs] == ["Erste Nachricht", "Zweite Nachricht"]  # oldest first
    assert msgs[0]["Status"] == "RO" and msgs[1]["Status"] == "RO" and msgs[1]["X-Status"] == "F"
    assert msgs[1].get_from().startswith("clara@example.com ")
    assert "Neuigkeiten aus Graz" in msgs[1].get_payload()[0].get_payload(decode=True).decode()
    # import into the archive: three messages with their marks (one starts a line with "From ", escaped in the file)
    src = tmp_path / "import.mbox"
    imported = mailbox.mbox(str(src))
    for subject, status, xstatus, text in (("Eins", "RO", None, "Hallo\nFrom here on, all fine.\n"), ("Zwei", "O", "F", "Text"), ("Drei", None, "A", "Antwort")):
        m = mailbox.mboxMessage(mf.sample_message(subject=subject, text=text))
        if status:
            m["Status"] = status
        if xstatus:
            m["X-Status"] = xstatus
        m.set_from("someone@example.com Thu Oct 15 10:00:00 2026")
        imported.add(m)
    imported.flush()
    imported.close()
    page.locator("[data-testid=folder]", has_text="Archive").click()
    expect(rows).to_have_count(0)
    with page.expect_file_chooser() as chooser:
        page.select_option("[data-testid=mbox-menu]", "import")
    chooser.value.set_files(str(src))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("3 messages imported into “Archive”")
    expect(rows).to_have_count(3)
    archive = imap.folders["Archiv"].messages
    by = {m.parsed()["subject"]: m for m in archive}
    assert "\\Seen" in by["Eins"].flags and "\\Flagged" in by["Zwei"].flags and "\\Seen" not in by["Zwei"].flags and "\\Answered" in by["Drei"].flags
    assert b"\r\nFrom here on, all fine." in by["Eins"].raw and b"Status:" not in by["Eins"].raw and b"\r\n" in by["Zwei"].raw
    assert page.errors == []
