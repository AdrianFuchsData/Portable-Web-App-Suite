"""Pytest fixtures: an OpenSSH server running as the current user (no root) with key authentication."""
import getpass
import shutil
import socket
import subprocess
import time

import pytest

SSHD = shutil.which("sshd") or "/usr/sbin/sshd"


def keygen(path, kind="ed25519", passphrase=""):
    subprocess.run(["ssh-keygen", "-q", "-t", kind, "-N", passphrase, "-f", str(path), "-C", "test"], check=True)
    return path


def fingerprint(pub):
    return subprocess.run(["ssh-keygen", "-lf", str(pub)], check=True, capture_output=True, text=True).stdout.split()[1]


@pytest.fixture(scope="session")
def sshd(tmp_path_factory):
    """Yields {"port", "user", "key", "key_passphrase", "rsa_key", "fingerprint", "home"}."""
    if not shutil.which("ssh-keygen") or not shutil.which(SSHD):
        pytest.skip("OpenSSH server not available")
    d = tmp_path_factory.mktemp("sshd")
    host_key = keygen(d / "host_ed25519")
    client_key = keygen(d / "client_ed25519")
    protected_key = keygen(d / "client_protected", passphrase="secret phrase")
    rsa_key = keygen(d / "client_rsa", kind="rsa")
    (d / "authorized_keys").write_text("".join((d / f"{k.name}.pub").read_text() for k in (client_key, protected_key, rsa_key)))
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    (d / "sshd_config").write_text(f"""
Port {port}
ListenAddress 127.0.0.1
HostKey {host_key}
AuthorizedKeysFile {d / "authorized_keys"}
PidFile {d / "sshd.pid"}
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
Subsystem sftp internal-sftp
LogLevel ERROR
""")
    process = subprocess.Popen([SSHD, "-D", "-e", "-f", str(d / "sshd_config")], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            break
        except OSError:
            if process.poll() is not None:
                pytest.fail("sshd did not start: " + process.stdout.read())
            time.sleep(0.05)
    files = d / "files"
    files.mkdir()
    yield {
        "port": port, "user": getpass.getuser(), "files": str(files),
        "key": client_key.read_text(), "protected_key": protected_key.read_text(), "rsa_key": rsa_key.read_text(),
        "fingerprint": fingerprint(d / "host_ed25519.pub"), "authorized_keys": str(d / "authorized_keys"),
    }
    process.terminate()
    process.wait(10)
