"""shared/js/kdbx.js: open/create KeePass databases, groups, entries, attachments; interoperability with pykeepass."""
import base64

import pytest
from pykeepass import PyKeePass, create_database

from helpers.paths import dist_url


def b64(path):
    return base64.b64encode(path.read_bytes()).decode()


def open_testbed(page):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    page.evaluate("Suite.i18n.setLanguage('en')")


def to_bytes(page, expression):
    return bytes(page.evaluate(f"async () => Array.from(await ({expression}))"))


@pytest.fixture
def sample_db(tmp_path):
    path = tmp_path / "sample.kdbx"
    kp = create_database(str(path), password="geheim")
    group = kp.add_group(kp.root_group, "Server")
    entry = kp.add_entry(group, "Router", "admin", "pw-äöü", url="https://192.168.1.1", notes="Notiz")
    entry.set_custom_property("Port", "22")
    kp.save()
    return path


def test_open_database_from_pykeepass(page, sample_db):
    open_testbed(page)
    result = page.evaluate("""async (data) => {
      const db = await Suite.kdbx.open(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { password: 'geheim' });
      const group = db.group('Server');
      const [entry] = db.entries(group);
      return { version: db.version, path: db.groupPath(group), fields: db.fields(entry) };
    }""", b64(sample_db))
    assert result["version"].startswith("4.")
    assert result["path"] == "Server"
    f = result["fields"]
    assert (f["Title"], f["UserName"], f["Password"], f["URL"], f["Notes"], f["Port"]) == ("Router", "admin", "pw-äöü", "https://192.168.1.1", "Notiz", "22")


def test_wrong_password(page, sample_db):
    open_testbed(page)
    message = page.evaluate("""async (data) => {
      try { await Suite.kdbx.open(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), { password: 'falsch' }); return null; }
      catch (e) { return e.localized(); }
    }""", b64(sample_db))
    assert message == "Wrong password or key file."
    assert page.evaluate("Suite.kdbx.open(new Uint8Array([1, 2, 3, 4, 5]), { password: 'x' }).catch((e) => e.localized())") == \
        "This is not a KeePass database (.kdbx)."


def test_create_and_read_with_pykeepass(page, tmp_path):
    open_testbed(page)
    data = to_bytes(page, """(async () => {
      const { db } = await Suite.kdbx.create({ name: 'Suite', password: 'neu' });
      const group = db.group('Portable Web App Suite/Text editor', { create: true });
      const entry = db.addEntry(group, { Title: 'SFTP', UserName: 'bob', Password: 's3cret', URL: 'sftp://host' }, { protect: [] });
      db.setFields(entry, { Token: 'abc' }, { protect: ['Token'] });
      await db.setAttachment(entry, 'settings.json', JSON.stringify({ fontSize: 14 }));
      const again = db.group('Portable Web App Suite/Text editor');    // found, not created twice
      if (again !== group) throw new Error('group created twice');
      return db.save();
    })()""")
    path = tmp_path / "created.kdbx"
    path.write_bytes(data)
    kp = PyKeePass(str(path), password="neu")
    entry = kp.find_entries(title="SFTP", first=True)
    assert entry.group.path == ["Portable Web App Suite", "Text editor"]
    assert (entry.username, entry.password, entry.url, entry.get_custom_property("Token")) == ("bob", "s3cret", "sftp://host", "abc")
    assert entry.attachments[0].filename == "settings.json" and entry.attachments[0].data == b'{"fontSize":14}'
    assert kp.kdf_algorithm == "argon2id"


def test_key_file_and_round_trip(page, tmp_path):
    open_testbed(page)
    result = page.evaluate("""async () => {
      const { db, keyFile } = await Suite.kdbx.create({ password: 'pw', withKeyFile: true });
      const entry = db.addEntry(db.root, { Title: 'A', Password: '1' });
      await db.setAttachment(entry, 'bin', new Uint8Array([0, 255, 7]));
      const saved = await db.save();
      const reopened = await Suite.kdbx.open(saved, { password: 'pw', keyFile });
      const e = reopened.entries()[0];
      const withoutKey = await Suite.kdbx.open(saved, { password: 'pw' }).then(() => 'opened', (err) => err.key);
      reopened.deleteEntry(e);
      return [Array.from(reopened.attachment(e, 'bin')), withoutKey, reopened.entries().length, Suite.kdbx.isKdbx(saved)];
    }""")
    assert result == [[0, 255, 7], "kdbx.invalidKey", 0, True]  # deleted entries go to the recycle bin
    assert page.errors == [] and page.requests == []
