# KeePass

The KeePass application (`keepass.html`) opens, edits and creates KeePass password databases (`.kdbx`, KDBX 3.1 and 4).
The files stay compatible with KeePass, KeePassXC, KeePassDX and other KeePass apps. Everything runs in the browser;
nothing is sent over the network.

## Unlocking a database

1. **Choose database…** selects the `.kdbx` file. You can also drop the file (and its key file) onto the window.
   In Chrome/Edge on the desktop, **Recently used** lists the databases opened before.
2. Enter the master password.
3. If the database uses a key file, select it with **Choose key file…**.
4. **Unlock**. A wrong password or key file shows an error message.

## Creating a database

**Create a new database** asks for a name and the master password (twice). Optionally, the application also creates a
**key file** (`<name>.keyx`), which is downloaded immediately: keep it in a safe place, because without it the
database cannot be opened. The new database is stored only after you **save** it.

## Groups and entries

- The left pane shows the **groups**. Click a group to show its entries; double-click a group (or **Rename**) to rename it.
  **New group** creates a subgroup of the selected group; **Delete group** moves the group with all its entries into the
  recycle bin.
- The middle pane lists the **entries** of the group, sorted by title. The **search** field searches the title, user name,
  URL, notes and tags in all groups (`Ctrl+F`).
- **New entry** creates an entry with a generated password in the selected group.
- The right pane edits the selected entry. All changes take effect immediately; the **Save** button is highlighted while
  there are unsaved changes.

## Editing an entry

| Field | Notes |
|---|---|
| Title, user name, URL, notes | ⧉ copies the user name; **Open** opens the URL in a new tab |
| Password | 👁 shows or hides it, ⧉ copies it; the strength is shown in bits |
| One-time password | the current code with the remaining seconds (see below); 🔑 **Set up one-time password…** adds one |
| Tags | separated by commas |
| Expires | sets an expiry date; expired entries are marked |
| Additional fields | own fields with name and value; 🔒 protects a field (it is hidden and stored in encrypted form in memory) |
| Attachments | add files, download them by clicking the name, or remove them |
| Group | moves the entry into another group |
| History | earlier versions of the entry; **Restore** makes an earlier version current again |

Each time you edit an entry, the previous version is stored once in the **history** (not on every key press). The history
lists the versions newest first, each with what was changed after it (for example “Password changed afterwards”). Click a
version to see its fields – the ones that differ from the current entry are highlighted, passwords and protected fields stay
hidden until you click 👁 – and to **Restore** it, copy its password or **Delete this version**. **Delete the whole history**
removes all older versions of the entry (for example after an old password should no longer be stored anywhere). Under
**⚙ Database**, *Older versions kept per entry* limits the history (KeePass's default is 10; −1 keeps all); older versions
beyond the limit are removed when saving.

Copied values are removed from the clipboard after 30 seconds.

Undo (↶, `Ctrl+Z`) and redo (↷, `Ctrl+Y`) cover all changes to the database since it was unlocked: fields, new and deleted entries and groups, moving, attachments and settings. Typing into one field counts as one step. Locking clears the history.

↗ next to an attachment (**Open with…**) opens it in another application of the suite; saving there replaces the attachment. Save the database afterwards.

## One-time passwords (two-factor codes)

An entry can hold the secret of a one-time password, so the database also replaces an authenticator app. The entry shows
the current code (⧉ copies it; the bar shows how long it is valid). **🔑 Set up one-time password…** – or ✎ for an
existing one – opens a dialog: paste the `otpauth://` link a service offers (it fills in all fields) or enter the **secret
key** (Base32, spaces are ignored) and, if the service says so, the type (**TOTP**: time-based, the usual one; **HOTP**:
counter-based; **Steam**: Steam Guard's five characters), algorithm, digits and period or counter. 🎲 creates a new random
secret, for example for your own server. × removes the one-time password.

For HOTP the entry shows the code for the current counter; **Next code** copies it and moves the counter on (save the
database afterwards, so the counter is kept).

The secret is stored protected in the field `otp` as an `otpauth://` link (as KeePassXC, KeeWeb, KeePassDX and Strongbox
do) and additionally in the `TimeOtp-…` / `HmacOtp-…` fields of KeePass 2.47+, so every common KeePass app shows the same
codes. Entries that only have the KeePass 2 fields, the older KeePassXC fields `TOTP Seed` / `TOTP Settings` or the KeeOtp
format are read too. These fields are not listed under *Additional fields*.

**QR codes.** In the set-up dialog, **📷 Scan QR code** reads the QR code a service shows with the device's camera (the
browser asks for permission; nothing leaves the device), **🖼 QR code from a picture…** reads it from a screenshot or photo.
A Google Authenticator export (*Transfer accounts*, `otpauth-migration://`) works too: the first account goes into the
entry, **Add them as new entries** creates an entry for each further account in the same group. To move a secret to
another device – for example your phone's authenticator app – click **▦ QR** next to the code: after a warning, **Show QR
code** displays it as a QR code (and the secret as text). Anyone who sees it can create your codes, so show it only to scan
it yourself.

## Password generator

🎲 **Generate** opens the generator: length (4 to 64), lower case, upper case, digits, symbols, and the option to avoid similar
characters (l, 1, O, 0). ⟳ creates a new password; **Use** sets it as the password of the entry.

## Recycle bin

Deleted entries and groups are moved into the **Recycle bin** group. To restore an entry, select it in the recycle bin and
choose another group in the **Group** field. **Empty recycle bin** deletes its content permanently.

## Saving

**Save** (`Ctrl+S`) writes the database directly into the opened file in Chrome/Edge on the desktop. In Firefox and on Android,
the database is downloaded: replace the original file with it. `Ctrl+Shift+S` saves under a new name.
After writing, the application checks that the saved file can be opened again.

## Master key and database settings

**Database** opens the settings: the database name and **Change master key** (new password and, optionally, a new key file
or removal of the existing key file). Save the database afterwards; keep the old file until you have checked that you can
open the new one.

## Merging databases

**⇄ Merge…** combines another `.kdbx` file with the open database (you enter its password and, if needed, its key file):

- **A copy of the same database** (for example one edited on another computer or phone) is **synchronized**: for every
  entry the newer version wins, the older one goes into its history; new entries and groups are added and entries
  deleted in one copy are deleted. This is the same as "Synchronize" in KeePass and KeePassXC.
- **Another database** is **imported**: its groups and entries are copied into a new group named after it (the
  recycle bin is skipped). Nothing in the open database is changed.

Save afterwards to keep the result; ↶ undoes the merge.

## Password report

**🩺 Report** checks all entries (except those in the recycle bin) and lists problems: empty passwords, weak passwords
(less than 60 bits of estimated strength, the same estimate as in the generator), passwords used in several entries,
expired entries and passwords unchanged for more than a year (from the entry history). Click an entry to open it.
The check runs completely in the browser; no password leaves the device.

## CSV import and export

**⇅ CSV → Export CSV…** writes the entries of the whole database or of the current group (with its subgroups) into a CSV
file (columns `Group`, `Title`, `Username`, `Password`, `URL`, `Notes`, `TOTP`, `Tags`, `Last Modified`, `Created` – the
layout of KeePassXC, which most password managers can import). **A CSV file is not encrypted**: the dialog warns about this,
and the export button says so. Export only when you need it, keep the file on your own device and delete it afterwards.

**⇅ CSV → Import CSV…** reads a CSV file of another password manager into a new group. The column headers of KeePassXC,
KeePass, Bitwarden, Chrome/Edge, Firefox, Safari, LastPass, 1Password, Dashlane, Proton Pass and similar exports are
recognised (also German headers such as *Benutzername* or *Kennwort*); the dialog shows which column becomes which field.
Columns without meaning for KeePass (favourite, IDs, timestamps) are ignored, unknown columns become additional fields. A
group/folder column creates subgroups; a TOTP column (an `otpauth://` link or a Base32 secret) becomes the entry's one-time
password; entries without a title are named after the web site. The separator (comma, semicolon or tab) and the encoding
(UTF-8 or Windows-1252) are detected. Delete the CSV file after the import – it contains your passwords in plain text.

## Locking

**Lock** (`Ctrl+L`) closes the database; unsaved changes require a confirmation. After 15 minutes without activity the
database is locked automatically, unless there are unsaved changes.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+L` | Lock |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Search |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The application shows one pane at a time: the entry list, a group list (‹ **Groups**) and the entry (‹ **Entries** goes back).
