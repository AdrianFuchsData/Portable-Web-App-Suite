"""S-4: SSH and SFTP from a file:// page with the WebAssembly engine (engines/ssh) through the relay."""
import base64
import os

import pytest

from helpers.paths import dist_url


def open_page(page, relay, sshd):
    page.goto(dist_url("s4-ssh"))
    page.wait_for_selector("body[data-ready]")
    return {"relay": {"url": relay["url"], "token": relay["token"]},
            "host": "localhost", "port": sshd["port"], "user": sshd["user"]}


CONNECT = """async ([cfg, extra]) => {
  window.hostKeys = [];
  const relay = Suite.relay.config(cfg.relay.url, cfg.relay.token);
  window.client = await Suite.ssh.connect(relay, { host: cfg.host, port: cfg.port, user: cfg.user, ...extra,
    hostKey: (info) => { hostKeys.push(info); return extra.accept !== false; } });
  return { serverVersion: client.serverVersion, hostKeys };
}"""


def connect(page, cfg, **extra):
    return page.evaluate(CONNECT, [cfg, extra])


def test_exec_and_host_key(page, relay, sshd):
    cfg = open_page(page, relay, sshd)
    info = connect(page, cfg, privateKey=sshd["key"])
    assert info["serverVersion"].startswith("SSH-2.0-OpenSSH")
    assert info["hostKeys"][0]["type"] == "ssh-ed25519"
    assert info["hostKeys"][0]["fingerprint"] == sshd["fingerprint"]
    result = page.evaluate("""async () => {
      const r = await client.exec('echo hello; echo oops >&2; exit 3');
      const d = new TextDecoder();
      return { stdout: d.decode(r.stdout), stderr: d.decode(r.stderr), code: r.code };
    }""")
    assert result == {"stdout": "hello\n", "stderr": "oops\n", "code": 3}
    assert page.errors == []


@pytest.mark.parametrize("key", ["protected_key", "rsa_key"])
def test_other_key_types(page, relay, sshd, key):
    cfg = open_page(page, relay, sshd)
    extra = {"privateKey": sshd[key]}
    if key == "protected_key":
        extra["passphrase"] = "secret phrase"
    connect(page, cfg, **extra)
    out = page.evaluate("async () => new TextDecoder().decode((await client.exec('whoami')).stdout)")
    assert out.strip() == sshd["user"]


def test_host_key_rejected(page, relay, sshd):
    cfg = open_page(page, relay, sshd)
    with pytest.raises(Exception, match="host key rejected"):
        connect(page, cfg, privateKey=sshd["key"], accept=False)


def test_authentication_failure(page, relay, sshd):
    cfg = open_page(page, relay, sshd)
    with pytest.raises(Exception, match="unable to authenticate"):
        connect(page, cfg, password="wrong")


def test_interactive_shell(page, relay, sshd):
    cfg = open_page(page, relay, sshd)
    connect(page, cfg, privateKey=sshd["key"])
    output = page.evaluate("""async () => {
      let text = '';
      const dec = new TextDecoder();
      const shell = await client.shell({ cols: 100, rows: 30, onData: (b) => { text += dec.decode(b); } });
      shell.write('echo result=$((6*7)) cols=$(tput cols)\\n');
      for (let i = 0; i < 100 && !/result=42 cols=100/.test(text); i++) await new Promise((r) => setTimeout(r, 50));
      shell.write('exit\\n');
      return text;
    }""")
    assert "result=42 cols=100" in output


def test_sftp(page, relay, sshd):
    cfg = open_page(page, relay, sshd)
    connect(page, cfg, privateKey=sshd["key"])
    data = os.urandom(2 * 1024 * 1024)
    result = page.evaluate("""async ([dir, b64]) => {
      const sftp = await client.sftp();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await sftp.mkdir(dir + '/sub');
      await sftp.writeFile(dir + '/sub/data.bin', bytes);
      const listed = (await sftp.list(dir + '/sub')).map((e) => [e.name, e.size, e.isDir]);
      const back = await sftp.readFile(dir + '/sub/data.bin');
      await sftp.rename(dir + '/sub/data.bin', dir + '/sub/moved.bin');
      const stat = await sftp.stat(dir + '/sub/moved.bin');
      await sftp.remove(dir + '/sub/moved.bin');
      await sftp.rmdir(dir + '/sub');
      const after = (await sftp.list(dir)).length;
      let s = ''; for (let i = 0; i < back.length; i += 0x8000) s += String.fromCharCode.apply(null, back.subarray(i, i + 0x8000));
      return { listed, same: btoa(s) === b64, size: stat.size, after };
    }""", [sshd["files"], base64.b64encode(data).decode()])
    assert result == {"listed": [["data.bin", len(data), False]], "same": True, "size": len(data), "after": 0}


def test_ui(page, relay, sshd):
    """The prototype UI: log in with a key, accept the host key, see the shell and the file list."""
    open_page(page, relay, sshd)
    page.on("dialog", lambda d: d.accept())
    page.fill("#relay-url", relay["url"])
    page.fill("#relay-token", relay["token"])
    page.fill("#port", str(sshd["port"]))
    page.fill("#user", sshd["user"])
    page.fill("#key", sshd["key"])
    page.click("#login button")
    page.wait_for_selector("#status:has-text('connected')", timeout=30000)
    page.wait_for_selector("#files li:has-text('..')")
    page.click("#terminal")
    page.keyboard.type("echo ui-$((40+2))\n")
    page.wait_for_selector(".xterm-rows:has-text('ui-42')", timeout=10000)
