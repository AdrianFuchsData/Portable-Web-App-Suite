# Spike Results

Results of the prototypes in [`prototypes/`](../../prototypes/). The spikes are listed in the
[feasibility study](feasibility-study.md#10-spikes-short-prototypes-before-committing).
Tests ran with Playwright 1.64 (Chromium and Firefox builds shipped with Playwright) on Linux.

## S-1: ES-module libraries without a bundler ✅

**Question:** Can libraries that only ship ES modules (CodeMirror 6) run from a single HTML file
opened via `file://`, with only Python tooling (no node/npm)?

**Approach:**

1. `tools/vendor_esm.py` downloads packages from jsDelivr's `+esm` endpoint (one pre-built ES module
   per package) together with all their dependencies. It keeps **one version per package** (like
   an npm dedupe; jsDelivr pins different dependency versions per package, and CodeMirror breaks if
   `@codemirror/state` is loaded twice), rewrites the imports to bare specifiers
   (`"@codemirror/state"`) and writes an `importmap.json`, a `lock.json` with versions and licenses,
   and the license texts.
2. `build.py` replaces `<script type="importmap" data-src="…">` with an inline import map whose
   entries are `data:text/javascript;base64,…` URLs (later replaced by Blob URLs, see S-2). Own code split into several modules works the
   same way (own import map, bare specifiers like `app/languages`). Relative imports cannot be used,
   because they would resolve to `file://` URLs.

**Result:** works in Chromium and Firefox from `file://` under a strict CSP
(`script-src 'unsafe-inline' data:`, `connect-src 'none'`), without any network requests.
CodeMirror 6 with six languages and a theme: 29 packages, 681 KiB of code, 914 KiB as a built HTML file
(base64 adds about a third). Editing, undo, language switching and theme switching work.

**Consequences:**

- ES-module-only libraries (CodeMirror 6, Mediabunny, newer Excalidraw, …) can be used. The study's
  fallback (prefer UMD builds such as Ace) is no longer needed.
- Classic scripts and modules can be mixed. Modules run after classic scripts (they are deferred), so
  classic code waits for a "ready" promise that the module code resolves.
- Workers do **not** see the document's import map. Worker code must be self-contained or load
  libraries itself (see S-5).
- Tests must not use Playwright's `wait_for_function` with a string. It uses `eval`, which the CSP
  blocks (as intended). The apps signal readiness through DOM attributes (`body[data-ready]`) instead.

## S-2: Office engine ✅ (Univer) / ❌ for `file://` (ONLYOFFICE)

**Question:** Which office engine can run from a single HTML file opened via `file://`, without threads
and without node?

**Univer (Apache-2.0), prototype [`s2-univer-sheets`](../../prototypes/s2-univer-sheets/):**

- `vendor/univer-sheets.esm.json` vendors `@univerjs/presets` + `@univerjs/preset-sheets-core` 1.0.4 with
  React 18, RxJS and the German and English locales: 87 packages (57 MIT, 24 Apache-2.0, 5 ISC, 1 0BSD),
  127 modules, 8.9 MB of code. 77 hyphenation dictionaries of other languages (5 MB, loaded lazily with
  dynamic `import()`) are excluded; the vendoring tool got `exclude`/`include` patterns for this, explicit
  subpath `modules` (locales), and parallel downloads (10 s instead of 5 min).
- Runs in Chromium and Firefox from `file://` under a strict CSP (no `unsafe-eval`, `connect-src 'none'`),
  with no errors and no network requests: toolbar, formula bar, German UI, formulas (`=SUM`), editing by
  typing into cells, and the Facade API for reading/writing cells.
- **Embedding technique changed (all prototypes):** with the module code as `data:` URLs in the import map
  (S-1), Univer took **16 s** in Chromium (7 s in Firefox) until ready. The same modules served as normal
  files over HTTP took 3 s, so the `data:` URLs were the bottleneck. `build.py` now embeds the modules as
  plain text elements and a small classic script creates **Blob URLs and the import map** before any module
  runs: ready after **3.4 s** in Chromium and **4.5 s** in Firefox, and the file shrank from 12 MB to
  **9.1 MB** (no base64). CSP: `script-src 'unsafe-inline' blob:` instead of `data:`. The `data:` mode is
  still available (`data-mode="data"`).
- Not covered by Univer's open-source core: **XLSX import/export** (commercial Pro feature). Needs our own
  mapping between XLSX (ExcelJS/SheetJS, both usable without node) and Univer's workbook JSON. This is
  the main remaining work for the spreadsheet app (follow-up spike S-6).

**ONLYOFFICE via ranuts/document (AGPL-3.0), desk analysis:**

- About 440 MiB of static files: `sdk-all.js` of 14–16 MB per editor, 1,900 UI files loaded into an
  iframe with an AMD loader, 183 MiB of fonts, the x2t converter (7 MB brotli-compressed WASM), and the
  PDF engine. Code, translations, fonts and WASM are loaded at runtime with `XMLHttpRequest`/`fetch`,
  which `file://` blocks; ranuts already patches the editor in dozens of places ("guards") for its hosted use.
- Verdict: **not realistic as a single HTML file** (huge, and every loader would have to be rewritten).
  **Realistic in the hosted PWA variant** (it is built as a static web app), if the suite license allows
  AGPL (D-002).

**Consequences:**

- `file://` office apps: Univer for spreadsheets (proposed D-019). Docs and slides still to evaluate
  (Univer's docs/slides presets vs. own editors).
- ONLYOFFICE remains an option as a high-fidelity "office pro" mode of the hosted PWA variant, depending on
  the license decision.

## S-6: Office file import/export and docs/slides engines ✅ (sheets, docs) / desk evaluation (slides)

**Question:** Can the `file://` office apps read and write XLSX/ODS/CSV (spreadsheets) and DOCX
(documents) although Univer's open-source core has no import/export, and which engine fits
presentations?

### Spreadsheets: [`shared/js/univer-xlsx.js`](../../shared/js/univer-xlsx.js), prototype [`s6-office-io`](../../prototypes/s6-office-io/)

- **XLSX/XLSM ↔ Univer workbook JSON with ExcelJS 4.4** (MIT, vendored classic browser build). Mapped:
  strings, numbers, booleans, dates (serial numbers + number format), errors, rich text and hyperlinks
  (as text), formulas incl. **shared formulas** (mapped to Univer's formula ids `si`; on export written
  as individual formulas with shifted relative references), cached results, fonts (family, size, bold,
  italic, underline, strike, color, super/subscript), solid fills, borders (all 13 styles), alignment,
  wrap, text rotation, number formats, merged cells, column widths, row heights, hidden rows/columns/
  sheets, frozen panes, gridlines, tab colors. Theme and indexed colors (incl. tint) are resolved.
- **ODS, XLS, CSV and other formats through SheetJS CE 0.20.3** (Apache-2.0, from cdn.sheetjs.com; npm
  only has 0.18.5): converted to XLSX in memory and then imported. Values, formulas and merged cells
  survive; **styles do not** (styles are a SheetJS Pro feature). Export to ODS and CSV (with UTF-8 BOM)
  the same way.
- Univer recalculates all formulas, also for files without cached results (openpyxl).
- **Tests (both browsers):** an openpyxl sample with patched-in shared formulas; an XLSX written by
  LibreOffice; an ODS written by LibreOffice; an XLSX round trip after an edit checked with openpyxl
  (values, recalculated cached results, formulas, dates, booleans, all styles, merges, sizes, frozen panes,
  tab color, cross-sheet formula); ODS export checked by converting it back with LibreOffice; CSV export;
  open/save through the UI; unit tests of the formula reference shifter.
- **Fonts:** files often use Microsoft fonts that Linux/Android/thin clients lack (Calibri fell back to a
  serif font). [`shared/css/office-fonts.css`](../../shared/css/office-fonts.css) defines `@font-face`
  aliases with `local()` sources only (installed original first, then Carlito/Caladea/Liberation/DejaVu).
- **Performance** (20,000 rows × 10 columns, 20,000 formulas): import 2.3–3.4 s, Univer load 0.5–0.9 s,
  formula calculation 4–7 s on the main thread, export 3.1–3.9 s (Chromium/Firefox).

### Documents: [`shared/js/univer-docx.js`](../../shared/js/univer-docx.js), prototype [`s6-univer-docs`](../../prototypes/s6-univer-docs/)

- **Univer Docs 1.0.4** (`@univerjs/preset-docs-core`, Apache-2.0) runs from `file://` (8.8 MB page).
  Paginated "traditional" layout (A4, set on import) or pageless "modern" layout; typing works.
- **Import:** DOCX → HTML with **mammoth 1.13** (BSD-2, classic browser build) → Univer document data
  with Univer's exported clipboard converter `convertClipboardHtmlToDocumentData`. Keeps headings,
  paragraphs, bold/italic/underline/strike, bullet and numbered lists and tables. Workarounds found:
  the converter returns `id: ""` (such a document is never rendered; a second one collides) → the
  import assigns an id; it maps `<em>` to bold → mammoth style map writes `<i>`/`<u>`/`<s>`;
  Univer hyphenates by default and lazily loads dictionaries for the detected language → hyphenation is
  switched off on import (Word's default) and only the German/English dictionaries are vendored.
- **Lost on import:** colors, font sizes, paragraph alignment and page breaks (mammoth deliberately
  ignores direct formatting; Univer's converter also ignores CSS underline and alignment), images,
  headers/footers, footnotes.
- **Export:** Univer document data → DOCX with **docx 9.11** (MIT, ES module): headings, paragraphs,
  alignment, runs (bold, italic, underline, strike, size, font, color, highlight, super/subscript), bullet
  and numbered lists, tables, page breaks. Checked with python-docx and LibreOffice.
- **Tests (both browsers):** import of a python-docx sample (text, run formatting, heading levels, list
  types, table, page layout), round trip checked with python-docx and converted by LibreOffice, typing
  into the editor and exporting, open/save through the UI.
- **Assessment:** good enough for a first version. For Word-like fidelity a **direct DOCX reader**
  (`document.xml`, `styles.xml`, `numbering.xml` → Univer's model, which is close to Word's: text stream
  with paragraphs, runs, tables, sections) should replace the mammoth/HTML route; the exporter already works
  on the model.

### Presentations: desk evaluation

| Candidate | License | Notes |
|---|---|---|
| Univer Slides (`@univerjs/slides`, `slides-ui` 1.0.4) | Apache-2.0 | Exists, but no preset and a small UI layer (120 KiB), clearly behind Sheets/Docs. Worth re-checking. |
| PptxGenJS 4.0 | MIT | Mature PPTX writer (text, shapes, images, tables, charts, notes). |
| pptx-preview 1.0 / @aiden0z/pptx-renderer 1.3 | ISC / Apache-2.0 | PPTX parsing and rendering (viewing), possible import base. |
| Konva 10 / Fabric 7 | MIT | Canvas object models for an own slide editor. |

**Recommendation:** own slide editor on Konva (or Univer Slides if it matures), PPTX export with
PptxGenJS, PPTX import based on a renderer library or an own parser (follow-up spike S-7).

## S-7: Presentation editor ✅ (own editor) / ❌ (Univer Slides)

**Question:** Univer Slides or an own editor? How well can PPTX be read and written without node?

### Univer Slides (prototype [`s7-univer-slides`](../../prototypes/s7-univer-slides/))

- `@univerjs/slides` + `slides-ui` 1.0.4 (no preset; assembled from 9 plugins, 6.9 MB) run from `file://`:
  slide thumbnails, slides with text, rectangles/ellipses, images, adding slides.
- **Not suitable:** a text box holds one plain string with one style for the whole box (`richText:
  {text, fs, cl, bl}`); no paragraphs, mixed formatting, bullets, tables, layouts/masters, presenter mode
  or PPTX support. Like Univer Docs it lazily loads hyphenation dictionaries for the detected language,
  but slides have no setting to switch that off.

### Own editor (prototype [`s7-slides`](../../prototypes/s7-slides/), 791 KB page)

- **Model:** own JSON deck model in px (slides → text/shape/image/table elements; text as paragraphs with
  level, alignment, bullets and formatted runs), close to PPTX.
- **Rendering** ([`shared/js/slide-render.js`](../../shared/js/slide-render.js)): DOM instead of a canvas
  library: shapes as SVG (preset geometries), text as HTML (rich text, bullets/numbering, editable with
  `contenteditable`), images, tables. The same renderer draws the stage, the thumbnails and the presenter
  view. Konva/Fabric were not needed: they would require an own rich-text layout engine.
- **Editing:** select, move, resize, rotate with **Moveable 0.53** (MIT); double-click edits text in place
  (read back into runs, also in Firefox where "select all + type" leaves the paragraph structure); bold/
  italic for selected text or whole elements; add text boxes, rectangles, ellipses, slides; delete.
- **Presenter mode:** fullscreen, keyboard (arrows, page up/down, space, Escape) and click navigation.
- **PPTX import** ([`shared/js/pptx-import.js`](../../shared/js/pptx-import.js), own parser with **fflate
  0.8**, MIT): slide size, slides in order, placeholders inheriting position/size/alignment/font size/bullets
  along slide → layout → master → master text styles, theme colors incl. `lumMod`/`lumOff`/`tint`/`shade`,
  color map, theme fonts (`+mj-lt`/`+mn-lt`), shape style colors (`fillRef`/`lnRef`/`fontRef`), preset
  geometries, fills (solid, first gradient stop), lines, auto-fit font scale, groups (child coordinate
  transform), pictures (data URLs), tables (text, cell fills, spans), backgrounds (slide → layout → master),
  non-placeholder decoration of layouts and masters (locked).
- **PPTX export** ([`shared/js/pptx-export.js`](../../shared/js/pptx-export.js)) with **PptxGenJS 4.0**
  (MIT, classic bundle): slide size, backgrounds, text with runs/levels/bullets/alignment, shapes with
  fill/line/text, images, tables. Placeholders are written as ordinary text boxes; layouts/masters are not
  preserved.
- **Tests (both browsers):** python-pptx sample (title layout with inherited placeholders, two-level bullets,
  mixed runs, shapes, picture, table, background) imported and checked in detail; round trip checked with
  python-pptx and converted to PDF by LibreOffice (3 pages); moving and resizing with the mouse; editing
  text and formatting; adding/deleting; presenter navigation; open/save through the UI; Univer Slides smoke
  test. A LibreOffice rendering of the sample served as visual reference (white, left-aligned shape text;
  table style).
- **Not yet covered:** charts, SmartArt, video/audio, animations and transitions, speaker notes, gradient
  and picture fills, custom geometry, table styles (approximated by CSS), text auto-fit while editing,
  undo/redo, copy/paste, ODP.

## S-8: Direct DOCX reader ✅

**Question:** Can an own DOCX reader replace the mammoth/HTML route (S-6) and keep Word formatting?

**Implementation:** [`shared/js/docx-import.js`](../../shared/js/docx-import.js) (ES module, fflate +
`buildDocTransform` from `@univerjs/docs`) reads `document.xml`, `styles.xml`, `numbering.xml`, the theme,
`settings.xml`, headers/footers and media directly into Univer's document model:

- page size and margins; default and first-page header/footer; automatic hyphenation setting;
- style inheritance: document defaults → paragraph style chain (`basedOn`) → character style chain →
  direct formatting; theme fonts (`asciiTheme`);
- headings, title and subtitle (by style name or outline level); alignment, spacing before/after, line
  spacing (auto/exact/at least), indentation;
- bold, italic, underline, strike, size, font, color, highlight and shading, super/subscript;
- bullet and numbered lists from `numbering.xml`, also when the list comes from the paragraph style;
- tables: column widths, cell shading, horizontal (`gridSpan`) and vertical (`vMerge`) merges;
- inline images (floating images become inline), hyperlinks (Univer custom ranges), tabs, page breaks,
  fields (current result), content controls, inserted text (tracked changes accepted, deleted text dropped).

Univer details found on the way:
- **Images:** they need `@univerjs/preset-docs-drawing` and must be passed as the `DOC_DRAWING_PLUGIN`
  resource. Without it the plugin resets the document's drawings to none.
- **Hyphenation:** when it is on (LibreOffice writes `autoHyphenation=true`), Univer loads dictionaries
  for the language it detects per paragraph. The vendoring tool now writes **stub modules** for the
  excluded dictionaries (an empty pattern, so no hyphenation for those languages) instead of failing imports.
- **Switching documents:** the "active" document/workbook switches asynchronously after creating a new
  one, so the apps keep their own reference to the open unit.

**DOCX export extended** ([`shared/js/univer-docx.js`](../../shared/js/univer-docx.js)): page size and
margins, headers/footers, spacing, line spacing, indentation, images (`ImageRun`), hyperlinks
(`ExternalHyperlink`, runs split at link boundaries), Word highlight colors, cell shading and merges.

**Result (both browsers):** a python-docx sample with all features above imports with its formatting
(title/heading colors and sizes, theme fonts, colored/sized runs, highlight, superscript, strike,
centered/right/justified paragraphs with spacing and indentation, lists, shaded and merged table, image,
hyperlink, page break → 2 pages, header and footer, A4 with 2 cm margins). The export round trip keeps
all of them (checked with python-docx; LibreOffice renders 2 pages). A DOCX written by LibreOffice
imports as well. The mammoth route stays available for comparison and loses colors, sizes, alignment
and headers.

**Not yet covered:** footnotes/endnotes, comments, tracked-change display, section-specific page setups
(only the last section), columns, floating object positions, text boxes/shapes, charts, equations,
table borders/styles beyond shading, line breaks inside paragraphs (imported as paragraph breaks),
ODT.

## S-9: Python notebook with Pyodide ✅

**Question:** Can a Jupyter-like Python notebook with pandas, numpy and matplotlib run completely on the
client, from a single HTML file opened via `file://`? Can users add their own wheels later?

**Implementation:**

- [`tools/vendor_pyodide.py`](../../tools/vendor_pyodide.py) downloads **Pyodide 314.0.7** (Python 3.14.2) and
  a package set with all dependencies from `pyodide-lock.json` (SHA-256 checked), plus pure-Python wheels
  from PyPI (seaborn, openpyxl, et-xmlfile), writes a reduced lock file, `bundle.json` and license metadata.
  The files are committed (D-026); `vendor/pyodide.lock.json` records the SHA-256 of every file.
- `build.py` embeds the whole bundle (`data-bundle`, gzip + base64): the notebook page is **32 MB**.
- [`shared/js/python-kernel.js`](../../shared/js/python-kernel.js) + [`python-worker.js`](../../shared/js/python-worker.js):
  Pyodide runs in a **worker** (UI stays responsive). `fetch()` inside the worker is answered from the embedded
  files; nothing is requested from the network (`connect-src 'none'`). A small Python kernel produces
  Jupyter outputs (nbformat 4): streamed stdout/stderr, `execute_result` with `text/html` (pandas),
  `display()`, matplotlib figures as PNG through an inline backend, tracebacks reduced to the cell's frames,
  top-level `await`. Packages are loaded on first import, and preloaded and imported in the background after
  start.
- Prototype [`s9-notebook`](../../prototypes/s9-notebook/): code and Markdown cells with CodeMirror 6
  (Python/Markdown), Shift+Enter/Ctrl+Enter, run all, restart, move/delete cells, `.ipynb` open/save
  (nbformat 4.5, valid according to the `nbformat` package), file panel (upload into `/home/pyodide`,
  download results), **"Install wheel"**. HTML outputs and Markdown are sanitized with **DOMPurify**
  (no scripts, event handlers or external URLs), Markdown is rendered with **marked**.

**Platform findings on `file://` (relevant beyond Pyodide):**

- Workers cannot load ES modules: Chromium refuses **module workers** from Blob URLs; neither browser allows
  `import()` or `importScripts()` of Blob URLs **inside** a worker. Pyodide is ES-module-only, so the vendoring
  tool converts its two modules into classic scripts, and the kernel concatenates them with the worker code
  into **one** classic worker script.
- Pyodide refuses classic workers (detected via `importScripts("data:…")`); the converted script answers
  "not a classic worker". Pyodide's options `createPyodideModule`, `lockFileContents` and `packageBaseUrl`
  make it independent of URLs.
- No `SharedArrayBuffer` on `file://`: running code cannot be interrupted (only **restart** = terminate the
  worker), and `input()` does not work. Both would be possible in the hosted PWA variant (COOP/COEP).

**Result (Chromium and Firefox, 20 tests):** start until Python is ready **7–10 s** (decoding the 32 MB page
plus Pyodide start); numpy/pandas/matplotlib preloaded and imported after **22–29 s**, after that imports take
0.1 s and a figure about 1 s. Tested: DataFrame HTML output, numpy, matplotlib figures (with and without
`plt.show()`), seaborn, Excel round trip with pandas/openpyxl, streams, error tracebacks, top-level await,
`display()`, files in and out of Python, **installing a wheel from a file**, `.ipynb` round trip validated with
`nbformat`, typing + Shift+Enter, sanitizing of malicious HTML/Markdown, restart (state reset, wheels
re-installed). No network requests.

**User-supplied wheels:** a wheel file is written into the in-memory file system and installed with
`micropip.install("emfs:…", deps=False)`. Works for pure-Python wheels and for wheels built for Pyodide's
Emscripten platform (`pyemscripten_2026_0_wasm32` for this Pyodide version); normal CPython wheels with native
code (Windows/Linux/macOS) cannot run. Dependencies must be bundled or supplied as wheels as well. Installed
wheels are re-installed after a restart, but are lost when the page is closed (follow-up: remember them in a
file, or a directory handle on Chromium).

**Additional packages (extra size on top of the core set):**

| Package | Extra | Package | Extra |
|---|---|---|---|
| scipy | 13.2 MiB | duckdb | 8.2 MiB |
| scikit-learn (+scipy) | 17.6 MiB | polars | 17.4 MiB |
| statsmodels (+scipy) | 20.8 MiB | pyarrow | 9.5 MiB |
| sympy | 4.3 MiB | networkx | 1.7 MiB |
| lxml | 2.0 MiB | beautifulsoup4, pyyaml, regex, xlrd, requests | < 0.5 MiB each |

**Package set extended (D-025):** sympy, networkx, lxml, beautifulsoup4, pyyaml, xlrd, regex, requests,
sqlite3, SQLAlchemy, pykeepass, nzpy (≈ 43 MiB, 49 MB HTML). Findings:

- **PyPI wheels in the lock file:** pure-Python wheels from PyPI get entries in the reduced `pyodide-lock.json`
  (imports from `top_level.txt`, dependencies from the manifest), so they load on import like Pyodide's packages.
- **Indirect imports:** Pyodide only loads packages for the imports written in a cell. A Python import hook
  loads a bundled package when any import needs it (e.g. pandas importing openpyxl), synchronously via
  **JSPI** (`pyodide.ffi.run_sync`, available in current Chromium and Firefox).
- **pykeepass:** needs pycryptodomex, which has no Pyodide build; the kernel maps `Cryptodome` to
  pycryptodome's `Crypto` (same library). argon2-cffi fails with "Threading failure" for Argon2 with several
  lanes (KDBX default), because WebAssembly has no threads here; the kernel replaces
  `argon2.low_level.hash_secret_raw` with hash-wasm's single-threaded Argon2 (same result) via JSPI. A KDBX
  file created with desktop pykeepass is read, changed and saved in the browser and read back on the desktop.
- **requests:** works through urllib3's browser adapter (JSPI + `fetch`) against servers that allow CORS
  (including the preflight that requests' default headers trigger in Firefox). The notebook's CSP therefore
  allows `connect-src http: https:`; the embedded Pyodide files never touch the network.
- **sqlite3** is part of Pyodide's standard library; **SQLAlchemy** works with SQLite files in the in-memory
  file system.
- **nzpy** installs and imports, but cannot connect: Pyodide has no TCP sockets. The same applies to every
  library that needs TCP (paramiko/fabric, `ftplib`, `smtplib`, `imaplib`, database drivers): Python in the
  browser has the same sandbox as JavaScript, so it is **no fallback for environments without a relay**.
  Pyodide's (Emscripten's) socket emulation tunnels sockets through WebSockets, i.e. it needs a
  WebSocket-to-TCP proxy as well; a websockify-compatible mode of the relay (S-3) would let these Python
  libraries connect through it (possible extension).

**Not yet covered:** interrupting a running cell (needs `SharedArrayBuffer`), `input()`, interactive widgets
(ipywidgets), variable inspector, Python console mode (REPL view), persistence of installed wheels, add-on
package packs, mounting a local directory (`mountNativeFS`, Chromium).

## S-3: Relay ✅

**Question:** Can the relay run with minimal rights as a single script in several runtimes, and can a
page opened via `file://` use it?

**Implementation:**

- [`relay/python/relay.py`](../../relay/python/relay.py): Python standard library only (asyncio, own
  WebSocket handshake and framing, `ssl`, `urllib` for the HTTP proxy).
- [`relay/powershell/relay.ps1`](../../relay/powershell/relay.ps1): Windows PowerShell 5.1 / PowerShell 7,
  no modules, **no `Add-Type`/C# compilation**, **no `HttpListener`** (so no URL ACL/admin rights): a
  `TcpListener`, own WebSocket framing, one runspace per connection, `SslStream` for TLS, and an own minimal
  HTTP/1.1 client for the proxy (raw headers stay visible; avoids certificate callbacks on foreign threads).
  WebSocket unmasking uses one `BigInteger` XOR per frame, because a PowerShell byte loop is far too slow.
- [`shared/js/relay.js`](../../shared/js/relay.js): browser client (`connect()` with `read()`/`send()`/`startTls()`,
  `http()`, `info()`).
- Protocol additions compared to the study: a **STARTTLS control message** (needed for SMTP submission on
  port 587, IMAP/POP3 STARTTLS and Postgres `SSLRequest`), `insecure` for self-signed servers, `--cafile` for
  company CAs, `Origin` and `Host` checks against foreign web pages and DNS rebinding.

**Result:**

- Both implementations pass the same **23 conformance tests** (info, CORS preflight incl.
  `Access-Control-Allow-Private-Network`, origin/host/token checks, TCP echo, 3 MiB transfer, TLS,
  hostname mismatch, insecure mode, STARTTLS, HTTP GET/POST, forbidden headers such as `Cookie`,
  `Set-Cookie` visible, redirects, error statuses, unreachable targets, non-HTTP schemes).
- Browser tests from a `file://` page in Chromium and Firefox pass against both implementations (TCP,
  TLS, STARTTLS, HTTP proxy, wrong token). A direct `fetch()` to the same server fails with a CORS error,
  as expected.
- Throughput through the tunnel (echo on loopback, both directions at the same time): Python about
  **64 MiB/s**, PowerShell 7 about **23 MiB/s** per direction. That is sufficient for SFTP/FTP.
- Playwright's Chromium did not show a Local Network Access prompt for `file://` → `ws://127.0.0.1`.
  **Still to check in a regular Chrome/Edge**, where Local Network Access may ask the user once.
- Tested with PowerShell 7.6 on Linux. **Windows PowerShell 5.1 on Windows is not tested yet** (the
  script avoids PowerShell 7-only syntax; .NET Framework specifics such as default TLS versions need a
  check on a real Windows client).

**Consequences:**

- D-010/D-014 are feasible: Python and PowerShell relays without admin rights or installation.
- A shell variant is not needed for now; with minimal rights the required tools are unlikely to exist.
- The relay terminates TLS, so no browser-side TLS library is needed.

## S-4: SSH/SFTP engine as WebAssembly ✅

**Question:** Can SSH (terminal, commands) and SFTP run in the browser from a `file://` page, end to
end encrypted, through the relay, and without node?

**Implementation:**

- [`engines/ssh/`](../../engines/ssh/): Go program with `golang.org/x/crypto/ssh` and `github.com/pkg/sftp`
  (BSD), compiled with `GOOS=js GOARCH=wasm`. Its transport is the relay connection object from
  `shared/js/relay.js` (`send`/`read`/`close`), so the relay only sees SSH ciphertext. API: `connect`
  (password, keyboard-interactive, private keys incl. passphrase, host key callback returning a SHA256
  fingerprint), `exec`, `shell` (PTY, resize), `sftp` (list, stat, realpath, readFile, writeFile, mkdir,
  remove, rmdir, rename).
- [`tools/build_engine_ssh.py`](../../tools/build_engine_ssh.py): builds the engine reproducibly (same
  SHA-256 for the same Go version) and vendors `ssh-engine.wasm`, Go's `wasm_exec.js`, versions and license
  texts of only the linked modules to `vendor/wasm/`. The Go toolchain is a portable copy in `.tools/go`
  (no root) and is only needed to change the engine.
- [`shared/js/ssh.js`](../../shared/js/ssh.js): loads the embedded engine and connects it to the relay.
- Prototype UI with **xterm.js 6** (vendored as ES modules with `tools/vendor_esm.py`, which can now also
  fetch package assets such as `xterm.css`).

**Result:**

- Tests against a real **OpenSSH server running as the normal user** (no root; key authentication) pass in
  Chromium and Firefox, through both the Python and the PowerShell relay: exec with stdout/stderr/exit
  code, host key fingerprint identical to `ssh-keygen -lf`, rejected host key, failed authentication,
  ed25519, RSA and passphrase-protected keys, interactive shell with PTY size, SFTP round trip of 2 MiB
  (mkdir, write, list, read, rename, stat, remove, rmdir), and the prototype UI (login, terminal typing,
  file list).
- Size: engine 7.1 MB (1.9 MB gzip), prototype page 3 MB in total.
- Throughput (loopback, single-threaded WASM): ChaCha20-Poly1305 about 12 MiB/s raw channel throughput,
  AES-GCM only about 4 MiB/s (no AES instructions in WASM), so the engine prefers ChaCha20. SFTP: download
  about **7–10 MiB/s**, upload about **2.5–7 MiB/s** depending on browser and relay. Enough for typical
  admin work; large transfers are slower than a native client.
- Password authentication could not be tested automatically (a non-root `sshd` can only use keys); the
  code path uses the library's standard `Password`/`KeyboardInteractive` methods.

**Consequences / follow-ups:**

- The SSH and SFTP apps can share one engine. FTP will be a small own JS implementation over the relay.
- Possible optimizations later: run the engine in a Web Worker (keeps the UI responsive during
  transfers), pipeline SFTP uploads with larger requests, try TinyGo for a smaller binary.

## S-5: Platform capabilities on `file://` ✅

**Question:** Do embedded WASM, workers and the browser APIs the suite relies on work in a single
HTML file opened via `file://`?

**Approach:** `build.py` embeds binaries gzip-compressed and base64-encoded
(`<script type="application/octet-stream">`) and worker code as text (`<script type="text/plain">`).
`shared/js/embed.js` unpacks binaries with `DecompressionStream` and starts workers from Blob URLs.
The CSP allows `'wasm-unsafe-eval'` and `worker-src blob:`.

**Result:**

| Probe | Chromium | Firefox |
|---|---|---|
| Embedded WASM (gzip + base64) | ✅ | ✅ |
| Worker from Blob URL | ✅ | ✅ |
| `location.origin` | `null` | `null` |
| Secure context | ✅ | ✅ |
| `crossOriginIsolated` / `SharedArrayBuffer` | ❌ / ❌ | ❌ / ❌ |
| `showOpenFilePicker` (File System Access API) | ✅ | ❌ |
| `DecompressionStream`, WebCrypto, WebCodecs `VideoEncoder` | ✅ | ✅ |
| localStorage, IndexedDB | ✅ | ✅ |
| localStorage **shared between different `file://` HTML files** | yes | yes |

**Consequences:**

- Confirms the study: no WASM threads on `file://` (single-threaded builds only, threads only in the
  hosted PWA variant), File System Access API only in Chromium.
- localStorage is shared between all local HTML files **in both browsers** (the study expected this
  only for Chromium). Any local HTML file can read what another one stored. This confirms D-006:
  never store secrets or important data in browser storage. (To be re-checked with a regular
  Firefox installation, whose `file://` origin settings may differ from the Playwright build.)

## S-10: WebCodecs with Mediabunny for the video editor ✅

**Question:** Can a single HTML file opened via `file://` encode and decode video with WebCodecs, using Mediabunny
(MPL-2.0, vendored as an ES module) for muxing and demuxing?

**Approach:** `prototypes/s10-webcodecs` draws 30 frames on an `OffscreenCanvas`, adds one second of audio from an
`OfflineAudioContext`, encodes both with Mediabunny (`CanvasSource`, `AudioBufferSource`, `BufferTarget`) and decodes the
result again (`Input`, `CanvasSink`). Test: `tests/prototypes/test_s10_webcodecs.py`.

**Result:**

| Container / codecs | Chromium | Firefox |
|---|---|---|
| WebM, VP9 + Opus | ✅ encode and decode | ✅ encode and decode |
| WebM, VP8 + Opus | ✅ | ✅ |
| MP4, VP9 + Opus | ✅ | ✅ |
| MP4, H.264 + AAC | ❌ no encoder | ❌ no encoder |

**Consequences:**

- The video editor exports with Mediabunny and WebCodecs; it offers the formats that `canEncodeVideo`/`canEncodeAudio`
  report. H.264/AAC is missing only in Playwright's open-source browser builds; Chrome and Edge have it.
- Firefox for Android has no WebCodecs video encoding (see the study): the editor works there, but cannot export.
- Test media are made with ffmpeg from the `imageio-ffmpeg` package (bundled binary), so the tests need no system ffmpeg.

## S-11: Diagrams in presentations, documents and spreadsheets ✅ (presentation, web slides, document) / larger (spreadsheet)

> **Implemented** (all four hosts and pictures in the spreadsheet): see *Diagrams in other applications* in the technical documentation.
> Further findings while implementing: ExcelJS cannot read pictures in files written by openpyxl (absolute relationship targets,
> drawings in the default namespace) – they are rewritten before loading; the Univer Sheets facade 1.0.4 has no `getSource()` on an
> image (its builder has); an updated picture keeps its scale rather than its width (a growing diagram would otherwise shrink).

**Question:** How much effort is it to insert diagrams into the presentation editor, the document editor and the spreadsheet,
so that they can be edited again later with the diagram editor?

**Approach:** the way draw.io itself integrates with Office and Confluence: the diagram is stored as an ordinary **PNG image
that carries the draw.io XML** in a `tEXt` chunk `mxfile` (the diagram editor already writes such PNGs with "PNG" export and
opens them). Editing goes through the app bridge ("Open with…"): the host app opens the image in the diagram editor and gets
the new image back when the user saves there. The spike checked the file formats with the built apps
(`tests/apps/test_embedded_diagrams.py`): a PNG with a diagram was put into a presentation, saved as PPTX and imported again,
and a DOCX with that picture was opened in the document editor and saved again.

**Results:**

| Step | Result |
|---|---|
| Presentation: image element → PPTX (pptxgenjs) | ✅ the PNG in `ppt/media/` still contains the diagram |
| PPTX → presentation (own importer, data URL) | ✅ diagram kept |
| DOCX → document editor (Univer drawing, data URL) | ✅ diagram kept |
| Document editor → DOCX (`docx` library, `ImageRun`) | ✅ the PNG in `word/media/` still contains the diagram |
| Web slides (reveal.js), notebook Markdown | images are data URLs in HTML/Markdown: kept unchanged (no conversion step) |
| Spreadsheet | ❌ no images at all yet: Univer Sheets runs without the drawing preset, the XLSX import/export (ExcelJS) ignores pictures |

Further findings:

- **Gap in the diagram editor:** a diagram opened from a PNG (or SVG) is always saved as `.drawio` XML, so a host app would get
  XML instead of an image back. Saving must write the format it was opened from (PNG: render at 2×, add the `mxfile` chunk – the
  code of the PNG export).
- **Univer Docs** (document editor): its facade lists, inserts and reads images (`getImages`, `insertImage`, `getSource`) but cannot
  replace one; the focused image comes from the drawing manager (`getFocusDrawings`, like `DocSelectionManagerService` already used
  for spelling). The app already reloads a changed document snapshot as a new unit (table of contents), which also works for a new
  image source.
- **Univer Sheets:** `@univerjs/preset-sheets-drawing` exists in the vendored version 1.0.4 (Apache-2.0; `sheets-drawing-ui` alone
  about 280 KB) – roughly +0.5–0.8 MB per spreadsheet file and in the overview. ExcelJS can read and write worksheet images
  (`getImages`/`addImage`, bytes unchanged).
- **Compatibility:** draw.io (diagrams.net) uses the same chunk for its "editable PNG"; diagrams made there can be edited in the
  suite and the other way round, also when the PPTX/DOCX is opened in PowerPoint or Word (they show the PNG).

**Effort estimate** (implementation, tests in Chromium/Firefox and on phones, user and technical documentation EN/DE):

| Part | Work | Effort |
|---|---|---|
| Diagram editor | save in the opened format (PNG with diagram; optionally SVG with `content`), crop to the content | S (½ day) |
| Shared module `diagram-embed.js` | detect a diagram image, "Insert diagram" (empty diagram) and "Edit diagram" through `Suite.bridge.openIn('diagram', …)` with a save callback, message when the diagram editor cannot be started | S (½ day) |
| Presentation | toolbar *Insert diagram*, *Edit diagram* (button, double-click) on image elements with a diagram, new source keeps position and width (height from the new aspect ratio), one undo step | S–M (½–1 day) |
| Web slides | the same for image blocks | S (½ day) |
| Document editor | insert through `insertImage`, edit the focused image (drawing manager), replace its source (snapshot reload or remove/insert at the same position), keep the size | M (1–2 days; risk: Univer internals) |
| Spreadsheet | vendor the drawing preset; images in XLSX import/export via ExcelJS (anchors, sizes); then insert/edit diagrams like in the document | L (3–5 days; also brings ordinary images to the spreadsheet) |

**Total:** presentation, web slides and document about **3–4 days**; with the spreadsheet about **6–9 days**.

**Recommendation:** start with the diagram editor fix, the shared module and the presentation (proves the edit loop end to end,
lowest risk), then web slides and the document editor; do the spreadsheet as a separate step together with general image
support. PNG at 2× is the safest format for all targets (PPTX needs a PNG fallback for SVG, Univer's SVG support is uncertain);
SVG can be offered later for web slides.
