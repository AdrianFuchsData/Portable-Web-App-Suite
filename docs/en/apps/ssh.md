# SSH client

The SSH client (`ssh.html`) opens terminal sessions on SSH servers and transfers files over SFTP. It works like PuTTY with an
integrated file panel. Connections go through the **local relay** (see the user guide, "Network functions and the relay").

## Connecting

1. **New connection** opens the connection dialog: name, host, port (22), user and the authentication:
   - **Private key**: paste the key (OpenSSH format `-----BEGIN OPENSSH PRIVATE KEY-----` or PEM) or load the key file; enter the
     passphrase if the key is protected. Ed25519, ECDSA and RSA keys are supported.
   - **Password** (also used for keyboard-interactive login).
2. Enter the relay address and token once (they are stored with the connections).
3. **Connect** opens a new tab; **Save connection** adds the connection to **Saved connections** (password and passphrase only if the
   box is ticked; a private key is always saved with the connection).

### Host keys

When you connect to a server for the first time, the client shows the server's key fingerprint (`SHA256:…`). Compare it with the
fingerprint the administrator gives you (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server):

- **Accept and save** stores the fingerprint with the saved connection; later connections are accepted without a question.
- **Accept once** connects without storing it.
- **Reject** cancels the connection.

If the fingerprint of a saved connection changes, a **warning** is shown — someone could be intercepting the connection. Only accept the new
key if you know why it changed (e.g. the server was reinstalled).

## Terminal

Every connection opens a tab with a terminal (xterm-compatible, colours, mouse, resizing). The coloured dot shows the state: green connected,
yellow connecting, red closed. **Reconnect** opens a closed session again; × closes a tab.

- Select text to copy it with ⧉ (or the browser's copy shortcut); 📋 pastes the clipboard into the session.
- **Font size** changes the size of all terminals.
- **⏺** records the session from now on; a second click (**⏹**, showing the recorded size) stops and saves the log as a text file
  (without colour codes). **⤓** saves what the terminal currently holds (including the scrollback of up to 5000 lines).
- On touch screens a key bar offers Esc, Tab, Ctrl (applies to the next key, e.g. Ctrl then C), the arrow keys and a few characters that are
  hard to type on phone keyboards.

## Files (SFTP)

**📁 Files** opens the file panel of the session (it starts in the home directory):

- Click a folder to open it, `..` goes up; type a path and press `Enter` to jump there; ⟳ reloads.
- Click a file (or ⬇) to download it.
- **Upload…** uploads files into the current folder; you can also drop files onto the panel.
- **New folder**, ✎ rename and × delete (folders must be empty).

## Saved connections

Saved connections and the relay settings are kept in a connections file, a **KeePass database** (encrypted, recommended) or a **JSON file**
(not encrypted). Use **Save** and **Open…** in the left panel. In KeePass, every connection is an entry in the group
"Portable Web App Suite/ssh" with the private key and the host key fingerprint as additional fields (the key protected).
A click on a saved connection connects; ✎ edits and × deletes it.

**Known host keys**: the left panel lists the host key fingerprints saved with connections; × forgets one, so the next connection
asks again (e.g. after the server was reinstalled).

### Creating a key pair

**🔑 New key pair…** creates a key for logging in without a password: Ed25519 (recommended), ECDSA P-256 or RSA 4096, with a
comment and an optional passphrase that encrypts the private key. Afterwards the dialog shows the public key and its fingerprint:
copy it into `~/.ssh/authorized_keys` on the server (or save it as `.pub`), save the private key (`id_ed25519`, OpenSSH format,
usable with OpenSSH and PuTTYgen), and **Use in a new connection** fills it into the connection dialog. Port forwarding is not
possible in a browser (a page cannot listen on local ports).

In the file panel, ↗ (**Open with…**) opens a remote file in another application of the suite; saving there writes it back over SFTP.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

☰ opens the saved connections. The file panel shares the screen with the terminal (below it). Use the key bar for keys missing on the on-screen keyboard.
