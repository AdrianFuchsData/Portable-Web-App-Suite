"""SSH client: snippets (saved commands with placeholders), kept in the connections file."""
import json

from playwright.sync_api import expect

from test_ssh_client import NO_PICKERS, fill_dialog, type_command, wait_text


def test_snippets(app_page, relay, sshd, tmp_path):
    page = app_page("ssh", init_script=NO_PICKERS)
    fill_dialog(page, relay, sshd)
    page.click("[data-testid=conn-connect]")
    page.click("[data-testid=hostkey-once]")
    expect(page.locator("[data-testid=tab]")).to_have_attribute("data-status", "connected", timeout=30000)
    wait_text(page, r"\$ |# ")
    if page.locator("[data-testid=toggle-panels]").is_visible():
        page.click("[data-testid=toggle-panels]")
    # a plain snippet with two lines
    page.click("[data-testid=snippet-add]")
    page.fill("[data-testid=snippet-name]", "Greeting")
    page.fill("[data-testid=snippet-command]", "echo one-$((2+3))\necho two-$((3*3))")
    page.click("[data-testid=snippet-save]")
    expect(page.locator("[data-testid=snippet]")).to_have_text(["Greeting"])
    page.locator("[data-testid=snippet] a").click()
    wait_text(page, r"one-5")
    wait_text(page, r"two-9")
    # a snippet with a placeholder
    if page.locator("[data-testid=toggle-panels]").is_visible():
        page.click("[data-testid=toggle-panels]")
    page.click("[data-testid=snippet-add]")
    page.fill("[data-testid=snippet-command]", "echo hello-{{ who }}-{{n}}")
    page.click("[data-testid=snippet-save]")
    expect(page.locator("[data-testid=snippet]").nth(1)).to_contain_text("echo hello-{{ who }}-{{n}}")
    page.locator("[data-testid=snippet] a").nth(1).click()
    page.fill("[data-testid=snippet-value-0]", "anna")
    page.fill("[data-testid=snippet-value-1]", "7")
    page.click("[data-testid=snippet-run-ok]")
    wait_text(page, r"hello-anna-7")
    # without Enter: the text waits at the prompt
    if page.locator("[data-testid=toggle-panels]").is_visible():
        page.click("[data-testid=toggle-panels]")
    page.locator("[data-testid=snippet-edit]").first.click()
    page.uncheck("[data-testid=snippet-enter]")
    page.fill("[data-testid=snippet-command]", "echo typed-")
    page.click("[data-testid=snippet-save]")
    page.locator("[data-testid=snippet] a").first.click()
    type_command(page, "later")
    wait_text(page, r"typed-later")
    # saved with the connections (JSON file)
    data = page.evaluate("SSH.data.settings")
    assert [s["command"] for s in data["snippets"]] == ["echo typed-", "echo hello-{{ who }}-{{n}}"] and data["snippets"][0]["enter"] is False
    # delete
    if page.locator("[data-testid=toggle-panels]").is_visible():
        page.click("[data-testid=toggle-panels]")
    page.locator("[data-testid=snippet-edit]").nth(1).click()
    page.click("[data-testid=snippet-delete]")
    expect(page.locator("[data-testid=snippet]")).to_have_count(1)
    assert page.errors == []
