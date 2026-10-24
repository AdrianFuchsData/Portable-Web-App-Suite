# Archive manager

The archive manager (`archive.html`) opens, creates and edits archives: browse folders, preview files, extract files,
add files and folders, create folders, rename, delete and convert between formats.

| Format | Open | Save |
|---|---|---|
| ZIP (also `.jar`, `.docx`, `.xlsx`, `.odt`, `.epub`, `.apk`, `.whl` and other ZIP-based files) | yes, incl. ZIP64 | yes (up to 4 GiB and 65,535 entries) |
| TAR | yes (ustar, pax, GNU long names, symbolic links) | yes |
| TAR.GZ / TGZ | yes | yes |
| GZ (a single compressed file) | yes | yes |
| 7z | yes | yes (without encryption; file names of ASCII characters only) |
| RAR (versions 4 and 5) | yes | – (save as 7z or ZIP) |
| TAR.XZ, TAR.BZ2, TAR.ZST, TAR.LZMA | yes | – |
| ISO, CAB, DEB, RPM, CPIO, AR, XAR | yes | – |

7z, RAR and the further formats are read with libarchive (built into the application). The whole archive is unpacked when it
is opened, so large archives need as much memory as their content. **Save** on a format that can only be read opens **Save as**
with 7z suggested. Encrypted 7z and RAR archives cannot be opened (a message says so; encrypted ZIP archives are supported, see
below), and a single compressed file without an archive inside (e.g. `notes.txt.xz`) cannot be opened either.

## Opening and creating

- **Open** (`Ctrl+O`) opens an archive. You can also drop an archive onto the window while no archive is open.
- **New** starts an empty ZIP archive. Dropping files onto the window while nothing is open also starts a new archive.
- In Chrome/Edge on the desktop the start page lists recently used archives.

## Browsing

- The list shows the content of the current folder: name, size (for folders the number of items), packed size (ZIP) and
  modification date. Click a column header to sort.
- Double-click (on phones: tap) a folder to open it. ↑, `Backspace` or the path above the list go back.
- Double-click (tap) a file to preview it: text, images, audio and video. **Download** in the preview saves the file.

## Selecting

Click selects one item, `Ctrl`+click adds or removes items, `Shift`+click selects a range, `Ctrl+A` selects all items of the
folder. The checkboxes select items too (on phones and tablets they are the way to select).

## Extracting

- **Extract** extracts the selected items, **Extract all** the whole current folder.
- A single file is downloaded directly.
- In Chrome/Edge on the desktop you choose a target folder; the files are written into it with their subfolders.
- In Firefox and on Android, several files are downloaded together as one ZIP file.

**✓ Test** checks the whole archive: every file is decompressed and, for ZIP archives, compared with its stored checksum
(CRC-32). The result lists damaged files with the reason; nothing is extracted or changed. Encrypted files need the
password.

## Editing

| Function | Description |
|---|---|
| Add files / Add folder | adds files or a whole folder into the current folder; you can also drop files and folders onto the window |
| New folder | creates a folder and lets you enter its name |
| Rename (`F2`) | renames the selected file or folder |
| Delete (`Del`) | removes the selected items from the archive |

Existing files with the same name are replaced after a confirmation.

Undo (↶, `Ctrl+Z`) and redo (↷, `Ctrl+Y`) work for adding, renaming, deleting and new folders.

**Open with…** (toolbar or preview) opens the selected file in another application of the suite; saving there replaces the file in the archive (undoable). Save the archive afterwards. With **several files** selected, Open with… offers the applications with tabs – the text editor and the hex editor – which open all of them in one window, each in its own tab (folders cannot be opened this way).

## Saving

- **Save** (`Ctrl+S`) writes the archive in its format: directly into the opened file in Chrome/Edge on the desktop, as a
  download in Firefox and on Android (replace the original file with it).
- **Save as** (`Ctrl+Shift+S`) asks for the file name and the **format** (ZIP, TAR, TAR.GZ, GZ). This converts an archive, for
  example a `.tar.gz` into a `.zip`. A GZ file holds exactly one file.
- **Compression** in the status bar sets the compression of new and changed files: Store, Fastest, Normal, Maximum. Unchanged
  files of an opened ZIP archive are copied as they are, so saving is fast.

## Encrypted ZIP archives

Encrypted files are marked with 🔒 (the tooltip names the method). Previewing, extracting or opening such a file asks for
the password; it is remembered until another archive is opened. Both methods in use are supported: **AES** (WinZip AES,
128/192/256 bit, used by 7-Zip, WinZip and others) and **ZipCrypto** (the old method that Windows can open without extra
software).

- After you entered the password of an archive, files you add or change are encrypted the same way when saving
  (shown as 🔒 in the status bar). Unchanged files are kept as they are.
- **Save as** offers the **encryption** of a ZIP archive: none, AES-256 (recommended) or ZipCrypto (weak; choose it only for
  the Windows Explorer), with the password entered twice. All files that are not encrypted yet are then encrypted;
  files that already were keep their password. Choosing "none" saves new and changed files without encryption.
- File names and the list of files are not encrypted in ZIP archives, only the contents.
- AES-encrypted files saved with version 1.0.0 or earlier of the suite could only be read by the suite itself (other
  programs such as 7-Zip reported a data error after the first few kilobytes). The suite still opens them; once you have
  entered the password, saving the archive encrypts these files again correctly. Archives that other programs encrypted
  were not affected.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select everything in the folder |
| `F2` | Rename |
| `Delete` | Delete |

### Navigation

| Keys | Function |
|---|---|
| `Enter` | Open the folder / preview the file |
| `Backspace` / `Alt+↑` | Parent folder |
| `Esc` | Close the preview |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The toolbar can be scrolled sideways. The list shows name and size; tap a folder to open it and a file to preview it, use the
checkboxes to select.
