"""KeePass editor: CSV export (with a warning) and import (headers of other password managers recognised)."""
import csv
import io

from playwright.sync_api import expect
from pykeepass import PyKeePass

from test_keepass import NO_PICKERS, TOTP_SECRET, choose, sample_db, save_download, unlock  # noqa: F401 (fixture)

BITWARDEN = ('folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n'
             'Social,,login,Mastodon,"Line 1\nLine 2",,0,https://mastodon.example,anna,"pw,with ""quotes""",JBSWY3DPEHPK3PXP\n'
             ',,login,,,,0,https://shop.example/login,bob,pw-shop,\n')

FIREFOX = ('"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n'
           '"https://www.wiki.example","carol","pw-wiki",,"https://www.wiki.example","{abc}","1700000000000","1700000000000","1700000000000"\n')


def export_csv(page, tmp_path, scope="all"):
    page.select_option("[data-testid=csv-menu]", "export")
    dialog = page.locator("[data-testid=csv-export-dialog]")
    expect(dialog.locator("[data-testid=csv-warning]")).to_contain_text("NOT encrypted")
    if scope == "group":
        page.click("[data-testid=csv-scope-group]")
    with page.expect_download() as d:
        page.click("[data-testid=csv-export-ok]")
    path = tmp_path / d.value.suggested_filename
    d.value.save_as(path)
    return path, list(csv.reader(io.StringIO(path.read_text(encoding="utf-8"), newline="")))


def import_csv(page, tmp_path, name, text, group=None):
    f = tmp_path / name
    f.write_text(text, encoding="utf-8")
    with page.expect_file_chooser() as chooser:
        page.locator("[data-testid=csv-menu]").select_option("import")
    chooser.value.set_files(str(f))
    dialog = page.locator("[data-testid=csv-import-dialog]")
    expect(dialog).to_be_visible()
    if group:
        page.fill("[data-testid=csv-group]", group)
    return dialog


def test_csv_export(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    path, rows = export_csv(page, tmp_path)
    assert path.name == "sample.csv"
    assert rows[0] == ["Group", "Title", "Username", "Password", "URL", "Notes", "TOTP", "Tags", "Last Modified", "Created"]
    by_title = {r[1]: r for r in rows[1:]}
    assert set(by_title) == {"Bank", "Mail", "Forum"}
    assert by_title["Bank"][:6] == ["Root/Banking", "Bank", "anna", "pw-bank", "https://bank.example", "Account"]
    assert TOTP_SECRET in by_title["Bank"][6] and by_title["Forum"][7] == "social"
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Delete the CSV file")
    # only one group
    page.locator("[data-testid=group]", has_text="Web").click()
    _, rows = export_csv(page, tmp_path, scope="group")
    assert sorted(r[1] for r in rows[1:]) == ["Forum", "Mail"]
    assert page.errors == []


def test_csv_import(app_page, sample_db, tmp_path):
    page = app_page("keepass", init_script=NO_PICKERS)
    unlock(page, sample_db)
    dialog = import_csv(page, tmp_path, "bitwarden.csv", BITWARDEN, group="From Bitwarden")
    expect(page.locator("[data-testid=csv-count]")).to_contain_text("2 entries")
    columns = dialog.locator("[data-testid=csv-columns]")
    expect(columns).to_contain_text("login_password")
    expect(columns.locator("tr", has_text="login_username")).to_contain_text("User name")
    expect(columns.locator("tr", has_text="favorite")).to_contain_text("ignored")
    expect(columns.locator("tr", has_text="fields")).to_contain_text("additional field")
    page.click("[data-testid=csv-import-ok]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("2 entries were imported")
    dialog = import_csv(page, tmp_path, "firefox.csv", FIREFOX, group="From Firefox")
    page.click("[data-testid=csv-import-ok]")
    # a KeePassXC-style export comes back with its groups (the root prefix dropped)
    _, rows = export_csv(page, tmp_path)
    page.evaluate("KP.app.state.csv = null")
    text = io.StringIO()
    csv.writer(text).writerows(rows)
    import_csv(page, tmp_path, "roundtrip.csv", text.getvalue(), group="Again")
    page.click("[data-testid=csv-import-ok]")
    saved = save_download(page, tmp_path)
    kp = PyKeePass(str(saved), password="secret")
    mastodon = kp.find_entries(title="Mastodon", first=True)
    assert mastodon.group.path == ["From Bitwarden", "Social"] and mastodon.username == "anna"
    assert mastodon.password == 'pw,with "quotes"' and mastodon.notes == "Line 1\nLine 2" and mastodon.url == "https://mastodon.example"
    assert mastodon.otp.startswith("otpauth://totp/") and f"secret={TOTP_SECRET}" in mastodon.otp
    shop = kp.find_entries(username="bob", first=True)
    assert shop.title == "shop.example" and shop.group.path == ["From Bitwarden"]
    wiki = kp.find_entries(username="carol", first=True)
    assert wiki.title == "wiki.example" and wiki.password == "pw-wiki" and not wiki.custom_properties
    bank = [e for e in kp.find_entries(title="Bank") if e.group.path[0] == "Again"][0]
    assert bank.group.path == ["Again", "Banking"] and bank.password == "pw-bank" and TOTP_SECRET in bank.otp
    again_mastodon = [e for e in kp.find_entries(title="Mastodon") if e.group.path[0] == "Again"][0]
    assert again_mastodon.group.path == ["Again", "From Bitwarden", "Social"]
    forum = [e for e in kp.find_entries(title="Forum") if e.group.path[0] == "Again"][0]
    assert forum.tags == ["social"]
    assert page.errors == []
