"""S-3: a page opened via file:// uses the relay client (shared/js/relay.js) in Chromium and Firefox."""
import json

from helpers.paths import dist_url


def open_page(page, relay):
    page.goto(dist_url("s3-relay"))
    page.wait_for_selector("body[data-ready]")
    return {"url": relay["url"], "token": relay["token"]}


def test_info(page, relay):
    cfg = open_page(page, relay)
    info = page.evaluate("cfg => Suite.relay.info(Suite.relay.config(cfg.url, cfg.token))", cfg)
    assert info["relay"] == "portable-web-app-suite"
    assert page.errors == []


TCP_ROUNDTRIP = """async ([cfg, opts, message]) => {
  const c = await Suite.relay.connect(Suite.relay.config(cfg.url, cfg.token), opts);
  c.send(message);
  let text = '';
  while (text.length < message.length) text += new TextDecoder().decode(await c.read());
  c.close();
  return text;
}"""


def test_tcp_echo(page, relay, echo):
    cfg = open_page(page, relay)
    assert page.evaluate(TCP_ROUNDTRIP, [cfg, {"host": "127.0.0.1", "port": echo}, "hello from file://"]) == "hello from file://"


def test_tcp_tls(page, relay, tls_echo):
    cfg = open_page(page, relay)
    assert page.evaluate(TCP_ROUNDTRIP, [cfg, {"host": "localhost", "port": tls_echo, "tls": True}, "secret"]) == "secret"


def test_tcp_starttls(page, relay, starttls_echo):
    cfg = open_page(page, relay)
    result = page.evaluate("""async ([cfg, port]) => {
      const dec = new TextDecoder();
      const c = await Suite.relay.connect(Suite.relay.config(cfg.url, cfg.token), { host: 'localhost', port });
      const lines = [];
      lines.push(dec.decode(await c.read()));
      c.send('STARTTLS\\r\\n');
      lines.push(dec.decode(await c.read()));
      await c.startTls();
      lines.push(dec.decode(await c.read()));
      c.close();
      return lines;
    }""", [cfg, starttls_echo])
    assert result == ["READY\r\n", "OK\r\n", "SECURE\r\n"]


def test_tcp_refused_with_wrong_token(page, relay, echo):
    open_page(page, relay)
    error = page.evaluate("""async ([url, port]) => {
      try { await Suite.relay.connect(Suite.relay.config(url, 'wrong'), { host: '127.0.0.1', port }); return null; }
      catch (e) { return e.message; }
    }""", [relay["url"], echo])
    assert "token" in error


def test_http_proxy(page, relay, http_target):
    cfg = open_page(page, relay)
    result = page.evaluate("""async ([cfg, url]) => {
      const r = await Suite.relay.http(Suite.relay.config(cfg.url, cfg.token),
        { method: 'POST', url, headers: [['Cookie', 'a=1']], body: 'Grüße' });
      return { status: r.status, headers: r.headers, body: new TextDecoder().decode(r.body) };
    }""", [cfg, http_target + "/x"])
    assert result["status"] == 200
    assert ["Set-Cookie", "session=abc; HttpOnly"] in result["headers"]
    echoed = json.loads(result["body"])
    assert echoed["headers"]["Cookie"] == "a=1" and echoed["body"] == "Grüße"


def test_direct_fetch_is_blocked_by_cors(page, relay, http_target):
    """Without the relay, the same request fails (target sends no CORS headers): the reason the relay exists."""
    open_page(page, relay)
    error = page.evaluate("""async (url) => {
      try { await fetch(url); return null; } catch (e) { return e.name; }
    }""", http_target + "/x")
    assert error == "TypeError"


# ---- protocol version 2: password login, remote relay behind a reverse proxy ---------------------------------

def proxied_page(browser, proxied):
    context = browser.new_context(ignore_https_errors=True)  # the test CA is not installed in the browser
    page = context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.goto(dist_url("s3-relay"))
    page.wait_for_selector("body[data-ready]")
    return page


def test_password_login_through_reverse_proxy(browser, proxied_relay, echo, tls_echo, http_target):
    page = proxied_page(browser, proxied_relay)
    cfg = proxied_relay
    info = page.evaluate("cfg => Suite.relay.info(Suite.relay.config(cfg.url))", cfg)
    assert info["auth"] == ["password"] and info["tls"] is True
    roundtrip = TCP_ROUNDTRIP.replace("Suite.relay.config(cfg.url, cfg.token)", "Suite.relay.config(cfg.url, '', { user: cfg.user, password: cfg.password })")
    assert page.evaluate(roundtrip, [cfg, {"host": "127.0.0.1", "port": echo}, "through the proxy"]) == "through the proxy"
    assert page.evaluate(roundtrip, [cfg, {"host": "localhost", "port": tls_echo, "tls": True}, "secret"]) == "secret"
    result = page.evaluate("""async ([cfg, url]) => {
      const relay = Suite.relay.config(cfg.url, '', { user: cfg.user, password: cfg.password });
      const r = await Suite.relay.http(relay, { method: 'GET', url: url + '/hello' });
      await Suite.relay.logout(relay);
      const again = await Suite.relay.http(relay, { method: 'GET', url: url + '/hello' });  // logs in again
      return [r.status, again.status];
    }""", [cfg, http_target])
    assert result == [200, 200]
    error = page.evaluate("""async (cfg) => {
      try { await Suite.relay.connect(Suite.relay.config(cfg.url, '', { user: cfg.user, password: 'wrong' }), { host: '127.0.0.1', port: 1 }); return null; }
      catch (e) { return e.message; }
    }""", cfg)
    assert "invalid user or password" in error
    assert page.errors == []
    page.context.close()


def test_unencrypted_remote_relay_is_refused(page, relay):
    open_page(page, relay)
    error = page.evaluate("""async () => {
      try { await Suite.relay.connect(Suite.relay.config('http://192.0.2.1:8765', 't'), { host: 'x', port: 1 }); return null; }
      catch (e) { return e.message; }
    }""")
    assert "not encrypted" in error
