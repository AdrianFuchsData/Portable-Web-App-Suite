"""The module "suite" of the Python notebook: the notebook's connection to the other applications of the suite.

suite.net (shared/js/python-net.py): requests through the relay; sockets (smtplib, ftplib, imaplib, http.client …) through the relay
when the notebook is served by it. suite.ssh (shared/js/python-ssh.py): SSH and SFTP with a subset of Fabric's Connection.
suite.shell (shared/js/python-shell.py): a bash-like shell on the file system (the Terminal tab; await suite.shell.run("ls -l")).

shared/js/python-worker.js installs this file as the package "suite". Its functions ask the page (apps/notebook) through
_page_call(name, json), which answers asynchronously, so they are awaited in a cell.

suite.archives – archives of the archive manager mounted into the file system ("📦 Mount archive…" in the Files panel does
the same with a dialog). The files of a mounted archive are plain files below /mnt/<archive name>: os, open, pathlib, shutil,
glob, pandas … work as usual. After every cell, new, changed and deleted files are written back into the archive (the archive
manager marks it changed; save it there). The whole archive is copied into the notebook's memory.

    path = await suite.archives.mount()            # the archive open in the archive manager (it asks you to allow it)
    path = await suite.archives.mount("data.zip")  # one of several open archives, by its name
    await suite.archives.sync()                    # write the changes back now
    await suite.archives.unmount("data.zip")       # write the changes back and remove the folder
    await suite.archives.mounted()                 # [{"name", "path", "closed"}]

Outside the suite (a regular Jupyter installation) there is no module "suite"; notebooks that should run in both use e.g.

    try:
        import suite
        path = await suite.archives.mount("data.zip")
    except ModuleNotFoundError:
        path = "data"   # the archive unpacked next to the notebook
"""
import json

import __main__

__all__ = ["archives", "net", "ssh", "shell"]


def __getattr__(name):
    # suite.net (requests and sockets through the relay) and suite.ssh (SSH/SFTP) are loaded when used
    if name in ("net", "ssh", "shell"):
        import importlib
        return importlib.import_module(f"suite.{name}")
    raise AttributeError(f"module 'suite' has no attribute {name!r}")


async def _call(_function, **args):
    """Ask the page; the answer is JSON (errors are raised as RuntimeError with the page's message)."""
    try:
        answer = await __main__._page_call(_function, json.dumps(args))
    except Exception as e:  # (a JavaScript error: its message is the page's localized text)
        raise RuntimeError(str(getattr(e, "message", e)).replace("Error: ", "", 1)) from None
    return json.loads(answer)


class _Archives:
    """Archives of the archive manager, mounted below /mnt."""

    async def mount(self, name=None):
        """Mount an archive open in the archive manager (by name if several are open); returns the folder."""
        return await _call("archives.mount", name=name)

    async def unmount(self, name):
        """Write the changes back and remove the folder (name or folder of the archive)."""
        return await _call("archives.unmount", name=str(name))

    async def sync(self):
        """Write new, changed and deleted files of all mounted archives back now; returns the number of changes."""
        return await _call("archives.sync")

    async def mounted(self):
        """The mounted archives: [{"name", "path", "closed"}] (closed: the archive was closed in the archive manager)."""
        return await _call("archives.mounted")

    def __repr__(self):
        return "<suite.archives: archives of the archive manager mounted below /mnt>"


archives = _Archives()
