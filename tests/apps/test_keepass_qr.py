"""KeePass editor: QR codes – an otpauth:// or Google Authenticator export QR code read from a picture into an entry, and an
entry's secret shown as a QR code (decoded again with zxing-cpp)."""
import base64
import io

import segno
import zxingcpp
from PIL import Image
from playwright.sync_api import expect
from pykeepass import PyKeePass

from test_keepass import NO_PICKERS, TOTP_SECRET, open_entry, sample_db, save_download, unlock  # noqa: F401 (fixture)
from test_keepass_otp import SECRET2, code, near


def varint(n):
    out = b""
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def field(num, value):
    if isinstance(value, int):
        return varint(num << 3) + varint(value)
    return varint(num << 3 | 2) + varint(len(value)) + value


def migration_uri(accounts):
    """otpauth-migration://offline?data=… as Google Authenticator writes it (protobuf)."""
    payload = b""
    for secret, name, issuer in accounts:
        raw = base64.b32decode(secret + "=" * (-len(secret) % 8))
        p = field(1, raw) + field(2, name.encode()) + field(3, issuer.encode()) + field(4, 1) + field(5, 1) + field(6, 2)
        payload += field(1, p)
    payload += field(2, 1) + field(3, 1) + field(4, 0)
    from urllib.parse import quote
    return "otpauth-migration://offline?data=" + quote(base64.b64encode(payload).decode())


def qr_png(path, text):
    segno.make_qr(text, error="m").save(str(path), scale=6, border=4)
    return path


def scan_picture(page, path):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=qr-image]")
    chooser.value.set_files(str(path))


def test_scan_from_picture(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Web", "Mail")
    page.click("[data-testid=otp-setup]")
    # not a one-time password
    scan_picture(page, qr_png(tmp_path / "url.png", "https://example.org"))
    expect(page.locator("[data-testid=otp-error]")).to_contain_text("not a one-time password")
    # an otpauth:// code fills the dialog
    scan_picture(page, qr_png(tmp_path / "otp.png", f"otpauth://totp/Example:anna?secret={SECRET2}&issuer=Example&digits=8"))
    expect(page.locator("[data-testid=otp-secret]")).to_have_value(SECRET2)
    expect(page.locator("[data-testid=otp-issuer]")).to_have_value("Example")
    expect(page.locator("[data-testid=otp-digits]")).to_have_value("8")
    page.click("[data-testid=otp-save]")
    assert code(page) in near(SECRET2, digits=8)
    # a Google Authenticator export with three accounts: the first into this entry, the others as new entries
    open_entry(page, "Web", "Forum")
    page.click("[data-testid=otp-setup]")
    uri = migration_uri([(TOTP_SECRET, "anna", "Forum"), (SECRET2, "bob@example.org", "Git"), ("JBSWY3DPEB3W64TMMQ======".rstrip("="), "carol", "Cloud")])
    scan_picture(page, qr_png(tmp_path / "migration.png", uri))
    expect(page.locator("[data-testid=otp-secret]")).to_have_value(TOTP_SECRET)
    expect(page.locator("[data-testid=qr-more]")).to_contain_text("2 more accounts")
    page.click("[data-testid=qr-more-add]")
    expect(page.locator("[data-testid=qr-more]")).to_have_count(0)
    page.click("[data-testid=otp-save]")
    assert code(page) in near(TOTP_SECRET)
    expect(page.locator("[data-testid=entry]", has_text="Git")).to_be_visible()
    kp = PyKeePass(str(save_download(page, tmp_path)), password="secret")
    git = kp.find_entries(title="Git", first=True)
    assert git.group.name == "Web" and git.username == "bob@example.org" and f"secret={SECRET2}" in git.otp
    assert kp.find_entries(title="Cloud", first=True).otp.startswith("otpauth://totp/Cloud:carol?")
    assert f"secret={TOTP_SECRET}" in kp.find_entries(title="Forum", first=True).otp
    assert page.errors == []


def test_show_qr_code(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    open_entry(page, "Banking", "Bank")
    page.click("[data-testid=otp-qr]")
    dialog = page.locator("[data-testid=qr-dialog]")
    expect(dialog).to_contain_text("Whoever sees")
    expect(page.locator("[data-testid=qr-code]")).to_have_count(0)  # only after asking for it
    page.click("[data-testid=qr-reveal]")
    expect(page.locator("[data-testid=qr-secret]")).to_have_text("JBSW Y3DP EHPK 3PXP")
    shot = Image.open(io.BytesIO(page.locator("[data-testid=qr-code]").screenshot()))
    results = zxingcpp.read_barcodes(shot)
    assert results and results[0].text.startswith("otpauth://totp/Bank:anna?") and f"secret={TOTP_SECRET}" in results[0].text
    page.click("[data-testid=qr-close]")
    expect(dialog).to_have_count(0)
    assert page.errors == []
