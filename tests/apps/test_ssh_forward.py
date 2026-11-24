"""SSH client: port forwarding – local (the relay listens on this machine, the SSH server connects on) and remote (the SSH
server listens, connections come back through the relay), saved with the connection."""
import re
import socket

from playwright.sync_api import expect

from test_ssh_client import NO_PICKERS, fill_dialog


def roundtrip(port, payload=b"ping through the tunnel"):
    with socket.create_connection(("127.0.0.1", port), timeout=10) as s:
        s.sendall(payload)
        data = b""
        while len(data) < len(payload):
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    return data


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_local_and_remote_forwarding(app_page, relay, sshd, echo):
    page = app_page("ssh", init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.check("[data-testid=conn-save-password]")
    page.click("[data-testid=conn-save]")
    page.locator("[data-testid=saved-connection] a").click()
    page.click("[data-testid=hostkey-save]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    page.click("[data-testid=toggle-forwards]")
    # local: any free port here -> the echo server, reached from the SSH server
    page.fill("[data-testid=forward-host]", "127.0.0.1")
    page.fill("[data-testid=forward-port]", str(echo))
    page.click("[data-testid=forward-add]")
    row = page.locator("[data-testid=forward]").first
    expect(row).to_have_attribute("data-status", "active", timeout=20000)
    local = int(re.search(r"127\.0\.0\.1:(\d+)", row.inner_text()).group(1))
    assert roundtrip(local) == b"ping through the tunnel"
    assert roundtrip(local, b"second") == b"second"
    expect(row).to_contain_text("2 connection")
    # remote: the SSH server listens, the relay connects to the echo server
    server_port = free_port()
    page.select_option("[data-testid=forward-type]", "remote")
    page.fill("[data-testid=forward-listen]", str(server_port))
    page.fill("[data-testid=forward-host]", "127.0.0.1")
    page.fill("[data-testid=forward-port]", str(echo))
    page.click("[data-testid=forward-add]")
    expect(page.locator("[data-testid=forward]").nth(1)).to_have_attribute("data-status", "active", timeout=20000)
    assert roundtrip(server_port, b"back home") == b"back home"
    # saved with the connection: they start again after reconnecting
    page.click("[data-testid=forward-save]")
    saved = page.evaluate("SSH.data.connections()[0].forwards")
    assert [f["type"] for f in saved] == ["local", "remote"] and saved[1]["listenPort"] == server_port
    page.locator("[data-testid=forward-stop]").first.click()
    expect(page.locator("[data-testid=forward]")).to_have_count(1)
    page.locator("[data-testid=close-tab]").click()
    try:
        socket.create_connection(("127.0.0.1", local), timeout=2).close()
        raise AssertionError("the local forwarding still listens")
    except OSError:
        pass
    page.locator("[data-testid=saved-connection] a").click()
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    page.click("[data-testid=toggle-forwards]")
    expect(page.locator("[data-testid=forward][data-status=active]")).to_have_count(2, timeout=20000)
    assert roundtrip(server_port, b"again") == b"again"
    assert page.errors == []
