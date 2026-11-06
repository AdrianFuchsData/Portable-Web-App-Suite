"""SSH and SFTP from the Python notebook with the suite's SSH engine through the relay (shared/js/python-worker.js installs this
file as suite.ssh). Like sockets (suite.net), it needs the notebook served by the relay (relay.py --serve). The encryption is
end to end between the browser and the server; the relay only forwards bytes.

The API is a subset of Fabric's Connection, so notebooks can also run with Fabric in a regular Jupyter installation:

    try:
        from suite.ssh import Connection
    except ModuleNotFoundError:
        from fabric import Connection

    with Connection("server.example.org", user="anna", connect_kwargs={"password": "…"}) as c:
        result = c.run("uname -a")                 # prints the output (hide=True: quiet); Result: stdout, stderr, exited, ok
        c.run("false", warn=True).failed           # warn=True: no exception for a failed command
        c.put("report.csv", "/tmp/report.csv")     # upload (local path or file object)
        c.get("/etc/hostname", "hostname.txt")     # download
        sftp = c.sftp()                            # like paramiko's SFTPClient
        sftp.listdir("/tmp"); sftp.stat("/tmp/report.csv").st_size
        with sftp.open("/tmp/notes.txt", "w") as f: f.write("hello")
        sftp.mkdir("/tmp/new"); sftp.rename("/tmp/notes.txt", "/tmp/new/notes.txt"); sftp.remove("/tmp/new/notes.txt"); sftp.rmdir("/tmp/new")

connect_kwargs: password, key_filename (a private key file in the notebook's file system, OpenSSH/PEM), passphrase, or
pkey_text (the private key as text). The first connection to a server asks in the notebook whether its host key is trusted
(as the SSH client does); a changed key is refused unless you confirm it.
"""
import io
import json
import os
import stat as _stat

from suite.net import _call

__all__ = ["Connection", "Result", "UnexpectedExit", "SFTPClient", "SFTPAttributes"]


class Result:
    """The result of Connection.run (like Fabric's / Invoke's Result)."""

    def __init__(self, command, stdout, stderr, exited, connection):
        self.command, self.stdout, self.stderr, self.exited, self.connection = command, stdout, stderr, exited, connection

    return_code = property(lambda self: self.exited)
    ok = property(lambda self: self.exited == 0)
    failed = property(lambda self: self.exited != 0)

    def __bool__(self):
        return self.ok

    def __repr__(self):
        return f"<Result cmd={self.command!r} exited={self.exited}>"


class UnexpectedExit(Exception):
    """A command ended with an exit status other than 0 (and warn was not set)."""

    def __init__(self, result):
        super().__init__(f"Command {result.command!r} exited with status {result.exited}.\n\nStderr:\n{result.stderr}")
        self.result = result


class SFTPAttributes:
    """Like paramiko's SFTPAttributes: filename, st_size, st_mode, st_mtime."""

    def __init__(self, info):
        self.filename = info.get("name", "")
        self.st_size = int(info.get("size", 0))
        # (the engine reports Go's FileMode: the permission bits are POSIX, the type bits are not)
        self.st_mode = (int(info.get("mode", 0)) & 0o7777) | (_stat.S_IFDIR if info.get("isDir") else _stat.S_IFREG)
        self.st_mtime = float(info.get("mtime", 0)) / 1000
        self.longname = info.get("modeString", "")

    def __repr__(self):
        return f"<SFTPAttributes {self.filename} {self.st_size} bytes>"


class _RemoteFile(io.RawIOBase):
    """A file on the server (SFTPClient.open): read and write in pieces."""

    CHUNK = 1024 * 1024

    def __init__(self, sftp, path, mode):
        super().__init__()
        self._sftp, self._path, self._mode, self._pos = sftp, path, mode, 0
        if "w" in mode:
            _call("sftp.write", {"id": sftp._id, "path": path, "offset": 0, "truncate": True}, b"")
        elif "a" in mode:
            self._pos = sftp.stat(path).st_size if sftp._exists(path) else 0

    def readable(self):
        return "r" in self._mode or "+" in self._mode

    def writable(self):
        return any(m in self._mode for m in "wa+")

    def seekable(self):
        return True

    def seek(self, offset, whence=0):
        self._pos = offset if whence == 0 else self._pos + offset if whence == 1 else self._sftp.stat(self._path).st_size + offset
        return self._pos

    def tell(self):
        return self._pos

    def readinto(self, buffer):
        data = _call("sftp.read", {"id": self._sftp._id, "path": self._path, "offset": self._pos, "length": min(len(buffer), self.CHUNK)})
        buffer[:len(data)] = data
        self._pos += len(data)
        return len(data)

    def write(self, data):
        data = data.encode("utf-8") if isinstance(data, str) else bytes(data)
        for i in range(0, len(data), self.CHUNK):
            _call("sftp.write", {"id": self._sftp._id, "path": self._path, "offset": self._pos + i, "truncate": False}, data[i:i + self.CHUNK])
        self._pos += len(data)
        return len(data)


class SFTPClient:
    """SFTP on a connection (Connection.sftp()); a subset of paramiko's SFTPClient."""

    def __init__(self, connection):
        self._id = _call("sftp.open", {"id": connection._id})["id"]
        self._cwd = None

    def _path(self, path):
        path = str(path)
        return path if path.startswith("/") or self._cwd is None else f"{self._cwd.rstrip('/')}/{path}"

    def _exists(self, path):
        try:
            self.stat(path)
            return True
        except OSError:
            return False

    def listdir(self, path="."):
        return sorted(a.filename for a in self.listdir_attr(path))

    def listdir_attr(self, path="."):
        return [SFTPAttributes(i) for i in _call("sftp.list", {"id": self._id, "path": self._path(path)})]

    def stat(self, path):
        return SFTPAttributes(_call("sftp.stat", {"id": self._id, "path": self._path(path)}))

    lstat = stat

    def normalize(self, path):
        return _call("sftp.realpath", {"id": self._id, "path": self._path(path)})["path"]

    def chdir(self, path=None):
        self._cwd = None if path is None else self.normalize(path)

    def getcwd(self):
        return self._cwd

    def open(self, filename, mode="r", bufsize=-1):
        raw = _RemoteFile(self, self._path(filename), mode.replace("b", ""))
        if "b" in mode:
            return io.BufferedReader(raw) if mode.startswith("r") and "+" not in mode else raw
        return io.TextIOWrapper(io.BufferedReader(raw) if mode.startswith("r") and "+" not in mode else io.BufferedWriter(raw), encoding="utf-8")

    file = open

    def get(self, remotepath, localpath):
        with self.open(remotepath, "rb") as src, open(localpath, "wb") as dst:
            while True:
                chunk = src.read(_RemoteFile.CHUNK)
                if not chunk:
                    break
                dst.write(chunk)

    def getfo(self, remotepath, fl):
        with self.open(remotepath, "rb") as src:
            data = src.read()
        fl.write(data)
        return len(data)

    def put(self, localpath, remotepath):
        with open(localpath, "rb") as src:
            return self.putfo(src, remotepath)

    def putfo(self, fl, remotepath, file_size=0):
        data = fl.read()
        with self.open(remotepath, "wb") as dst:
            dst.write(data)
        return self.stat(remotepath)

    def mkdir(self, path, mode=0o777):
        _call("sftp.mkdir", {"id": self._id, "path": self._path(path)})

    def remove(self, path):
        _call("sftp.remove", {"id": self._id, "path": self._path(path)})

    unlink = remove

    def rmdir(self, path):
        _call("sftp.rmdir", {"id": self._id, "path": self._path(path)})

    def rename(self, oldpath, newpath):
        _call("sftp.rename", {"id": self._id, "from": self._path(oldpath), "to": self._path(newpath)})

    posix_rename = rename

    def close(self):
        try:
            _call("sftp.close", {"id": self._id})
        except OSError:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class Connection:
    """An SSH connection (a subset of Fabric's Connection): run, put, get, sftp, open/close, with-statement."""

    def __init__(self, host, user=None, port=None, connect_kwargs=None, connect_timeout=None, **ignored):
        if "@" in host:
            user, host = host.rsplit("@", 1)
        if host.count(":") == 1:
            host, port = host.split(":")
        self.host, self.user, self.port = host, user or os.environ.get("USER") or "root", int(port or 22)
        self.connect_kwargs = dict(connect_kwargs or {})
        self.connect_timeout = connect_timeout
        self._id = None
        self._sftp = None

    def __repr__(self):
        return f"<Connection host={self.host} user={self.user} port={self.port}{' (open)' if self.is_connected else ''}>"

    @property
    def is_connected(self):
        return self._id is not None

    def open(self):
        if self._id is not None:
            return
        kw = self.connect_kwargs
        key = kw.get("pkey_text")
        files = kw.get("key_filename")
        if not key and files:
            with open(files[0] if isinstance(files, (list, tuple)) else files, encoding="utf-8") as f:
                key = f.read()
        if not key and not kw.get("password"):
            raise ValueError('connect_kwargs needs "password", "key_filename" or "pkey_text"')
        self._id = _call("ssh.connect", {"host": self.host, "port": self.port, "user": self.user, "password": kw.get("password"),
                                         "privateKey": key, "passphrase": kw.get("passphrase")})["id"]

    def close(self):
        if self._sftp:
            self._sftp.close()
            self._sftp = None
        if self._id is not None:
            try:
                _call("ssh.close", {"id": self._id})
            except OSError:
                pass
            self._id = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *exc):
        self.close()

    def run(self, command, warn=False, hide=False, **ignored):
        """Run a command; prints its output unless hide (True, "out", "err", "both"); raises UnexpectedExit on failure unless warn."""
        self.open()
        answer = _call("ssh.run", {"id": self._id, "command": command})
        result = Result(command, answer["stdout"], answer["stderr"], int(answer["code"]), self)
        if hide not in (True, "both", "out") and result.stdout:
            print(result.stdout, end="")
        if hide not in (True, "both", "err") and result.stderr:
            import sys
            print(result.stderr, end="", file=sys.stderr)
        if result.failed and not warn:
            raise UnexpectedExit(result)
        return result

    def sftp(self):
        self.open()
        if self._sftp is None:
            self._sftp = SFTPClient(self)
        return self._sftp

    def put(self, local, remote=None, preserve_mode=True):
        """Upload a local file (path or file object); remote: a path or folder (default: the file name in the home folder)."""
        sftp = self.sftp()
        name = os.path.basename(local) if isinstance(local, str) else getattr(local, "name", "upload")
        if remote is None or remote.endswith("/"):
            remote = (remote or "") + os.path.basename(name)
        if isinstance(local, str):
            sftp.put(local, remote)
        else:
            sftp.putfo(local, remote)
        return _Transfer(local, remote)

    def get(self, remote, local=None, preserve_mode=True):
        """Download a file; local: a path, a folder ending in "/", or a file object (default: the file name here)."""
        sftp = self.sftp()
        if local is None or (isinstance(local, str) and local.endswith("/")):
            local = (local or "") + os.path.basename(remote)
        if isinstance(local, str):
            sftp.get(remote, local)
        else:
            sftp.getfo(remote, local)
        return _Transfer(local, remote)


class _Transfer:
    def __init__(self, local, remote):
        self.local, self.remote = local, remote

    def __repr__(self):
        return f"<Result local={self.local!r} remote={self.remote!r}>"
