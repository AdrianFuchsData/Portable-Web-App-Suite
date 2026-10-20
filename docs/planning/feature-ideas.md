# Feature ideas

Functions that users are likely to expect from the applications and that fit the constraints of the suite (single HTML
file, `file://`, no server, minimal rights, Chromium and Firefox, phones). Collected 2026-10-18.

**Status 2026-10-20 (version 1.0.0):** the ideas rated ★★★ or ★★ with effort S or M have been implemented, as well as the
interactive notebook widgets; the user guides describe them, including their limits. The notes in the tables describe the
starting point when the ideas were collected. The remaining ideas (★, or effort L) are not decided.

Effort: **S** = up to a day, **M** = a few days, **L** = a week or more. Value: ★★★ = expected by most users of this kind
of tool, ★★ = often useful, ★ = nice to have. Notes name the technique or the library where it is not obvious.

## Across all applications

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Recent files list in every editor (with handles where the browser keeps them) | ★★★ | S | `Suite.files.remember` exists; only some apps show a list (text editor). Firefox: names only. |
| Autosave / crash recovery of unsaved work | ★★★ | M | Periodic snapshot to IndexedDB/OPFS per app; offer to restore on start. Needs size limits (video, audio). |
| Keyboard shortcut overview (`?` dialog per app) | ★★ | S | Shortcuts are documented but not discoverable in the app. |
| Print / PDF export for documents, diagrams, calendars, spreadsheets | ★★ | S–M | `window.print()` with print stylesheets; diagram and calendar have none yet. |
| Command palette (`Ctrl+Shift+P`) with all actions | ★★ | M | Shared component; actions registered per app. Helps on phones (fewer toolbar buttons). |
| Accessibility pass (focus order, ARIA labels on icon buttons, contrast) | ★★ | M | Many icon-only buttons have `title` only. |
| Settings export/import together with app data (one JSON/KDBX for the whole suite) | ★★ | M | Builds on the app data format (D-012). |
| Hosted PWA variant (offline install, file handlers) | ★★ | M | Built in 1.0.0 (`tools/build_pwa.py`); planned with `manifest.json`, service worker, `file_handlers` for Chromium. |
| More interface languages | ★ | S per language | i18n tables are per app; a translation table export/import would help translators. |

## Text editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Find in all open files / in a folder (File System Access directory handle) | ★★★ | M | Chromium only for folders; open tabs everywhere. |
| Split view (two editors side by side, same or different file) | ★★ | M | CodeMirror supports several views on one state. |
| Compare two files (diff view) | ★★ | M | `@codemirror/merge`. |
| Indentation guides, minimap | ★ | S | Folding, bracket matching and block selection already come with CodeMirror's `basicSetup`; minimap via `@replit/codemirror-minimap` (MIT). |
| Macros (record/replay key sequences), sort/unique/trim lines, case conversion | ★★ | S–M | Notepad++ users expect the “TextFX”-like line tools. |
| Format JSON/XML/HTML/CSS, base64/URL encode/decode of the selection | ★★ | S | Built-in formatters for JSON/XML; prettier would be too large. |
| Open a folder as a project tree | ★ | M | Chromium only. |

## Hex editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Compare two files byte by byte | ★★ | M | Second view with synchronised scrolling and difference marks. |
| Checksums of selection/file (CRC32, MD5, SHA-1/256) | ★★ | S | WebCrypto for SHA; small JS for CRC32/MD5. |
| Structure templates (e.g. ZIP, PNG, BMP headers) shown in the inspector | ★ | L | 010-Editor-like; a small template language. |
| Fill/insert patterns, bookmarks | ★ | S | |

## Archive manager

| Feature | Value | Effort | Notes |
|---|---|---|---|
| 7z and RAR reading | ★★★ | M | libarchive.js (WASM; MIT, libarchive BSD) reads 7z/RAR/XZ/BZip2/LZMA; writing 7z is rarer. |
| AES-256 encrypted ZIP (read/write) | ★★★ | M | ZipCrypto exists; zip.js (BSD-3) supports AES, fflate does not. |
| Tar.xz / tar.bz2 / tar.zst | ★★ | S–M | Via libarchive.js or small decoders. |
| Test archive integrity (CRC check of all entries) | ★★ | S | |
| Split/multi-volume ZIP | ★ | M | |

## Media player

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Equaliser and audio normalisation | ★★ | S | Web Audio `BiquadFilterNode`s on a `MediaElementSource`. |
| A–B repeat, frame stepping, snapshot of the current frame | ★★ | S | |
| Resume position per file, media library view with metadata/covers | ★★ | M | Tags via Mediabunny metadata or a small ID3 reader. |
| Formats the browser cannot play (e.g. AVI/MKV with unsupported codecs) | ★ | L | Software decoding (ffmpeg.wasm) is large (≈ 30 MB) and slow; probably out of scope. |

## Audio editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Project file (tracks, clip positions, beat grids, gains) | ★★★ | M | Save currently mixes down to one WAV; a ZIP with WAV/FLAC per clip + JSON keeps the arrangement. |
| Clip gain, clip fades and crossfades (draggable handles) | ★★★ | M | Non-destructive envelope per clip; mixing already per clip. |
| Volume automation (envelope) per track | ★★ | M | |
| Noise reduction, compressor/limiter, reverb, pitch shift (keeping tempo), equaliser | ★★★ | M each | Pitch shift = WSOLA (exists) + resampling; spectral noise gate with the existing FFT. |
| Spectrogram view | ★★ | S–M | FFT exists in `beats.js`. |
| Labels/markers track with export (Audacity label format) | ★★ | S | Cues exist per clip; project-level markers are missing. |
| Variable-tempo beat tracking and bar (downbeat) detection | ★ | M | Current grid is constant tempo. |
| Metronome / click track generator from a beat grid | ★ | S | |

## Video editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Transitions between clips (cross-dissolve, wipe) | ★★★ | M | Compose two frames in `drawClip`; overlapping clips on one track. |
| Speed changes (slow motion, fast forward) and reverse | ★★ | M | |
| Colour correction (brightness, contrast, saturation), crop, rotate, Ken Burns | ★★ | M | Canvas filters per clip. |
| Audio waveforms in the timeline, audio ducking | ★★ | S–M | Reuse the audio editor's peaks code. |
| Picture-in-picture/overlay positions with keyframes | ★★ | L | |
| Subtitle track (SRT import/export, burn-in) | ★★ | M | |
| GIF export, export of a single frame as PNG | ★ | S | |

## Image editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Magic wand, lasso and polygon selection, selection add/subtract | ★★★ | M | Selection as an alpha mask (the layer model is ready for masks). |
| Layer masks, adjustment layers, layer effects (shadow, stroke) | ★★ | L | |
| Clone stamp / healing, smudge, blur/sharpen brush | ★★ | M | |
| Curves and levels dialogs with histogram | ★★ | M | Only automatic levels exist. |
| Open/save PSD with layers | ★★ | M | ag-psd (MIT); OpenRaster (`.ora`) already keeps layers. |
| Vector paths/pen tool, text on path | ★ | L | |
| Batch resize/convert of several images | ★ | S | |

## Diagram editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| More shape libraries (UML, BPMN, network, AWS/Azure icons, ER) | ★★★ | M | draw.io stencils are XML; licences of icon sets must be checked. |
| Automatic layout (tree, layered, organic) | ★★ | M | elkjs (EPL-2.0) or dagre (MIT). |
| Mermaid / PlantUML-like text import | ★★ | M | Mermaid (MIT) is large; a parser for flowcharts only is smaller. |
| Layers, groups, locking | ★★ | M | |
| Export to PDF, VSDX import | ★ | M–L | |

## PDF viewer

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Page operations: merge PDFs, delete/reorder/rotate/extract pages | ★★★ | M | pdf-lib (MIT) writes PDFs; viewer uses pdf.js for display. |
| Digital signature display and verification status | ★★ | M | pdf.js shows signature fields; verification needs a CMS parser. |
| Fill and sign (draw or type a signature image) | ★★ | S | Annotations exist; signature as stamp annotation. |
| Text selection copy with layout, OCR of scanned pages | ★ | L | OCR = tesseract.js (Apache-2.0, ≈ 10 MB with one language). |
| Compare two PDF versions | ★ | M | |

## Spreadsheet

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Charts (insert, edit, keep in XLSX) | ★★★ | L | Charts are not part of the open-source Univer packages; own chart objects with ExcelJS export are possible but large. |
| Conditional formatting and data validation in import/export | ★★★ | M | Univer has the plugins; the ExcelJS mapping must be extended. |
| Pivot tables | ★★ | L | |
| CSV import dialog (separator, encoding, column types) | ★★ | S | |
| Comments/notes on cells | ★ | M | |

## Document editor

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Table of contents, footnotes, page numbers in fields | ★★★ | M | DOCX export through `docx` supports these; Univer support varies. |
| Track changes and comments (DOCX round trip) | ★★ | L | |
| ODT import/export | ★★ | M | |
| PDF export with layout (print stylesheet is the fallback) | ★★ | M | |
| Spelling check (Hunspell dictionaries DE/EN) | ★★ | M | Built with Hunspell (hunspell-asm) instead; first idea: nspell (MIT) with LibreOffice dictionaries (licences per dictionary). |

## Presentation editor and web slides

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Presenter view with notes, timer and next slide (PPTX editor) | ★★★ | M | Web slides has it through the reveal.js notes plugin. |
| Slide transitions and simple animations in PPTX | ★★ | M | |
| Charts and SmartArt-like diagrams | ★ | L | |
| Web slides: Mermaid/diagram blocks, math (KaTeX), vertical-slide drag-and-drop, PDF export with notes | ★★ | S–M each | reveal.js math plugin needs KaTeX (MIT, fonts ≈ 1 MB). |
| Convert between PPTX and web slides | ★★ | M | Both models exist; text, images and simple shapes map well. |

## Calendar

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Reminders (notifications while the page is open) | ★★ | S | Notification API; `VALARM` is already in iCalendar. |
| CalDAV sync through the relay | ★★★ | L | Needs HTTP via the relay (exists for the HTTP analyzer). |
| Free/busy view across calendars, time zone per event | ★★ | M | |
| Print week/month | ★ | S | |

## Mail client

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Several accounts at once, unified inbox | ★★ | M | |
| Conversation threading (IMAP THREAD or References headers) | ★★ | M | Server-side search exists. |
| S/MIME and OpenPGP (read and sign/encrypt) | ★★ | L | openpgp.js (LGPL) – licence decision D-002. |
| Rules/filters, signatures, templates | ★★ | M | |
| CardDAV contacts, LDAP address lookup through the relay | ★ | L | |

## KeePass

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Key file creation and hardware-key (YubiKey challenge-response) unlocking | ★★ | M | Key files can be used, not created; challenge-response needs WebHID/WebUSB (Chromium). TOTP and entry history exist. |
| Password health report (weak, reused, old; HIBP k-anonymity check optional through the relay) | ★★ | M | |
| Merge/synchronise two databases | ★★ | M | kdbxweb has `merge`. |
| Auto-type is impossible in a browser; copy-with-clear-timer exists | – | – | |

## Network tools

| Feature | Value | Effort | Notes |
|---|---|---|---|
| SSH: port forwarding (local), key generation, `known_hosts` management, X11-less SCP | ★★ | M | Engine supports channels; relay forwards TCP. |
| SSH: session logging and split terminals | ★★ | M | |
| FTP: directory synchronisation (compare local/remote), resume of interrupted transfers | ★★ | M | |
| HTTP analyzer: pre-request scripts and tests (Postman `pm.*` subset), WebSocket client, OpenAPI import | ★★★ | M each | Scripts in a sandboxed iframe/worker. |
| Database tool: ER diagram of the schema, query history, explain plan view, MySQL/MariaDB through the relay | ★★ | M each | MySQL protocol in JS is possible (relay TCP). |
| Web inspector: cookie/storage view of loaded pages, request blocking, responsive preview sizes | ★★ | M | Limited by the relay-based design (D-004). |

## Python notebook

| Feature | Value | Effort | Notes |
|---|---|---|---|
| Interactive widgets (ipywidgets subset) and interactive plots | ★★ | L | |
| Variable inspector, table viewer for DataFrames | ★★ | M | |
| Export to HTML/PDF (nbconvert-like) | ★★ | M | Web slides already exports notebooks as slides. |
| SQL magic connected to the database tool (SQLite files) | ★ | S | sqlite3 is part of Pyodide. |

## Suggested order

1. Quick wins with high value: recent files everywhere, PDF page operations, archive AES/7z reading, audio project
   file, keyboard shortcut overview, KeePass merge and password health report.
2. Editor depth: image editor selections, video transitions, audio clip fades/crossfades and effects, text editor
   search in files and diff.
3. Larger items that need decisions: spreadsheet charts, CalDAV, OpenPGP (license, D-002), hosted PWA.
