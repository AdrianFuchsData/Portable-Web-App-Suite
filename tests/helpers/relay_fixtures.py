"""Pytest fixtures: relay implementations and local test servers (registered in tests/conftest.py)."""
import re
import shutil
import subprocess
import sys
import time

import pytest

from helpers.paths import ROOT
from helpers import relay_servers as servers

TOKEN = "test-token-123"

PWSH = shutil.which("pwsh") or str(ROOT / ".tools" / "pwsh" / "pwsh")

# Every relay implementation must pass the same conformance tests: name -> (command, args(port, token, ca))
RELAYS = {
    "python": ([sys.executable, str(ROOT / "relay" / "python" / "relay.py")],
               lambda port, token, ca: ["--port", port, "--token", token, "--cafile", ca]),
    "powershell": ([PWSH, "-NoProfile", "-NonInteractive", "-File", str(ROOT / "relay" / "powershell" / "relay.ps1")],
                   lambda port, token, ca: ["-Port", port, "-Token", token, "-CaFile", ca]),
}


# Options of protocol version 2 per implementation: name -> (command, {option: flag})
RELAYS_V2 = {
    "python": (RELAYS["python"][0], {"port": "--port", "token": "--token", "users": "--users", "bind": "--bind", "hosts": "--host",
                                     "base_path": "--base-path", "trusted_proxy": "--trusted-proxy", "proxy_user_header": "--proxy-user-header",
                                     "session_hours": "--session-hours", "tls": ("--tls-cert", "--tls-key"), "cafile": "--cafile"}),
    "powershell": (RELAYS["powershell"][0], {"port": "-Port", "token": "-Token", "users": "-Users", "bind": "-Bind", "hosts": "-HostName",
                                             "base_path": "-BasePath", "trusted_proxy": "-TrustedProxy", "proxy_user_header": "-ProxyUserHeader",
                                             "session_hours": "-SessionHours", "tls": ("-TlsCert", "-TlsKey"), "cafile": "-CaFile"}),
}


def start_relay(impl, expect_failure=False, **options):
    """Start a relay with version 2 options (users, bind, tls=(cert, key), hosts=[...], ...). Returns
    {"port", "url", "output", "stop"} or, with expect_failure, {"returncode", "output"}."""
    command, flags = RELAYS_V2[impl]
    args = []
    for name, value in {"port": "0", **options}.items():
        flag = flags[name]
        if name == "tls":
            args += [flag[0], str(value[0]), flag[1], str(value[1])]
        elif isinstance(value, (list, tuple)):
            # PowerShell takes arrays as one comma-separated argument, Python repeats the option
            args += [flag, ",".join(map(str, value))] if impl == "powershell" else sum(([flag, str(v)] for v in value), [])
        else:
            args += [flag, str(value)]
    process = subprocess.Popen(command + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    output = []
    if expect_failure:
        try:
            out, _ = process.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            process.kill()
            out, _ = process.communicate()
        return {"returncode": process.returncode, "output": out}
    port = None
    for line in process.stdout:
        output.append(line)
        match = re.search(r"listening on \S+:(\d+)", line)
        if match:
            port = int(match.group(1))
            break
    if not port:
        process.kill()
        raise RuntimeError(f"{impl} relay did not start: {''.join(output)}")
    # read the remaining start-up lines without blocking the tests
    import threading
    threading.Thread(target=lambda: output.extend(process.stdout), daemon=True).start()
    time.sleep(0.3)

    def stop():
        process.terminate()
        try:
            process.wait(10)
        except subprocess.TimeoutExpired:
            process.kill()
    return {"port": port, "url": f"http://127.0.0.1:{port}", "output": "".join(output), "stop": stop, "process": process}


@pytest.fixture(scope="session")
def certs(tmp_path_factory):
    return servers.make_certs(tmp_path_factory.mktemp("certs"))


@pytest.fixture(scope="session", params=sorted(RELAYS))
def relay(request, certs):
    """A running relay; yields {"port", "token", "url", "implementation"}."""
    command, args = RELAYS[request.param]
    if not shutil.which(command[0]):
        pytest.skip(f"{command[0]} not available")
    ca, _, _ = certs
    process = subprocess.Popen(command + args("0", TOKEN, str(ca)),
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    port = None
    for line in process.stdout:
        match = re.search(r"listening on 127\.0\.0\.1:(\d+)", line)
        if match:
            port = int(match.group(1))
            break
    if not port:
        process.kill()
        pytest.fail(f"{request.param} relay did not start")
    yield {"port": port, "token": TOKEN, "url": f"http://127.0.0.1:{port}", "implementation": request.param}
    process.terminate()
    process.wait(10)


@pytest.fixture(scope="session")
def echo():
    server = servers.echo_server()
    yield server.server_address[1]
    server.shutdown()


@pytest.fixture(scope="session")
def tls_echo(certs):
    _, cert, key = certs
    server = servers.tls_echo_server(cert, key)
    yield server.server_address[1]
    server.shutdown()


@pytest.fixture(scope="session")
def starttls_echo(certs):
    _, cert, key = certs
    server = servers.starttls_echo_server(cert, key)
    yield server.server_address[1]
    server.shutdown()


@pytest.fixture(scope="session")
def http_target():
    server = servers.http_server()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


RELAY_PASSWORD = "correct horse battery"


@pytest.fixture(scope="module")
def proxied_relay(relay, certs, tmp_path_factory):
    """The same implementation as `relay`, with an account, behind a TLS reverse proxy at https://localhost:<port>/relay."""
    from helpers.reverse_proxy import ReverseProxy
    users = tmp_path_factory.mktemp("proxied") / "users.json"
    subprocess.run(RELAYS_V2["python"][0] + ["--users", str(users), "--add-user", "anna", "--password-stdin"],
                   input=RELAY_PASSWORD + "\n", text=True, check=True, timeout=60)
    ca, cert, key = certs
    upstream = start_relay(relay["implementation"], users=users, base_path="/relay", trusted_proxy=["127.0.0.1"], cafile=ca)
    proxy = ReverseProxy(upstream["port"], cert, key)
    yield {"url": f"https://localhost:{proxy.port}/relay", "user": "anna", "password": RELAY_PASSWORD}
    proxy.stop()
    upstream["stop"]()
