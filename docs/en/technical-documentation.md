# Portable Web App Suite – Technical Documentation

This document describes the architecture, the shared modules, the build and the tests of the Portable Web App
Suite. For end-user instructions see the [user guide](user-guide.md). Planning documents (feasibility study,
decision log, spike results) are in `docs/planning/` (English only).

## Principles

- **One file per application:** every application is a single HTML file with all code, styles, libraries and
  WebAssembly modules. It runs from `file://` without a server and without an internet connection.
- **No node/npm:** the sources are plain JavaScript. A Python script (`build.py`, standard library only)
  bundles them. Third-party libraries are vendored in `vendor/`.
- **No secrets in browser storage:** all `file://` pages share one storage area (Chromium and Firefox), so
  application data (connections, credentials) is kept in user files (JSON or KeePass). Browser storage only holds
  preferences (language, theme, app settings, spelling language and personal words), recently used file handles,
  recovery copies of unsaved work (never of an unlocked KeePass database) and dictionaries loaded by the user.
- **Offline by default:** a Content Security Policy in every page forbids network connections, unless the
  application has network functions.
- **Inputs and re-renders:** Preact sets `value` on every render when it differs from the DOM. Inputs that commit only on
  `change`, `blur` or Enter (renaming, tags, names) therefore use `defaultValue` (with a `key` that changes with the model value),
  otherwise a re-render in between (a timer, a hover) would replace half-typed text.

## Repository layout

| Path | Content |
|---|---|
| `apps/<app>/src/` | Sources of an application (`index.html`, `js/`, styles) |
| `shared/js/`, `shared/css/` | Modules and styles used by all applications |
| `vendor/` | Third-party libraries, ES-module sets (`esm/`), WebAssembly engines (`wasm/`), Pyodide (`pyodide/`) |
| `engines/` | Sources of own WebAssembly engines (SSH/SFTP in Go) |
| `relay/` | Relay implementations (Python, PowerShell) |
| `prototypes/` | Prototypes from the spikes |
| `testbeds/` | Pages that only exist for tests |
| `tools/` | Vendoring, engine build, PWA and documentation tools |
| `tests/` | pytest + Playwright tests |
| `docs/` | Documentation (Markdown, Confluence storage format, planning) |
| `build.py` | Builds every `apps/*`, `prototypes/*` and `testbeds/*` into `dist/<name>.html` |
| `LICENSE`, `LICENSE-de.txt`, `NOTICE.md` | EUPL-1.2 (English, German) and the licensor's notice; a file `MODIFIED` marks a modified version |

## Build

```sh
python3 build.py                 # all applications, prototypes and testbeds
python3 build.py apps/texteditor # one directory
python3 build.py --check         # fails if a built file is out of date
```

`build.py` replaces in `src/index.html`:

| Source | Result |
|---|---|
| `<link rel="stylesheet" href>` | inline `<style>` |
| `<script src>` / `<script type="module" src>` | inline script |
| `<script type="importmap" data-src="a.json b.json">` | ES modules as text; a small script creates Blob URLs and the import map before any module runs |
| `<script type="application/octet-stream" id data-src>` | binary file, gzip + base64 (`shared/js/embed.js` unpacks it) |
| `<script type="application/octet-stream" data-bundle="bundle.json">` | all files of a bundle (used for Pyodide and for the apps in the overview, which is built last) |
| `<script type="text/plain" id data-src>` | text, e.g. worker code |
| `</head>` (every page) | `#suite-about` (copyright, licence, source URL, version, the line of `MODIFIED`) and `#suite-licenses` (see *Licences*) |

The build is reproducible: the same sources give a byte-identical file.

### Licences

Before inlining, `build.py` inserts two elements into every page. `#suite-about` (JSON) is read at once by the shell: the
about dialog shows copyright, licence and source URL, and when the first line of the file `MODIFIED` (or of
`$SUITE_MODIFIED_FILE`) is present, the dialog starts with "Modified version: …", the header shows a badge and the window
title ends with "(modified version)" – the visible notice that `NOTICE.md` asks of modified versions. `#suite-licenses`
(gzip + base64 JSON, decoded with `DecompressionStream` when the licence section is opened) holds the EUPL in English and
German, the two halves of `NOTICE.md` and the third-party components of the page with their licence texts (deduplicated by
hash): the packages of the `vendor/esm/*/lock.json` files that the page's import maps use, the Python packages of
`vendor/pyodide/licenses.json` (texts read from the wheels) and the entries of `vendor/components.json` whose path prefix
the page references (classic builds, engines, fonts, code bundled in other packages; `extends` adds texts to a lock-file
component); missing texts come from `vendor/licenses/spdx/`. The overview lists the components of all apps it embeds.
Tests: `tests/apps/test_licence.py` (licence, notice and components with texts in English and German, only the components of
an app, the marks of a build with `MODIFIED`).

Embedded modules get `blob:` URLs, against which relative specifiers cannot be resolved. An application's own modules
therefore import each other with bare specifiers (`@app/doc.js`) that the application's `js/importmap.json` maps to the files; this
works the same in the source tree and in the built file.

### Hosted PWA variant

`python3 tools/build_pwa.py [dir]` (default `build/pwa`, git-ignored) turns the built apps into a web site that can be
installed: each `<app>.html` gets a `<link rel="manifest">`, the registration of `sw.js` (only on http/https) and a CSP
extended by `manifest-src 'self'` and `'self'` in `worker-src`/`img-src`; next to it `<app>.webmanifest` (id/start URL
`./<app>.html`, standalone, the favicon as `icons/<app>.svg`, `file_handlers` with the extensions of the app from the app
list in `shared/js/bridge.js`) and `index.html` forwarding to the overview. The service worker uses one cache: the overview,
manifests and icons are added on installation, every other file on its first load; requests are answered from the cache
and refreshed in the background (stale-while-revalidate, query strings ignored). Files opened through a file handler
arrive at `window.launchQueue`; `Suite.bridge.receive` passes the first one with its real `FileSystemFileHandle` to the
app (so saving writes back). Serve `.webmanifest` as `application/manifest+json`. Test: `tests/apps/test_pwa.py` (output,
offline reload and the forwarding index in Chromium, the launch queue with a stub).

### Releases and the public repository

A release sets `VERSION` (shown in the about dialogs), rebuilds `dist/` and the documentation, writes `dist/SHA256SUMS`
(checksums of the built apps, so that users can check that they run an unmodified build) and is tagged `v<version>`.
`python3 tools/publish_release.py v<version> [directory]` then mirrors the tag into the public repository (default
`../portable-web-app-suite-public`): one commit and one annotated tag per release, as "Adrian Fuchs
<github@adrianfuchs.at>", with the tracked files of the tag (`git archive`) but without `dist/` (the built apps and
`SHA256SUMS` are attached to the GitHub release instead). The development history is not published. Before committing,
the tool refuses files with private information: e-mail addresses other than example domains and the public address
(outside `vendor/`), private keys, access tokens, local home paths.

### Platform restrictions of `file://`

- External module scripts are blocked; modules are therefore embedded and loaded from Blob URLs.
- Workers cannot load ES modules (no module workers from Blob URLs in Chromium, no `import()` or
  `importScripts()` of Blob URLs in workers). Worker code is one classic script.
- No `SharedArrayBuffer` (no cross-origin isolation): only single-threaded WebAssembly.
- File System Access API only in Chromium on the desktop; elsewhere files are downloaded.

## Vendored libraries

- Classic browser builds are downloaded with `curl` (see `vendor/README.md`).
- ES-module packages are vendored with `tools/vendor_esm.py <manifest>` from jsDelivr's `+esm` endpoint:
  one version per package, imports rewritten to bare specifiers, license texts and versions recorded,
  optional stub modules for excluded lazily loaded modules.
- Pyodide and Python packages: `tools/vendor_pyodide.py vendor/pyodide.json` (SHA-256 checked).
- The SSH/SFTP engine: `tools/build_engine_ssh.py` (needs Go; the result is committed).

## Shared modules

The shared modules in the first table are classic scripts that extend the global `Suite` object; the second table lists
ES modules that applications import through their import maps.

| Module | Global | Purpose |
|---|---|---|
| `i18n.js` | `Suite.i18n`, `Suite.t`, `Suite.LocalizedError` | English/German strings with placeholders (`{0}`), language detection and switching, localized errors |
| `files.js` | `Suite.files` | Open (File System Access API or file input), drag & drop, save (write back or download with hint), save as, recently used files |
| `kdbx.js` | `Suite.kdbx` | KeePass databases with kdbxweb and hash-wasm Argon2: open, create (KDBX 4, Argon2id), groups by path, entries, protected fields, attachments, group create/move/delete, recycle bin, entry history, master key change, verified saving |
| `ical.js` | `Suite.ical` | iCalendar: tolerant parsing and folding/serialising (unknown properties and components kept), events, time zones (TZID via `Intl`, Windows zone names, generated `VTIMEZONE`), RRULE expansion with EXDATE and RECURRENCE-ID overrides |
| `history.js` | `Suite.UndoHistory` | Undo/redo history of snapshots (custom clone function, merging of steps with the same key within a second, size limit) and the common shortcut check `UndoHistory.key(event)` (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z`; not while a text field has the focus) |
| `bridge.js` | `Suite.bridge` | “Open with…” between apps: app registry (ids, names, extensions), app chooser dialog, `openIn`/`openWith` (source) and `receive` (target) with a file-handle stand-in that saves back through a `MessagePort`; detects the overview (`hub()`) |
| `appdata.js` | `Suite.appdata` | UI for the application data file of apps with connections: in-memory store until the user opens or saves a JSON/KeePass file (`settings.js`), password dialog, relay settings shared by all apps (app `suite`), components `Bar`, `Dialog`, `RelayFields` |
| `settings.js` | `Suite.settings` | Application data store in a JSON file or a KeePass database (group `Portable Web App Suite/<app>`) |
| `shell.js` | `Suite.shell` | Common frame with Preact + htm: header, language and theme switch, about dialog, toasts, banner, confirm dialog, unsaved-changes warning |
| `embed.js` | `Suite.embed` | Access to embedded binaries and worker code |
| `relay.js` | `Suite.relay` | Client of the relay (TCP over WebSocket, STARTTLS, HTTP proxy) |
| `ssh.js` | `Suite.ssh` | SSH/SFTP engine (WebAssembly) on top of the relay |
| `python-kernel.js`, `python-worker.js` | `Suite.python` | Python kernel (Pyodide in a worker) for the notebook |
| `univer-xlsx.js`, `univer-docx.js`, `docx-import.js` | | Spreadsheet and document import/export for Univer |
| `pptx-import.js`, `pptx-export.js`, `slide-render.js` | | Presentation model, PPTX import/export, rendering |
| `autosave.js` | `Suite.autosave` | Recovery copies of unsaved work in IndexedDB (see *Recovery copies*) |

| ES module | Purpose |
|---|---|
| `spell.js`, `spell-dom.js`, `cm-spell.js` | Spell checking: Hunspell service, marks and menu in text fields and contenteditable elements, header selector; CodeMirror extension (see *Spell checking*) |
| `odt.js`, `doc-toc.js`, `doc-html.js` | Document editor: OpenDocument text, table of contents, HTML rendering for printing and saving |
| `deck-convert.js` | Conversion between PowerPoint decks and web slides |
| `python-widgets.py` | Interactive widgets of the notebook (installed as the Python module `ipywidgets`) |

Script order in an application: `vendor/htm-preact-standalone.umd.js`, `vendor/kdbxweb.min.js`,
`vendor/hash-wasm-argon2.umd.min.js`, then `i18n.js`, `files.js`, `kdbx.js`, `settings.js`, `shell.js`, then the
application's own scripts.

### Spell checking

`shared/js/spell.js` wraps hunspell-asm (Hunspell compiled to WebAssembly; the apps' CSP allows `'wasm-unsafe-eval'` and
`connect-src data:`). Dictionaries are converted to UTF-8 before Hunspell reads them (decoded in the character set of the `SET`
line, `SET UTF-8` written), so words go in and come out as JavaScript strings for every dictionary. The service `spell` holds the
suite-wide setting (`suite.spell.enabled`, `suite.spell.language` – default from the UI language), the built-in dictionaries
(embedded as `#dict-en_US-aff/-dic`, `#dict-de_DE-aff/-dic`, gzip, read with `Suite.embed.bytes` only when checking starts), user
dictionaries (IndexedDB `suite-dictionaries`; `.aff`+`.dic` pairs or the `dictionaries/` of an `.oxt`, without `hyph_`/`th_`
files), personal words (`suite.spell.words`, added to every checker) and ignored words (session); `words()` drops chunks with
digits, `_`, `@`, `/`, `://`, single letters and all-caps words; `onChange` informs the views, also about changes in other tabs
(`storage` event).

`shared/js/spell-dom.js` (imported by the eleven apps with prose; calendar and KeePass load it as a module script) adds the
selector to the header (`Suite.shell.addHeaderItem`) and marks unknown words with one CSS Custom Highlight (`suite-spell`):
in contenteditable elements on their text nodes (not in `code`, `pre`, links); for `<textarea>` and `<input data-spell>` on a
mirror – a fixed, transparent copy of the field with the same box, font and scroll position in a layer above the page, shown
only while a point of the field is the top-most element (`elementFromPoint`), so that dialogs and drawers covering it hide its
marks. Fields with `spellcheck="false"` (code, addresses), read-only and non-text inputs and CodeMirror editors are left out;
in checked fields the browser's checking is switched off (`spellcheck="false"`, restored when spelling is off). Updates run in
`requestAnimationFrame` after input, scrolling, resizing and DOM mutations. The context menu (`contextmenu` in the capture
phase, not with Shift) finds the word at the caret (fields) or at `caretPositionFromPoint`/`caretRangeFromPoint`
(contenteditable) and replaces through `execCommand('insertText')`, which keeps the undo history and fires `input`.
`shared/js/cm-spell.js` is the CodeMirror counterpart: a view plugin builds mark decorations (`cm-spell-error`) for the visible
ranges – in "prose" mode everything except Markdown code, URLs and HTML, in "code" mode only syntax nodes named `*Comment*`,
`*String*`, `*Docstring*` – and handles the context menu; the text editor chooses the mode from the document's language, the
notebook from the cell type. The document editor keeps its panel (canvas). Tests: `tests/apps/test_spelling.py` (German
compounds and suggestions in the text editor, personal words, code mode, textarea mirror and contenteditable in mail with
menu, ignore and Shift, the setting shared between apps, an `.oxt` in ISO-8859-1 from the header, the menu on a phone),
spelling cells in `test_notebook.py`, the panel in `test_document.py`.

### Undo and redo

Every editor has undo/redo with toolbar buttons (`data-testid` `undo`/`redo`, needed on touch devices) and the
shortcuts of `Suite.UndoHistory.key`. Text fields keep the browser's own undo. Strategies:

| Application | Undo |
|---|---|
| Text editor, SQL/body editors, notebook cell text | CodeMirror history per document/editor (`@codemirror/commands` `undo`/`redo`) |
| Spreadsheet, document | Univer's command history (toolbar buttons of Univer) |
| Archive manager | snapshots of the entry list (entries copied shallowly; their `load()` closures keep the data) |
| KeePass | `Database.snapshot()`/`restore()` in `kdbx.js`: deep copy of the group tree with kdbxweb's `copyFrom` (protected values stay encrypted in memory), deleted objects and metadata; a snapshot is taken after every change and the previous one goes to the history; locking clears it |
| Calendar | snapshots of the events, name, color and `VCALENDAR` of all open calendars (opening/closing files is not a step) |
| Notebook | cell list snapshots referring to the cell objects (editors are kept); outputs are only restored for clearing outputs and type changes |
| Database tool | SQLite: exported database file before every change (`driver.restore()`), up to 20 steps and 32 MiB; Postgres: inverse statements for grid edits |
| HTTP analyzer | snapshots of the collection after every change; typing in one field (by input event target) within a second is merged |
| Hex, image, diagram, presentation, audio, video editors | own snapshot histories (see the sections of the applications) |

### App bridge (“Open with…”)

`shared/js/bridge.js` passes a file from a source app to a target app and saves it back:

1. The source calls `Suite.bridge.openWith(name, { data, save, source, exclude })` from a click. The chooser lists the
   apps registered for the extension (`APPS`; the hex editor opens anything).
2. **Standalone:** the source opens `new URL('<app>.html', location.href)` with `window.open` (synchronously, for popup
   blockers). The target calls `Suite.bridge.receive(onOpen)` at start and posts `{ suite: 'suite-bridge', type: 'ready' }`
   to its opener; the source answers with `{ type: 'open', name, fileType, bytes, writable, source }` and, for writable
   files, transfers one end of a `MessageChannel`. **In the overview** (window name `suite-hub-app`), the source sends
   `{ type: 'open-in', app, … }` to the overview instead, which opens a tab and forwards file and port when the tab is
   ready.
3. The target gets `{ file, handle }`. The handle (`bridged: true`) implements `getFile`, `queryPermission`,
   `requestPermission` and `createWritable`; `Suite.files.save()` writes through it, which sends
   `{ type: 'save', id, bytes }` over the port. The source's `save(bytes)` callback writes the data back (archive entry,
   SFTP/FTP upload, KeePass attachment, Pyodide file) and answers `saved` or `error`. Read-only copies (received mail
   attachments) have no handle, so saving downloads.

Sources: archive manager, FTP/SFTP client, SSH file panel, KeePass attachments, mail attachments, notebook files, the
overview. Targets: every app that opens files.

### Application data format

JSON:

```json
{ "format": "portable-web-app-suite", "version": 1,
  "apps": { "sftp": { "settings": {}, "connections": [ { "id": "…", "name": "Server", "url": "sftp://host" } ] } } }
```

KeePass: group `Portable Web App Suite/<app>`. The settings are the attachment `settings.json` of the entry
`Settings`. Every connection is an entry with the custom field `SuiteId`; `name`, `username`, `password`, `url`
and `notes` are stored in the standard fields, other properties as custom fields (text as it is, other values as JSON); `password`,
`privateKey`, `passphrase`, `token`, `secret` and `apiKey` are protected.

The app `suite` holds what all apps share: `settings.relay` and `settings.preferences`, the localStorage entries of the
suite (keys `suite.*` and `<app>.prefs`, without `suite.mediaplayer.resume`) as strings. `Suite.preferences` (end of
`shared/js/shell.js`) collects and applies them; the about dialog exports them as a JSON file in this format
(`suite-settings.json`, only `apps.suite.settings.preferences`) and imports the same part of any JSON app data file, then
asks to reload. `Suite.appdata` writes the current preferences into every connection file it saves and, when a file
with different preferences is opened, shows a banner to apply them. Test: `tests/apps/test_preferences.py`.

## Applications

### Text editor (`apps/texteditor`)

| File | Content |
|---|---|
| `js/encoding.js` | `TE.encoding`: detection (BOM, valid UTF-8, UTF-16 without BOM by zero bytes, else Windows-1252) and encoding of UTF-8 (± BOM), UTF-16 LE/BE (± BOM), Windows-1252; line endings LF/CRLF/CR. The editor works with `\n` internally and converts when saving. |
| `js/languages.js` | Module `app/languages`: language by file name/extension, CodeMirror language support (lang-* packages and legacy modes). |
| split view | A second `EditorView` with its own state on the same document: both views get a custom `dispatch` that forwards document changes to the other one, marked with an `Annotation` so they are not echoed back (with the original user event, so the main view's history groups them). Only the main view keeps the history; the second view maps undo/redo to it. |
| find in files | `runFind()` searches the `EditorState` documents of all tabs, or – with a `FileSystemDirectoryHandle` from `showDirectoryPicker` – the files of a folder (async generator, debounced input, a newer search cancels an older one); matches keep their document offsets so that a click selects them. |
| `@codemirror/merge` | Comparing: `MergeView` (two editors; the left one read-only, `revertControls: "a-to-b"`) or, below 760 px, `unifiedMergeView` in one editor; `getChunks` counts the differences, `goToNextChunk`/`goToPreviousChunk` navigate. The result replaces the document in one transaction when the comparison ends. |
| `js/tools.js` | Module `app/tools`: text tools as pure string functions (`apply(id, text)`); line tools sort with `Intl.Collator` (numeric, base sensitivity, stable), XML is re-indented from a `DOMParser` tree. `main.js` applies a tool to the selection (extended to whole lines for line tools) or the document as one transaction (`userEvent: input.tool`). |
| `js/main.js` | One CodeMirror `EditorView`; every tab keeps its own `EditorState` (undo history, selection), swapped with `setState`. Settings (wrap, whitespace, font size, dark theme) are compartments that are reconfigured when switching tabs. Toolbar, tabs and status bar are Preact components in the shared shell. |

Multiple cursors use CodeMirror's built-in support (`allowMultipleSelections`, `Ctrl+click`, rectangular selection
with `Alt+drag`, `selectNextOccurrence`). A document counts as changed if its text differs from the last saved text
(`Text.eq`). View preferences are stored in `localStorage` (`texteditor.prefs`); file contents never are.

Tests: `tests/apps/test_texteditor.py` (languages, encoding round trips, conversion, tabs, search/replace, go to
line, multiple cursors, preferences, German interface, phone layout, write-back with the File System Access API, text
tools on the document and the selection, encoders/formatters, invalid input, comparing with an open document and a file, split view (changes both ways, shared undo, following the tab), find in open files (case, regular expressions, errors) and in a folder (OPFS
directory standing in for the picker; `.git` and binary files skipped)).

### Hex editor (`apps/hexeditor`)

| File | Content |
|---|---|
| `js/buffer.js` | `HE.ByteBuffer`: bytes in a growable `Uint8Array` with the operations replace, insert and remove; every operation returns its inverse, which gives undo/redo (the two nibbles of a typed byte are one undo step). `find()` searches forwards/backwards, `HE.parseHex()` parses hexadecimal input, `HE.inspect()` interprets bytes for the data inspector (`DataView`, `BigInt`). |
| `js/checksum.js` | `HE.checksums()`: CRC-32 and Adler-32 (tables/loops), MD5 (RFC 1321, WebCrypto has none) and SHA-1/256/512 via `crypto.subtle.digest`; `HE.differences()` counts differing bytes of two arrays. |
| `js/main.js` | UI in the shared shell: virtualized view (only visible rows plus a margin are rendered into an absolutely positioned spacer; row height 22 px), keyboard and pointer handling, search bar, go-to bar, inspector, status bar, checksum dialog, comparison (second column rendered per visible row, so scrolling is shared; the difference count is recomputed when the buffer version changes, next/previous difference scans from the cursor). |

The whole file is kept in memory; files above 256 MiB trigger a warning. Bytes per row default to 8 (narrow screens),
16 or 32 (wide screens). Preferences (bytes per row, byte order) are stored in `localStorage` (`hexeditor.prefs`).

Tests: `tests/apps/test_hexeditor.py` (overwrite, ASCII input, appending, insert, delete, undo/redo, search, go to,
inspector, saving, 16 MiB file, mouse selection and copy, German interface, phone editing via the inspector,
write-back, checksums against Python's `hashlib`/`zlib` incl. MD5 padding edge cases, comparison with navigation and
recount after editing).

### PDF viewer (`apps/pdfviewer`)

Signatures (`js/signatures.js`, no libraries): `findSignatures` scans the raw bytes for `/ByteRange [0 a b c]`; `/Contents` is the
hex string in the gap between the two ranges, the other keys (`/Name`, `/M`, `/Reason`, `/Location`, `/SubFilter`) are read from the
dictionary text around it. A small DER reader parses the CMS SignedData: the signer certificate (issuer + serial or the first one), the
digest algorithm, the signed attributes (`messageDigest`, `signingTime`) and the signature. Integrity = SHA digest of both ranges equals
`messageDigest`; signature = `crypto.subtle.verify` over the signed attributes re-tagged as SET (RSASSA-PKCS1-v1_5, RSA-PSS with the
hash and salt from its parameters, ECDSA with the DER signature converted to r‖s; RSA keys are re-wrapped as `rsaEncryption` SPKI).
Bytes after the last range mean changes after signing. The certificate chain inside the signature is verified link by link; trust
is not decided (no root store offline).

PDF.js (`pdfjs-dist`, Apache-2.0) is vendored with `tools/vendor_pdfjs.py <version>` into `vendor/pdfjs/`:

| File | Use |
|---|---|
| `pdf.min.mjs`, `pdf_viewer.mjs` | ES modules (import map `pdfjs-dist`, `pdfjs-dist/web/pdf_viewer`); the viewer components read the library from `globalThis.pdfjsLib`, so `main.js` sets it before importing them |
| `pdf.worker.classic.js` | the worker converted to a classic script (`export` removed, `import.meta.url` replaced) and started from a Blob URL (`GlobalWorkerOptions.workerPort`) |
| `pdf_viewer.css` | viewer styles with the referenced images inlined as `data:` URLs |
| `cmaps/`, `standard_fonts/`, `wasm/` | embedded with `data-bundle`; an own `BinaryDataFactory` (`useWorkerFetch: false`) serves them from the bundle instead of fetching URLs |

`getDocument` runs with `isEvalSupported: false` (no `eval` under the CSP) and `useSystemFonts: false` (the system font
path would load the standard fonts by URL). The `PDFViewer` container is created once outside Preact and attached to
the layout (it must be absolutely positioned and survive re-renders). Thumbnails are rendered lazily with an
`IntersectionObserver`. Saving uses `saveDocument()` when form data or annotations exist, otherwise `getData()`.
Printing renders every page into an image in `#pv-print` and calls `window.print()`; a print style sheet hides the app.

Page operations (`js/pages.js`) use pdf-lib 1.17 (MIT, `vendor/esm/pdflib`, imported on first use). Each operation loads
the current bytes (with form data and annotations, `saveDocument()`), changes the document in place (`setRotation`,
`removePage`, `insertPage` of the existing page objects for reordering, `copyPages` from other files), saves it and
reopens the result in the viewer at the affected page; the previous bytes go onto an undo stack (30 steps).
Extracting copies pages into a new document. pdf-lib cannot write encrypted files; such PDFs report an error.
Signing is a page operation too: the signature pad (a 600×200 canvas, pointer strokes or typed text in a script font) is
cropped to its ink and saved as PNG; the click position on the page canvas is converted with the page view's
`viewport.convertToPdfPoint()` and `pages.stamp()` draws the image there (`embedPng`, `drawImage`, 180 pt wide at most).

Tests: `tests/apps/test_pdfviewer.py` with PDFs written by `tests/helpers/office_samples.make_pdf()` (Helvetica text that is
not embedded, outline, internal link, form field; encrypted with pypdf): rendering, text layer, thumbnails, navigation,
outline, links, zoom, rotation, search, form filling and ink annotations checked with pypdf, password, printing, page
operations (move, rotate, delete and undo, append, extract; order, rotation and form checked with pypdf), protected
PDFs, German interface, phone layout, signing (drawn signature as an image XObject, empty pad, cancelled placement).

### KeePass (`apps/keepass`)

The application works directly on the `Suite.kdbx` database object (kdbxweb); `vendor/otpauth.umd.min.js` (otpauth, MIT)
computes TOTP codes from an `otp` field (`otpauth://` URI, KeePassXC convention). `js/generator.js` provides
`KP.generatePassword(options)` (rejection sampling with `crypto.getRandomValues`, at least one character of each selected
class) and `KP.entropy(password)` (character pool estimate).

- Editing: `setFields(entry, values, { history })` pushes the previous state into the entry history only on the first change
  of an editing session (`state.historyPushed`), not on every key press. Protected custom fields are `ProtectedValue`s.
- Deleting entries and groups moves them into the recycle bin (created on demand, `meta.recycleBinUuid`); `groups()` and
  `entries()` of `Suite.kdbx` skip the bin, the UI looks up the selected group including the bin.
- Saving goes through `db.save()` (re-opens the result to verify it) and `Suite.files.save/saveAs`; a new database is
  saved with “save as”. Key files are created with `kdbxweb.Credentials.createRandomKeyFile(2)` (XML key file v2, `.keyx`).
- Auto-lock after 15 minutes without pointer/keyboard activity, skipped while there are unsaved changes; the clipboard is
  cleared 30 seconds after copying.
- Layout: three panes (groups, entries, editor); below 760 px only one pane (`pane-groups|entries|entry`) is visible.

Tests: `tests/apps/test_keepass.py` creates databases with pykeepass and checks every saved file with pykeepass: wrong password,
browsing, search, TOTP code, editing with history, custom and protected fields, tags, groups, moving, history restore, recycle
bin, new database with key file, master key change, generator, attachments, lock and auto-lock (Playwright clock), merging
a copy (synchronized with kdbxweb's `merge`, which requires the same root group UUID) and another database (imported
with `importEntry` into a new group), password report, German interface, phone layout.

### Archive manager (`apps/archive`)

`js/archive.js` (ES module, fflate for deflate/gzip) parses and writes the container formats itself; `js/multi.js` reads the
other formats and writes 7z through libarchive.js 2.0 (libarchive as WebAssembly, `vendor/libarchive`, `tools/vendor_libarchive.py`):

- The worker bundle (classic script after replacing `import.meta.url`; module workers from Blob URLs do not start in `file://`
  pages) and the wasm are embedded by build.py. The worker has its own opaque origin and cannot fetch the page's Blob URLs, so
  the wasm is patched into it as a `data:` URL. Two more patches: a larger output buffer for writing (libarchive.js reserves only
  128 bytes per file, too little for headers) and `printErr` as warning. `Archive.init({ getWorker })` starts it.
- `detectMulti` recognises the formats by magic numbers; `readMulti` extracts all entries at once (`client.extractFiles()`,
  libarchive reads sequentially) and keeps them in memory. libarchive decrypts no 7z/RAR: encrypted ones give
  `ar.encryptedUnsupported`; no entries from xz/bzip2/zstd/lzma data means a single compressed file (`raw` format not enabled).
- `write7z`: libarchive.js has no working "no filter" option, so the 7z stream is written through the gzip filter and unpacked
  with `DecompressionStream`. Entries carry no folder records (folders come from the paths) and no encryption.

- **ZIP reading** starts at the end-of-central-directory record (ZIP64 locator and extra field supported). Entries are listed
  from the central directory without decompressing; `load()` inflates on demand and checks the CRC-32. Names are UTF-8 (flag 11
  or valid UTF-8) or CP437; the Info-ZIP Unicode path (0x7075), extended timestamp (0x5455) and Unix modes are read.
- **ZIP writing** sets the UTF-8 flag and an extended timestamp. Unchanged entries of the opened archive are copied with their
  compressed data (`entry.zip.raw()`); encrypted entries keep their flags, extra fields and data descriptor. New or changed entries
  are deflated with the chosen level (stored when that is not smaller). No ZIP64 writing: more than 4 GiB or 65,535 entries is an error.
- **TAR** reads ustar headers with prefix, pax (`path`, `linkpath`, `mtime`), GNU long names (`L`/`K`) and base-256 sizes, and
  writes ustar plus pax headers for long or non-ASCII names. **GZ** keeps the original file name (`FNAME`).
- 7z, RAR, bzip2 and xz are detected by their signature and reported as unsupported.
- **Encryption** (`js/zipcrypto.js`, synchronous so that `load()` stays synchronous): SHA-1, HMAC-SHA1, PBKDF2 and the AES
  block cipher (T-tables; checked against the FIPS-197 and RFC 6070 test vectors) are implemented in the module, because
  WebCrypto is asynchronous and its AES-CTR counts big-endian while WinZip AES uses Gladman's little-endian counter.
  WinZip AES (method 99, extra field 0x9901): PBKDF2-HMAC-SHA1 with 1000 iterations derives key, HMAC key and the 2-byte
  verifier from password (UTF-8) and salt; data = salt + verifier + AES-CTR data + 10 bytes HMAC-SHA1; AE-2 (no CRC) is
  written with AES-256. ZipCrypto: the 12th header byte checks the password against the CRC (or the DOS time with flag 3).
  `archive.js` keeps the entered passwords (`addPassword`), `locked(entry)` checks them cheaply with the verifier, and
  `write(..., { encryption: { password, method, all } })` encrypts new and changed (with `all` also unchanged
  unencrypted) entries; encrypted unchanged entries are copied raw.

`js/main.js` keeps a flat entry list; folders implied by paths are shown without an entry of their own. Adding content creates
explicit folder entries for its parents. After saving, the written bytes are read again so that the state matches the file.
Extracting several items uses `showDirectoryPicker()` where available, otherwise one ZIP download. Folder drops are read with
`webkitGetAsEntry()`. `main.js` imports `@app/archive.js` (see Build).

Tests: `tests/apps/test_archive.py` creates archives with `zipfile`, `tarfile` and `gzip` (and a ZipCrypto archive written by the
test) and checks every saved file with them: browsing, preview, sorting, adding, folders, renaming, deleting, raw copy of unchanged
entries, compression level, TAR.GZ long/Unicode names and symbolic links, conversion to TAR and ZIP, GZ, ZipCrypto password
prompt and encryption of added files (checked with `zipfile`), AES archives from pyzipper read and written as AES-256 and
ZipCrypto (checked with pyzipper and `zipfile`),
extraction (download, ZIP, folder via OPFS), integrity test (intact archive, stored entry with a changed byte), unsupported formats, drag and drop, German interface, phone layout.

### Media player (`apps/mediaplayer`)

One `<video>` element (created once outside Preact and attached to the stage) plays audio and video from Blob URLs of the
selected files or from stream URLs; the CSP allows `media-src blob: data: http: https:`. No decoder is bundled: the formats are
those of the browser.

- `js/tags.js` reads tags from the first 512 KiB (ID3v2.2–2.4 incl. APIC, FLAC Vorbis comments and PICTURE, Ogg Vorbis/Opus comments,
  RIFF INFO and `id3 ` chunks, MP4 `ilst`) and ID3v1 from the end of the file.
- `js/playlist.js` parses M3U/M3U8 (`#EXTINF`), PLS and XSPF, writes M3U8 and converts SRT to WebVTT (subtitles are attached as
  `<track>` with a Blob URL).
- Playlist entries are matched with the added files by file name (case-insensitive); missing entries wait for a file with that
  name. `.m3u` files have the MIME type `audio/x-mpegurl` and are therefore excluded from the media files explicitly.
- Durations are probed one after another with a hidden `<audio preload=metadata>`.
- Shuffle keeps a random order with the current item first; with repeat “all” a new order is drawn at the end.
- Media Session metadata and action handlers; preferences (volume, mute, speed, shuffle, repeat, playlist visibility) in
  `localStorage` (`suite.mediaplayer`).

Equaliser: a second media element is created on first use and routed through `createMediaElementSource` → ten
`BiquadFilterNode`s (low shelf, eight peaking filters with Q 1.4, high shelf) → optionally a `DynamicsCompressor`
(threshold −24 dB, ratio 4) with make-up gain → destination. Local files play through this element while the equaliser
is on; stream URLs always use the plain element, because routing media without CORS headers through Web Audio
silences it. `useElement()` swaps the elements (keeping volume, speed and position). A–B repeat checks the position
every animation frame; frame steps move by 1/30 s; snapshots draw the video into a canvas. Resume positions (files of
two minutes or more, name and size as key) are kept in `localStorage` (`suite.mediaplayer.resume`, 200 entries).

Tests: `tests/apps/test_mediaplayer.py` with WAV files written by `tests/helpers/media_samples.py` (RIFF INFO and ID3 tags, cover) and a
WebM video made with ffmpeg (skipped without ffmpeg): tags, durations, playback, automatic advance, repeat modes, keyboard,
preferences, playlist import (M3U, PLS, XSPF) and export, missing entries, subtitles, video, unplayable files, shuffle, reordering,
filter, URLs, equaliser (element switch during playback, filter gains, preferences), A–B repeat, resume position, album
view, frame steps and snapshot size, German interface, phone layout.

### Image editor (`apps/imageeditor`)

ES modules: `doc.js` (document model and file formats, imports fflate), `tools.js`, `filters.js`, `guides.js` (rulers, snapping), `main.js` (UI).

- **Document**: every layer is a canvas of the image size with `visible`, `opacity` and `blend` (canvas composite operations);
  compositing draws the layers in order. The selection is a rectangle or ellipse used as clip path; `selectionMask()` gives an alpha
  mask for pixel operations (fill, convolution, auto levels).
- **History**: before a change the affected state is captured (`layer`: a copy of one layer, `props`: layer properties, coalesced while
  a slider is dragged, `doc`: all layers and the size). Undo captures the current state into the redo stack and restores the snapshot.
  The history is limited to 50 steps and 512 MiB.
- **View**: one canvas (outside Preact) sized to the stage in device pixels; zoom and pan are a transform. Painting draws into a stroke
  canvas that is composed with the layer copy into `ed.preview` (uniform opacity within a stroke, eraser as `destination-out`, clipped
  to the selection); the preview replaces the layer while drawing and becomes the layer at the end. Coalesced pointer events and pen
  pressure are used; two touch pointers switch to pinch zoom.
- **Retouching** (`tools.js`): the clone stamp, healing brush and blur/sharpen brush paint soft round dabs (a cached radial-alpha
  mask, every size/4 pixels along the stroke) of a source image into the stroke canvas: the layer copy at the clone offset, or a
  blurred copy (`ctx.filter = blur()`) / an unsharp-masked copy (`x + (x − blur(x))`). Healing replaces the clone at the end of
  the stroke by `clone + blur(layer) − blur(clone)` inside the painted area (`healArea`), so the texture comes from the source and
  the low frequencies (colour, brightness) from the destination. Smudge works on a copy of the layer that is updated dab by dab:
  each dab copies the pixels of the previous position with the opacity as strength.
- **Rulers, guides, grid**: the stage is a grid of two ruler canvases and the canvas box (built outside Preact). Guides
  (`ed.guides`, `{ axis: 'h' | 'v', pos }`) lie on pixel boundaries; dragging from a ruler uses pointer capture on the ruler.
  `guides.js` `snapPoint` snaps to guides, image edges and the nearest grid lines within `snapDistance / zoom`; tools with
  `snaps: true` get snapped coordinates (marked `snappedX/Y`), which the selection tools treat as pixel boundaries instead of
  including the pixel under the pointer. The move tool snaps the moved selection's edges (`snapRect`). Preferences are stored in
  `localStorage` (`suite.imageeditor.view`).
- **Filters**: CSS filters via `ctx.filter` (live preview while the dialog is open), 3×3 convolution and auto levels on `ImageData`.
  Selections are `rect`, `ellipse`, `poly` (lasso; points relative to x/y) or `mask` (magic wand and every combined selection:
  runs of pixels `[dx, dy, length, …]` relative to x/y), so moving a selection only changes x and y and `selectionPath` can
  clip with all of them. Combining (add, subtract, intersect, invert) works on `selectionMask()` and turns the result back
  into runs (`maskSelection`); the marching ants of a mask follow its pixel border (`selectionOutline`, cached per selection).
  The magic wand shares the region search of the fill tool (`regionMask`).
  Levels and curves build 256-entry lookup tables (levels: `outBlack + (outWhite − outBlack) · x^(1/γ)`; curves: monotone cubic
  Hermite interpolation after Fritsch–Carlson, so the curve never overshoots); the RGB table is applied first, then the channel's
  own (`channelLuts`). The preview is the layer with the tables applied, shown through `ed.preview` and recomputed once per frame;
  these dialogs (and the adjustments) do not dim the image.
- **Files**: decoding through `<img>`/Blob URL; encoding with `canvas.toBlob` (PNG, JPEG, WebP), an own 24-bit BMP writer and
  OpenRaster (`mimetype` stored first, `stack.xml` top layer first, `data/*.png`, `mergedimage.png`, thumbnail). PSD with ag-psd
  (`vendor/esm/psd`, MIT, with pako; imported on first use): layers are read bottom-up with their offsets, groups flattened
  (hidden/opacity inherited), layer masks multiplied into the alpha (`defaultColor` outside the mask rectangle); blend mode
  names map to composite operations (`color dodge` ↔ `color-dodge`, `linear dodge` ↔ `lighter`). Writing stores every layer at
  0/0 plus the composite and a thumbnail.
- **Clipboard**: `navigator.clipboard.write/read` with PNG where available, `paste` events with image files, and an internal clipboard as
  fallback.

Tests: `tests/apps/test_imageeditor.py` creates images with Pillow and checks pixels of the composite and the saved files: brush, pencil,
undo/redo, picker, fill, shapes, selection, copy/paste, move, crop, layers with opacity and blend modes, OpenRaster round trip, PSD from psd-tools and back, flip,
rotate, image and canvas size, adjustments with preview, filters, levels (preview, cancel, per channel, undo) and curves (point
added by dragging, monotone result), magic wand with Shift/Alt, invert, intersect, lasso and polygon lasso, JPEG/WebP/BMP/PNG, GIF opening, text, gradient, zoom, German interface, phone layout. Firefox reports integer mouse coordinates, so the tests aim at integer page coordinates inside a pixel.

### Diagram editor (`apps/diagram`)

ES modules: `model.js` (shapes, geometry, routing, text layout, history), `drawio.js` (file formats, uses fflate), `main.js` (UI).

- **Model**: a document has pages with shapes (`type`, `x`, `y`, `w`, `h`, `text`, `style`) and edges (`from`/`to` = `{ id, ax?, ay? }` for
  an attached end, fixed at a relative point when `ax`/`ay` are set, else floating; `{ x, y }` for a free end; `route`; `style`). Floating
  ends meet the shape outline (polygon) on the line towards the other end; orthogonal edges leave at the side facing the other end and get
  one or two bends; curved edges are cubic Béziers along the exit directions. Arrow heads are drawn as paths (no markers), so exports look
  the same everywhere.
- **Shape libraries** (`model.js` `LIBRARIES`, `PRESETS`): every library shape is an own type with an SVG path (`shapePath`) and a
  draw.io style (`drawio.js` `TYPE_STYLE`): core draw.io shapes where they exist (`folder`, `component`, `doubleEllipse`, `swimlane`,
  `mxgraph.networks.*` stencils), otherwise a core shape plus the key `dgType` (draw.io keeps unknown keys), e.g. the gateway as
  `rhombus`. Classes and entities are one cell with an HTML label (bold title, `<hr>`, lines; `--` lines become further `<hr>`),
  as draw.io's own class shape. Crow's foot and hollow arrow heads map to `ERmandOne`… and `block`/`diamond` with `endFill=0`; hollow
  heads are filled with white so the line does not show through.
- **Rendering**: Preact renders SVG; the same `PageContent` component renders into a detached element for the SVG export. Text is wrapped
  with canvas `measureText` and drawn as `<tspan>` lines (no `foreignObject`, which would taint the canvas of the PNG export).
- **Interaction**: one pointer handler on the SVG with pointer capture (double-clicks are hit-tested with `elementsFromPoint`), drag modes
  for move, resize, band selection, connect and end re-attachment, grid snapping, two-finger pinch. Connection ports are drawn below the
  end handles of a selected edge (an attached end lies on a port).
- **draw.io**: `<mxfile>` with one `<diagram>` per page; compressed diagrams (Base64, raw deflate, URI encoding) are read. Layer cells
  (children of the root) become `page.layers` (`visible="0"`, `locked=1`); a shape or edge gets the id of its layer and of its outermost
  `group` ancestor (`group`, absolute geometry: child geometry is relative to the parent); `locked=1` sets `locked`. Writing creates the
  layer cells and one `group` cell per group (bounding box of the members, members relative to it). The model functions `layersOf`,
  `layerOf`, `isShown`, `isSelectable` and `inLayerOrder` decide drawing order, visibility and what clicks, the selection frame and
  `Ctrl+A` may select; new objects get the active layer in `changed()`, pasted groups get new ids. `UserObject` labels, HTML labels (converted to text), edge label cells, `exitX/entryX`
  anchors and the usual shape styles are mapped. Style keys the editor does not use are stored in `extra` and written back. The clipboard
  holds an `<mxGraphModel>` like draw.io's. SVG exports carry the file in the `content` attribute, PNG exports in a `tEXt` chunk `mxfile`.
- **Excalidraw**: rectangles, ellipses, diamonds, text (also inside containers), arrows/lines with bindings, images from `files`.
- **History**: `structuredClone` snapshots of the document (100 steps), coalesced for quick property changes and nudging.
- **Automatic layout** (`js/layout.js`): a small layered layout like Graphviz `dot`: cycles broken by reversing back edges
  (depth-first search), ranks by longest path, eight barycenter sweeps to reduce crossings, ranks as rows or columns with the
  nodes centred; unconnected shapes go in a row after the graph. Edges against the direction get side anchors so the
  orthogonal router leads them around.
- **Mermaid** (`js/mermaid.js`): a line-based parser for flowcharts (node shapes, link types, labels, chains, `&`); unknown
  statements are skipped. Shapes are sized from their labels and placed with the layout; `.mmd`/`.mermaid` files open as
  diagrams.
- **Printing**: `printDiagram()` puts the SVG export of every non-empty page into `#dg-print` (one sheet each, with a title);
  the print stylesheet shows only that container and scales each SVG to the sheet width; it is removed after `afterprint`.

Tests: `tests/apps/test_diagram.py` with draw.io files written by the test (compressed page, group, HTML label, exit anchor, unknown style
key) and an Excalidraw file: drawing, connecting via ports, labels, saving (checked with ElementTree), pages, styles, undo/redo, align,
distribute, type change, z-order, move with snapping, resize, nudge, delete with edges, copy/paste/duplicate, routing, arrows, detaching
ends, SVG/PNG export and reopening, German interface, phone layout, printing (empty diagram, one sheet per page, print media), Mermaid parsing (shapes, links, labels, skipped statements), import with
a left-to-right layout without overlaps, automatic layout with undo, `.mmd` files, unsupported diagram types.

### Calendar (`apps/calendar`)

A classic-script application on top of `shared/js/ical.js`:

- **Times** are zoned wall times (`{ y, m, d, hh, mm, ss, date, tz }`, `tz` = `floating`, `UTC` or a TZID). `toInstant` resolves TZIDs with
  `Intl.DateTimeFormat` (IANA ids, Windows names from a table, `/mozilla.org/…/Region/City`); unknown zones fall back to local time. Views work
  with instants in the browser's zone; editing keeps the event's zone. New events get the browser's IANA zone and a `VTIMEZONE` generated from
  this year's offset transitions (yearly `RRULE` with `BYDAY=nXX`).
- **Recurrence** (`expand`): periods of the rule (day, week from `WKST`, month, year) produce candidate days (`BYDAY` with ordinals, `BYMONTHDAY`
  incl. negative days, `BYMONTH`, `BYSETPOS`); `COUNT`, `UNTIL`, `EXDATE` and overrides (`RECURRENCE-ID`) are applied. Wall times are compared
  numerically and only occurrences near the range are converted to instants, so long-running series stay fast.
- **Round trip**: an event keeps its original component; when writing, the managed properties (UID, DTSTAMP, DTSTART/DTEND, SUMMARY, LOCATION,
  DESCRIPTION, RRULE, EXDATE, RECURRENCE-ID, CATEGORIES, STATUS, SEQUENCE, LAST-MODIFIED) are regenerated and all others (ATTENDEE, VALARM,
  X- properties) copied. VTODO/VJOURNAL and existing VTIMEZONEs are kept.
- **Editing a series**: "only this" writes an override VEVENT (same UID, RECURRENCE-ID = original start of the occurrence) or an EXDATE;
  "all" changes the master (moving by the same offset as the edited occurrence). SEQUENCE is incremented.
- **Views**: month grid, time grid with overlap layout (columns per cluster), agenda; pointer-based create/move/resize with 15-minute snapping,
  HTML5 drag & drop in the month view.
- **Free/busy** (`ical.js`): an occurrence blocks time unless it is `CANCELLED` or `TRANSP:TRANSPARENT`; all-day occurrences
  only with an explicit `TRANSP:OPAQUE` (`TRANSP` is read but not managed, so it is written back with the component).
  `STATUS:TENTATIVE` gives `BUSY-TENTATIVE`. `mergeBusy` joins periods per type, `freeSlots` walks the days of the range inside
  the working hours (local time, optionally without weekends) and returns the gaps of at least the duration, `freeBusyPeriods`
  reads `FREEBUSY` values of `VFREEBUSY` components (start/end or start/duration, `FBTYPE=FREE` skipped) and `freeBusyText`
  writes a `METHOD:PUBLISH` calendar with one `VFREEBUSY` in UTC. The imported periods are cached per calendar component
  (`WeakMap`), so undo, which replaces the component, recomputes them.
- **Printing**: `printView()` adds `body.cal-printing` and an `@page` rule (A4 landscape for month and week); the print
  stylesheet hides the shell, the side bar and dialogs, shows a heading and scales the time grid with `zoom` so that 24 hours fit
  one sheet.
- **Reminders**: the first VALARM with a relative trigger (RELATED=START) is the event's `reminder` (minutes before the start); saving
  replaces only that alarm (`-PnDTnHnM`, ACTION:DISPLAY) and keeps the others. Every 30 s, `checkReminders()` looks at the occurrences of the next
  8 days and shows the due ones once per session (Notification API when switched on and permitted, otherwise the shell banner).

Tests: `tests/shared/test_ical.py` compares the recurrence expansion with `dateutil.rrule` (ten rules across a DST change) and checks parsing,
folding, time zones, `VTIMEZONE`, EXDATE/overrides and written events with `icalendar`. `tests/apps/test_calendar.py` runs the app in
`Europe/Vienna` with a fixed clock: views, search, creating by dragging, editing one or all occurrences, deleting occurrences and series, moving
and resizing, month drag & drop, all-day events, repeat rules from the dialog, visibility, import by UID, renaming, German interface, phone layout, reminders (read from VALARM, due once, written and removed), printing (page size, print stylesheet).

### Database tool (`apps/dbtool`)

ES modules `drivers.js` and `main.js`; CodeMirror with `@codemirror/lang-sql` (dialect and schema for completion are reconfigured per session).

- **SQLite**: sql.js (`vendor/sql-wasm.js`, global `initSqlJs`); the WASM binary is embedded (`data-src`, gzip + base64) and passed as
  `wasmBinary`, the CSP allows `'wasm-unsafe-eval'`. Statements run one by one with `iterateStatements`, so every statement has its own result
  or change count. Saving exports the database (`db.export()`).
- **Postgres**: own client for protocol version 3 over a relay TCP connection: SSLRequest and `startTls` on the relay, startup message,
  cleartext, MD5 (own MD5 implementation; WebCrypto has none) and SCRAM-SHA-256 (PBKDF2/HMAC from WebCrypto, server signature checked),
  simple query protocol (RowDescription, DataRow, CommandComplete, ErrorResponse with all fields, NoticeResponse); queries are serialised.
  Numeric type OIDs are converted to numbers except `int8`/`numeric` (kept as text to avoid precision loss). The schema comes from
  `information_schema` (tables, views, columns, primary keys).
- **Editing**: browsing selects the key columns (primary key, or `rowid` for SQLite) and hides them when they are not table columns; cell
  edits, inserts and deletes are single statements with a `WHERE` on the key.
- **Statement splitting** for "run at cursor" respects quotes, identifiers, comments and Postgres dollar quoting.
- **Connections** are stored through `Suite.appdata` (connection fields: name, host, port, database, username, password, ssl, insecure, url).
- **ER diagram** (`js/er.js`): foreign keys from `PRAGMA foreign_key_list` (SQLite) or `information_schema` (Postgres, empty when the
  views are not readable); one draw.io vertex per table (label with the columns), one edge per foreign key, placed with the diagram
  editor's layered layout (`apps/diagram/src/js/layout.js`, shared through the import map); the XML is sent to the diagram editor with
  `Suite.bridge.openIn`.
- **History**: statements run by the user (not browsing or explaining) are kept in `localStorage` (`suite.dbtool.history`, 200 entries,
  newest first, duplicates moved up, with database name, time and success). **Explain** prefixes the current statement with
  `EXPLAIN QUERY PLAN` (SQLite; rows `id`/`parent`/`detail` are turned into an indented tree) or `EXPLAIN` (Postgres).

Tests: `tests/apps/test_dbtool.py` — SQLite files from Python's `sqlite3` (schema, several results, run at cursor, errors, create, browse,
edit, insert, delete, rowid tables, CSV/JSON export, saving checked with `sqlite3`); Postgres through both relays against
`tests/helpers/pg_fake.py`, a small protocol server on top of SQLite (SCRAM, MD5 and cleartext authentication, wrong password, SSL with the
test CA, browsing and editing), saved connections in KeePass (checked with pykeepass and reopened) and JSON (without password), query
history (failed entries, browsing excluded, reload, clearing), the SQLite query plan, and the ER diagram opened in the diagram editor
(tables, view, key markers, relations, layering).

### SSH client (`apps/ssh`)

xterm.js terminals (ES modules from `vendor/esm/xterm`, one `Terminal` with `FitAddon` per tab, created outside Preact and moved into the
active tab's container) on top of the SSH engine (`shared/js/ssh.js`, Go `x/crypto/ssh` and `pkg/sftp` compiled to WebAssembly, transport =
relay TCP connection). `client.shell()` requests a PTY (`xterm-256color`) and forwards terminal input (`term.onData`) and resizes; the touch key
bar sends escape sequences and turns the next key into a control character. The SFTP panel uses `client.sftp()` (`realpath`, `list`,
`readFile`, `writeFile`, `mkdir`, `rename`, `remove`, `rmdir`). Host keys: the engine calls the `hostKey` callback with type, SHA-256
fingerprint and key; the app compares it with the `hostKey` field of the saved connection and otherwise asks (accept once, accept and save,
reject; a changed key shows a warning). Connections are stored with `Suite.appdata` (fields: name, host, port, username, auth, password,
privateKey, passphrase, hostKey, url). Key pairs are generated by the engine (`engine.generateKey(type, comment, passphrase)`:
`crypto/ed25519`, `ecdsa` P-256 or `rsa` 4096, `ssh.MarshalPrivateKey(WithPassphrase)` in the OpenSSH format, `MarshalAuthorizedKey`,
`FingerprintSHA256`; engine 0.2.0). Session logs collect the decoded shell output while recording and strip escape sequences when saved.

Tests: `tests/apps/test_ssh_client.py` against a local OpenSSH server (`tests/helpers/ssh_fixtures.py`, key authentication) through both relays:
terminal input/output (read from the xterm buffer), session end and reconnect button, rejected host key, passphrase-protected key, SFTP
listing/download/upload/mkdir/rename/delete/navigation, saved connection with host key in KeePass (checked with pykeepass), changed host key
warning, German interface, phone layout with key bar, key generation (checked with `ssh-keygen -y` and `-l`, then authorized and used to
log in), session log without escape codes, terminal output, known host keys listed and forgotten.

### FTP/SFTP client (`apps/ftp`)

`js/remote.js` offers one interface (`home`, `list`, `read`/`write` with progress and an `offset`, `size`, `setTime`, `mkdir`, `rmdir`,
`remove`, `rename`, `close`) for:

- **FTP** — own client over relay connections: replies with multi-line handling, explicit FTPS (`AUTH TLS` + relay `startTls`), implicit
  FTPS (TLS connection), `PBSZ 0`/`PROT P`, `TYPE I`, `FEAT`/`MLSD` with fallback to `LIST` (Unix and Windows formats parsed), passive mode with
  `EPSV` and fallback to `PASV`. Data connections are separate relay connections to the control host (addresses in PASV replies are ignored,
  they are often private); with FTPS they are TLS connections. Uploads end by closing the data connection. Commands are serialised.
  Servers that require TLS session reuse on the data connection (e.g. vsftpd `require_ssl_reuse=YES`) are not supported, because the relay
  opens every TLS connection independently.
- **SFTP** — the SSH engine (`client.sftp()`), host keys confirmed and saved with the site. Files are read and written in 1 MiB chunks
  (`readAt`/`writeAt`, engine 0.3.0), which gives progress and makes resuming possible; `chtimes` sets the modification time.

The local side uses `showDirectoryPicker()` (directory handles; recursive upload and download of folders); without it, files come from the file
picker and downloads use `Suite.files.download`. Transfers run one after another from a queue with progress.

- **Resume**: a failed read carries `error.partial` (FTP: the chunks of the data connection before the failure; SFTP: the chunks read).
  Download jobs keep it in `job.partial` and the next run reads from that offset (FTP `REST n` before `RETR`) and concatenates. Upload
  retries ask `size()` (FTP `SIZE`, SFTP `stat`) and send the rest (FTP `APPE`, SFTP `writeAt` at the offset). A smaller file with the
  same name on the other side offers resuming before a transfer starts.
- **Synchronize**: `localTree`/`remoteTree` collect the files below both folders (at most 5000 each) as relative paths;
  `compareEntry(local, remote, { mode, useTimes })` gives the status (same size = same unless times are compared, with 2 minutes slack
  for `LIST` minute precision) and the proposed action for the direction. Running it creates missing folders (local
  `getDirectoryHandle(…, { create })`, remote `MKD`) and queues normal jobs; uploads set the remote time to the local
  `lastModified` (`MFMT` / `chtimes`).

Tests: `tests/apps/test_ftp.py` against pyftpdlib (plain, explicit and implicit TLS with the test CA; each server gets its own IOLoop, lock and stop
event because pyftpdlib shares them between instances) and the OpenSSH fixture: browsing, download, upload (300 kB), mkdir, rename, recursive
delete, navigation, FTPS, wrong password, SFTP, LIST/MLSD parsing, local folder transfers via an OPFS stub (with an own relay that accepts the
HTTP test origin), saved site, German interface, phone layout.

### HTTP analyzer (`apps/http`)

ES modules `model.js` (request model, variables, body encoding, cURL, Postman v2.1) and `main.js` (UI, CodeMirror for request and response
bodies).

- **Sending**: `build()` resolves `{{variables}}` (environment before collection variables), adds Basic/Bearer authorization and encodes the body
  (raw with a content type per language, URL-encoded with `+` for spaces, multipart with an own boundary, file). Through the relay
  `Suite.relay.http()` is used (all headers in both directions, optional redirect following and untrusted certificates); directly, `fetch`
  with `credentials: 'omit'` (a failure is reported as a possible CORS block). The CSP allows `connect-src http: https:` for the direct mode.
- **Rows** (params, headers, form fields, variables): the empty last row creates a row on the first input and keeps it on its table row element,
  so fast typing before the next render does not create two rows. Query parameters are derived from the URL and written back into it.
- **cURL**: a shell-word parser (quotes, `$'…'`, backslash line continuations) and the common options (`-X`, `-H`, `-d`/`--data-*`, `--json`,
  `-F`, `-u`, `-G`, `-A`, `-e`, `-b`); export groups each option with its value on one line.
- **Collections** are Postman v2.1 JSON (folders, headers, raw/urlencoded/formdata bodies, basic/bearer auth, collection variables); environments
  are stored with `Suite.appdata`. The history (50 entries) is kept in memory only, because requests may contain secrets.
- **Scripts** (`scripts.js`): each run creates a `Worker` from a `data:` URL that contains the `pm` runtime and the user's code as the
  body of an async function (no `eval`; the CSP gets `worker-src data:`). A `data:` worker has an opaque origin, so it cannot open the
  suite's IndexedDB or storage; it receives only the request, response and variables and returns test results, console output,
  changed variables and the changed request; it is terminated after 5 s (endless loops). Changed environment and collection
  variables are merged back; Postman `event` entries (`prerequest`, `test`) are imported and exported.
- **WebSocket**: a URL with `ws:`/`wss:` (after variable resolution) switches the send button and the response area to a browser
  `WebSocket` (`binaryType = 'arraybuffer'`, subprotocols from the `Sec-WebSocket-Protocol` header, at most 2000 log entries).
- **OpenAPI** (`openapi.js`, js-yaml from `vendor/esm/yaml`): local `$ref`s are resolved with cycle protection; examples come from
  `example`/`default`/`enum`, `allOf`/`oneOf` and the type and format; the collection is saved as a Postman collection.

Tests: `tests/apps/test_http.py` against the echo server of the relay tests through both relays and directly: params/URL sync, headers, Basic
auth, response headers, JSON/urlencoded/multipart bodies with environment variables, status classes, redirects, history, direct mode with and
without CORS headers, cURL import and export, Postman round trip (with scripts), German interface, phone layout, pre-request script
and tests (headers and variables from the script, passed and failed tests, console, variables written back, timeout, syntax error,
sandbox without storage or DOM), WebSocket against `tests/helpers/ws_echo.py` (subprotocol, echo, server close code and reason,
reconnect, client close), OpenAPI 3 YAML import (tags, server variables, path/query parameters, `$ref` schemas with a cycle, bearer and
API-key security).

### Python notebook (`apps/notebook`)

The app is built on the kernel of spike S-9 (`shared/js/python-kernel.js`, `python-worker.js`, Pyodide bundle from `vendor/pyodide/bundle.json`,
see decisions D-025 to D-027): the worker is started from embedded text as a classic script, the Pyodide files are embedded with
`data-bundle`. The kernel API gained `removeFile`.

- **Cells**: every cell owns a CodeMirror view (Python or Markdown), created once and attached to the cell element by Preact. Outputs are kept in
  nbformat 4 form (streams merged like Jupyter) and rendered by an `Output` component; HTML, SVG and Markdown pass DOMPurify (no scripts, event
  handlers, external URLs).
- **Files**: `.ipynb` read and written as nbformat 4.5 (cell ids kept or created); `.py` with `# %%` / `# %% [markdown]` markers (percent format)
  read and exported.
- **Console**: a CodeMirror input with history on the same kernel; execution counts are shared with the notebook.
- **Keyboard**: in a cell `Shift/Ctrl/Alt+Enter`; command mode (focus on the cell element) `Enter`, `A`, `B`, `M`, `Y`, arrows, `Delete`.
- Restart terminates the worker and starts a new one; wheels installed in the session are installed again.
- **Export**: `toHtml()` writes a standalone page (inline CSS) from the cells: Markdown and HTML/SVG outputs through the same
  DOMPurify filter as on screen, images as `data:` URLs, code escaped; PDF prints that page from a hidden `srcdoc` frame.
- **Variables**: the worker's `_variables()` walks the cell namespace `_ns` (without modules, functions, classes and `_` names) and returns
  name, type, shape/length, dtype and a repr cut to 200 characters as JSON; the app asks for it after every execution. `_table(name)` renders
  a DataFrame/Series (other objects through `pandas.DataFrame(...)`) with `to_html(max_rows=500, max_cols=50)`, shown after DOMPurify.
- **Widgets**: `shared/js/python-widgets.py` (embedded as `#python-widgets`, written to `/tmp/suite/ipywidgets.py` at start, so it is
  imported on demand) implements the ipywidgets 8 API without traitlets: every widget has a model id (`<session>-<n>`) and a state dict
  with the key names of the Jupyter models (`_options_labels`/`index` for selections, `IPY_MODEL_<id>` references for children,
  `outputs` for Output). The kernel sends `{op: open|update|close, id, model, state}` through `_post_comm` (worker message `comm`,
  `onComm` of `Suite.python.start`); `_repr_mimebundle_` puts `application/vnd.jupyter.widget-view+json` into display outputs.
  `apps/notebook/src/js/widgets.js` keeps the models, draws the controls (Preact) and sends changes with `kernel.widget(id, data)`
  (`{value}`, `{index}`, `{click}`, `{submit}`, `{selected_index}`), one at a time, keeping only the latest pending value per widget,
  and showing it at once. `_widget_event` in the worker calls the widget's observers/callbacks; outputs go to the request and so to the
  cell that created the widget, unless an `Output` captures them: the kernel's `_emit` routes outputs (display, figures, results)
  to the innermost `with out:` and `Output.__enter__` replaces `sys.stdout`/`stderr`. `clear_output()` outside an Output sends
  `{output_type: "clear_output"}`, which the page applies to the cell. `interactive` builds controls from abbreviations (tuples → sliders,
  lists/dicts → Dropdown, bool → Checkbox, str → Text, number v → slider from −v to 3v) and re-runs the function in its Output.
  Saving writes the state of the shown widgets (with children and nested outputs) to `metadata.widgets` in the Jupyter widget-state
  format; opening and restarting keep them as inactive models. A minimal `IPython.display` module is registered as well.

Tests: `tests/apps/test_notebook.py` (one page per browser): start without network requests, keyboard execution and command mode, Markdown
rendering and sanitizing, console with history, file panel (upload, refresh after running, download, delete), wheel installation, opening and
saving `.ipynb` (validated with nbformat), `.py` import and export, restart, German interface, phone layout, variable inspector (filtering,
types, shapes, table viewer, updates after running), HTML export with and without code (sanitized Markdown, escaped code, outputs) and printing, widgets (slider with observe and Output,
interact with Dropdown, buttons printing into the cell and raising, Checkbox, Tab, matplotlib in interact, saved state shown inactive). The kernel itself is covered by
`tests/prototypes/test_s9_notebook.py`.

### Spreadsheet (`apps/spreadsheet`)

Univer Sheets 1.0 (`vendor/esm/univer-sheets`, decision D-019) in a container that is created outside Preact and attached to the layout, with the
file conversion of spike S-6 (`shared/js/univer-xlsx.js`: ExcelJS for XLSX/XLSM, SheetJS for ODS/XLS/CSV).

Conditional formatting and data validation come from the presets `@univerjs/preset-sheets-conditional-formatting` and
`-data-validation` (pinned to the core's 1.0.4). Univer keeps their rules in the workbook `resources`
(`SHEET_CONDITIONAL_FORMATTING_PLUGIN`, `SHEET_DATA_VALIDATION_PLUGIN`: JSON `{ sheetId: [rules] }`); `univer-xlsx.js` maps them to
ExcelJS `worksheet.conditionalFormattings` / `addConditionalFormatting` (cellIs, containsText, expression, timePeriod, top10,
aboveAverage, colorScale, dataBar; differential styles ↔ Univer `bg`/`cl`/`bl`/`it`/`ul`/`st`) and to cell `dataValidation`s.
ExcelJS lists validations per cell; equal settings are joined into column runs again. Error styles: Univer INFO=0, STOP=1,
WARNING=2. ExcelJS writes containsText rules without the `text` attribute, so reading takes the text from the formula.

- **Styles**: the app loads `vendor/pico.conditional.min.css`, which styles only elements inside `.pico`; the shell's header, banner, toasts and
  dialogs carry that class, the Univer UI keeps its own look. Dialogs with `.pico` get a `z-index` above embedded editors.
- **Dirty state**: `CommandExecuted` events of type mutation count as edits only within 3 seconds after user input (pointer, key, paste, cut,
  drop) in the editor container, and only if that input came after the latest load: Univer emits set-up mutations asynchronously after a
  unit is created. The document editor uses the same rule.
- **Theme and language** follow the shell: `univerAPI.toggleDarkMode()` and `univerAPI.setLocale()`.
- **Saving** keeps the opened format (XLSM is saved as XLSX); CSV and XLS show a note that formatting is lost.
- **CSV import** (`js/csv.js`, `SSCSV`): decoding (BOM, strict UTF-8, else Windows-1252), separator sniffing (the candidate with the most
  consistent column count over 20 rows), an RFC 4180 parser (line breaks inside quotes become `\n`) and value conversion; the rows go through
  `Suite.univerXlsx.importRows()` (SheetJS `aoa_to_sheet` → XLSX → ExcelJS → Univer). Dates are written as serial numbers computed in UTC with a
  `yyyy-mm-dd` format, because SheetJS would convert `Date` objects in the local zone. CSV export passes the import's separator to SheetJS (`FS`).

Tests: `tests/apps/test_spreadsheet.py` — opening, typing with recalculation, dirty marker, saving XLSX (checked with openpyxl), ODS, CSV, XLS, XLSM,
discarding changes, language and theme, phone layout, CSV import dialog (Windows-1252, semicolons, decimal comma, quoted line breaks, leading
zeros, dates, all-text mode, saving with the same separator). Import/export fidelity: `tests/prototypes/test_s6_office_io.py`.

### Document editor (`apps/document`)

Univer Docs 1.0 with the docs core and docs drawing presets (`vendor/esm/univer-docs`, decision D-020), in the same structure as the spreadsheet
(container outside Preact, conditional Pico, dirty rule, theme and language). DOCX import uses the direct reader of spike S-8
(`shared/js/docx-import.js`, through `importDocx` of `shared/js/univer-docx.js`), export uses the `docx` library (`exportDocx`). DOCM and DOTX
are opened and saved as new DOCX files. ODT (`shared/js/odt.js`, own code on fflate): the reader resolves automatic and common styles with
their parent chains (text and paragraph properties, lengths in cm/mm/in/pt), `text:h` outline levels, Title/Subtitle, lists with the
`text:list-style` level kinds, tables (covered cells: horizontal spans are dropped, vertical ones become `rowSpan: 0`), frames with images,
links, `text:s`/`text:tab`, notes (appended at the end) and the first master page (page layout, header, footer); it builds the Univer body
with the `Body` builder of `docx-import.js`. The writer walks the Univer body like `exportDocx` and writes `content.xml` with automatic styles
shared by equal properties, nested `text:list`s, tables with covered cells, `Pictures/`, plus `styles.xml` (headings, page layout, header and
footer), `meta.xml` and the manifest, with `mimetype` stored first. Table of contents (`shared/js/doc-toc.js`): ordinary paragraphs whose
text is a hyperlink to `#toc-<n>` (n = position among the headings, namedStyleType 4–8); `insertToc` cuts an existing table (found by these
links) or uses the cursor paragraph (`DocSelectionManagerService.getActiveTextRange()`), pastes the new paragraphs and shifts all indices of
the body; the document is reloaded as a new unit. The DOCX export wraps headings in `Bookmark`s and the entries in `InternalHyperlink`s, the
ODT export writes `text:bookmark` and `#toc-n` links. The DOCX reader turns `footnoteReference`/`endnoteReference` into superscript labels and
appends the note bodies at the end (as the ODT reader does). Plain text: lines become paragraphs (`fromText`); saving as text writes the data stream with paragraph
marks as line breaks and without embedded objects (`toText`). Printing and HTML (`shared/js/doc-html.js`, `toHtml`): the Univer data becomes
a self-contained page (named styles → `h1`–`h5`/title/subtitle, paragraph and run styles as inline CSS, links, nested `ul`/`ol` from
`bullet.nestingLevel`, tables with `colgroup` widths, spans and shading, drawings as `img`, page breaks as `break-before:page`, headings
with `id="toc-<n>"` for the table of contents links); `@page` takes the page size and margins of `documentStyle`, and with `print` the
default header and footer are `position: fixed` in the margin boxes so they repeat on every page. The 🖨 button (`Ctrl+P`) loads it into a
hidden `srcdoc` frame and calls its `print()` (CSP `frame-src 'self' about:`); saving as `.html` writes the same page without `print`. Spelling panel (`apps/document/src/js/spelling.js`, `F7`) on the suite's spell checker (see *Spell checking*):
`spell.errors` of the body's data stream, grouped by word with their offsets; the language, personal and ignored words are those of
the header selector. Selecting and replacing use the facade (`FDocument.setSelection`, `getTextRange(start, end).setText`, from the
last occurrence backwards); the offsets are computed again before each action, as the text may have changed since the check.

Tests: `tests/apps/test_document.py` — opening a DOCX, typing at the start, dirty marker, saving (checked with python-docx), typing in a new
document and saving as text, opening text files, rich DOCX with header/footer, templates, language and theme, phone layout, ODT round trip, table of contents and footnotes, print rendering (header, lists, table spans, images, heading anchors; Firefox blocks the page in `print()` under Playwright, so there the frame is caught before it loads) and HTML export, spelling (suggestion replaces all occurrences, personal dictionary, `.oxt` in ISO-8859-1, ignore, kept after a reload, `.aff`+`.dic` pair). DOCX fidelity:
`tests/prototypes/test_s8_docx_reader.py` and `test_s6_univer_docs.py`. In Firefox, umlauts typed by Playwright are duplicated by Univer Docs'
input handling; the typing tests use ASCII text.

### Presentation editor (`apps/presentation`)

Own editor on the deck model of spike S-7 (decision D-021): `shared/js/pptx-import.js` (PPTX reader with layout/master inheritance, fflate),
`shared/js/slide-render.js` (DOM/SVG rendering, text as editable HTML), `shared/js/pptx-export.js` (PptxGenJS) and Moveable for move, resize and
rotate (with snapping guides).

- **Transitions and animations** (`slide.transition = { type, dir, duration, advanceAfter }`, `slide.animations = [{ id, effect, start }]`):
  the reader takes the first `p:transition` (PowerPoint 2010+ writes it in `mc:AlternateContent` with `p14:dur`; otherwise `spd`, `advTm`)
  and the entrance `p:cTn`s of `p:timing` (presetClass `entr`, presetID 1/10/2/53 → appear/fade/fly/zoom, nodeType → click/with/after),
  mapping `spTgt spid` to the elements by the `p:cNvPr` ids read with them. PptxGenJS writes neither, so `pptx-export.js` unzips its output
  and inserts `p:transition` and a main sequence (`p:timing`, one click group per "on click") after `p:clrMapOvr`; the shape ids come from
  the `p:cNvPr` elements in the order the elements were added. The show groups the animations the same way: elements of later groups are
  hidden, a step plays the next group with the Web Animations API (`opacity`, `translate`, `scale`); transitions animate the new (and for
  *push* the old) slide view; *advance after* is a timer that any navigation restarts.

- The stage and the thumbnails are rendered imperatively into containers outside Preact; the panels are Preact. Pico is loaded in its
  conditional build so that slide content (tables, text) is not restyled; toolbar, panel and dialogs carry `.pico` (in the media query the toolbar
  selector is `nav.pr-toolbar`, because `.pico nav` would win otherwise).
- Text editing uses `contenteditable` on the rendered text box (or table cell) and reads the result back with `readText`; formatting while
  editing uses `document.execCommand`, otherwise the properties of all runs of the element are changed.
- Undo/redo keep `structuredClone` snapshots of the deck (60 steps, quick changes of the same kind coalesced). The clipboard holds copies of
  elements inside the page.
- Presenting renders one slide scaled into a full-screen overlay; keyboard, click and swipe navigation. Printing renders every slide into a print
  container with `@page` of the slide size.
- Speaker notes (`slide.notes`) are read from the body placeholder of the slide's `notesSlide` part (`pptx-import.js`) and written with
  PptxGenJS `addNotes`. The presenter view opens an `about:blank` window (same origin), copies the page's `<style>` elements into it and
  renders the current slide there; the console in the main window shows the current and next slide, the notes, a timer and the clock.
  Key presses in either window go to the same handler.

Tests: `tests/apps/test_presentation.py` — opening a PPTX, editing position, size and text formatting in the panel, saving (checked with
python-pptx), adding text, shapes, tables (cell editing) and images, slides (add, duplicate, reorder, delete), undo/redo, nudging, copy/paste,
moving with the mouse, presenting, save as and templates, German interface, phone layout, speaker notes (imported with python-pptx,
edited, saved) and the presenter view (console, audience window, keys in both windows, ending). Import/export fidelity:
`tests/prototypes/test_s7_slides.py`.

### Mail client (`apps/mail`)

Own protocol clients on top of the relay TCP connections (`Suite.relay.connect`, TLS or `startTls`):

- `js/imap.js`: IMAP4rev1 client. Responses are cut into complete lines including literals (`{n}`), then tokenized
  (atoms with `[...]` sections, quoted strings, literals as bytes, NIL, lists). Commands are serialized through a promise
  chain; untagged responses belong to the running command, `EXISTS`/`EXPUNGE` of the selected folder are also reported to
  `onUpdate`. Login with `AUTHENTICATE PLAIN` (SASL-IR or continuation) or `LOGIN`; literals with LITERAL+ or synchronizing.
  Folder names in modified UTF-7; special-use flags with name guesses (German/English) as fallback. Moving uses `MOVE` or
  `COPY` + `\Deleted` + `UID EXPUNGE` (`EXPUNGE` without UIDPLUS).
- `js/smtp.js`: submission with EHLO, STARTTLS, AUTH PLAIN/LOGIN, per-recipient refusals, dot-stuffing.
- `js/mime.js`: message building (7-bit only: quoted-printable text, base64 attachments, RFC 2047 headers, RFC 2231 file
  names, folded headers, `multipart/alternative`, `related` for pasted images, `mixed`), address lists, mbox split/join,
  vCard 2.1/3.0/4.0 parsing (unknown properties kept) and vCard 3.0 writing. Parsing of messages with postal-mime
  (`vendor/esm/mail`).

Several accounts: `sessions` maps account ids to `{ account, imap, folders, unread, folder, selected }`; `state.account/imap/folders/unread`
are those of the active session (`activate`), switching keeps the other connections open and NOOPs all of them every minute.
`selected` tracks the folder selected on each connection (`selectIn` selects only when needed). The combined inbox (`source:
'unified'`) selects every inbox, fetches its newest 50 summaries and tags them with `uid = "<account>:<uid>"`, `acc` and `realUid`;
reading, flags and deleting group the uids by account (`byAccount`) and act on that connection; replies take the message's account
(`messageAccount`) and append the sent copy and `\Answered` through its session. `EXISTS` of a background inbox updates its unread
count, or reloads the combined list.

`js/main.js`: accounts are appdata connections (passwords only when chosen; `smtpPassword` is a protected KeePass field),
contacts are in the app settings (`settings.contacts`). Lists fetch `UID FLAGS INTERNALDATE RFC822.SIZE` and selected header
fields in pages of 50 (sequence ranges); messages are fetched with `BODY.PEEK[]`, parsed, cached (40) and marked `\Seen`
explicitly. HTML mail is sanitized with DOMPurify (forms, frames, `base` removed; remote `src`/`url()` removed and counted;
`cid:` images replaced by data URLs) and shown in a `srcdoc` iframe with `sandbox` without `allow-scripts`; the iframe
inherits the page CSP, so remote content cannot load either. Invitations are read with `shared/js/ical.js`; replies are
iMIP `METHOD:REPLY` messages with the attendee's `PARTSTAT`. Sent messages are appended to the `\Sent` folder, drafts to
`\Drafts` (with Bcc, flags `\Draft \Seen`); sending an edited draft expunges it. A `NOOP` every minute picks up new mail.

Conversation threads (`js/threads.js`): the summaries also fetch `In-Reply-To` and `References`; a message's parent is
the last message of its reference chain that is loaded, otherwise (no references, subject with a reply prefix) the
earliest message with the same base subject; cycles are broken. The list shows threads collapsed (newest activity
first) and expands them on demand; keyboard navigation follows the displayed order.

Rules and templates are stored in the account record (`rules: [{field, contains, action, folder}]`,
`templates: [{name, subject, text, html, mode}]`), so they travel with the application data file. `applyRules` runs on
the summaries of unread inbox messages when the inbox is opened and when IDLE/NOOP reports new mail; it remembers the
processed `folder/uid` pairs for the session, groups the UIDs per action and issues one MOVE/STORE/expunge per group.
The ⚙ button applies the rules to all loaded messages of the current folder.

Tests: `tests/apps/test_mail.py` with `tests/helpers/mail_fake.py` (threaded IMAP and SMTP servers: literals with and without
LITERAL+, MOVE or not, implicit TLS and STARTTLS, AUTH PLAIN/LOGIN) — reading HTML/attachments from `.eml`, mbox and search,
composing (checked with Python's `email`), contacts and vCard, invitations, MIME helpers, German/phone layout, and through
the relay (Python and PowerShell): folders, unread counts, flags, search, move, delete, new mail, reply/forward/send with
sent copy and `\Answered`, drafts, TLS/STARTTLS with COPY+EXPUNGE and invitation replies, wrong password, folder creation
and drag and drop; conversation threads from an mbox (references, subject fallback, depth, flat list); rules (move on
demand, flag on arrival) and templates.

### Audio editor (`apps/audioeditor`)

The Web Audio API plus, for compressed export only, Mediabunny with its MP3 (LAME) and FLAC (libFLAC) WebAssembly encoder
extensions (`vendor/esm/audio`, MPL-2.0, loaded with a dynamic `import()` when the export dialog opens). `js/dsp.js`
works on `{ rate, channels: [Float32Array] }` and always returns new arrays. It contains range editing (slice, remove,
insert, replace, pad), effects (gain, normalize, fades with a ramp that may span several clips, reverse, invert, echo),
generators, a mixer (gain in dB, equal-power pan, mute, solo), peaks for drawing (min/max per 256 samples), an own WAV
decoder (PCM 8/16/24/32 bit, float 32/64, extensible, RF64) and encoder (16/24 bit PCM scaled like the decoder, so that
unchanged PCM is written back bit-identically; 32 bit float). Resampling, speed changes and biquad filters render through
an `OfflineAudioContext`. Other formats are decoded with `decodeAudioData` of an `OfflineAudioContext` at the project rate.

`js/clips.js`: a track is a list of clips `{ id, offset (samples), audio, name, beats?, cues? }`. Clips are immutable;
every operation returns a new list, so undo snapshots (50) only copy the track objects. Range operations ripple like
Audacity: `removeRange` cuts the range out of the clips it touches and moves later clips left, `insertGap`/`insertClips`
split at the position and move later clips right, `sliceRange` copies the clips of a range (clipboard, trim),
`mapRange` processes the parts of the clips in a range with the same length (most effects), `mergeRange` mixes the
range into one clip for effects that change the length (speed, tempo, reverse), `flatten` mixes a track (gaps are
silence, overlapping clips add up). Beats are a constant-tempo grid `{ bpm, phase }` relative to the clip, cues sample
positions in the clip; splitting and ripple edits carry them along, speed/tempo scale them.

`js/beats.js`: an onset envelope by spectral flux (radix-2 FFT, Hann window, hop ≈ 11.6 ms, log magnitude, positive
differences, local mean removed); the tempo from the envelope autocorrelation weighted with a log-normal curve around
120 BPM (parabolic peak interpolation); then a fine search of period (±3 %, 0.05 % steps) and phase (¼ frame) that
maximises the interpolated envelope at the grid positions. Accuracy with click tracks: ±0.05 BPM, phase within 2 ms. Cues:
the first sample above −40 dBFS and envelope peaks above mean + k·σ (k from the sensitivity), strongest first, with a minimum
distance. `timeStretch` is WSOLA (40 ms Hann frames, 50 % overlap, ±10 ms search: coarse on the mono mix decimated by 4,
then ±3 samples at full rate; all channels use the same frame positions), about 0.5 s per 30 s of 44.1 kHz audio.

`js/main.js`: waveforms are drawn into one canvas per track that is as wide as the visible lane; the visible range is
cached in an offscreen canvas (key: view, size, track version, colours, picked clip) with clips, their title bars, beat
lines and cues; selection, cursor, snap line and playhead are drawn over it, during playback once per frame. Peaks and
`AudioBuffer`s are cached per audio object in `WeakMap`s. Dragging a clip by its title bar moves it live (between tracks as
well) and records one undo step on release. Snapping collects the edges, beats and cues of all other clips, the playhead and
0 into a sorted array and, for every edge, beat and cue of the dragged clip, finds the nearest target by binary search
(threshold 8 px). Playback starts one `AudioBufferSourceNode` per audible clip into a gain and `StereoPannerNode` per track;
levels change live. Recording uses `getUserMedia` and `MediaRecorder` and decodes the result into a new track. Menus are
fixed-position panels (a dropdown inside the horizontally scrolling toolbar would be clipped).

`js/project.js`: `.audioproj` files are ZIPs (fflate) with `project.json` (`format: "suite-audio-project"`, version, rate,
tracks with name/gain/pan/mute/solo and clips with name, offset in samples, beat grid, cues and the path of their audio)
and `audio/<n>.wav` (32-bit float, stored without compression; clips sharing an audio object share the file). Opening
resamples to the project rate and scales offsets, beat phases and cues accordingly. Project labels are stored as
`labels: [{start, end, text}]` in seconds.

`js/effects.js`: compressor/limiter (peak follower over all channels with attack/release coefficients, gain computer in dB),
equaliser and reverb as offline Web Audio graphs (`BiquadFilterNode` shelves/peak; `ConvolverNode` with a deterministic decaying
noise impulse response), pitch shift = WSOLA time stretch by 1/r followed by resampling with `playbackRate` r, noise reduction =
spectral gate (STFT 2048/512 with Hann windows, noise level per bin from the quietest 10 % of the frames that lie fully inside the
range, gains smoothed over neighbouring bins and decaying over time, overlap-add with window normalisation).

Clip volume and fades (`clips.envelopeAt`): gain in dB and equal-power fade curves (`sin` over the fade length) per clip, applied in
`flatten()` (saving, export, effects that mix) and during playback as a `GainNode` with `setValueCurveAtTime` from the playback
position to the clip's end. Splitting keeps the fade-in on the left and the fade-out on the right part; the project file stores
`gain`, `fadeIn` and `fadeOut`. *Cross-fade* sets the fades of overlapping neighbours to the overlap length.

Volume automation: `track.envelope` is a sorted list of `{ t, db }` points (seconds, −40…+6 dB), linear in dB between the
points and constant before the first and after the last. `withEnvelope()` applies it to the mix of the track (mixdown, export,
"Mix down to one track"); playback puts one more `GainNode` per track behind the clip sources and feeds it the curve with
`setValueCurveAtTime` (sampled every 10 ms, at most 8000 values). The points are drawn over the lane while ⤴ is active; dragging is clamped between
the neighbours, a double-click removes a point. The project file stores `envelope` per track.

`js/labels.js`: Audacity label text (`start\tend\ttext`, one per line; lines starting with `\` – frequency ranges – are
skipped, a missing end makes a point label). The label strip is a canvas drawn with the ruler; overlapping labels
alternate between two rows, hit-testing uses the same layout (`labelBoxes()`). Labels are part of the undo snapshots and
of the snapping targets.

Spectrogram (`beats.spectrogram()`): Hann-windowed 1024-point FFTs of the mono mix with a hop that keeps at most 6000
frames per audio object, levels quantised to bytes (-100…0 dB) and cached in a `WeakMap`; `drawClipSpectrum()` maps each
device pixel column to a frame and each row to a bin on a logarithmic frequency axis and writes an `ImageData` through a
256-entry colour table.

`js/encode.js`: `available()` asks Mediabunny's `canEncodeAudio` per format (the browser's encoders first; the LAME and
libFLAC encoders are registered only where the browser has none). `encode()` feeds the mix in 2-second `AudioSample`s
(`f32-planar`) into an `AudioSampleSource` of an `Output` (`Mp3OutputFormat`, `FlacOutputFormat`, `OggOutputFormat` with
Opus, `Mp4OutputFormat` with AAC) with a `BufferTarget`. MP3 is encoded at the project rate (at most 48 kHz), Opus at
48 kHz, AAC at 44.1 or 48 kHz. The encoders run in workers created from Blob URLs; the CSP therefore allows
`worker-src blob:` and `'wasm-unsafe-eval'`.

Tests: `tests/apps/test_audioeditor.py` (WAV files generated and checked with `wave`/`struct`) — opening, deleting with
undo/redo and bit-identical saving, mouse selection over tracks, copy/paste, resampled import, mute/pan and mixdown, all
effects, generators, WAV export (24 bit stereo selection, 32 bit float), 24-bit decoding, playback with loop, recording
(fake microphone from an oscillator), splitting, dragging clips with and without snapping and into another track, ripple
delete, clip menu (move to, duplicate, remove), beat detection and beat-to-beat snapping of two click tracks, cue detection,
tempo matching with re-detection, beat grid by numbers, MP3/FLAC (and Ogg Opus where available) export, German interface
and phone layout with touch, labels (keyboard and double-click, selecting, undo, Audacity export/import, removing, project file), spectrogram (peak bin and
level of a 1 kHz tone, brightest row of the drawn view), fade handle dragging with undo/redo, clip volume, cross-fading
overlapping clips, playback with fades, fades in the project file, compressor, limiter, equaliser, reverb tail, pitch shift by an
octave (zero crossings, length), noise reduction (>10 dB less noise, tone within 1.5 dB) and effects through the menu.

### Barcodes (`apps/barcode`)

ZXing-C++ compiled to WebAssembly (zxing-wasm 3, MIT; ZXing-C++ Apache-2.0) reads and encodes all codes.
`tools/vendor_zxing.py` stores the ES module of the "full" build (reader and writer), its shared chunk and
`zxing_full.wasm` in `vendor/zxing/`; the WASM is embedded (`data-src`, gzip + base64) and passed as `wasmBinary` to
`prepareZXingModule`, so zxing-wasm does not fetch it from its CDN.

- Reading: `readBarcodes(ImageData, { tryHarder, maxNumberOfSymbols: 16 })` on images drawn into a canvas (files,
  drops, pasted images) and on camera frames (`getUserMedia`, about five frames per second, at most 1280 px wide).
  Results are listed once per format and text; their positions are drawn on an overlay canvas.
- `js/content.js` recognises contents (URL, `WIFI:`, vCard and MeCard, `mailto:`/`MATMSG:`, `tel:`, `SMSTO:`, `geo:`,
  `otpauth://`, VEVENT) and builds them for the generator (with the escaping of `WIFI:`/vCard). Links are only offered
  for `http(s)` and open with `rel="noopener noreferrer"`.
- Generating: `writeBarcode(text, { format, options: 'ecLevel=…' })` returns the symbol as a bitmap (0 = dark, without
  quiet zone); `js/render.js` draws it as SVG (identical rows merged into one path) and on a canvas (PNG) with module
  size, quiet zone, colours and, for 1D codes, bar height and text. The result is read back with `tryInvert` as a check
  (EAN/UPC may add the check digit).

Tests: `tests/apps/test_barcode.py` – an image with a QR code (segno) and an EAN-13 (zxing-cpp) read together, duplicates,
links, empty images, vCard to .vcf and into the generator, PNG/SVG read back with zxing-cpp, Wi-Fi escaping, error
correction, EAN example and invalid content, Data Matrix/Aztec/PDF417/Code 128, light-on-dark colours, a fake camera
(canvas stream), German interface and phone layout.

### Video editor (`apps/videoeditor`)

Based on spike S-10: WebCodecs through Mediabunny (`vendor/esm/video`, MPL-2.0).

- `js/timeline.js`: the project model as plain objects and pure functions (overwrite edits with `clearRange`, move, trim,
  split, ripple delete, snapping, fade factor) plus the drawing of a clip (fit "contain", offset, scale, opacity, fades,
  titles) that the preview and the export share. Transitions (`transitionIn`/`transitionOut`) use the fade progress to clip
  (wipes, circle) or transform (slides, zoom) the drawing; exits are mirrored; only 'fade' changes the opacity, the sound
  always fades. Picture settings: a CSS `filter` (brightness, contrast, saturate) on the 2D context (also on the export's
  `OffscreenCanvas`), the crop as the source rectangle of `drawImage`, rotation around the picture's centre, and `motion(c, t)`
  interpolating scale and offset over the clip (Ken Burns). Speed and reverse: a clip covers `(out - in) / speed` seconds of the
  timeline; `sourceTime(c, t)` maps timeline to source time (backwards from `out` when `reverse`), and `subClip(c, a, b)` is
  used by overwrite edits, trimming and splitting, so the source range of every part stays correct. The export asks
  `CanvasSink.canvasesAtTimestamps` for the mapped times (descending for reversed clips) and plays the clip's audio as one
  buffer (reversed in place) with `playbackRate` = speed; the preview sets `playbackRate` (without `preservesPitch`) and seeks
  reversed clips frame by frame, muted.
- Subtitles (`js/subtitles.js`): SRT/WebVTT cues (timestamps with `,` or `.`, optional hours, tags removed) become text clips on a
  video track named *Subtitles*; `toSrt` writes the text clips back with numbered cues. Undo keeps the previous project objects (100).
- Preview (`js/main.js`): one `<video>`/`<audio>` element per clip (not in the DOM); `syncMedia` seeks or plays them to the
  timeline time (drift correction 0.3 s while playing), `compose` draws the active clips of the visible video tracks from
  bottom to top on the preview canvas. While paused, frames are drawn after `seeked`. Volume in the preview is capped at
  100 % (media element limit); the export applies the real gain.
- Export (`js/export.js`): `availableFormats` asks `canEncodeVideo`/`canEncodeAudio`; `render` composes every frame on an
  `OffscreenCanvas` (`CanvasSource`) with one sequential `CanvasSink.canvasesAtTimestamps` iterator per video clip; images are
  `ImageBitmap`s. The audio of all audible clips is decoded with `AudioBufferSink`, placed in an `OfflineAudioContext` (48 kHz
  stereo, gain automation for volume and fades) and added as one `AudioBufferSource`. Cancelling aborts and calls
  `output.cancel()`.
- Media are probed with Mediabunny (duration, size, `canDecode`, thumbnail); files it cannot read fall back to media element
  metadata (preview only). Project files are JSON (`app: "videoeditor"`) with the timeline and source metadata; media are
  relinked by file name (import or "Locate…").
- Waveforms: after loading a source with sound, `loadPeaks` decodes it once with `OfflineAudioContext.decodeAudioData`
  (files up to 400 MB) into 50 peak values per second; every audio/video clip draws its part (`in`…`out`, times the clip
  volume) into a canvas whose content is only redrawn when the clip, the zoom or the size changes.

Tests: `tests/apps/test_videoeditor.py` with media from `tests/helpers/media_samples.py` (ffmpeg of `imageio-ffmpeg`): import
and probing, timeline layout, preview pixels, split/ripple delete/undo, dragging between tracks, trimming, properties,
titles, export checked with ffmpeg (codecs, size, duration, pixels at given times), project save/open/relink, playback and
frame steps, German interface and phone layout, waveforms (height of a tone, scaling with the volume, video clips), transitions (pixels in the middle of a dissolve, wipe, slide and
circle), picture settings (brightness, rotation, crop, reset, motion at start and end; brightness in an exported file), subtitles (SRT and
WebVTT import, burnt-in text, SRT export).

### Web inspector (`apps/webinspector`)

Reduced browser wrapper (decision D-004), no libraries.

- Pages are loaded with `Suite.relay.http` (all headers, no CORS) or, without a relay, with `fetch` (the CSP allows
  `connect-src http: https:` for this). Bodies are decoded with the charset of `Content-Type` or the `<meta charset>`.
  Every request is recorded (method, headers, status, body, time) and can be exported as HAR 1.2 (`analyze.js` `toHar`).
- `js/analyze.js`: `securityChecks` (header rules with i18n keys), `structure` (DOMParser: meta, headings, links, images,
  scripts, styles, forms, frames and accessibility/security hints), HAR helpers (`parseHar`, `mimeGroup`, `bodyOf`, `curl`),
  `previewDocument` and `highlightHtml`.
- The preview removes scripts, `noscript`, frames, objects, `base`, `meta http-equiv`, event handler attributes and
  `javascript:` URLs, makes links absolute and removes form actions. Through the relay it inlines stylesheets (and the
  `url()`s inside them), images, posters and inline-style images as data URLs (at most 80 requests). It is shown in a `srcdoc`
  iframe with `sandbox="allow-same-origin allow-popups …"` (no `allow-scripts`); the iframe inherits the page CSP, so nothing
  loads from the network. A click handler on the iframe document loads clicked links in the inspector. Resources that could
  not be loaded or are blocked lose their address (`data-original-src`, CSS `url(data:,)`), so the preview requests nothing.
  Preview sizes set the iframe's content box to the device size (`box-sizing: content-box`), so `innerWidth` and media
  queries match.
- Cookies (`analyze.js`): `parseSetCookie` (RFC 6265 simplified: Domain must match the host, Max-Age wins over Expires,
  default path from the request path), `storeCookies` (replace by name/domain/path, expired cookies delete), `cookieMatches`
  and `cookieHeader` (longer paths first). With *Keep cookies* the jar lives in the page state and `request()` adds the Cookie
  header to relay requests. `blockedBy(rules, url)` matches host rules by suffix and `*` patterns against the whole URL (or
  without the scheme); blocked resources are recorded as requests with status 0. Preview size, rotation, rules and the
  keep-cookies switch are per-browser preferences in localStorage.
- `js/bookmarklet.js` is embedded as text (`<script type="text/plain">`); `bookmarkletUrl()` removes comments, collapses
  whitespace and URL-encodes it (the file avoids line comments and relies on semicolons). The panel lives in a shadow root,
  hooks `console.*`, `error` and `unhandledrejection`, evaluates input with indirect `eval`, and reads Resource Timing,
  cookies and storage. Running it again toggles the panel (`window.__suiteInspector`).

Tests: `tests/apps/test_webinspector.py` with a local test site — loading through the relay (Python and PowerShell) with
inlined styles/images, security checks, structure hints, source search, requests and HAR export, navigation in the preview
and back; direct loading with CORS and pasted sources without relay; the HAR viewer (filters, sorting, JSON/image bodies,
query/post data, timings, cURL); the bookmarklet on an HTTP page (console capture, evaluation, info, network, element
picker, toggle) and in the app; German interface and phone layout.

### Overview (`apps/overview`)

Contains all built apps: `bundle.json` lists `dist/<app>.html`, which `build.py` embeds gzip + base64 (the overview is
therefore built last). An app is decoded on first use (`DecompressionStream`) and started by **writing its HTML into an
empty frame or window** (`document.open/write/close` on `about:blank`). Such a document has the origin of the overview,
so it keeps a secure context with File System Access API, Web Crypto and storage. Documents from Blob URLs do not on
`file://` in Chromium (opaque, insecure origin), and cannot be navigated to from other windows ("Not allowed to load
local resource"). Written documents inherit the overview's Content-Security-Policy in addition to their own, so the
overview's policy is the union of all app policies (checked by `tests/apps/test_overview.py`).

Frames and windows get the name `suite-hub-app`; `Suite.bridge.hub()` returns the parent frame or opener then. The
overview relays “Open with…” requests into new tabs (no pop-ups) and receives `dirty` messages from `Suite.shell.setDirty`
for the tab markers. “Save all apps” writes into a folder (`showDirectoryPicker`) or builds a ZIP (`js/zip.js`, stored
entries). The overview is about 90 MB; it loads in about 2 s because the apps are only decoded when started.

### Web slides (`apps/reveal`)

Diagram blocks (`js/mermaid-svg.js`) import `mermaid.js`, `layout.js` and `model.js` of the diagram editor through the import map
(`@diagram/…`): the flowchart is parsed, laid out and drawn as an SVG string (shape paths, edges with arrow heads, labels with a
background rect) in `currentColor`; the block keeps `source`, `svg` and `error`, and `renderBlock` only inserts the SVG. Drag and drop
in the slide list uses HTML5 drag events (`application/x-rv-slide`); `dropSlide` takes the slide out (a main slide with its
sub-slides) and inserts it before the target or as the target's last sub-slides. Print with notes passes `showNotes: 'separate-page'`
to the print view.

Conversion with PowerPoint (`shared/js/deck-convert.js`, used here and in the presentation editor, which imports `deck.js` of this app for
`fromHtml`/`fromMarkdown`): `pptxToWebSlides` orders the unlocked elements by position (rows within 20 px, then x) and maps title
placeholders to headings, bullet/body placeholders to lists (levels as indentation), other text to text blocks (runs as `<strong>`, `<em>`,
… and coloured spans except greys), pictures and tables; entrance animations become fragments (`fragmentIndex` = click group), transitions
reveal.js transitions. `webSlidesToPptx` flattens the stacks and lays the blocks out from the top (HTML and Markdown slides are first turned
into blocks with `DOMParser` / a small Markdown subset), estimates heights from font size and text length and scales everything down when
it is taller than the slide; fragments (also on list items) become entrance animations, slides with dark backgrounds get white text.

Visual editor for reveal.js presentations. ES modules `deck.js` (model, HTML generation, import) and `main.js` (UI). The
reveal.js builds, plugins, stylesheets, themes and fonts are embedded as text (`<script type="text/plain">`, see
`vendor/README.md`), because the app writes them into the presentations it creates.

- **Model**: `deck = { title, lang, theme, highlightTheme, css, config, slides: [stack] }`; a stack is a main slide with
  `children` (vertical sub-slides). A slide has `kind` `blocks` (heading, text, list, image, code, quote, table, HTML blocks
  with fragment effect and index, auto-animate `data-id`, alignment, size, colour), `markdown` (rendered by the markdown
  plugin: `<section data-markdown><textarea data-template>`) or `html`, plus background, transition, auto-animate,
  visibility, layout, auto-slide and notes (`<aside class="notes">`).
- **Output**: `renderPage(deck, assets)` writes one self-contained HTML page: reveal.css, the theme's fonts, theme,
  highlight theme and custom CSS, the slides, the editor model as `<script type="application/json"
  id="suite-reveal-deck">`, reveal.js and the plugins inline, and `Reveal.initialize` with the deck configuration. Saved
  presentations therefore play offline and open again losslessly.
- **Preview**: the same page with `editable: true` (blocks carry `data-block`) in an `<iframe srcdoc>` (same origin,
  inherits the app's CSP), configured `embedded`, without fragments, transitions and auto-slide. The editor attaches to
  the frame's document: clicks select blocks, double-clicks make them `contentEditable` (keyboard navigation of reveal.js
  is switched off meanwhile), formatting uses `document.execCommand` in the frame, and edited content is read back into
  the model without rebuilding the frame. Other changes rebuild the frame (debounced) and return to the current slide.
- **Presenting**: a full-screen overlay frame, or a new window written via `about:blank` (speaker notes window and print
  view work there); the print view uses `view: 'print'`.
- **Import**: own HTML (embedded model), other reveal.js HTML (sections become HTML slides; backgrounds, transitions,
  notes, theme link and common `Reveal.initialize` options are recognised), Markdown with `---`/`--`/`Note:` separators,
  and Jupyter notebooks with `metadata.slideshow.slide_type` (slide, subslide, fragment, skip, notes), like
  `nbconvert --to slides`. Export also to Markdown.
- **Undo**: `Suite.UndoHistory` with deck snapshots; typing in one field or one edited text is merged into one step.

The notebook keeps cell metadata, shows a slide-type selector per cell (“Slideshow”) and opens the notebook in the web
slides app through the app bridge (“Slides”).

**Formulas** (D-042): `usesMath(deck)` looks for `$$…$$`, `\(…\)` and `\[…\]`; only then `renderPage` embeds KaTeX
(`vendor/katex`: `katex.min.js`, `auto-render.min.js` and `katex.css` with the WOFF2 fonts as `data:` URLs) and calls
`renderMathInElement` when reveal.js is ready (`body[data-math=rendered]`). reveal.js' own math plugin is not used because
it loads KaTeX from a CDN. Markdown slides pass through marked, which would remove backslashes before punctuation and turn
`_`/`*` into emphasis: `mathForMarked` escapes them inside formulas when the page is generated and `mathFromMarked` reverses
this when a foreign presentation is imported. In the editing preview each block keeps its source (`el.suiteSource`), which
`startEditing` restores, so texts are edited as TeX.

Tests: `tests/apps/test_reveal.py` edits texts in the preview, adds slides and elements, sets backgrounds, transitions,
fragments, notes and deck options, checks the saved HTML and plays it offline in a new page (`Reveal.getTotalSlides`,
highlighting), reopens it, imports Markdown, a notebook and a foreign reveal.js file, presents, and opens a notebook from
the notebook app; plus slide structure with undo, German interface and phone layout; formulas (display and inline in
Markdown, `$` left alone, editing the TeX source, escaping in the saved file and on import, offline typesetting, no
KaTeX without formulas).

## Relay

The relay forwards TCP connections (WebSocket, with STARTTLS) and HTTP requests (without CORS restrictions).
Implementations: `relay/python/relay.py` (standard library) and `relay/powershell/relay.ps1` (no modules, no
administrator rights). The protocol (version 2), the options and reverse proxy examples are in `relay/README.md`.

Protocol version 2 adds remote use: listening on other addresses (`--bind`) with an own TLS certificate or behind a
reverse proxy (`--trusted-proxy`, `--base-path`, `--host`), user accounts (`--users`, PBKDF2-SHA256 hashes, created
with `--add-user`, per-account target allow-lists), sessions (`POST /auth`, sliding expiry), rate limiting of failed
logins, and sign-in by the reverse proxy (`--proxy-user-header`). Credentials are only accepted over TLS or from the
local machine. Both implementations share the users file format and pass `tests/relay/test_auth.py`. The PowerShell
relay keeps sessions and login failures in synchronized hashtables shared by its connection runspaces, and reads the
browser side of a tunnel asynchronously, so that it also works over an `SslStream`.

`shared/js/relay.js` takes `{ url, token, user, password, allowInsecure }` (`Suite.relay.config`): with a user name it
logs in, caches the session per relay and credentials, and logs in again once when the relay answers `invalid token`
or `session expired`. It refuses to send credentials to `http://` addresses of other machines unless `allowInsecure`
is set. The relay settings form (`appdata.js` `RelayFields`) offers the sign-ins token, user name and password, and
reverse proxy / client certificate; `data.relayConfigured()` tells the apps whether the settings are complete. The
apps that use the relay allow `connect-src http: https: ws: wss:` so that the relay can run on any host.

## Tests

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium firefox
python3 build.py
.venv/bin/pytest
```

The tests open the built HTML files from `file://` in Chromium and Firefox. They check that pages make no
network requests and produce no console errors. Shared modules are tested through the testbed
`testbeds/shared`; file access with the File System Access API uses picker stubs backed by the origin private
file system (served over http). Interoperability is checked with pykeepass, openpyxl, python-docx,
python-pptx, nbformat, LibreOffice and an OpenSSH server.

`pytest --mobile` runs every browser test on a phone display (393 × 851 CSS pixels, device scale 2.75, touch; Chromium
also emulates a mobile browser with `is_mobile`): the `browser` fixture wraps `new_context` so that every context gets
these options unless a test sets its own viewport (`tests/helpers/devices.py`). The tests then act like a phone user:
before an action (or `expect(...).to_be_visible()`) on an element that exists but is hidden, the navigation buttons
(☰/Panels, Slides, ‹ Groups, ‹ Entries, ←, Media/Properties tabs) are tapped until it is visible; before an action on an
element covered by an open drawer or its shade, and before raw mouse input on a point the drawer covers, the drawer is
closed by tapping the shade. Elements that no visible button reveals still fail. Run the suite once normally and once
with `--mobile`.

`SUITE_DIST=<directory>` makes `build.py` write the apps to another directory (the overview embeds the apps from
there as well) and the tests open them from there, so that changes can be built and tested while another test run
uses `dist/`.

### Recovery copies (autosave)

`shared/js/autosave.js`: apps call `Suite.autosave.register({ app, save, restore })`; `save()` returns a
structured-cloneable snapshot (or null), stored in IndexedDB `suite-autosave` (one record per app, works on `file://` in
Chromium and Firefox; file handles and Blobs are kept). `Suite.shell.setDirty(true)` schedules a copy (interval 15 s,
`localStorage['suite.autosave.interval']` in tests) and `visibilitychange` to hidden stores at once; `setDirty(false)`
deletes it unless a found copy still waits for the user's decision. On start a banner (`Suite.shell.banner(message,
actions)`) offers Restore/Discard; restoring stores a fresh copy and sets the app dirty. Snapshots above 64 MB are
skipped. Per app: text editor (changed documents with handles and saved text), hex editor (bytes), diagram (draw.io XML),
image editor (OpenRaster), spreadsheet and document (Univer snapshots), presentation and web slides (deck objects),
notebook (ipynb), audio editor (project file), video editor (project and media up to 48 MB), calendar (iCalendar texts
of changed calendars), database tool (SQLite exports of changed databases), HTTP analyzer (Postman collection), archive
(the archive written with level 1, without passwords), PDF viewer (bytes with form data, annotations and page changes);
not KeePass. Test: `tests/apps/test_autosave.py` (each app: change, copy, second tab restores, discard).

### Keyboard shortcut overview

The section "## Keyboard shortcuts" (German: "## Tastenkürzel") of `docs/<lang>/apps/<app>.md` is the single source of
an app's shortcut list: tables `| `Ctrl+S` | Save |` (alternatives `a` / `b`), grouped by `### Group` headings.
`build.py` replaces `<script type="application/json" data-shortcuts="<app>">` with `#suite-shortcuts`
(`{"en": [{group, keys, text}], "de": [...]}`); the build fails if an app has none. The shell lists them in the ? dialog
for the current language and opens it with `F1` (and `?` outside of text fields). Test: `tests/apps/test_shortcuts.py`
(every app, both languages, the number of rows matches the documentation).

### Command palette

The end of `shared/js/shell.js` holds `Suite.palette`: when opened it collects the enabled buttons, tabs, `a[href="#"]` links
and the options of `select` menus inside `#app` (not in dialogs, not the shell's theme/language/about/⌘ buttons), labelled by
`title`/`aria-label` and text, de-duplicated; `Suite.palette.register(provider)` adds app-defined entries. Running an entry
clicks the element (or sets the select's value and fires `input`/`change`) after the palette has closed and the focus is
back, so apps see an ordinary user action. Search folds case and accents; all words must match. Keys: `Ctrl/Cmd+Shift+P`
and `Ctrl/Cmd+Shift+Space` (capture phase; Firefox reserves the first). Test: `tests/apps/test_palette.py` (every app has
entries without the shell buttons; running a menu entry and a button; app-registered entries; calendar and hex editor).

### Accessibility

`shared/js/shell.js` gives icon-only buttons (`button`, `[role=button]`, `a`, `summary` with a `title` and no two-letter word in
their text) their title as `aria-label`, through a MutationObserver on the whole document (also titles that change with the
language); labels set by an app are kept (the automatic ones are marked with `data-auto-label`). `shared/css/suite.css` defines
`--suite-selected` (light and dark) for selected rows and list entries – Pico's `--pico-primary-focus` is too dark for links and
coloured text on it (WCAG 4.5:1) – and a `:focus-visible` outline for every element. The command palette is a combobox with
`aria-activedescendant`; tab bars use `role=tablist`/`tab` with `aria-selected` as strings (Preact drops `false`); CodeMirror
editors get an `aria-label` through `EditorView.contentAttributes`. Test: `tests/apps/test_accessibility.py` runs axe-core
(axe-playwright-python, WCAG 2.1 A/AA rules) on the start screen of every app in light and dark mode and on the shell dialogs
(shortcut overview, palette); the Univer surfaces and CodeMirror's syntax colours are excluded.

### Recent files and window title

`Suite.files.remember(app, handle)` keeps up to ten `FileSystemFileHandle`s per app in IndexedDB
(`suite-recent-files`) and fires a `suite-recent` event; `Suite.files.forget(app)` clears them. `Suite.shell.Recent`
(`<${Suite.shell.Recent} app=… onOpen=… before=… />`) is the shared select: it reloads on the event, asks `before()`
(unsaved changes), calls `Suite.files.reopen` (permission prompt) and `onOpen({ file, handle })`. It renders nothing
without the File System Access API. `Suite.shell.setFileName(name)` sets the window title to "name – app".
Test: `tests/apps/test_recent_files.py` (eleven editors, picker stubs on the origin private file system).

### Phone layout

Below 760 px the shell stylesheet turns the header toolbar (`.suite-header > nav`) into a full-width, horizontally
scrolling row below the title. Side panels carry the class `suite-drawer` (fixed position, from `--suite-top` to the
bottom, 20 rem wide at most) and are shown by the app's own `open` class. `shell.js` keeps `--suite-top` at the bottom
edge of the header and banner (ResizeObserver), because the header wraps to two or three lines on phones; drawers must
never cover it, so the button that opened a drawer can always close it. Apps render `Suite.shell.backdrop(onClose)`
next to an open drawer: a shade below the drawer (hidden on wide screens) that closes it on a tap. Toasts ignore the
pointer, so they never block buttons.

## Documentation

The documentation is written in Markdown in `docs/en/` and `docs/de/`. `tools/build_docs.py` converts it to
Confluence storage format in `docs/confluence/` (code blocks become code macros, notes become info/warning
macros, links between the documents become page links). `tools/build_docs.py --check` fails if the generated
files are out of date.
