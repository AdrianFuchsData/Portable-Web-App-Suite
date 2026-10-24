# Portable Web App Suite – User Guide

The Portable Web App Suite is a collection of applications that run completely in your web browser: no
installation, no server and no internet connection are needed. Every application is a single HTML file
that you can keep on a USB stick, a network drive or your phone.

This guide describes the common functions of all applications; each application has its own guide (see the table
below). The suite is free software under the EUPL-1.2 and comes without warranty (see [Licence](#licence)).

## Starting an application

Open the HTML file of the application (for example `texteditor.html`) in a current version of Chrome,
Edge, Firefox or another Chromium-based browser. On Android, open the file with Chrome or Firefox from a
file manager.

The file `overview.html` contains all applications: open it to start any application in a tab, or to save single
applications as their own files ([Overview](apps/overview.md)).

All applications work offline. Your files and data never leave your device, unless you use a network
function yourself (for example connecting to a server).

### Installed from a web server

Your administrator can also provide the suite on a web server. Open the address in the browser; each application
can then be installed like an app (Chrome/Edge: the install icon in the address bar or *Install app* in the menu;
Android: *Add to home screen*). An installed application opens in its own window and works offline, too: every
application is stored on the device the first time you open it and updated in the background when you are online
(an update is used from the next start on). Open each application once while online if you want to use it offline
later.

In Chrome and Edge on the desktop, installed applications are offered by the operating system for their file types
(*Open with* in the file manager): the file opens in the application and **Save** writes directly into it.

## Applications

| Application | File | Guide |
|---|---|---|
| Overview (all applications) | `overview.html` | [Overview](apps/overview.md) |
| Text editor | `texteditor.html` | [Text editor](apps/texteditor.md) |
| Hex editor | `hexeditor.html` | [Hex editor](apps/hexeditor.md) |
| PDF viewer | `pdfviewer.html` | [PDF viewer](apps/pdfviewer.md) |
| KeePass | `keepass.html` | [KeePass](apps/keepass.md) |
| Archive manager | `archive.html` | [Archive manager](apps/archive.md) |
| Media player | `mediaplayer.html` | [Media player](apps/mediaplayer.md) |
| Image editor | `imageeditor.html` | [Image editor](apps/imageeditor.md) |
| Diagram editor | `diagram.html` | [Diagram editor](apps/diagram.md) |
| Calendar | `calendar.html` | [Calendar](apps/calendar.md) |
| Database tool | `dbtool.html` | [Database tool](apps/dbtool.md) |
| SSH client | `ssh.html` | [SSH client](apps/ssh.md) |
| FTP/SFTP client | `ftp.html` | [FTP/SFTP client](apps/ftp.md) |
| HTTP analyzer | `http.html` | [HTTP analyzer](apps/http.md) |
| Python notebook | `notebook.html` | [Python notebook](apps/notebook.md) |
| Spreadsheet | `spreadsheet.html` | [Spreadsheet](apps/spreadsheet.md) |
| Document | `document.html` | [Document](apps/document.md) |
| Presentation | `presentation.html` | [Presentation](apps/presentation.md) |
| Web slides (reveal.js) | `reveal.html` | [Web slides](apps/reveal.md) |
| Mail | `mail.html` | [Mail](apps/mail.md) |
| Audio editor | `audioeditor.html` | [Audio editor](apps/audioeditor.md) |
| Video editor | `videoeditor.html` | [Video editor](apps/videoeditor.md) |
| Web inspector | `webinspector.html` | [Web inspector](apps/webinspector.md) |
| Barcodes (QR codes and others) | `barcode.html` | [Barcodes](apps/barcode.md) |

## Common functions

Every application has the same header:

| Button | Function |
|---|---|
| ABC / ABC✓ | Spelling: off, or the language that text fields are checked in (only in applications with text, see [Spelling](#spelling)) |
| ⌘ | Command palette: search all actions of the application (also `Ctrl+Shift+P` or `Ctrl+Shift+Space`) |
| ◐ / ☀ / ☾ | Design: automatic (follows the system), light or dark |
| DE / EN | Switches the language between German and English |
| ? | Information about the application and its keyboard shortcuts (also `F1`, or `?` outside of text fields) |
| ☺ | In a focused text field: emoji and symbols (also `Ctrl+.`, see [Emoji and symbols](#emoji-and-symbols)) |

The applications remember the language and the design in your browser.

### Command palette

**⌘** (or `Ctrl+Shift+P` / `Ctrl+Shift+Space`; on a Mac `Cmd` instead of `Ctrl`) lists every action the application offers
at the moment – its buttons and the entries of its menus, including those hidden in side panels on a phone. Type a few
letters of what you are looking for (several words in any order, upper/lower case and accents do not matter), choose
with `↑` `↓` and run it with `Enter` or a click; `Esc` closes the palette. In Firefox, `Ctrl+Shift+P` opens a private
window instead: use `Ctrl+Shift+Space` or ⌘ there.

### Recovering unsaved work

While a document has unsaved changes, the editors keep a recovery copy in the browser (updated about every 15 seconds
and when you switch to another tab or close the window). If the browser or the computer crashes, or a tab is closed
without saving, the application shows **“Unsaved work … was recovered”** the next time you open it: **Restore** brings
the changes back (save them afterwards), **Discard** deletes the copy. Saving or discarding changes deletes the copy as
well.

- The copy stays in the browser profile of the computer; it is not a backup of your file. Clearing the browser data
  deletes it.
- It works in all editors except KeePass: an unlocked password database is never written into browser storage.
- Very large documents (more than 64 MB, e.g. long audio projects) get no copy; for the video editor, media files
  larger than 48 MB in total are not copied (they are opened again with "relink" like a saved project).
- The archive manager never stores passwords; encrypted entries stay encrypted in the copy.

### Recently used files

In Chrome and Edge on a computer, the editors list the files you opened or saved under **🕘 Recent** next to
**Open** (up to ten per application). Choosing one opens it again; the browser may ask once for permission. **Clear
list** forgets them. The list contains references to the files, not copies; a moved or deleted file cannot be opened
from it. Firefox and Android browsers cannot keep such references, so the list is not shown there. The window title
shows the name of the open file.

### Phones and tablets

All applications adapt to narrow screens (below 760 pixels):

- The toolbar is a row of its own below the title. If it is wider than the screen, swipe it sideways to reach the
  further buttons.
- Side panels (folders, connections, sites, layers, formatting …) are hidden and open with ☰ or **Panels** as a drawer
  below the header. Tap the shaded area next to the drawer (or the button again) to close it; choosing an entry that
  opens something (a connection, a request, a table, a slide) closes it as well.
- Lists, editors and views that are side by side on a computer are shown one after another, with back buttons where
  needed (e.g. mail and KeePass).
- Buttons that only make sense with a mouse are hidden; their functions are in the menus or dialogs.

### Keyboard and screen readers

All buttons, tabs and menus can be reached with `Tab` and used with `Enter` or `Space`; the element that has the keyboard
focus is outlined. Buttons that only show a symbol (✕, 🖨, ⏏ …) have a name that screen readers announce (the same text
as the tooltip), and the editing areas of the code editors are labelled. Selected rows and list entries are highlighted
with a light tint, so that links and coloured text on them stay readable. In the text editor, the file tabs can be
focused: `Enter` shows the file, `Delete` closes it. The editing surfaces of the document editor and the spreadsheet
come from a third-party component (Univer) and are less accessible than the rest of the suite.

### Spelling

The applications in which you write text – text editor, Python notebook, mail, document, presentation, web slides,
calendar, KeePass (notes), diagram, image editor (text) and video editor (titles) – can check the spelling. Choose the
language in the **ABC** selector in the header: **English (US)** and **German (Germany)** are built in; **ABC Spelling
off** switches it off (the default). The choice applies to all these applications.

- Unknown words are underlined in red in text fields, text areas and formatted text – in the text editor and the
  notebook in Markdown and plain text completely, in program code only in comments and strings. Words with digits,
  words in capitals (abbreviations), web and e-mail addresses are not checked.
- **Right-click** an underlined word (long press on a phone): the menu shows suggestions – a click replaces the word –,
  **Add to dictionary** (kept in the browser, for all languages) and **Ignore** (until the application is closed).
  **Shift+right click** shows the browser's own menu.
- The document editor shows the unknown words in its **Spelling** panel (`F7`), because its page is drawn as an image.
- **Load dictionary…** in the selector adds a Hunspell dictionary for another language or variant: the `.aff` and the
  `.dic` file together (for example from a LibreOffice installation) or a LibreOffice dictionary extension (`.oxt`,
  e.g. from extensions.libreoffice.org). Loaded dictionaries stay in the browser.
- While the suite checks a field, the browser's own spell checking is off there, so that words are not marked twice.

Chrome and Edge share the setting among all applications opened from files; Firefox keeps it per application file.

### Emoji and symbols

Every text field of the suite – one-line fields, text areas, formatted text and the code editors – can take emoji and
other Unicode characters (arrows, currency signs, mathematical symbols, Greek letters, letters with accents, shapes …).

- **`Ctrl+.`** (or the **☺** button at the right edge of the focused field) opens the picker next to the field (on phones
  at the bottom of the screen). It shows the characters you used last (**🕘**, newest first; shared by the applications
  like the spelling setting), the emoji groups and the symbol groups.
- **Search** while the picker is open: by name or keyword in English or German (`happy`, `Pfeil rechts`, `euro`), by
  code (`:wave:`), by emoticon (`:)`) or by code point (`U+1F60A`, `1F60A`). `Enter` inserts the first result; `↓` moves
  into the characters, the arrow keys move between them, `Enter` or a click inserts and closes the picker,
  **`Shift+Enter`** or **Shift+click** inserts and keeps it open. The selector at the bottom chooses the **skin tone** of
  people and hands. `Esc` closes the picker.
- **Typing in the text** (not in code editors): **`:name:`** becomes the emoji as soon as you type the closing colon
  (`:smile:` → 😄, `:thumbsup:` → 👍; also German codes and keywords such as `:winkende_hand:`), and while you type
  `:wav` a list of matches appears (`↑`/`↓`, `Enter` or `Tab` to take one, `Esc` to close it). A code point such as
  **`U+1F60A`** or **`U1F60A`** followed by a space becomes the character (😊).
- **`Alt+X`** turns the code point before the cursor (e.g. `2192`) into the character (→) and a character back into its
  code point – as in Word; this also works in the code editors.
- **Emoticons** such as `:)`, `;-)` or `<3` become emoji when followed by a space – only if you switch this on (see below),
  because in other contexts they are ordinary text.

**Settings:** in the about dialog (`F1` or **?**) under **⚙ Settings → Emoji and symbols**: **Show the ☺ button in text
fields** (on by default) and **Replace text emoticons such as :) with emoji** (off by default). They are kept in the
browser and apply to all applications (in Firefox per application file) and are part of the exported settings. Password
fields and the terminal of the SSH client never get emoji. How emoji look depends on the fonts of the system; on a
computer without an emoji font they appear as boxes.

### Colours

Wherever an application asks for a colour (image editor, diagram editor, video editor, presentation and web slides,
calendar colours, barcodes, notebook widgets …), the suite's **colour picker** opens: an area for saturation and
brightness, a slider for the hue (and, where the colour may be transparent, one for the opacity), the hexadecimal value and
the R, G, B (and opacity in %) values to type, the previous and the new colour side by side (a click on the previous one
goes back to it), recently used colours and basic colours, and – in Chrome and Edge – **💧** to pick a colour from anywhere
on the screen. The changes show at once; **OK** (or `Enter`) keeps the colour, **Cancel** (or `Esc`, or a click outside)
restores the previous one. With the keyboard, the arrow keys move the point in the area and the sliders (`Shift`: in larger
steps). On phones the picker appears at the bottom of the screen.

The text editor shows a small square in front of every hexadecimal colour in the text (`#6cf`, `#6cff`, `#66ccff`,
`#66ccffff`); a click on it opens the picker and changes the colour in the text (see the text editor).

In the about dialog under **⚙ Settings → Colour picker**, choose **The browser's own** to use the browser's colour dialog
instead (without opacity and recently used colours).

### Undo and redo

All editors can undo and redo changes: with the buttons ↶ and ↷ in the toolbar (also on phones and tablets) or with
`Ctrl+Z` (undo) and `Ctrl+Y` or `Ctrl+Shift+Z` (redo); on a Mac `Cmd` instead of `Ctrl`. While you type in a text
field, the keys undo the typing in that field. The history is kept until you open another file or close the
application; saving does not clear it.

### Open with…

Files inside an application – a file in an archive, on an FTP/SFTP server or in the SSH file panel, a KeePass or e-mail
attachment, a file of the Python notebook – can be opened in another application with **Open with…** (↗). Choose the
application; it opens in a new tab (when started from the overview) or a new window. **Save** in that application
writes the file back to where it came from (archive, server, database, …); save the archive or database afterwards to
keep the change. E-mail attachments of received messages open as a copy. Several files selected in the archive manager or the
FTP/SFTP client open together in the text editor or the hex editor, each in its own tab of one window.

For applications started as separate files, keep the HTML files **in one folder with their original names**
(`texteditor.html`, `archive.html`, …), so that one application can find the other.

### Diagrams in presentations, documents and spreadsheets

The presentation editor, the web slides, the document editor and the spreadsheet can contain diagrams of the diagram editor:
**📐 Diagram** opens an empty diagram in the diagram editor, and every **Save** there puts it into the presentation, document or
workbook as a picture (the first save inserts it, later saves update it). **📐 Edit diagram** (or a double-click in the
presentation) opens a diagram picture in the diagram editor again. The diagram travels inside the picture – a PNG that also
contains the draw.io file, like draw.io's "editable PNG" – so it stays editable in the saved `.pptx`, `.docx` and `.xlsx`
files, while PowerPoint, Word and Excel simply show the picture. Diagram pictures made with draw.io can be edited the same way.
As with *Open with…*, the diagram editor must be in the same folder, or the application must be started from the overview.

## Opening and saving files

You can open files with the open button of an application or by dragging them onto the application window.

How files are saved depends on the browser:

- **Chrome, Edge and other Chromium-based browsers on the desktop:** changes are saved directly to the
  opened file. When you save a file for the first time, the browser asks for permission to change it.
- **Firefox and browsers on Android:** browsers cannot write to opened files. Saving creates a download.
  **Replace the original file with the downloaded one**, otherwise your changes are lost. The application
  reminds you of this after every download.

When you close an application with unsaved changes, the browser asks whether you really want to leave.

## Application data: settings, connections and passwords

Some applications store settings, connections or passwords, for example server connections of the SSH client.
This data is kept in a file that **you** choose, never in the browser. One file can hold the data of several
applications.

You can choose between two formats:

| Format | Protection | Use |
|---|---|---|
| JSON file (`.json`) | **not encrypted** | for settings without passwords, or on a protected drive |
| KeePass database (`.kdbx`) | encrypted with your password and/or key file | recommended for connections and passwords |

You can also use your existing KeePass database. The applications store their data in the group
**Portable Web App Suite**, with one subgroup per application, and leave all other entries untouched.
Connections are normal KeePass entries (title, user name, password, URL), so you can also see and edit them in
KeePassXC, KeePass 2, KeePassDX or Strongbox.

> **Warning:** Keep a backup of your KeePass database and your key file. Without the password or the key
> file, the data cannot be recovered.

### Moving your settings

Preferences such as the theme, the language, the text editor's font size or the diagram libraries are kept in the
browser. To take them to another computer or browser, open the about dialog (`F1` or **?**), expand **⚙ Settings** and
choose **Export…**: this saves `suite-settings.json`. **Import…** in any application reads such a file and offers to
reload the application, so that the settings take effect.

The connection files of the applications with connections (database tool, SSH, FTP, mail, HTTP) also carry these
preferences – the JSON file and the KeePass database alike. When you open a connection file whose preferences differ
from the current ones, a bar offers **Apply settings**. One KeePass database can so hold the connections, passwords and
preferences of the whole suite.

Chrome and Edge share the preferences of all applications opened from files; Firefox keeps them per application file.
There, export and import in each application whose settings you want to move.

## Network functions and the relay

Browsers cannot connect directly to mail, SSH, SFTP, FTP or database servers. The applications that need
such connections use the **relay**: a small program that you start on your computer. The relay is optional;
all other functions work without it.

Start the relay with Python or PowerShell (no installation or administrator rights needed):

```sh
python3 relay.py
```

```sh
powershell -ExecutionPolicy Bypass -File relay.ps1
```

The relay shows its address (usually `127.0.0.1:8765`) and a **token**. Enter both in the relay settings
of the application (sign-in “Token”). The relay only accepts connections from your own computer and only with this
token.

**A shared relay.** Your organisation can also run the relay on a server, for example behind its web server at
`https://relay.example.org/relay`. Then enter that address, choose the sign-in **User name and password** and enter
your relay account (the administrator creates it). If the server checks a client certificate or a company sign-in
itself, choose **Reverse proxy / client certificate**. **Test** checks the address and the sign-in. Addresses of
other computers must use `https`; an unencrypted `http` address only works if you allow it explicitly (trusted
networks only).

Details are in [`relay/README.md`](../../relay/README.md) and the [technical documentation](technical-documentation.md).

## Python notebook

The Python notebook (`notebook.html`) runs Python with pandas, numpy, matplotlib and other libraries completely in the
browser, with Jupyter notebooks (`.ipynb`) and a console. See [Python notebook](apps/notebook.md).

## Licence

Copyright © 2026 Adrian Fuchs. The suite is licensed under the **EUPL-1.2** (European Union Public Licence): you may use,
copy, change and pass it on – also commercially –, under the conditions of the licence. It comes **without warranty**:
check results that matter and keep backups of your files.

The about dialog of every application (`F1` or **?**) shows under **⚖ Licence** the licence text (English or German),
the licence notice and all third-party components that the application contains, with their licences.

A **modified version** must say so visibly: its about dialog then shows **Modified version** with the name of the
modifier and the date, and its title is marked *(modified version)*. If you see this mark, the application was not
published by the author of the suite – trust it only if you trust the one who changed it. The original is available at
https://software.adrianfuchs.at/local-tools/portable-web-app-suite/.
