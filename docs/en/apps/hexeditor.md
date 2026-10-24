# Hex editor

The hex editor (`hexeditor.html`) shows and edits the bytes of any file: hexadecimal and text view, overwrite and
insert mode, search for byte patterns and text, a data inspector, and undo/redo, with several files in tabs. It handles
files of several hundred megabytes; only the visible rows are drawn.

## Opening, creating and saving

- **Open** (`Ctrl+O`) opens one or more files; you can also drag files onto the window. **New** starts an empty file.
- Every file opens in its own **tab**; a dot (●) on a tab shows unsaved changes. Each tab keeps its own cursor,
  selection, undo history and comparison. Close a tab with × or `Alt+W`; if it has unsaved changes, you are asked first.
  Files opened from other applications (*Open with…*, for example several files of an archive) also open in tabs.
- **Save** (`Ctrl+S`) writes the file: directly into the opened file in Chrome/Edge on the desktop, as a download in
  Firefox and on Android (replace the original file with it). **Save as** saves under a new name.

## The view

Each row shows the offset (hexadecimal), the bytes in hexadecimal and the same bytes as text (`.` for bytes that are
not printable). **Bytes per row** chooses 8, 16 or 32 bytes, or adapts to the window width (Auto).

The highlighted byte is the cursor. `Tab` switches between the hexadecimal and the text column.

## Editing

| Function | Keys |
|---|---|
| Move the cursor | arrow keys, `Page Up`/`Page Down`, `Home`/`End` (row), `Ctrl+Home`/`Ctrl+End` (file) |
| Select | `Shift` + movement keys, or drag with the mouse; `Ctrl+A` selects everything |
| Change a byte | type two hexadecimal digits (hex column) or a character (text column) |
| Overwrite / insert mode | `Insert`, or the mode button |
| Delete bytes | `Delete` (byte under the cursor or selection), `Backspace` (byte before the cursor or selection) |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Copy as hexadecimal | `Ctrl+C` |
| Paste hexadecimal bytes | `Ctrl+V` |

Typing at the end of the file appends bytes. In insert mode, new bytes are inserted before the cursor.

## Search and go to

- **Find** (`Ctrl+F`, 🔍) searches for hexadecimal bytes (for example `DE AD BE EF`) or for text (UTF-8). **Next** and
  **Previous** jump to the next match; the search continues at the other end of the file.
- **Go to** (`Ctrl+G`, ↧) jumps to an offset, decimal (`1024`) or hexadecimal (`0x400`).

## Data inspector

The data inspector interprets the bytes at the cursor: binary, signed and unsigned integers with 8, 16, 32 and 64 bits,
floating point numbers (32 and 64 bit) and the UTF-8 character. **Little endian** switches the byte order.

**Byte value (hex)** writes the bytes you enter at the cursor (for example `FF` or `48 65 6C`). This is the easiest way
to edit on phones and tablets.

## Checksums

**#** shows the checksums of the selection, or of the whole file when nothing is selected: CRC-32, Adler-32, MD5,
SHA-1, SHA-256 and SHA-512 (hexadecimal). ⧉ copies a value, for example to compare it with a published checksum.

## Comparing two files

**⇆** opens a second file and compares it byte by byte with the current one (at the same offsets). Its bytes are shown
in an additional column next to the hexadecimal column (instead of the text column), both scroll together, and
differing bytes are highlighted in both. The bar above the view shows the number of differences; **↑** and **↓** jump
to the previous/next difference. Bytes past the end of the shorter file count as differences. Editing updates the
comparison; **×** (or ⇆ again) ends it.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Alt+W` | Close the file (tab) |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `Ctrl+V` | Copy, paste |
| `Ctrl+A` | Select all |
| `0–9` / `A–F` | Type a hex digit (hex column) |
| `Insert` | Insert / overwrite |
| `Delete` / `Backspace` | Delete bytes |
| `Tab` | Switch between the hex and the text column |

### Navigation

| Keys | Function |
|---|---|
| `Ctrl+F` | Find |
| `Ctrl+G` | Go to offset |
| `←` / `→` / `↑` / `↓` | Move (with Shift: select) |
| `Page Up` / `Page Down` | One page up / down |
| `Home` / `End` | Start / end of the row |
| `Ctrl+Home` / `Ctrl+End` | Start / end of the file |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The rows show 8 bytes, the data inspector is below the bytes. Tap a byte to select it, then enter the new value under
**Byte value (hex)** and tap **Set**.
