"""shared/js/settings.js: application data in JSON files or KeePass databases."""
import base64
import json

from pykeepass import PyKeePass, create_database

from helpers.paths import dist_url

FILL = """async (store) => {
  const app = store.app('sftp');
  app.settings = { theme: 'dark', recent: ['a', 'b'] };
  const id = app.saveConnection({ name: 'Server', url: 'sftp://host', username: 'anna', password: 'pw-ä', port: 22, privateKey: 'KEY' });
  app.saveConnection({ name: 'Zweiter', username: 'bob' });
  store.app('mail').settings = { signature: 'Gruß' };
  return id;
}"""


def open_testbed(page):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    page.evaluate("Suite.i18n.setLanguage('en')")


def test_json_store(page):
    open_testbed(page)
    result = page.evaluate(f"""async () => {{
      const {{ store }} = await Suite.settings.create('json');
      const id = await ({FILL})(store);
      store.app('sftp').saveConnection({{ id, name: 'Server 2', port: 2222 }});   // update
      const bytes = await store.toBytes();
      const reopened = await Suite.settings.open(bytes);
      return {{ text: new TextDecoder().decode(bytes), connections: reopened.app('sftp').connections(), settings: reopened.app('sftp').settings,
                apps: reopened.apps(), needsPassword: Suite.settings.needsPassword(bytes) }};
    }}""")
    data = json.loads(result["text"])
    assert data["format"] == "portable-web-app-suite" and data["version"] == 1
    assert result["apps"] == ["sftp", "mail"]
    assert result["settings"] == {"theme": "dark", "recent": ["a", "b"]}
    assert [c["name"] for c in result["connections"]] == ["Server 2", "Zweiter"]
    assert result["connections"][0]["port"] == 2222 and "password" not in result["connections"][0]  # replaced completely
    assert result["needsPassword"] is False


def test_kdbx_store_readable_by_keepass(page, tmp_path):
    open_testbed(page)
    data = bytes(page.evaluate(f"""async () => {{
      const {{ store }} = await Suite.settings.create('kdbx', {{ password: 'geheim' }});
      await ({FILL})(store);
      return Array.from(await store.toBytes());
    }}"""))
    path = tmp_path / "suite.kdbx"
    path.write_bytes(data)
    kp = PyKeePass(str(path), password="geheim")
    server = kp.find_entries(title="Server", first=True)
    assert server.group.path == ["Portable Web App Suite", "sftp"]
    assert (server.username, server.password, server.url) == ("anna", "pw-ä", "sftp://host")
    assert server.get_custom_property("port") == "22" and server.get_custom_property("privateKey") == 'KEY'
    settings = kp.find_entries(title="Settings", group=kp.find_groups(name="sftp", first=True), first=True)
    assert json.loads(settings.attachments[0].data) == {"theme": "dark", "recent": ["a", "b"]}
    assert kp.find_groups(name="mail", first=True) is not None


def test_existing_keepass_database_is_preserved(page, tmp_path):
    path = tmp_path / "personal.kdbx"
    kp = create_database(str(path), password="pw")
    kp.add_entry(kp.root_group, "Bank", "me", "1234")
    kp.save()
    open_testbed(page)
    result = page.evaluate("""async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (!Suite.settings.needsPassword(bytes)) throw new Error('should need a password');
      const store = await Suite.settings.open(bytes, { password: 'pw' });
      const app = store.app('ssh');
      const id = app.saveConnection({ name: 'Host', username: 'root', password: 'r00t' });
      app.saveConnection({ id, name: 'Host', username: 'admin', password: 'neu' });
      return Array.from(await store.toBytes());
    }""", base64.b64encode(path.read_bytes()).decode())
    out = tmp_path / "out.kdbx"
    out.write_bytes(bytes(result))
    kp = PyKeePass(str(out), password="pw")
    assert kp.find_entries(title="Bank", first=True).password == "1234"  # untouched
    host = kp.find_entries(title="Host", first=True)
    assert (host.username, host.password, len(host.history)) == ("admin", "neu", 1)


def test_bad_file(page):
    open_testbed(page)
    message = page.evaluate("Suite.settings.open(new TextEncoder().encode('{\"x\": 1}')).catch((e) => e.localized())")
    assert message == "This file is neither an application data file (JSON) nor a KeePass database."
    assert page.errors == [] and page.requests == []
