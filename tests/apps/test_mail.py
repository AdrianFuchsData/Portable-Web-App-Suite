"""Mail client (apps/mail): offline .eml/.mbox files, composing, contacts, invitations, and IMAP/SMTP through the relay
(fake servers in helpers/mail_fake.py)."""
import email
import email.policy
import json
import re

import pytest
from playwright.sync_api import expect

from helpers import mail_fake as mf

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
INVITE = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:meeting-42@example.com
DTSTAMP:20261001T080000Z
DTSTART:20261020T090000Z
DTEND:20261020T100000Z
SUMMARY:Projektbesprechung
LOCATION:Raum 3
ORGANIZER;CN=Bernd Beispiel:mailto:bernd@example.com
ATTENDEE;CN=Anna;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:anna@example.com
SEQUENCE:0
END:VEVENT
END:VCALENDAR
"""


def parse(data):
    return email.message_from_bytes(data, policy=email.policy.default)


def content(part):
    return part.get_content().replace("\r\n", "\n")


def ready(app_page, **kw):
    return app_page("mail", init_script=NO_PICKERS, **kw)


def open_files(page, *paths):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open-file]")
    chooser.value.set_files([str(p) for p in paths])


def download(page, selector):
    with page.expect_download() as d:
        page.click(selector)
    return open(d.value.path(), "rb").read(), d.value.suggested_filename


# ---- offline ---------------------------------------------------------------------------------------------------------------

def test_open_eml_html_attachment(app_page, tmp_path):
    raw = mf.sample_message(subject="Bericht März", text="Plain version", attachments=[("daten.csv", "text/csv", b"a;b\n1;2\n")],
                            html='<p>Hallo <b>Anna</b></p><img src="https://tracker.example.com/pixel.gif"><a href="https://example.com/x">Link</a>')
    path = tmp_path / "bericht.eml"
    path.write_bytes(raw)
    page = ready(app_page)
    assert page.title() == "Mail"
    expect(page.locator("[data-testid=not-connected]")).to_be_visible()
    open_files(page, path)
    expect(page.locator("[data-testid=message]")).to_have_count(1)
    expect(page.locator("[data-testid=subject]")).to_have_text("Bericht März")
    expect(page.locator("[data-testid=from]")).to_have_text("Bernd Beispiel <bernd@example.com>")
    frame = page.frame_locator("[data-testid=body-html]")
    expect(frame.locator("b")).to_have_text("Anna")
    expect(frame.locator("img")).not_to_have_attribute("src", re.compile("tracker"))
    expect(frame.locator("a")).to_have_attribute("target", "_blank")
    expect(page.locator("[data-testid=remote-blocked]")).to_be_visible()
    data, name = download(page, "[data-testid=attachment]")
    assert (data, name) == (b"a;b\n1;2\n", "daten.csv")
    page.click("[data-testid=toggle-text]")
    expect(page.locator("[data-testid=body-text]")).to_contain_text("Plain version")
    data, name = download(page, "[data-testid=save-eml]")
    assert name == "Bericht März.eml" and data == raw
    assert page.errors == [] and page.requests == []


def test_open_mbox_and_search(app_page, tmp_path):
    msgs = [mf.sample_message(subject=s, text=f"Text {s}\nFrom here on\n") for s in ("Eins", "Zwei", "Drei")]
    mbox = b"".join(b"From someone@example.com Thu Oct 15 10:00:00 2026\n" + m.replace(b"\r\n", b"\n").replace(b"\nFrom here", b"\n>From here") + b"\n" for m in msgs)
    path = tmp_path / "archiv.mbox"
    path.write_bytes(mbox)
    page = ready(app_page)
    open_files(page, path)
    expect(page.locator("[data-testid=message]")).to_have_count(3)
    expect(page.locator("[data-testid=local-folder]")).to_contain_text("archiv.mbox")
    page.fill("[data-testid=search]", "zwei")
    expect(page.locator("[data-testid=message]")).to_have_count(1)
    page.locator("[data-testid=message]").click()
    expect(page.locator("[data-testid=body-text]")).to_contain_text("From here on")
    page.keyboard.press("Delete")
    expect(page.locator("[data-testid=message]")).to_have_count(0)


def test_compose_and_save_eml(app_page, tmp_path):
    page = ready(app_page)
    page.click("[data-testid=new-message]")
    page.fill("[data-testid=compose-to]", "Jürgen Müller <juergen@example.com>, b@example.com")
    page.fill("[data-testid=compose-subject]", "Grüße aus Wien – Test")
    page.fill("[data-testid=compose-text]", "Hallo Jürgen,\n.\nFrom the start\n" + "lang " * 40)
    attachment = tmp_path / "Übersicht.txt"
    attachment.write_text("Inhalt äöü", encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=compose-attach]")
    chooser.value.set_files(str(attachment))
    expect(page.locator("[data-testid=compose-attachments] li")).to_have_count(1)
    data, name = download(page, "[data-testid=compose-eml]")
    assert name == "Grüße aus Wien – Test.eml"
    msg = parse(data)
    assert msg["subject"] == "Grüße aus Wien – Test"
    assert [a.display_name for a in msg["to"].addresses] == ["Jürgen Müller", ""]
    assert all(b < 128 for b in data) and max(len(l) for l in data.split(b"\r\n")) <= 78
    body = content(msg.get_body(("plain",)))
    assert body.startswith("Hallo Jürgen,\n.\nFrom the start\n") and ("lang " * 40).strip() in body
    att = next(msg.iter_attachments())
    assert att.get_filename() == "Übersicht.txt" and att.get_payload(decode=True) == "Inhalt äöü".encode()

    # HTML mode: formatted text with a plain-text alternative
    page.check("[data-testid=compose-mode]")
    editor = page.locator("[data-testid=compose-html]")
    editor.click()
    page.keyboard.press("Control+a")
    page.keyboard.type("Fett ")
    page.click("[data-testid=fmt-bold]")
    page.keyboard.type("wichtig")
    data, _ = download(page, "[data-testid=compose-eml]")
    msg = parse(data)
    assert "<b>wichtig</b>" in content(msg.get_body(("html",)))
    assert "Fett wichtig" in content(msg.get_body(("plain",)))
    page.click("[data-testid=compose-discard]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=compose]")).to_have_count(0)


def test_send_needs_account(app_page):
    page = ready(app_page)
    page.click("[data-testid=new-message]")
    page.fill("[data-testid=compose-to]", "not an address")
    page.click("[data-testid=compose-send]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Invalid address")
    page.fill("[data-testid=compose-to]", "a@example.com")
    page.click("[data-testid=compose-send]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("needs a mail account")


def test_contacts_vcard_and_autocomplete(app_page, tmp_path):
    vcf = tmp_path / "kontakte.vcf"
    vcf.write_text("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jürgen Müller\r\nN:Müller;Jürgen;;;\r\nEMAIL;TYPE=INTERNET:juergen@example.com\r\nTEL:+43 1 234\r\n"
                   "BDAY:1980-01-01\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Gr=C3=BCn;Eva\r\nEMAIL:eva@example.com\r\nEND:VCARD\r\n", encoding="utf-8")
    page = ready(app_page)
    page.click("[data-testid=open-contacts]")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=import-vcf]")
    chooser.value.set_files(str(vcf))
    expect(page.locator("[data-testid=contact]")).to_have_count(2)
    expect(page.locator("[data-testid=contact]").nth(0)).to_contain_text("Eva Grün")
    page.click("[data-testid=new-contact]")
    page.fill("[data-testid=contact-name]", "Zoe Neu")
    page.fill("[data-testid=contact-emails]", "zoe@example.com")
    page.click("[data-testid=contact-save]")
    expect(page.locator("[data-testid=contact]")).to_have_count(3)
    expect(page.locator("[data-testid=appdata]")).to_contain_text("•")  # saved with the connections file
    data, name = download(page, "[data-testid=export-vcf]")
    text = data.decode()
    assert name == "contacts.vcf" and text.count("BEGIN:VCARD") == 3
    assert "FN:Jürgen Müller" in text and "N:Müller;Jürgen;;;" in text and "BDAY:1980-01-01" in text and "TEL:+43 1 234" in text
    page.locator("[data-testid=contact]").filter(has_text="Zoe").locator("[data-testid=contact-write]").click()
    expect(page.locator("[data-testid=compose-to]")).to_have_value("Zoe Neu <zoe@example.com>")
    page.fill("[data-testid=compose-cc]", "jür")
    expect(page.locator("[data-testid=suggestion]")).to_have_count(1)
    page.keyboard.press("Enter")
    expect(page.locator("[data-testid=compose-cc]")).to_have_value("Jürgen Müller <juergen@example.com>, ")


def test_invitation_offline(app_page, tmp_path):
    path = tmp_path / "einladung.eml"
    path.write_bytes(mf.sample_message(subject="Einladung", calendar=INVITE))
    page = ready(app_page)
    open_files(page, path)
    card = page.locator("[data-testid=invitation]")
    expect(card).to_contain_text("Projektbesprechung")
    expect(card).to_contain_text("Raum 3")
    expect(page.locator("[data-testid=invite-accept]")).to_have_count(0)  # no account
    data, name = download(page, "[data-testid=invite-ics]")
    assert name == "Projektbesprechung.ics" and b"UID:meeting-42@example.com" in data
    reply = page.evaluate("ics => MAIL.invitationReply(Suite.ical.parse(ics), 'anna@example.com', 'ACCEPTED')", INVITE)
    assert "METHOD:REPLY" in reply and "UID:meeting-42@example.com" in reply
    assert re.search(r"ATTENDEE;CN=Anna;PARTSTAT=ACCEPTED:mailto:anna@example.com", reply) and "RSVP" not in reply


def test_mime_helpers(app_page):
    page = ready(app_page)
    r = page.evaluate("""() => {
      const m = MAIL.mime;
      return {
        addrs: m.parseAddresses('"Last, First" <lf@example.com>; Anna <anna@example.com>, plain@example.com (comment)'),
        word: m.encodeWord('Grüße'), ascii: m.encodeWord('Hello'),
        qp: m.quotedPrintable('a=b äö\\n.dot \\nFrom x'),
        mbox: m.splitMbox(new TextEncoder().encode('From a@b Thu Oct 15 2026\\nSubject: 1\\n\\n>From x\\n\\nFrom c@d Thu Oct 15 2026\\nSubject: 2\\n\\nbody\\n')).map((b) => new TextDecoder().decode(b)),
      };
    }""")
    assert r["addrs"] == [{"name": "Last, First", "address": "lf@example.com"}, {"name": "Anna", "address": "anna@example.com"}, {"name": "", "address": "plain@example.com"}]
    assert r["word"] == "=?UTF-8?B?R3LDvMOfZQ==?=" and r["ascii"] == "Hello"
    assert r["qp"] == "a=3Db =C3=A4=C3=B6\r\n=2Edot=20\r\n=46rom x"
    assert r["mbox"] == ["Subject: 1\n\nFrom x\n", "Subject: 2\n\nbody"]


def test_german_and_mobile(app_page, tmp_path):
    page = app_page("mail", mobile=True, init_script="localStorage.setItem('suite.lang', 'de');" + NO_PICKERS)
    expect(page.locator("[data-testid=app-title]")).to_have_text("E-Mail")
    expect(page.locator("[data-testid=message-list]")).to_be_visible()
    expect(page.locator("[data-testid=sidebar]")).to_be_hidden()
    page.click("[data-testid=toggle-panels]")
    expect(page.locator("[data-testid=sidebar]")).to_be_visible()
    expect(page.locator("[data-testid=add-account]")).to_have_text("+ Konto")
    page.click("[data-testid=toggle-panels]")
    path = tmp_path / "a.eml"
    path.write_bytes(mf.sample_message(subject="Mobil"))
    open_files(page, path)
    expect(page.locator("[data-testid=subject]")).to_be_visible()  # a single message is shown right away
    expect(page.locator("[data-testid=message-list]")).to_be_hidden()
    page.click("[data-testid=back]")
    expect(page.locator("[data-testid=message-list]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


# ---- IMAP/SMTP through the relay ------------------------------------------------------------------------------------------------------

@pytest.fixture
def servers():
    imap = mf.ImapFake()
    smtp = mf.SmtpFake()
    si, ss = mf.start_imap(imap), mf.start_smtp(smtp)
    imap.deliver(mf.sample_message(subject="Erste Nachricht", text="Hallo Anna, erste."), flags=["\\Seen"])
    imap.deliver(mf.sample_message(subject="Zweite Nachricht", text="Neuigkeiten aus Graz", sender="Clara <clara@example.com>",
                                   to="anna@example.com, team@example.com", attachments=[("plan.pdf", "application/pdf", b"%PDF-1.4 test")]))
    yield imap, smtp, si.server_address[1], ss.server_address[1]
    si.shutdown()
    ss.shutdown()


def set_relay(page, relay):
    page.fill("[data-testid=relay-url]", relay["url"])
    page.locator("[data-testid=relay-url]").blur()
    page.fill("[data-testid=relay-token]", relay["token"])
    page.locator("[data-testid=relay-token]").blur()


def add_account(page, relay, imap_port, smtp_port, host="127.0.0.1", imap_sec="none", smtp_sec="none", save_password=False):
    page.locator("[data-testid=sidebar] details summary").click()
    set_relay(page, relay)
    page.click("[data-testid=add-account]")
    page.fill("[data-testid=acc-email]", "anna@example.com")
    page.locator("[data-testid=acc-email]").blur()
    page.fill("[data-testid=acc-display]", "Anna Äpfel")
    page.fill("[data-testid=acc-user]", "anna")
    page.fill("[data-testid=acc-password]", "secret")
    if save_password:
        page.check("[data-testid=acc-save-password]")
    page.select_option("[data-testid=acc-imap-security]", imap_sec)
    page.fill("[data-testid=acc-imap-host]", host)
    page.fill("[data-testid=acc-imap-port]", str(imap_port))
    page.select_option("[data-testid=acc-smtp-security]", smtp_sec)
    page.fill("[data-testid=acc-smtp-host]", host)
    page.fill("[data-testid=acc-smtp-port]", str(smtp_port))
    page.fill("[data-testid=acc-signature]", "Anna")
    page.click("[data-testid=acc-connect]")
    expect(page.locator("[data-testid=folder]").first).to_contain_text("Inbox")


def test_imap_read_flag_move_delete(app_page, relay, servers, tmp_path):
    imap, _, ip, sp = servers
    page = ready(app_page)
    add_account(page, relay, ip, sp)
    expect(page.locator("[data-testid=folder]")).to_have_text([re.compile(x) for x in ("Inbox", "Drafts", "Sent", "Archive", "Trash")])
    expect(page.locator("[data-testid=folder]").first.locator("[data-testid=unread]")).to_have_text("1")
    rows = page.locator("[data-testid=message]")
    expect(rows).to_have_count(2)
    expect(rows.first).to_have_class(re.compile("unread"))
    expect(rows.first.locator("[data-testid=message-subject]")).to_have_text("Zweite Nachricht")
    rows.first.click()
    expect(page.locator("[data-testid=body-text]")).to_contain_text("Neuigkeiten aus Graz")
    expect(page.locator("[data-testid=attachment]")).to_contain_text("plan.pdf")
    expect(rows.first).not_to_have_class(re.compile("unread"))
    expect(page.locator("[data-testid=folder]").first.locator("[data-testid=unread]")).to_have_count(0)
    assert "\\Seen" in imap.folders["INBOX"].messages[1].flags

    page.click("[data-testid=toggle-flag]")
    expect(rows.first.locator("[data-testid=flagged]")).to_be_visible()
    assert "\\Flagged" in imap.folders["INBOX"].messages[1].flags

    # search on the server
    page.fill("[data-testid=search]", "graz")
    page.press("[data-testid=search]", "Enter")
    expect(rows).to_have_count(1)
    page.fill("[data-testid=search]", "")
    expect(rows).to_have_count(2)

    # move to the archive, delete to the trash, delete for good in the trash
    rows.first.click()
    page.click("[data-testid=move]")
    page.locator("[data-testid=move-target]").filter(has_text="Archive").click()
    expect(rows).to_have_count(1)
    assert [m.parsed()["subject"] for m in imap.folders["Archiv"].messages] == ["Zweite Nachricht"]
    rows.first.click()
    page.click("[data-testid=delete]")
    expect(rows).to_have_count(0)
    assert len(imap.folders["Trash"].messages) == 1 and not imap.folders["INBOX"].messages
    page.locator("[data-testid=folder]").filter(has_text="Trash").locator("a").click()
    expect(rows).to_have_count(1)
    rows.first.click()
    page.keyboard.press("Delete")
    page.click("[data-testid=confirm-ok]")
    expect(rows).to_have_count(0)
    assert not imap.folders["Trash"].messages

    # new mail arrives
    page.locator("[data-testid=folder]").first.locator("a").click()
    imap.deliver(mf.sample_message(subject="Ganz neu"))
    page.click("[data-testid=refresh]")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text("Ganz neu")

    # the account is stored without the password (not chosen)
    page.click("[data-testid=appdata-save]")
    page.check("[data-testid=appdata-json]")
    with page.expect_download() as d:
        page.click("[data-testid=appdata-create-ok]")
    stored = json.loads(open(d.value.path(), encoding="utf-8").read())
    account = stored["apps"]["mail"]["connections"][0]
    assert account["email"] == "anna@example.com" and account["imapPort"] == ip and not account.get("password")
    assert page.errors == []


def test_reply_send_and_drafts(app_page, relay, servers):
    imap, smtp, ip, sp = servers
    page = ready(app_page)
    add_account(page, relay, ip, sp)
    page.locator("[data-testid=message]").first.click()
    expect(page.locator("[data-testid=subject]")).to_have_text("Zweite Nachricht")
    page.click("[data-testid=reply-all]")
    expect(page.locator("[data-testid=compose-to]")).to_have_value("Clara <clara@example.com>, team@example.com")
    expect(page.locator("[data-testid=compose-subject]")).to_have_value("Re: Zweite Nachricht")
    text = page.locator("[data-testid=compose-text]")
    expect(text).to_have_value(re.compile(r"> Neuigkeiten aus Graz"))
    text.focus()
    page.keyboard.press("Control+Home")
    page.keyboard.type("Danke!")
    page.click("[data-testid=compose-send]")
    expect(page.locator("[data-testid=compose]")).to_have_count(0)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("sent")
    assert len(smtp.messages) == 1
    sent = smtp.messages[0]
    assert sent["from"] == "anna@example.com" and sent["to"] == ["clara@example.com", "team@example.com"] and sent["user"] == "anna"
    msg = parse(sent["data"])
    original = imap.folders["INBOX"].messages[1].parsed()
    assert msg["In-Reply-To"] == original["Message-ID"] and msg["From"] == "Anna Äpfel <anna@example.com>"
    body = content(msg.get_body(("plain",)))
    assert body.startswith("Danke!") and "> Neuigkeiten aus Graz" in body and "-- \nAnna" in body
    assert len(imap.folders["Sent"].messages) == 1 and "\\Seen" in imap.folders["Sent"].messages[0].flags
    assert "\\Answered" in imap.folders["INBOX"].messages[1].flags

    # forward with the attachment, saved as a draft
    page.click("[data-testid=forward]")
    expect(page.locator("[data-testid=compose-attachments] li")).to_contain_text("plan.pdf")
    page.fill("[data-testid=compose-to]", "dora@example.com")
    page.click("[data-testid=show-bcc]")
    page.fill("[data-testid=compose-bcc]", "geheim@example.com")
    page.click("[data-testid=compose-draft]")
    expect(page.locator("[data-testid=compose]")).to_have_count(0)
    drafts = imap.folders["Drafts"].messages
    assert len(drafts) == 1 and {"\\Draft", "\\Seen"} <= drafts[0].flags
    draft = drafts[0].parsed()
    assert draft["Subject"] == "Fwd: Zweite Nachricht" and draft["Bcc"] == "geheim@example.com"
    assert next(draft.iter_attachments()).get_filename() == "plan.pdf"

    # edit the draft and send it: the draft is removed
    page.locator("[data-testid=folder]").filter(has_text="Drafts").locator("a").click()
    page.locator("[data-testid=message]").first.click()
    page.click("[data-testid=edit-draft]")
    expect(page.locator("[data-testid=compose-bcc]")).to_have_value("geheim@example.com")
    page.click("[data-testid=compose-send]")
    expect(page.locator("[data-testid=compose]")).to_have_count(0)
    assert smtp.messages[1]["to"] == ["dora@example.com", "geheim@example.com"]
    assert b"geheim@example.com" not in smtp.messages[1]["data"]  # Bcc is not in the sent message
    expect(page.locator("[data-testid=message]")).to_have_count(0)
    assert not imap.folders["Drafts"].messages


def test_tls_starttls_without_move_and_invitation(app_page, relay, certs, tmp_path):
    _, cert, key = certs
    imap = mf.ImapFake(cert=str(cert), key=str(key), implicit_tls=True, literal_plus=False, move=False, auth_plain=False)
    smtp = mf.SmtpFake(cert=str(cert), key=str(key), login_only=True)
    imap.deliver(mf.sample_message(subject="Einladung", calendar=INVITE))
    si, ss = mf.start_imap(imap), mf.start_smtp(smtp)
    try:
        page = ready(app_page)
        add_account(page, relay, si.server_address[1], ss.server_address[1], host="localhost", imap_sec="tls", smtp_sec="starttls")
        page.locator("[data-testid=message]").first.click()
        expect(page.locator("[data-testid=invitation]")).to_contain_text("Projektbesprechung")
        page.click("[data-testid=invite-accept]")
        expect(page.locator("[data-testid=toast]").last).to_contain_text("bernd@example.com")
        sent = smtp.messages[0]
        assert sent["tls"] and sent["user"] == "anna" and sent["to"] == ["bernd@example.com"]
        cal = parse(sent["data"]).get_body(("calendar",))
        assert cal.get_param("method") == "REPLY" and "PARTSTAT=ACCEPTED" in content(cal)
        # moving without MOVE: COPY + STORE \\Deleted + UID EXPUNGE
        page.click("[data-testid=move]")
        page.locator("[data-testid=move-target]").filter(has_text="Archive").click()
        expect(page.locator("[data-testid=message]")).to_have_count(0)
        assert len(imap.folders["Archiv"].messages) == 1 and "UID EXPUNGE" in imap.commands
        assert "LOGIN" in imap.commands
        # a draft through a synchronizing literal (no LITERAL+)
        page.click("[data-testid=new-message]")
        page.fill("[data-testid=compose-subject]", "Entwurf ohne LITERAL+")
        page.click("[data-testid=compose-draft]")
        expect(page.locator("[data-testid=compose]")).to_have_count(0)
        assert imap.folders["Drafts"].messages[0].parsed()["Subject"] == "Entwurf ohne LITERAL+"
    finally:
        si.shutdown()
        ss.shutdown()


def test_wrong_password_and_folders(app_page, relay, servers):
    imap, _, ip, sp = servers
    imap.password = "other"
    page = ready(app_page)
    page.locator("[data-testid=sidebar] details summary").click()
    set_relay(page, relay)
    page.click("[data-testid=add-account]")
    page.fill("[data-testid=acc-email]", "anna@example.com")
    page.locator("[data-testid=acc-email]").blur()
    expect(page.locator("[data-testid=acc-imap-host]")).to_have_value("imap.example.com")
    page.fill("[data-testid=acc-user]", "anna")
    page.fill("[data-testid=acc-password]", "secret")
    page.select_option("[data-testid=acc-imap-security]", "none")
    page.fill("[data-testid=acc-imap-host]", "127.0.0.1")
    page.fill("[data-testid=acc-imap-port]", str(ip))
    page.click("[data-testid=acc-connect]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("invalid credentials")
    imap.password = "secret"
    page.locator("[data-testid=account] a").click()
    expect(page.locator("[data-testid=folder]").first).to_contain_text("Inbox")
    page.click("[data-testid=folder-new]")
    page.fill("[data-testid=name-input]", "Projekte Ä")
    page.click("[data-testid=name-ok]")
    expect(page.locator("[data-testid=folder]").filter(has_text="Projekte Ä")).to_have_count(1)
    assert "Projekte &AMQ-" in imap.folders
    # drag a message onto the new folder
    page.locator("[data-testid=folder]").first.locator("a").click()
    if page.evaluate("matchMedia('(max-width: 760px)').matches"):
        # on phones the list and the folders are separate views: open the message and use "Move…"
        page.locator("[data-testid=message]").first.click()
        page.click("[data-testid=move]")
        page.locator("[data-testid=move-target]").filter(has_text="Projekte Ä").click()
    else:
        page.locator("[data-testid=message]").first.drag_to(page.locator("[data-testid=folder]").filter(has_text="Projekte Ä"))
    expect(page.locator("[data-testid=message]")).to_have_count(1)
    assert len(imap.folders["Projekte &AMQ-"].messages) == 1


def test_conversation_threads(app_page, tmp_path):
    def msg(mid, subject, date, refs="", reply_to=""):
        head = f"From: a@example.com\nTo: b@example.com\nSubject: {subject}\nDate: {date}\nMessage-ID: <{mid}@x>\n"
        if reply_to:
            head += f"In-Reply-To: <{reply_to}@x>\n"
        if refs:
            head += "References: " + " ".join(f"<{r}@x>" for r in refs.split()) + "\n"
        return f"From a@example.com Thu Oct 15 10:00:00 2026\n{head}\nText {mid}\n\n".encode()
    mbox = b"".join([
        msg("a", "Topic", "Thu, 15 Oct 2026 10:00:00 +0000"),
        msg("b", "Re: Topic", "Thu, 15 Oct 2026 11:00:00 +0000", refs="a", reply_to="a"),
        msg("c", "Re: Re: Topic", "Thu, 15 Oct 2026 12:00:00 +0000", refs="a b", reply_to="b"),
        msg("d", "AW: Topic", "Thu, 15 Oct 2026 13:00:00 +0000"),  # a reply without references: by subject
        msg("e", "Other", "Thu, 15 Oct 2026 09:00:00 +0000"),
    ])
    path = tmp_path / "threads.mbox"
    path.write_bytes(mbox)
    page = ready(app_page)
    open_files(page, path)
    rows = page.locator("[data-testid=message]")
    expect(rows).to_have_count(2)  # the conversation (newest activity first) and the other message
    expect(rows.first.locator("[data-testid=thread-toggle]")).to_have_text("▸ 4")
    expect(rows.nth(1)).to_contain_text("Other")
    rows.first.locator("[data-testid=thread-toggle]").click()
    expect(rows).to_have_count(5)
    assert [rows.nth(i).get_attribute("data-depth") for i in range(4)] == ["0", "1", "2", "1"]
    expect(rows.nth(2)).to_contain_text("Re: Re: Topic")
    expect(rows.nth(3)).to_contain_text("AW: Topic")
    rows.first.locator("[data-testid=thread-toggle]").click()
    expect(rows).to_have_count(2)
    # flat list
    page.click("[data-testid=threads]")
    expect(rows).to_have_count(5)
    assert page.evaluate("localStorage.getItem('suite.mail.threads')") == "0"
    assert page.errors == []


def test_rules_and_templates(app_page, relay, servers):
    imap, _, ip, sp = servers
    page = ready(app_page)
    add_account(page, relay, ip, sp)
    rows = page.locator("[data-testid=message]")
    expect(rows).to_have_count(2)
    # rules: move Clara's messages to Archive, flag invoices
    page.locator("[data-testid=sidebar] [data-testid=edit-account]").click()
    page.click("[data-testid=add-rule]")
    expect(page.locator("[data-testid=rule]")).to_have_count(1)
    rule = page.locator("[data-testid=rule]").last
    rule.locator("[data-testid=rule-contains]").fill("CLARA@")
    rule.locator("[data-testid=rule-folder]").select_option("Archiv")
    page.click("[data-testid=add-rule]")
    expect(page.locator("[data-testid=rule]")).to_have_count(2)
    rule = page.locator("[data-testid=rule]").nth(1)
    rule.locator("[data-testid=rule-field]").select_option("subject")
    rule.locator("[data-testid=rule-contains]").fill("rechnung")
    rule.locator("[data-testid=rule-action]").select_option("flag")
    page.click("[data-testid=acc-save]")
    expect(page.locator("[data-testid=account-dialog]")).to_have_count(0)
    page.click("[data-testid=apply-rules]")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text("Erste Nachricht")
    assert len(imap.folders["Archiv"].messages) == 1
    # new mail is handled when it arrives
    imap.deliver(mf.sample_message(subject="Ihre Rechnung Oktober"))
    page.click("[data-testid=refresh]")
    expect(rows).to_have_count(2)
    expect(page.locator("[data-testid=message] [data-testid=flagged]")).to_have_count(1)
    assert "\\Flagged" in imap.folders["INBOX"].messages[-1].flags

    # templates: save a message as a template, start a new one from it
    page.click("[data-testid=new-message]")
    page.fill("[data-testid=compose-subject]", "Wochenbericht")
    page.fill("[data-testid=compose-text]", "Hallo Team,\n\nErledigt:\n- \n")
    page.click("[data-testid=compose-template]")
    page.click("[data-testid=compose-discard]")
    page.click("[data-testid=confirm-ok]")
    page.select_option("[data-testid=templates]", label="Wochenbericht")
    expect(page.locator("[data-testid=compose-subject]")).to_have_value("Wochenbericht")
    expect(page.locator("[data-testid=compose-text]")).to_have_value("Hallo Team,\n\nErledigt:\n- \n")
    assert page.errors == []


def test_several_accounts_and_all_inboxes(app_page, relay, servers):
    from datetime import datetime, timedelta, timezone
    imap, smtp, ip, sp = servers
    imap2, smtp2 = mf.ImapFake(user="bob", password="pw2"), mf.SmtpFake(user="bob", password="pw2")
    si2, ss2 = mf.start_imap(imap2), mf.start_smtp(smtp2)
    imap2.deliver(mf.sample_message(subject="Von Bob", sender="Carla <carla@example.com>", to="bob@example.org", text="Hallo Bob",
                                    date=datetime.now(timezone.utc) + timedelta(minutes=5)))
    try:
        page = ready(app_page)
        add_account(page, relay, ip, sp)
        page.click("[data-testid=add-account]")
        page.fill("[data-testid=acc-name]", "Bob")
        page.fill("[data-testid=acc-email]", "bob@example.org")
        page.locator("[data-testid=acc-email]").blur()  # fills in suggestions for the empty fields
        page.fill("[data-testid=acc-user]", "bob")
        page.fill("[data-testid=acc-password]", "pw2")
        page.select_option("[data-testid=acc-imap-security]", "none")
        page.fill("[data-testid=acc-imap-host]", "127.0.0.1")
        page.fill("[data-testid=acc-imap-port]", str(si2.server_address[1]))
        page.select_option("[data-testid=acc-smtp-security]", "none")
        page.fill("[data-testid=acc-smtp-host]", "127.0.0.1")
        page.fill("[data-testid=acc-smtp-port]", str(ss2.server_address[1]))
        page.click("[data-testid=acc-connect]")
        rows = page.locator("[data-testid=message]")
        expect(rows).to_have_count(1)
        expect(rows.first).to_contain_text("Von Bob")
        accounts = page.locator("[data-testid=account]")
        expect(accounts.filter(has_text="anna@example.com")).to_have_attribute("data-connected", "true")  # still connected
        expect(accounts.filter(has_text="anna@example.com").locator("[data-testid=account-unread]")).to_have_text("1")

        # all inboxes: newest first, with the account of every message
        page.click("[data-testid=all-inboxes] a")
        expect(rows).to_have_count(3)
        expect(page.locator("[data-testid=all-inboxes] [data-testid=unread]")).to_have_text("2")
        expect(rows.locator("[data-testid=message-subject]")).to_have_text(["Von Bob", "Zweite Nachricht", "Erste Nachricht"])
        expect(rows.first.locator("[data-testid=message-account]")).to_have_text("Bob")
        rows.first.click()
        expect(page.locator("[data-testid=body-text]")).to_contain_text("Hallo Bob")
        expect(page.locator("[data-testid=reader-account]")).to_have_text("Bob")
        expect(page.locator("[data-testid=all-inboxes] [data-testid=unread]")).to_have_text("1")
        assert "\\Seen" in imap2.folders["INBOX"].messages[0].flags
        # a reply goes out from the account of the message
        page.click("[data-testid=reply]")
        expect(page.locator("[data-testid=compose-to]")).to_have_value("Carla <carla@example.com>")
        page.click("[data-testid=compose-send]")
        expect(page.locator("[data-testid=compose]")).to_have_count(0)
        assert len(smtp2.messages) == 1 and not smtp.messages and smtp2.messages[0]["from"] == "bob@example.org"
        assert len(imap2.folders["Sent"].messages) == 1 and "\\Answered" in imap2.folders["INBOX"].messages[0].flags
        # flag and delete work per account
        rows.nth(1).click()
        page.keyboard.press("s")
        expect(rows.nth(1).locator("[data-testid=flagged]")).to_be_visible()
        assert "\\Flagged" in imap.folders["INBOX"].messages[1].flags
        rows.nth(2).click()
        page.click("[data-testid=delete]")
        expect(rows).to_have_count(2)
        assert len(imap.folders["Trash"].messages) == 1 and len(imap.folders["INBOX"].messages) == 1
        # new mail in one of the inboxes
        imap.deliver(mf.sample_message(subject="Neu für Anna", date=datetime.now(timezone.utc) + timedelta(minutes=10)))
        page.click("[data-testid=refresh]")
        expect(rows).to_have_count(3)
        expect(rows.first).to_contain_text("Neu für Anna")
        # the search filters the combined list
        page.fill("[data-testid=search]", "bob")
        page.press("[data-testid=search]", "Enter")
        expect(rows).to_have_count(1)
        page.fill("[data-testid=search]", "")
        page.press("[data-testid=search]", "Enter")
        expect(rows).to_have_count(3)

        # back to one account: its folders, the connection is reused
        logins = lambda: sum(c in ("LOGIN", "AUTHENTICATE") for c in imap.commands)
        before = logins()
        accounts.filter(has_text="anna@example.com").locator("a").click()
        expect(page.locator("[data-testid=folders-account]")).to_have_text("anna@example.com")
        expect(rows).to_have_count(2)
        assert logins() == before
        # disconnecting one account removes the combined inbox
        accounts.filter(has_text="Bob").locator("[data-testid=disconnect-account]").click()
        expect(page.locator("[data-testid=all-inboxes]")).to_have_count(0)
        expect(accounts.filter(has_text="Bob")).to_have_attribute("data-connected", "false")
        expect(rows).to_have_count(2)
        assert page.errors == []
    finally:
        si2.shutdown()
        ss2.shutdown()
