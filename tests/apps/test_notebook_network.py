"""Network functions of the Python notebook through the relay (shared/js/python-net.py, python-ssh.py): the notebook served by
the relay (relay.py --serve, cross-origin isolated) uses sockets (smtplib with STARTTLS), requests and suite.ssh (SSH and SFTP
with the suite's engine); opened as a file, requests still goes through the relay while sockets explain what is missing."""

import pytest
from playwright.sync_api import expect

from helpers import mail_fake
from helpers.paths import DIST, dist_url
from helpers.relay_fixtures import start_relay

pytestmark = pytest.mark.skipif(not (DIST / "notebook.html").exists(), reason="build with vendored Pyodide missing")
TOKEN = "notebook-relay-token"


@pytest.fixture(scope="module")
def served(certs):
    """The python relay serving dist/ (and trusting the test CA for TLS to the test servers)."""
    ca, _, _ = certs
    relay = start_relay("python", token=TOKEN, serve=str(DIST), cafile=str(ca))
    yield relay
    relay["stop"]()


def open_notebook(browser, url, token=TOKEN):
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en');")
    page = context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e) + " " + (e.stack or "")))
    page.goto(url)
    page.wait_for_selector("body[data-kernel=ready]", timeout=120000)
    if token:  # the relay in the Files panel (Network: Relay)
        page.locator("[data-testid=network] summary").click()
        page.fill("[data-testid=relay-token]", token)
        page.locator("[data-testid=relay-token]").press("Tab")
    return page


def run(page, source, timeout=90000):
    page.evaluate("cells => NB.setCells(NB.fromNotebook({ cells }), 'test.ipynb', null)", [{"cell_type": "code", "source": source, "metadata": {}, "outputs": []}])
    page.click("[data-testid=run-all]")
    out = page.locator("[data-testid=cell]").first.locator("[data-testid=outputs]")
    return out


def test_isolated_notebook_network(browser, served, certs, http_target, sshd):
    _, cert, key = certs
    smtp = mail_fake.SmtpFake(cert=str(cert), key=str(key))
    smtp_server = mail_fake.start_smtp(smtp)
    page = open_notebook(browser, f"{served['url']}/notebook.html")
    try:
        expect(page.locator("[data-testid=isolation]")).to_contain_text("Network and interrupt")
        # requests through the relay's /http
        out = run(page, "import requests\n"
                        f"r = requests.get({http_target + '/hello'!r}, headers={{'X-Custom': 'yes'}})\n"
                        "print(r.status_code, r.json()['path'], r.json()['headers']['X-Custom'])")
        expect(out).to_contain_text("200 /hello yes", timeout=90000)
        # smtplib over a socket through the relay, STARTTLS in the relay (it checks the certificate)
        out = run(page, "import smtplib\n"
                        f"with smtplib.SMTP('localhost', {smtp_server.server_address[1]}, timeout=20) as s:\n"
                        "    s.starttls()\n    s.login('anna', 'secret')\n"
                        "    s.sendmail('anna@example.com', ['bernd@example.com'], 'Subject: Hi\\r\\n\\r\\nfrom Python')\n"
                        "print('sent')")
        expect(out).to_contain_text("sent", timeout=60000)
        assert smtp.messages and smtp.messages[-1]["tls"] and b"from Python" in smtp.messages[-1]["data"]
        # SSH and SFTP with suite.ssh (the host key is asked for once)
        page.evaluate("key => NB.kernel.writeFile('/home/pyodide/id_test', new TextEncoder().encode(key))", sshd["key"])
        out = run(page, "from suite.ssh import Connection\n"
                        f"with Connection('127.0.0.1', user={sshd['user']!r}, port={sshd['port']}, connect_kwargs={{'key_filename': '/home/pyodide/id_test'}}) as c:\n"
                        "    r = c.run('echo hello from $0 | tr a-z A-Z', hide=True)\n"
                        "    print(r.ok, r.stdout.strip()[:10])\n"
                        "    sftp = c.sftp()\n"
                        "    with sftp.open('nb-test.txt', 'w') as f:\n        f.write('written by the notebook')\n"
                        "    print('nb-test.txt' in sftp.listdir('.'), sftp.stat('nb-test.txt').st_size)\n"
                        "    c.get('nb-test.txt', 'copy.txt')\n    sftp.remove('nb-test.txt')\n"
                        "print(open('copy.txt').read())\n"
                        "print(c.run('false', warn=True, hide=True).failed)")
        confirm = page.locator("[data-testid=confirm]")
        expect(confirm).to_contain_text(sshd["fingerprint"], timeout=60000)
        page.click("[data-testid=confirm-ok]")
        expect(out).to_contain_text("True HELLO FROM", timeout=60000)
        expect(out).to_contain_text("True 23")
        expect(out).to_contain_text("written by the notebook")
        expect(out.locator("[data-testid=output]").last).to_contain_text("True")
        # a connection that is refused: an OSError in Python
        out = run(page, "import socket\ntry:\n    socket.create_connection(('127.0.0.1', 1), timeout=5)\nexcept OSError as e:\n    print('refused:', e)")
        expect(out).to_contain_text("refused:", timeout=60000)
        assert page.errors == []
    finally:
        page.context.close()
        smtp_server.shutdown()


def test_file_notebook_requests_without_sockets(browser, served, http_target):
    page = open_notebook(browser, dist_url("notebook"))
    try:
        page.fill("[data-testid=relay-url]", served["url"])
        page.locator("[data-testid=relay-url]").press("Tab")
        expect(page.locator("[data-testid=isolation]")).to_contain_text("Opened as a file")
        out = run(page, f"import requests\nprint(requests.get({http_target + '/plain'!r}).status_code)")
        expect(out).to_contain_text("200", timeout=90000)
        out = run(page, "import suite.net, socket\nprint(suite.net.status())\n"
                        "try:\n    suite.net._call('tcp.open', {'host': 'example.org', 'port': 80})\nexcept OSError as e:\n    print('error:', e)")
        expect(out).to_contain_text("'isolated': False, 'relay': True, 'sockets': False", timeout=60000)
        expect(out).to_contain_text("served by the relay")
        assert page.errors == []
    finally:
        page.context.close()
