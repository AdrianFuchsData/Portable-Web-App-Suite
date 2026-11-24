"""HTTP analyzer: code generation – the generated cURL, wget, PowerShell and Go code is run against the echo server, the other
languages are checked for their content (Python is compiled)."""
import json
import os
import shutil
import subprocess

import pytest
from playwright.sync_api import expect

from helpers.paths import ROOT
from test_http import NO_PICKERS, set_url

PWSH = shutil.which("pwsh") or str(ROOT / ".tools" / "pwsh" / "pwsh")
GO = shutil.which("go") or str(ROOT / ".tools" / "go" / "bin" / "go")


def code_for(page, lang):
    out = page.locator("[data-testid=curl-output]")
    before = out.inner_text()
    if page.locator("[data-testid=code-language]").input_value() == lang:
        return before
    page.select_option("[data-testid=code-language]", lang)
    page.wait_for_timeout(250)  # (rendered in the next animation frame; fetch and Node.js may give the same text)
    return out.inner_text()


@pytest.fixture
def page_with_request(app_page, http_target):
    page = app_page("http", init_script=NO_PICKERS)
    set_url(page, f"{http_target}/orders?x=1", "POST")
    page.evaluate("() => { HTTP.state.current.headers.push({ key: 'X-Token', value: \"it's 42\", enabled: true }); }")
    page.click("[data-testid=show-curl]")
    expect(page.locator("[data-testid=curl-out-dialog]")).to_be_visible()
    return page


def run(cmd, **kw):
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120, **kw)
    assert out.returncode == 0, out.stderr
    return out.stdout


def echoed(stdout):
    start = stdout.index("{")
    return json.loads(stdout[start:stdout.rindex("}") + 1])


def test_codegen(page_with_request, http_target, tmp_path):
    page = page_with_request
    body = '{"name": "Ünïcode \\"q\\" it\'s", "n": 1}'
    # (the body: set on the request directly, then the dialog is opened again)
    page.click("[data-testid=curl-out-dialog] footer button.secondary")
    page.evaluate("b => { HTTP.state.current.body.raw = b; HTTP.state.current.body.mode = 'raw'; }", body)
    page.click("[data-testid=show-curl]")
    for lang in ("curl", "wget"):
        code = code_for(page, lang)
        r = echoed(run(["bash", "-c", code]))
        assert r["method"] == "POST" and r["path"] == "/orders?x=1" and r["body"] == body and r["headers"]["X-Token"] == "it's 42", lang
    code = code_for(page, "powershell")
    if os.path.exists(PWSH):
        script = tmp_path / "req.ps1"
        script.write_text(code, encoding="utf-8")
        r = echoed(run([PWSH, "-NoProfile", "-File", str(script)]))
        assert r["body"] == body and r["headers"]["X-Token"] == "it's 42"
    code = code_for(page, "go")
    if os.path.exists(GO):
        (tmp_path / "main.go").write_text(code, encoding="utf-8")
        env = {**os.environ, "GOCACHE": str(ROOT / ".tools" / "gocache"), "GOFLAGS": "-mod=mod", "GO111MODULE": "off", "GOTOOLCHAIN": "local"}
        r = echoed(run([GO, "run", str(tmp_path / "main.go")], env=env, cwd=tmp_path))
        assert r["body"] == body and r["method"] == "POST"
    code = code_for(page, "python")
    compile(code, "req.py", "exec")
    assert f'"{http_target}/orders?x=1"' in code and '"X-Token": "it\'s 42"' in code
    for lang, needles in {"fetch": ['method: "POST"', '"X-Token": "it\'s 42"'], "node": ["await fetch("], "httpie": ["http POST"],
                          "java": ['.method("POST", HttpRequest.BodyPublishers.ofString('], "csharp": ['new HttpMethod("POST")', 'TryAddWithoutValidation("X-Token"'],
                          "php": ["CURLOPT_CUSTOMREQUEST => 'POST'", "'X-Token: it\\'s 42'"]}.items():
        code = code_for(page, lang)
        for n in needles:
            assert n in code, (lang, n, code)
    # the chosen language is remembered; saving gives a file with the right extension
    with page.expect_download() as d:
        page.click("[data-testid=code-save]")
    assert d.value.suggested_filename == "request.php"
    page.click("[data-testid=curl-out-dialog] footer button.secondary")
    page.click("[data-testid=show-curl]")
    expect(page.locator("[data-testid=code-language]")).to_have_value("php")
    assert page.errors == []
