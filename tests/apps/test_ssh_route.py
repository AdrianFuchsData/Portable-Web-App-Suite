"""SSH client: connections through a SOCKS5 or HTTP proxy and through a jump host (a saved connection)."""
import pytest
from playwright.sync_api import expect

from helpers.socks_proxy import socks_proxy
from helpers.upstream_proxy import upstream_proxy
from test_ssh_client import NO_PICKERS, fill_dialog, type_command, wait_text


@pytest.mark.parametrize("kind", ["socks5", "http"])
def test_proxy(app_page, relay, sshd, kind):
    proxy = socks_proxy("pu", "pp") if kind == "socks5" else upstream_proxy("pu:pp")
    try:
        page = app_page("ssh", init_script=NO_PICKERS)
        fill_dialog(page, relay, sshd)
        page.locator("[data-testid=conn-dialog] details.ssh-route summary").click()
        page.select_option("[data-testid=conn-proxy-type]", kind)
        page.fill("[data-testid=conn-proxyHost]", "127.0.0.1")
        page.fill("[data-testid=conn-proxyPort]", str(proxy.server_address[1]))
        page.fill("[data-testid=conn-proxyUser]", "pu")
        page.fill("[data-testid=conn-proxyPassword]", "wrong")
        page.click("[data-testid=conn-connect]")
        expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "closed", timeout=30000)
        wait_text(page, r"refused the user name or password|407")
        # the right password
        page.locator("[data-testid=close-tab]").click()
        fill_dialog(page, relay, sshd)
        page.locator("[data-testid=conn-dialog] details.ssh-route summary").click()
        page.select_option("[data-testid=conn-proxy-type]", kind)
        page.fill("[data-testid=conn-proxyHost]", "127.0.0.1")
        page.fill("[data-testid=conn-proxyPort]", str(proxy.server_address[1]))
        page.fill("[data-testid=conn-proxyUser]", "pu")
        page.fill("[data-testid=conn-proxyPassword]", "pp")
        page.click("[data-testid=conn-connect]")
        page.click("[data-testid=hostkey-once]")
        expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
        wait_text(page, r"\$ |# ")
        type_command(page, "echo via-proxy-$((40+2))")
        wait_text(page, r"via-proxy-42")
        targets = proxy.log if kind == "socks5" else [x[1] for x in proxy.log]
        assert (("localhost", sshd["port"]) in targets) if kind == "socks5" else (f"localhost:{sshd['port']}" in targets)
        assert page.errors == []
    finally:
        proxy.shutdown()


def test_jump_host(app_page, relay, sshd):
    page = app_page("ssh", init_script=NO_PICKERS)
    # the jump host: saved (with its key)
    fill_dialog(page, relay, sshd)
    page.fill("[data-testid=conn-name]", "Bastion")
    page.check("[data-testid=conn-save-password]")
    page.click("[data-testid=conn-save]")
    # the target: through the bastion (the same test server, reached from there as 127.0.0.1)
    page.click("[data-testid=new-connection]")
    page.fill("[data-testid=conn-name]", "Inside")
    page.fill("[data-testid=conn-host]", "127.0.0.1")
    page.fill("[data-testid=conn-port]", str(sshd["port"]))
    page.fill("[data-testid=conn-username]", sshd["user"])
    page.fill("[data-testid=conn-privateKey]", sshd["key"])
    page.locator("[data-testid=conn-dialog] details.ssh-route summary").click()
    page.select_option("[data-testid=conn-jump]", label="Bastion")
    expect(page.locator("[data-testid=conn-proxy-type]")).to_have_count(0)
    page.click("[data-testid=conn-connect]")
    expect(page.locator("[data-testid=hostkey-fingerprint]")).to_have_text(sshd["fingerprint"], timeout=30000)
    page.click("[data-testid=hostkey-once]")  # the bastion
    expect(page.locator("[data-testid=hostkey-fingerprint]")).to_have_text(sshd["fingerprint"], timeout=30000)
    page.click("[data-testid=hostkey-once]")  # the target
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    wait_text(page, r"through the jump host")
    type_command(page, "echo $SSH_CONNECTION")
    wait_text(page, r"127\.0\.0\.1 \d+ 127\.0\.0\.1 " + str(sshd["port"]))
    # closing the tab closes both connections
    page.locator("[data-testid=close-tab]").click()
    assert page.errors == []
