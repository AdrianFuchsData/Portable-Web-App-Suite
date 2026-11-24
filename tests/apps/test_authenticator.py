"""Authenticator (apps/authenticator): one-time passwords of a KeePass database. Databases are written and checked with
pykeepass; the expected codes are computed here (RFC 4226/6238, Steam)."""
import base64
import calendar
import hashlib
import hmac
import json
import re
import struct

import segno
from playwright.sync_api import expect
from pykeepass import PyKeePass, create_database

from test_keepass_qr import migration_uri

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
UTC = {"timezone_id": "UTC"}
S1 = "JBSWY3DPEHPK3PXP"
S2 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
S3 = "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U"
S4 = "KRUGS4ZANFZSAYJAONSWG4TFOQ"
S5 = "GEZDGNBVGY3TQOJQ"
AT = calendar.timegm((2030, 1, 2, 3, 4, 5))  # 2030-01-02 03:04:05 UTC
STEAM_CHARS = "23456789BCDFGHJKMNPQRTVWXY"


def raw_value(secret, counter, algorithm=hashlib.sha1):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), algorithm).digest()
    offset = digest[-1] & 15
    return struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF


def hotp(secret, counter, digits=6, algorithm=hashlib.sha1):
    return str(raw_value(secret, counter, algorithm) % 10 ** digits).zfill(digits)


def steam(secret, counter):
    value, out = raw_value(secret, counter), ""
    for _ in range(5):
        out += STEAM_CHARS[value % 26]
        value //= 26
    return out


def make_db(path):
    kp = create_database(str(path), password="secret")
    web = kp.add_group(kp.root_group, "Web")
    games = kp.add_group(kp.root_group, "Games")
    mail = kp.add_entry(web, "Mail", "anna@example.org", "pw-mail", url="https://mail.example")
    mail.otp = f"otpauth://totp/Mail:anna%40example.org?secret={S1}&issuer=Mail"
    native = kp.add_entry(web, "Native", "anna", "")  # KeePass 2.47+ fields only
    native.set_custom_property("TimeOtp-Secret-Base32", S2, protect=True)
    native.set_custom_property("TimeOtp-Length", "8")
    native.set_custom_property("TimeOtp-Algorithm", "HMAC-SHA-256")
    counter = kp.add_entry(web, "Counter", "anna", "")
    counter.otp = f"otpauth://hotp/Counter:anna?secret={S3}&counter=5"
    game = kp.add_entry(games, "Steam", "gamer", "")
    game.otp = f"otpauth://totp/Steam:gamer?secret={S4}&issuer=Steam&encoder=steam"
    broken = kp.add_entry(web, "Broken", "anna", "pw")
    broken.otp = "otpauth://totp/x?secret=1!!"
    kp.add_entry(web, "Plain", "anna", "no-otp")
    kp.save()
    return path


def choose(page, selector, *paths):
    with page.expect_file_chooser() as chooser:
        page.click(selector)
    chooser.value.set_files([str(p) for p in paths])


def unlock(page, path, password="secret"):
    choose(page, "[data-testid=choose-db]", path)
    page.fill("[data-testid=password]", password)
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=workspace]")).to_be_visible(timeout=30000)


def card(page, name):
    return page.locator("[data-testid=token]", has=page.locator("[data-testid=token-name]", has_text=name))


def code_of(page, name, which="code"):
    return card(page, name).locator(f"[data-testid={which}]").get_attribute("data-code")


def set_time(page, value="2030-01-02T03:04:05"):
    if not page.locator("[data-testid=clock-datetime]").is_visible():
        page.click("[data-testid=clock-settings]")
    page.fill("[data-testid=clock-datetime]", value)
    page.click("[data-testid=clock-datetime-set]")
    expect(page.locator("[data-testid=clock-status]")).to_have_text("Stopped")


def save_download(page, tmp_path, name):
    with page.expect_download() as download:
        page.click("[data-testid=save]")
    path = tmp_path / name
    download.value.save_as(path)
    return path


def test_codes_and_clock(app_page, tmp_path):
    page = app_page("authenticator", init_script=NO_PICKERS, **UTC)
    assert page.title() == "Authenticator"
    db = make_db(tmp_path / "otp.kdbx")
    choose(page, "[data-testid=choose-db]", db)
    page.fill("[data-testid=password]", "wrong")
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=error]")).to_be_visible(timeout=30000)
    page.fill("[data-testid=password]", "secret")
    page.click("[data-testid=unlock]")
    expect(page.locator("[data-testid=workspace]")).to_be_visible(timeout=30000)

    # the entries with OTP data, sorted; the invalid one shows its error; the entry without OTP is not listed
    expect(page.locator("[data-testid=token-name]")).to_have_text(["Broken", "Counter", "Mail", "Native", "Steam"])
    expect(card(page, "Broken").locator("[data-testid=token-error]")).to_contain_text("invalid secret")
    expect(card(page, "Mail").locator("[data-testid=token-account]")).to_have_text("anna@example.org")

    set_time(page)
    step = AT // 30
    expect(card(page, "Mail").locator("[data-testid=code]")).to_have_attribute("data-code", hotp(S1, step))
    assert code_of(page, "Mail", "code-prev") == hotp(S1, step - 1)
    assert code_of(page, "Mail", "code-next") == hotp(S1, step + 1)
    assert card(page, "Mail").locator("[data-testid=code]").inner_text() == hotp(S1, step)[:3] + " " + hotp(S1, step)[3:]
    expect(card(page, "Mail").locator("[data-testid=remaining]")).to_have_text(f"{30 - AT % 30} s")
    assert code_of(page, "Native") == hotp(S2, step, 8, hashlib.sha256)
    assert code_of(page, "Steam") == steam(S4, step)
    assert code_of(page, "Counter") == hotp(S3, 5)

    # stopped: the codes do not change; −30 s shows the previous code
    page.wait_for_timeout(1200)
    assert code_of(page, "Mail") == hotp(S1, step)
    page.click("[data-testid=clock-back]")
    expect(card(page, "Mail").locator("[data-testid=code]")).to_have_attribute("data-code", hotp(S1, step - 1))
    page.click("[data-testid=clock-forward]")
    page.click("[data-testid=clock-forward]")
    expect(card(page, "Mail").locator("[data-testid=code]")).to_have_attribute("data-code", hotp(S1, step + 1))

    # an offset to the local clock; ▶ runs on; ↺ goes back to the local clock
    page.click("[data-testid=clock-reset]")
    expect(page.locator("[data-testid=clock-status]")).to_have_text("Local clock")
    page.fill("[data-testid=clock-offset]", "-3600")
    page.click("[data-testid=clock-offset-apply]")
    expect(page.locator("[data-testid=clock-status]")).to_have_text("Offset −1 h")
    expect(page.locator("[data-testid=clock]")).to_have_class("au-clock adjusted")
    page.click("[data-testid=clock-toggle]")
    expect(page.locator("[data-testid=clock-status]")).to_have_text("Stopped")
    page.click("[data-testid=clock-toggle]")
    expect(page.locator("[data-testid=clock-status]")).to_contain_text("Offset −")
    page.click("[data-testid=clock-reset]")
    expect(page.locator("[data-testid=clock-reset]")).to_be_disabled()

    # search
    page.fill("[data-testid=search]", "games")
    expect(page.locator("[data-testid=token-name]")).to_have_text(["Steam"])
    page.fill("[data-testid=search]", "xyz")
    expect(page.locator("[data-testid=token]")).to_have_count(0)
    page.fill("[data-testid=search]", "")

    # copying a code
    if page.context.browser.browser_type.name == "chromium":
        page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    card(page, "Counter").locator("[data-testid=code]").click()
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Code copied")
    assert not page.errors, page.errors


def test_add_edit_counter_delete_save(app_page, tmp_path):
    page = app_page("authenticator", init_script=NO_PICKERS, **UTC)
    unlock(page, make_db(tmp_path / "otp.kdbx"))
    set_time(page)
    step = AT // 30

    # add from a link: the fields are filled in and the code is previewed
    page.click("[data-testid=add]")
    page.fill("[data-testid=edit-uri]", f"otpauth://totp/Git:bob%40example.org?secret={S2}&issuer=Git&digits=8&algorithm=SHA512")
    expect(page.locator("[data-testid=edit-issuer]")).to_have_value("Git")
    expect(page.locator("[data-testid=edit-account]")).to_have_value("bob@example.org")
    expect(page.locator("[data-testid=edit-name]")).to_have_value("Git")
    code = hotp(S2, step, 8, hashlib.sha512)
    expect(page.locator("[data-testid=edit-preview]")).to_have_text(code[:4] + " " + code[4:])
    page.click("[data-testid=edit-dialog] summary")  # (advanced settings)
    expect(page.locator("[data-testid=edit-algorithm]")).to_have_value("SHA512")
    page.locator("[data-testid=group]").select_option(label="Games")
    page.click("[data-testid=edit-save]")
    expect(card(page, "Git").locator("[data-testid=code]")).to_have_attribute("data-code", code)
    expect(card(page, "Git")).to_contain_text("Games")

    # an invalid secret is refused
    page.click("[data-testid=add]")
    page.fill("[data-testid=edit-name]", "Bad")
    page.fill("[data-testid=edit-secret]", "189")
    page.click("[data-testid=edit-save]")
    expect(page.locator("[data-testid=edit-error]")).to_contain_text("secret")
    page.keyboard.press("Escape")
    expect(page.locator("[data-testid=edit-dialog]")).to_have_count(0)

    # edit: rename (the old version goes to the history)
    card(page, "Mail").locator("[data-testid=edit]").click()
    page.fill("[data-testid=edit-name]", "Mailbox")
    page.click("[data-testid=edit-save]")
    expect(card(page, "Mailbox")).to_have_count(1)

    # HOTP: the next code
    card(page, "Counter").locator("[data-testid=next-counter]").click()
    expect(card(page, "Counter").locator("[data-testid=code]")).to_have_attribute("data-code", hotp(S3, 6))

    # delete: Mail has a password → only the token is removed; Steam has nothing else → the entry is deleted
    card(page, "Mailbox").locator("[data-testid=delete]").click()
    expect(page.locator("[data-testid=delete-dialog]")).to_contain_text("lock yourself out")
    page.click("[data-testid=delete-token]")
    card(page, "Steam").locator("[data-testid=delete]").click()
    expect(page.locator("[data-testid=delete-token]")).to_have_count(0)
    page.click("[data-testid=delete-confirm]")
    expect(page.locator("[data-testid=token-name]")).to_have_text(["Broken", "Counter", "Git", "Native"])

    saved = save_download(page, tmp_path, "saved.kdbx")
    kp = PyKeePass(str(saved), password="secret")
    git = kp.find_entries(title="Git", first=True)
    assert git.group.name == "Games" and git.username == "bob@example.org"
    assert "secret=" + S2 in git.otp and "algorithm=SHA512" in git.otp and "digits=8" in git.otp
    assert kp.find_entries(title="Counter", first=True).get_custom_property("HmacOtp-Counter") == "6"
    mailbox = kp.find_entries(title="Mailbox", first=True)
    assert mailbox.password == "pw-mail" and not mailbox.otp
    assert any(h.title == "Mail" for h in mailbox.history)
    steam_entries = [e for e in kp.find_entries(title="Steam") if e.group.name != "Recycle Bin"]
    assert not steam_entries
    expect(page.locator("[data-testid=save]")).to_have_class("secondary")
    assert not page.errors, page.errors


def test_import_and_export(app_page, tmp_path):
    page = app_page("authenticator", init_script=NO_PICKERS, **UTC)
    unlock(page, make_db(tmp_path / "otp.kdbx"))
    page.click("[data-testid=import]")
    links = "\n".join([
        f"otpauth://totp/Mail:anna%40example.org?secret={S1}&issuer=Mail",  # already there
        f"otpauth://totp/Forum:anna?secret={S5}&issuer=Forum",
        "not a link",
        migration_uri([(S3, "carol", "Cloud"), ("JBSWY3DPEB3W64TMMQ", "dave", "Docs")]),
    ])
    page.fill("[data-testid=import-text]", links)
    expect(page.locator("[data-testid=import-errors]")).to_contain_text("Line 3")
    aegis = tmp_path / "aegis.json"
    aegis.write_text(json.dumps({"version": 1, "db": {"version": 2, "entries": [
        {"type": "totp", "name": "erin", "issuer": "Exchange", "info": {"secret": "ONSWG4TFOQYTEMZU", "algo": "SHA1", "digits": 6, "period": 30}},
        {"type": "totp", "name": "anna", "issuer": "Forum", "info": {"secret": S5, "algo": "SHA1", "digits": 6, "period": 30}},  # twice in the import
    ]}}))
    choose(page, "[data-testid=import-file]", aegis)
    picture = tmp_path / "qr.png"
    segno.make_qr(f"otpauth://totp/Photo:frank?secret={S4}&issuer=Photo", error="m").save(str(picture), scale=6, border=4)
    choose(page, "[data-testid=import-image]", picture)
    rows = page.locator("[data-testid=import-candidates] tr")
    expect(rows).to_have_count(6)  # Mail, Forum, Cloud, Docs, Exchange, Photo
    expect(rows.filter(has_text="Mail")).to_contain_text("already there")
    expect(rows.filter(has_text="Mail").locator("[data-testid=import-check]")).not_to_be_checked()
    expect(page.locator("[data-testid=import-submit]")).to_have_text("Import 5 tokens")
    page.locator("[data-testid=import-dialog] [data-testid=group]").select_option(label="Games")
    page.click("[data-testid=import-submit]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("5 tokens imported")
    expect(page.locator("[data-testid=token]")).to_have_count(10)
    expect(card(page, "Photo")).to_contain_text("Games")

    # pasting an otpauth:// link anywhere opens the import with it
    page.locator("[data-testid=clock-time]").click()
    page.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'otpauth://totp/Paste:x?secret=JBSWY3DPEHPK3PXP');
      const e = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(e, 'clipboardData', { value: dt });
      document.dispatchEvent(e); }""")
    expect(page.locator("[data-testid=import-dialog]")).to_be_visible()
    expect(page.locator("[data-testid=import-candidates] tr")).to_have_count(1)
    page.keyboard.press("Escape")

    # a token as QR code and link
    card(page, "Forum").locator("[data-testid=share]").click()
    expect(page.locator("[data-testid=qr]")).to_have_count(0)
    page.click("[data-testid=share-reveal]")
    expect(page.locator("[data-testid=share-dialog] [data-testid=qr] svg")).to_have_count(1)
    expect(page.locator("[data-testid=share-uri]")).to_have_value(f"otpauth://totp/Forum:anna?secret={S5}&issuer=Forum&period=30&digits=6&algorithm=SHA1")
    page.keyboard.press("Escape")

    # export all: text file and QR codes (the broken token is left out)
    page.click("[data-testid=export-all]")
    expect(page.locator("[data-testid=export-dialog]")).to_contain_text("9 tokens are exported")
    with page.expect_download() as download:
        page.click("[data-testid=export-text]")
    lines = open(download.value.path(), encoding="utf-8").read().split()
    assert len(lines) == 9 and all(line.startswith("otpauth://") for line in lines)
    assert any(f"secret={S4}" in line and "issuer=Photo" in line for line in lines)
    page.click("[data-testid=export-qr]")
    expect(page.locator("[data-testid=export-dialog] [data-testid=qr]")).to_have_count(9)
    page.keyboard.press("Escape")

    saved = save_download(page, tmp_path, "saved.kdbx")
    kp = PyKeePass(str(saved), password="secret")
    docs = kp.find_entries(title="Docs", first=True)
    assert docs.group.name == "Games" and docs.username == "dave" and "secret=JBSWY3DPEB3W64TMMQ" in docs.otp
    assert len([e for e in kp.find_entries(title="Forum")]) == 1
    assert not page.errors, page.errors


def test_new_database_and_lock(app_page, tmp_path):
    page = app_page("authenticator", init_script=NO_PICKERS)
    page.click("[data-testid=create]")
    page.fill("[data-testid=create-name]", "My codes")
    page.fill("[data-testid=create-password]", "a long passphrase")
    page.fill("[data-testid=create-repeat]", "a different one")
    page.click("[data-testid=create-submit]")
    expect(page.locator("[data-testid=error]")).to_contain_text("do not match")
    page.fill("[data-testid=create-repeat]", "a long passphrase")
    page.click("[data-testid=create-submit]")
    expect(page.locator("[data-testid=empty]")).to_be_visible(timeout=30000)
    page.click("[data-testid=add]")
    page.fill("[data-testid=edit-issuer]", "Example")
    expect(page.locator("[data-testid=edit-name]")).to_have_value("Example")
    page.click("[data-testid=edit-random]")
    expect(page.locator("[data-testid=edit-secret]")).to_have_value(re.compile(r"^[A-Z2-7]{32}$"))
    secret = page.input_value("[data-testid=edit-secret]")
    assert len(secret) == 32
    page.click("[data-testid=edit-save]")
    expect(page.locator("[data-testid=token]")).to_have_count(1)

    # unsaved: locking asks first
    page.click("[data-testid=lock]")
    page.click("[data-testid=confirm-cancel]")
    expect(page.locator("[data-testid=workspace]")).to_be_visible()
    saved = save_download(page, tmp_path, "My codes.kdbx")
    kp = PyKeePass(str(saved), password="a long passphrase")
    assert kp.find_entries(title="Example", first=True).otp.startswith("otpauth://totp/Example")

    # auto-lock after 10 minutes without activity
    page.clock.install()
    page.locator("[data-testid=search]").click()  # restarts the (now fake) inactivity timer
    page.clock.fast_forward("11:00")
    expect(page.locator("[data-testid=unlock-form]")).to_be_visible()
    expect(page.locator("[data-testid=toast]").last).to_contain_text("locked after 10 minutes")


def test_german_and_phone(app_page, tmp_path):
    page = app_page("authenticator", mobile=True, init_script=NO_PICKERS + "localStorage.setItem('suite.lang', 'de');", **UTC)
    expect(page.locator("[data-testid=unlock]")).to_have_text("Entsperren")
    unlock(page, make_db(tmp_path / "otp.kdbx"))
    expect(page.locator("[data-testid=add]")).to_contain_text("Hinzufügen")
    expect(page.locator("[data-testid=clock-status]")).to_have_text("Lokale Uhr")
    # one column of cards, no horizontal scrolling
    boxes = [page.locator("[data-testid=token]").nth(i).bounding_box() for i in range(2)]
    assert boxes[1]["y"] > boxes[0]["y"] and abs(boxes[1]["x"] - boxes[0]["x"]) < 2
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    card(page, "Mail").locator("[data-testid=edit]").click()
    expect(page.locator("[data-testid=edit-dialog]")).to_contain_text("Token bearbeiten")
    page.keyboard.press("Escape")
    assert not page.errors, page.errors
