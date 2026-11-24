"""KeePass editor: one-time passwords – set up (link or fields), TOTP/HOTP/Steam codes, KeePass 2 TimeOtp-/HmacOtp- fields."""
import base64
import hashlib
import hmac
import struct
import time

from playwright.sync_api import expect
from pykeepass import PyKeePass, create_database

from test_keepass import NO_PICKERS, TOTP_SECRET, open_entry, save_download, unlock

SECRET2 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def hotp(secret, counter, digits=6, algorithm=hashlib.sha1):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), algorithm).digest()
    offset = digest[-1] & 15
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 10 ** digits
    return str(value).zfill(digits)


def near(secret, period=30, digits=6, algorithm=hashlib.sha1):
    now = time.time()
    return {hotp(secret, int(now + d) // period, digits, algorithm) for d in (-period, 0, period)}


def code(page):
    return page.text_content("[data-testid=otp-code]").replace(" ", "")


def make_db(path):
    kp = create_database(str(path), password="secret")
    g = kp.add_group(kp.root_group, "Web")
    kp.add_entry(g, "Mail", "anna@example.org", "pw-mail")
    kp.add_entry(g, "Forum", "anna", "pw-forum")
    native = kp.add_entry(g, "Native", "anna", "pw-native")  # KeePass 2.47+ fields only
    native.set_custom_property("TimeOtp-Secret-Base32", TOTP_SECRET, protect=True)
    native.set_custom_property("TimeOtp-Length", "8")
    native.set_custom_property("TimeOtp-Algorithm", "HMAC-SHA-256")
    broken = kp.add_entry(g, "Broken", "anna", "pw")
    broken.otp = "otpauth://totp/x?secret=1!!"
    kp.save()
    return path


def test_otp_setup_and_codes(app_page, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, make_db(tmp_path / "otp.kdbx"))
    # KeePass 2 native fields are read; the OTP fields are not listed as additional fields
    open_entry(page, "Web", "Native")
    assert code(page) in near(TOTP_SECRET, digits=8, algorithm=hashlib.sha256)
    expect(page.locator("[data-testid=custom-field]")).to_have_count(0)
    open_entry(page, "Web", "Broken")
    expect(page.locator("[data-testid=otp-invalid]")).to_contain_text("invalid secret")
    # set up from a link: the fields are filled in
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=otp-setup]")
    expect(page.locator("[data-testid=otp-issuer]")).to_have_value("Mail")
    expect(page.locator("[data-testid=otp-account]")).to_have_value("anna@example.org")
    page.fill("[data-testid=otp-uri]", f"otpauth://totp/Example:anna?secret={SECRET2}&issuer=Example&algorithm=SHA256&digits=8&period=60")
    page.locator("[data-testid=otp-uri]").dispatch_event("change")
    expect(page.locator("[data-testid=otp-secret]")).to_have_value(SECRET2)
    expect(page.locator("[data-testid=otp-period]")).to_have_value("60")
    expect(page.locator("[data-testid=otp-algorithm]")).to_have_value("SHA256")
    page.click("[data-testid=otp-save]")
    expect(page.locator("[data-testid=otp-dialog]")).to_have_count(0)
    assert code(page) in near(SECRET2, 60, 8, hashlib.sha256)
    # HOTP by hand; a wrong secret is refused
    open_entry(page, "Web", "Forum")
    page.click("[data-testid=otp-setup]")
    page.select_option("[data-testid=otp-type]", "hotp")
    page.fill("[data-testid=otp-secret]", "not base32!")
    page.click("[data-testid=otp-save]")
    expect(page.locator("[data-testid=otp-error]")).to_contain_text("invalid secret")
    page.fill("[data-testid=otp-secret]", TOTP_SECRET)
    page.fill("[data-testid=otp-counter]", "5")
    page.click("[data-testid=otp-save]")
    assert code(page) == hotp(TOTP_SECRET, 5)
    expect(page.locator("[data-testid=otp-remaining]")).to_have_count(0)
    page.click("[data-testid=otp-next]")
    expect(page.locator("[data-testid=otp-code]")).to_have_text(f"{hotp(TOTP_SECRET, 6)[:3]} {hotp(TOTP_SECRET, 6)[3:]}")
    # remove it again from "Native"
    open_entry(page, "Web", "Native")
    page.click("[data-testid=otp-remove]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=otp-setup]")).to_be_visible()
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    mail = kp.find_entries(title="Mail", first=True)
    assert mail.otp.startswith("otpauth://totp/Example:anna?") and f"secret={SECRET2}" in mail.otp and "period=60" in mail.otp
    assert mail.custom_properties["TimeOtp-Secret-Base32"] == SECRET2 and mail.custom_properties["TimeOtp-Algorithm"] == "HMAC-SHA-256"
    assert mail.custom_properties["TimeOtp-Period"] == "60" and mail.custom_properties["TimeOtp-Length"] == "8"
    forum = kp.find_entries(title="Forum", first=True)
    assert forum.otp.startswith("otpauth://hotp/") and "counter=6" in forum.otp
    assert forum.custom_properties["HmacOtp-Secret-Base32"] == TOTP_SECRET and forum.custom_properties["HmacOtp-Counter"] == "6"
    assert len(forum.history) == 1  # one version for the editing session
    native = kp.find_entries(title="Native", first=True)
    assert native.otp is None and not any(k.startswith("TimeOtp") for k in native.custom_properties)
    assert page.errors == []
