# FTP/SFTP client

The FTP/SFTP client (`ftp.html`) transfers files between your computer and servers, like FileZilla. It supports **SFTP** (over SSH),
**FTPS** (FTP over TLS, explicit and implicit) and plain **FTP**. Connections go through the **local relay** (see the user guide,
"Network functions and the relay").

## Connecting

The bar at the top connects directly: choose the protocol, enter host, port (filled in for the protocol), user and password, and click
**Connect**.

| Protocol | Port | Notes |
|---|---|---|
| SFTP (SSH) | 22 | password or private key (paste it into the key field); the server's host key is shown on the first connection |
| FTPS (explicit TLS) | 21 | encrypted after `AUTH TLS`; the usual secure FTP |
| FTPS (implicit TLS) | 990 | encrypted from the start |
| FTP (not encrypted) | 21 | passwords and files travel in clear text — use only in trusted networks |

For FTPS with a self-signed server certificate, tick **Accept untrusted certificates**. FTP always uses passive mode; the data connections go to
the same host as the control connection.

**Save site** stores the current settings under a name in the **Sites** list; a click on a site connects, ✎ loads it into the bar, × deletes it.
Sites and the relay settings are kept in a connections file (KeePass database or JSON file, **Save** and **Open…** below the list).

## Local and remote files

The window shows two lists: **Local** on the left, **Remote** (the server) on the right.

- **Local** (Chrome/Edge on the desktop): **Choose local folder…** opens a folder of your computer. Double-click folders to open them, ↑ goes up.
  Downloads are written into this folder; folders are downloaded with their content.
- In Firefox and on phones, local folders cannot be opened: **Upload files…** uploads files, and downloads go to the browser's download folder.
- **Remote**: double-click a folder to open it, ↑ goes up, or type a path and press `Enter`; ⟳ reloads.

Click selects an entry, `Ctrl`+click selects several.

## Transfers

- **Upload →** uploads the selected local entries (folders with their content) into the current remote folder; you can also drag entries from
  the local list (or files from the desktop) onto the remote list.
- **← Download** downloads the selected remote entries; double-clicking a remote file downloads it; you can also drag remote entries onto the
  local list.
- Existing remote files are overwritten after a confirmation.

The **Transfers** list shows every transfer with its progress, size and result; **Clear finished** removes the finished ones.

**Resuming**: when a transfer fails (e.g. the connection was lost), **↻ Resume** next to it continues where it stopped – a
download keeps the part already received and asks the server only for the rest, an upload continues after the part the server
already has. When you upload a file and a smaller file of the same name is on the server, the client asks whether to resume the
upload; when you download into a local folder that contains a smaller file of the same name, it asks whether to resume the
download. Resuming works with SFTP and with FTP servers that support `REST` and `APPE` (almost all do).

## Comparing and synchronizing folders

With a local folder open (Chrome/Edge on the desktop) and a connection, **⇄ Compare / synchronize** compares the local folder
with the current remote folder, including all subfolders. The list shows every file that differs: *only local*, *only on the
server*, *local is newer*, *server is newer* or *different size* (when the times do not tell which is newer), with size and
modification time on both sides; **Show identical files** adds the files that are the same.

Every file gets an action – **upload**, **download** or **skip** – that you can change. **Direction** proposes the actions:
*both ways* (the newer file wins), *upload only* (makes the server match the local folder) or *download only*. **Synchronize**
puts the transfers into the queue; missing folders are created. Files are never deleted.

Files with the same size count as identical; tick **Compare modification times when the sizes are equal** to compare their times
as well. Uploads keep the local modification time on the server (FTP `MFMT`, SFTP), so they count as identical afterwards. A
browser cannot set the time of a downloaded file: downloaded files get the current time, which is why the comparison relies on
the sizes by default. At most 5000 files per side are compared.

## Managing remote files

**New folder**, **Rename** (one selected entry) and **Delete** (selected entries; folders are deleted with their content after a confirmation).

**Open with…** opens the selected remote file in another application of the suite; saving there uploads it again (shown in the transfer queue). With **several files** selected (`Ctrl+click`), the text editor or the hex editor opens all of them in one window, each in its own tab.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The lists are shown one below the other; ☰ **Sites** opens the saved sites.
