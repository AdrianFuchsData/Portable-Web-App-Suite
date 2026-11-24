# Authenticator

The authenticator (`authenticator.html`) shows the one-time passwords (two-factor codes) of a KeePass database – like an
authenticator app on the phone, but the secrets stay in your own encrypted `.kdbx` file. It supports **TOTP** (time-based,
the usual kind), **HOTP** (counter-based) and **Steam** codes. Everything runs in the browser; nothing is sent anywhere.

The tokens are stored the way KeePassXC, KeePass 2 (2.47 and later), KeePassDX and Strongbox store them (the `otp` field
plus KeePass 2's `TimeOtp-…`/`HmacOtp-…` fields), so the same database also works in those programs and in the suite's
[KeePass](keepass.md) application. Older KeePassXC fields (`TOTP Seed`/`TOTP Settings`) and KeeOtp entries are read too.

## Unlocking or creating a database

1. **Choose database…** picks the `.kdbx` file; you can also drop it onto the window, together with its key file. In
   Chrome/Edge on the desktop, **Recently opened** lists the databases opened before.
2. Enter the password (👁 shows it) and, if the database has one, choose the **key file**.
3. **Unlock**. A wrong password or key file gives an error message.

**Create a new database** asks for a name and a password (twice); optionally a **key file** is created as well and
downloaded at once – keep it safe, without it the database cannot be opened. The new database is a KDBX 4 file (AES-256,
Argon2id); it is written when you **save** it.

## The codes

Every entry with one-time password data (outside the recycle bin) appears as a card, sorted by name, with its account and
its group. For TOTP and Steam tokens the card shows three codes: the **previous**, the **current** (large) and the **next**
code, and a bar with the seconds left. Click a code to copy it. The current code turns red in its last five seconds – the
next code is then the one to use. The previous code helps when a server is a little behind.

HOTP tokens show the code for the current counter; **⟳ n** moves on to the next code (the counter is increased and saved with
the database).

**Search** (`Ctrl+F`) filters by name, account, issuer and group.

## Adjusting the clock

TOTP codes depend on the time: if the clock of your device differs from the server's, the codes are rejected. The bar above
the codes shows the clock the codes are made with:

- **−30 s** / **+30 s** move the clock half a minute back or forward (one code step).
- **⏸** stops the clock (the codes stay as they are), **▶** lets it run on from there.
- **⚙** opens the settings: an **offset to the local clock** in seconds (e.g. `-90`), or a fixed **date and time** (this
  stops the clock).
- **↺** returns to the local clock. While the clock differs from the local clock, the bar is shown in yellow.

The clock setting is not saved; it is reset when the application is opened again.

## Adding and editing tokens

**+ Add** opens the form:

- **Fill in from an otpauth:// link**: paste a link as offered by a website for setting up two-factor authentication
  (`otpauth://totp/Example:anna@example.org?secret=…&issuer=Example`) – all fields are filled in.
- Or enter **issuer**, **account**, **name** (the title of the KeePass entry) and the **secret key** (Base32, spaces are
  ignored). 🎲 creates a random secret (for setting up a token of your own).
- **Advanced settings**: type (TOTP, HOTP, Steam), algorithm (SHA1, SHA256, SHA512), digits, period (TOTP) or counter (HOTP),
  and the KeePass **group** the new entry goes into.
- The **current code** is shown while you type, so you can compare it with the website before you save.

**✎ Edit** changes a token the same way; the previous version of the entry goes into its history.

## Deleting tokens

**🗑 Delete** asks first and warns: switch off two-factor authentication for the account (or make sure you can sign in
another way) before deleting the token, or you may lock yourself out. If the KeePass entry holds more than the token – a
password, a URL, notes, attachments or other fields – you can **remove only the token** and keep the entry, or delete the
whole entry. Deleted entries go to the recycle bin of the database, if it has one.

## Importing

**⇩ Import** reads several tokens at once:

- **Text**: `otpauth://` links (one per line), **Google Authenticator** export links (`otpauth-migration://`, from the
  QR codes of “Transfer accounts”) and unencrypted **Aegis** JSON exports.
- **🖼 QR code from a picture…** reads the QR codes of screenshots or photos; you can also **paste** a screenshot (`Ctrl+V`) or
  drop pictures onto the window.
- **📷 Scan with the camera** reads QR codes held in front of the camera (the browser asks for permission).
- **📄 From a file…** reads text and JSON files.

The list below shows the tokens found; tokens that are already in the database are marked *already there* and not ticked.
Choose the **group** for the new entries and **Import**. Pasting an `otpauth://` link or a QR code screenshot anywhere in the
window (outside the text fields) opens the import with it.

## Exporting

- **▦** on a card shows the token as a **QR code** and as an `otpauth://` link (after a warning – anyone who sees it can create
  your codes). Scan the QR code with another authenticator app to move a token there.
- **⇧ Export all** downloads all `otpauth://` links as a text file, or shows all QR codes. The export is **not encrypted** –
  delete it after use.

## Saving

**💾 Save** (`Ctrl+S`) writes the database back to its file in Chrome/Edge on the desktop. In other browsers (Firefox,
Android) it is downloaded: replace the original file with the downloaded one, otherwise the changes are lost. **Save as**
(`Ctrl+Shift+S`) writes a copy. Before saving, the new file is decrypted again to make sure it can be opened.

## Locking

**🔒 Lock** (`Ctrl+L`) closes the database. It is also locked after **10 minutes** without activity – but never while there
are unsaved changes.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+L` | Lock |

### Codes

| Keys | Function |
|---|---|
| `Ctrl+F` | Search |
| `Ctrl+V` | Import a pasted `otpauth://` link or QR code picture |
| `Escape` | Close the dialog |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The cards are shown in one column; the toolbar wraps. The camera of the back is used for scanning QR codes. On Android the
database is saved as a download (see *Saving*).
