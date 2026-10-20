# Feasibility Study – Portable Web App Suite

Status: draft, updated 2026-10-15
Scope: everything listed in [`AGENTS.md`](../../AGENTS.md)
Decisions taken so far: see [`decisions.md`](decisions.md)

> Library facts (licenses, versions, browser support) were checked in October 2026,
> but they change fast. Anything marked **(verify)** must be confirmed with a
> prototype or the project's own repository before we commit to it.

---

## 1. Summary

The suite is **feasible**, but not every app is feasible in the same way. The apps fall
into four groups:

| Group | Apps | Verdict |
|---|---|---|
| **A – fully feasible offline, file://** | Text editor, Hex editor, Archive manager, Media player, Image editor, Diagram editor, KeePass editor, Authenticator, PDF viewer, Calendar (files), SQLite part of the DB tool | Good open-source building blocks exist. Mostly integration work. |
| **B – feasible with reduced scope or fidelity** | Spreadsheet, Document editor, Presentation editor, Audio editor, Video editor | Feasible, but full MS Office / Audacity / kdenlive fidelity is out of reach in a single HTML file. Office fidelity depends on the license decision (§5.3). Video export needs WebCodecs (not in Firefox for Android). |
| **C – needs a network relay** | E-mail (IMAP/SMTP), SSH, SFTP/FTP, remote Postgres, CalDAV/CardDAV without CORS, HTTP analyzer without CORS limits | A browser page **cannot open TCP sockets**. These apps work through an optional WebSocket relay (decided, see D-001). Without the relay they fall back to offline file features. |
| **D – not feasible as specified** | Browser wrapper ("browser in the browser with dev tools") | The browser's same-origin policy, `X-Frame-Options` and CSP make it impossible to load and inspect arbitrary sites from a page. A reduced scope is proposed (§6.6). |

The biggest risks are:

1. **Office file fidelity** (DOCX/XLSX/PPTX/ODF round trips).
2. **Raw TCP** for the web utilities (solved by the relay, which needs to be hosted somewhere).
3. **file:// limitations**: no service worker, no `SharedArrayBuffer` (so only single-threaded WASM), no File System Access API on Firefox *or on Android Chrome*, and shared or unique origins depending on the browser.
4. **File size**: apps that embed WASM engines (video, office, 7-Zip) end up with HTML files of 5 to 50 MB.
5. **Scope**: these are 20+ applications, each a large project in its own right. A strict reuse-first strategy and a phased roadmap (§8) are essential.

---

## 2. Platform constraints (file://, single HTML, offline)

These constraints apply to every app and shape the shared architecture.

### 2.1 What works from a single HTML file opened via file://

| Feature | Status | Notes |
|---|---|---|
| Inline JS/CSS, inline `<script type="module">` | ✅ | External module files via file:// are blocked by CORS in Chromium, so **everything must be inlined** (the build does this). |
| Web Workers | ✅ via Blob URL | `new Worker('x.js')` fails on file://. Create workers from inlined code via `URL.createObjectURL(new Blob([...]))`. |
| WebAssembly | ✅ | `fetch()` of a .wasm file fails on file://, so WASM must be inlined (base64). To save space, store it as **gzip + base64** and unpack it with `DecompressionStream` (supported by all current browsers). |
| WASM threads / `SharedArrayBuffer` | ❌ | Needs cross-origin isolation (COOP/COEP response headers), which file:// cannot send. Only single-threaded WASM builds work. They are available but slow for ffmpeg, LibreOffice and similar engines. **Works in the hosted PWA variant** (D-003). |
| Service Worker / PWA install | ❌ on file:// | ✅ in the hosted PWA variant. |
| File System Access API (`showOpenFilePicker`, writable handles) | Chromium **desktop** only | Not in Firefox, Safari or **Chrome for Android** (caniuse, Oct 2026). AGENTS.md only mentions Firefox. The download fallback is also needed on Android. |
| Download fallback (`<a download>` + Blob) | ✅ everywhere | The user must replace the old file manually. The UI explains this (as required by AGENTS.md). |
| Persisting file handles across sessions | Chromium desktop | Handles can be stored in IndexedDB. The user has to grant permission again each session (one click). |
| Clipboard, WebCrypto, WebAudio, WebCodecs, Canvas/WebGL/WebGPU | ✅ | file:// is a "potentially trustworthy" origin, so secure-context APIs are available. WebCodecs: Chromium, Safari and Firefox desktop ≥ 130. **No WebCodecs video encoding in Firefox for Android.** |
| `fetch()` to remote hosts | ⚠️ CORS | The page origin is `null`. Only servers that send `Access-Control-Allow-Origin: *` (or `null`) answer. Forbidden headers (`Cookie`, `Host`, …) cannot be set, and `Set-Cookie` cannot be read. |
| Raw TCP/UDP | ❌ | Direct Sockets API exists only for Chrome *Isolated Web Apps* on ChromeOS. Not usable here. |
| localStorage / IndexedDB | ⚠️ | Chromium shares one storage area for **all** file:// pages **(verify)**. Firefox isolates each file (unique file origin). **Never store secrets or important data in browser storage.** Use it only for UI preferences and recent-file handles. |

### 2.2 Android

- Opening a local HTML file works in Chrome (`content://` URI via a file manager) and Firefox
  **(verify on current Android versions)**. Single-file apps help here because nothing relative needs to load.
- No File System Access API, so saving always means a download.
- Mobile UI: all apps need touch-friendly layouts. CodeMirror 6 handles mobile better than Monaco.
- The **hosted PWA variant** (D-003) is the more comfortable option on Android (installable, offline, file handling).

### 2.3 Thin clients / restrictive environments

- Browser policies may block downloads, `file://` or WASM (`--js-flags`, enterprise policy
  `WebAssembly` restrictions are rare but exist). Every app should degrade gracefully and
  show a clear message if WASM or Blob workers are blocked.
- Each HTML file should carry a strict **Content-Security-Policy meta tag** (`connect-src 'none'`
  for pure offline apps, the relay URL only for network apps). This proves to users and
  admins that the offline apps do not phone home.

### 2.4 Size budget (estimates)

| App | Main engines | Estimated HTML size |
|---|---|---|
| Text / Hex editor | CodeMirror 6 + languages | 1–3 MB |
| KeePass, Authenticator | kdbxweb + Argon2 WASM | 0.5–1 MB |
| PDF viewer | PDF.js + worker + CMaps/fonts | 3–6 MB |
| Archive manager | fflate (+ 7-Zip WASM) | 0.2 MB (+ ~2 MB) |
| Image / Diagram editor | miniPaint / Excalidraw | 2–5 MB |
| Spreadsheet / Docs / Slides | Univer or ONLYOFFICE engine + fonts | 5–40 MB |
| Media player | native + Mediabunny (+ optional ffmpeg.wasm) | 1 MB (+ ~30 MB) |
| Video editor | Mediabunny + WebCodecs (+ ffmpeg.wasm) | 2 MB (+ ~30 MB) |

Browsers open HTML files of this size without problems. Heavy optional engines (ffmpeg,
LibreOffice) should be **separate add-on files** that the user can load on demand
(open file → read into memory → instantiate). The core app stays small.

---

## 3. Shared architecture (proposal)

### 3.1 Repository and build (no node/npm, D-009)

node and npm are not installed on the development machine, and the UI must not need them.
The build follows the approach of the existing **web-authenticator** (`../web-authenticator`):

- **Plain JavaScript, no transpiling.** No TypeScript compiler, no JSX, no bundler. Type hints via
  JSDoc comments where useful.
- **UI with Preact + htm** (tagged templates instead of JSX, one vendored UMD file
  `htm-preact-standalone.umd.js`) and **Pico CSS**, as in the authenticator.
- **Vendored libraries** in `vendor/` (downloaded once from jsDelivr with `curl`, committed, with
  version, license and download command in `vendor/README.md` and license texts in `vendor/licenses/`).
- **`build.py`** (Python standard library only) inlines every `<link rel="stylesheet">` and
  `<script src>` of `apps/<app>/src/index.html` into `dist/<app>.html`. It is reproducible (same input
  gives a byte-identical file) and has a `--check` mode. Extensions compared to the authenticator:
  - one build script for all apps, plus shared code from `shared/`;
  - inlining of **WASM and other binaries** (gzip + base64, unpacked with `DecompressionStream`);
  - inlining of **worker code** (as text, started via Blob URL);
  - **ES-module-only libraries** (see below);
  - output of the **hosted PWA variant** (manifest, service worker; COOP/COEP headers documented
    for the web server) (D-003).
- For development, `apps/<app>/src/index.html` can be opened directly in the browser.
- i18n: German and English from day one (as `i18n.js` in the authenticator).

**ES-module-only libraries.** Classic scripts that define globals are the simplest case, but many
modern libraries only ship ES modules (e.g. CodeMirror 6, xterm.js, Univer, Mediabunny). Browsers
block *external* module scripts from `file://`, but inline modules work. Solution (spikes S-1/S-2,
D-015): `tools/vendor_esm.py` vendors the packages from jsDelivr's `+esm` endpoint with one version per
package and rewrites their imports to bare specifiers. `build.py` embeds each module as a plain text
element; a small classic script turns them into Blob URLs and inserts an **import map** before any module
runs. Imports between the modules are then resolved by the browser without a bundler.

Consequence: libraries that require **React** (Excalidraw, Univer UI) need special care. React 19 no
longer ships UMD builds. Options are `preact/compat` (verify per library) or a vendored React 18 UMD
build used only in that app. This is decided per app; the shared UI stays Preact.

Compiled WASM engines that have no ready-made browser build (e.g. an SSH/SFTP engine) are built once
with their own toolchain (Go, Emscripten) outside the normal build, and the resulting `.wasm` is
committed to `vendor/` with reproducible build instructions. The normal build never needs those toolchains.

### 3.2 Shared modules (`shared/`, plain JS files inlined by `build.py`)

| Module | Purpose |
|---|---|
| `shared/js/files.js` | Open/save abstraction: File System Access API (Chromium desktop, keeps handles, "Save" writes in place) ↔ fallback (input + download + "please replace the old file" notice). Recent files. Drag and drop. |
| `shared/js/settings.js` | App data (connections, credentials, preferences) in **JSON or XML file** (unencrypted) **or a KeePass KDBX file** (encrypted). See §3.3. |
| `shared/js/kdbx.js` | Thin wrapper around **kdbxweb** + Argon2 WASM, shared by the KeePass app, the authenticator and `shared/js/settings.js`. |
| `shared/js/relay.js` | WebSocket client for the optional relay (TCP tunnel + HTTP proxy mode), see §3.4. |
| `shared/js/ui.js` + `shared/css/` | Layout, menus, dialogs, tabs, theming (light/dark), touch support, i18n. |
| `shared/js/worker.js` | Helpers to run inlined workers / WASM. |

### 3.3 Storing app data (JSON/XML or KeePass)

- One **suite settings file** can hold data for several apps, or each app can use its own file.
  Each app is a separate HTML file and, on Firefox, a separate origin, so the **file** is the
  only reliable way to share data between apps.
- Formats: **JSON** (unencrypted) and **KDBX** (encrypted). XML is not a hard requirement and is
  not implemented for now (D-013).
- KDBX layout: group `Portable Web App Suite/<App>/…`. **Credentials are regular KeePass entries**
  (title, user name, password, URL), so they stay usable in KeePassXC/KeePass2. App-specific
  settings go into custom string fields or a JSON attachment.
- Compatibility is tested with **pykeepass** (Python venv) and KeePassXC.

### 3.4 Relay (decided: optional, local, several implementations; D-001, D-010)

The relay (the "engine") will usually run **on the same thin client** as the browser, listening on
`127.0.0.1` only. It is not known in advance what users are allowed to run there, so the relay is
specified as a **small, documented protocol** with **several interchangeable implementations**.
The user starts whichever one their system permits:

| Implementation | Runtime | Notes |
|---|---|---|
| Python | Python 3 standard library only (asyncio, own minimal WebSocket handshake/framing, `ssl`) | Primary reference implementation; Linux, Windows, macOS. No pip packages, so it also works where pip is blocked. |
| PowerShell | Windows PowerShell 5.1 / PowerShell 7, .NET only (`TcpListener` with own WebSocket handshake/framing, `TcpClient`, `SslStream`) | For locked-down Windows clients where only PowerShell is allowed. No `HttpListener`, so no URL ACL/admin rights are needed and it also runs with PowerShell 7 on Linux (D-014). Does not work in Constrained Language Mode **(verify)**. |
| Shell | POSIX shell + an existing tool such as `websocat`, `socat` or `websockify` | Thin wrapper only. A pure shell WebSocket server is not realistic. Lowest priority: with minimal rights (D-014) these tools are unlikely to be available. |
| Further (optional, later) | e.g. a single static Go binary, Java | Only if needed. |

Protocol (draft, to be specified in the technical documentation):

- **TCP tunnel mode**: one WebSocket per TCP connection. The first message is a JSON header
  (`{"token", "host", "port", "tls"}`), then raw binary frames in both directions (like websockify).
- **TLS**: because the relay runs locally, it may **terminate TLS** (`"tls": true`), so IMAPS, SMTPS,
  FTPS and Postgres-TLS work without a TLS stack in the browser. Plaintext only exists on the loopback
  interface. SSH stays end-to-end encrypted (the SSH engine runs in the browser). Browser-side TLS
  (e.g. subtls) remains an option for remote relays later.
- **HTTP proxy mode**: plain HTTP endpoint with CORS headers that forwards a described request and
  returns status, raw headers and body. This solves CORS for the HTTP analyzer, CalDAV/CardDAV,
  JMAP and similar services.
- **Security**: random token generated at start (shown to the user / copied into the app), loopback
  binding by default, optional allow-list of target hosts/ports, no open proxy.
- A shared **conformance test suite** (pytest) runs against every implementation.
- Browsers may ask for permission before a page connects to a loopback/local-network address
  (Chromium "Local Network Access"); how this behaves for `file://` pages must be tested **(verify)**.

**Everything that does not need the relay must work without it.** Apps detect a configured relay
and enable network features only then; offline file features are always available.

---

## 4. Re-use strategy

Rule of thumb:

- **Use libraries** for file formats, engines and complex widgets (editors, grids, codecs,
  crypto, PDF rendering, archive formats).
- **Embed complete apps** only when they are MIT/Apache, bundle into a single file and can be
  themed and controlled from our shell (e.g. Excalidraw, miniPaint).
- **Write our own code** for the app shell, file handling, settings and relay integration, and
  for the simpler apps where no good library exists (hex editor, playlist handling, FTP
  protocol, HTTP analyzer UI).
- **Licenses**: a suite license has not been chosen yet (Q-1). Until then, components are
  marked by license class: permissive (MIT/BSD/Apache/ISC), weak copyleft (MPL/LGPL), and
  strong copyleft (GPL/AGPL). The LGPL/MPL parts must remain replaceable and their source must
  be published, which is easy because the vendored files are committed and can be shipped
  alongside the release.

---

## 5. Per-app analysis

Legend: ✅ feasible · 🟡 feasible with limitations · 🔴 not feasible as specified

### 5.1 File utilities

#### Text editor (Notepad++-like) ✅
- **Use:** **CodeMirror 6** (MIT): modular, small, good on mobile, many languages via
  `@codemirror/lang-*` and Lezer grammars, autocomplete, search/replace (regex), multiple cursors,
  folding, minimap via extension. **Monaco** (MIT) offers more IDE features (IntelliSense for
  TS/JSON), but it is large (~5 MB+), relies on workers and an AMD loader that are awkward
  to inline, and works poorly on mobile. → **CodeMirror 6**, provided the ES-module import-map
  technique works (spike S-1, §3.1). CodeMirror 6 only ships ES modules. Fallback with classic
  scripts: **Ace** (BSD, UMD builds, many modes) or CodeMirror 5 (MIT, maintenance mode).
- **Extra libs:** `prettier/standalone` (MIT) for formatting, `jschardet` / TextDecoder for encoding
  detection, `diff` (BSD) for comparing files.
- **Own work:** tabs/multiple documents, session restore, encodings and line endings, "find in
  all open documents", macro recording, Notepad++-like UI.
- **Limits:** "Find in files" over folders only on Chromium desktop (`showDirectoryPicker`).

#### Hex editor ✅
- No convincing embeddable library. **Write our own** (virtualized grid, lazy reading from
  `File.slice()` so files of several GB work for viewing, overwrite/insert, search hex/text,
  data inspector, bookmarks, diff).
- Editing large files in place is only possible on Chromium desktop via writable handles.
  Otherwise the whole file must be rebuilt in memory and downloaded.
- Reference for ideas: hexed.it (closed source), ImHex (GPL, C++).

#### Archive manager (7-Zip-like) ✅/🟡
- **Use:** **fflate** (MIT) for ZIP/GZIP read/write (fast, small), **zip.js** (BSD) when
  ZIP AES encryption and streaming are needed. For everything else: **7z-wasm** (7-Zip compiled
  with Emscripten; LGPL plus the unRAR restriction) or **libarchive.js / libarchive-wasm**
  (BSD; read many formats, limited write).
- Formats: zip, 7z, tar, gz, bz2, xz, zst, rar (read only, license restriction), iso, cab.
- **Limits:** everything happens in memory, so archives of several GB are a problem. Streaming
  for ZIP/TAR is possible.

#### Media player (VLC-like) 🟡
- **Use:** native `<video>`/`<audio>` for everything the browser can decode;
  **hls.js** (Apache-2.0) / **dash.js** (BSD) for streams; **Mediabunny** (MPL-2.0) to remux
  containers the browser does not play (e.g. MKV/MOV with H.264/AAC → MP4) quickly and without
  re-encoding; **JASSUB / libass-wasm** (MIT/ISC) for ASS subtitles, SRT→WebVTT conversion is our own code.
- Optional add-on: **ffmpeg.wasm** (MIT wrapper, LGPL/GPL core, ~30 MB, single-threaded on file://)
  for exotic codecs (WMV, old DivX, …). Transcoding is slow, so it is a fallback only.
- **Own work:** playlists (M3U/M3U8/PLS/XSPF), library view, Media Session API, equalizer
  (WebAudio), A-B loop, playback speed.
- **Limits:** codec support depends on the browser and OS (HEVC, AC-3/DTS are often missing).
  Large local files are fine (Blob URLs stream from disk).

#### Audio editor (Audacity-like) 🟡
- **Use:** **wavesurfer.js** (BSD-3) with the regions/timeline plugins for display, WebAudio
  `OfflineAudioContext` for effects and rendering, **Mediabunny**/WebCodecs or **lamejs**
  (LGPL) for MP3, and FLAC/Opus/WAV encoders.
- **Reference / possible base:** **AudioMass** (MIT, pure JS, Audacity-like web editor), worth
  evaluating as a starting point **(verify maintenance)**.
- **Own work:** multitrack, non-destructive edit list, effect chain, recording, undo.
- **Limits:** decoded audio lives in memory as Float32 (about 10 MB per minute of stereo audio at 44.1 kHz).
  Sessions longer than a few hours are a problem. No VST/LV2 plugins.

#### Video editor (kdenlive-like) 🟡 (highest technical risk among the file apps)
- **Use:** **WebCodecs** (decode/encode with hardware acceleration) + **Mediabunny** (MPL-2.0,
  demux/mux MP4/WebM/MKV/MOV) + Canvas/WebGL (or WebGPU) for compositing, transitions and titles.
- **Reference projects:** Omniclip (MIT, browser NLE) for ideas. Remotion's license does not fit.
- Optional ffmpeg.wasm add-on for formats WebCodecs does not cover.
- **Scope:** "kdenlive lite". Multitrack timeline, cut/trim/split, simple transitions,
  titles, audio levels, export to MP4/WebM. No proxy clips, no keyframed effect stack in v1.
- **Limits:** needs WebCodecs. Works in Chromium (desktop and Android), Safari, and Firefox desktop ≥ 130.
  **Firefox for Android: no export.** Memory limits for long 4K projects. On file:// only
  single-threaded WASM (WebCodecs itself is hardware accelerated, so not affected).

#### Image editor (Paint/GIMP-like) ✅/🟡
- **Embed/base:** **miniPaint** (MIT; layers, filters, selection, text, offline, single page)
  or **JSPaint** (MIT; MS Paint clone) for a "Paint" mode. Write our own on top of
  **Fabric.js** / **Konva** only if miniPaint turns out hard to integrate.
- **Format libs:** **ag-psd** (MIT, PSD read/write), **UTIF.js** (MIT, TIFF), **libheif-js**
  (LGPL, HEIC), browser codecs for PNG/JPEG/WebP/AVIF, **gifenc**/**gifuct-js** (MIT) for GIF.
- **Limits:** GIMP-level features (non-destructive adjustment layers, CMYK, 16-bit pipeline,
  plugins) are out of scope.

#### Diagram editor (draw.io/excalidraw-like) ✅
- **Embed:** **Excalidraw** (MIT, React) for whiteboard/sketch diagrams (fits well).
- For structured diagrams (flow charts, UML, network): **maxGraph** (Apache-2.0, TypeScript successor
  of mxGraph, the engine behind draw.io) with import/export of the **draw.io `.drawio`/mxfile XML**
  format. Embedding the complete draw.io web app (Apache-2.0, but a large app with many files and
  its own build) is possible but hard to inline and theme **(verify with a spike)**.
- **Mermaid** (MIT) for text-to-diagram as a bonus.
- tldraw is **not** an option (its license requires a commercial key for production use).

### 5.2 Security

#### KeePass database editor ✅
- **Use:** **kdbxweb** (MIT, from KeeWeb; KDBX 3/4, Argon2 via pluggable implementation) +
  **hash-wasm** or **argon2-browser** (MIT) for Argon2d/id.
- **Reference:** **KeeWeb** (MIT), itself an offline single-HTML KeePass app, but unmaintained
  since about 2021. Reuse concepts, not the code base.
- **Own work:** UI, groups/entries/history/attachments, password generator, TOTP display
  (shared with the authenticator), key files, KDBX 4.1 features **(verify kdbxweb support)**,
  auto-lock, clipboard clearing.
- **Limits:** no YubiKey challenge-response (WebHID/WebUSB on Chromium could do it, but that is
  later work). No browser autofill integration.

#### Authenticator ✅ (exists)
- Exists as a separate project (`../web-authenticator`, version 1.0.0). It stays a separate project
  and is linked from the suite. Integrating it into the suite shell is a later decision.
- **Concepts carried over into the suite** (D-009, D-011):
  - stdlib-only Python `build.py` that inlines CSS/JS into one HTML file; reproducible builds with a
    `VERSION` file, `--check` mode and documented SHA-256 checksums of releases;
  - vendored libraries in `vendor/` with `vendor/README.md` (version, license, `curl` command) and license texts;
  - plain JavaScript as classic scripts with one global namespace per app, Preact + htm, Pico CSS (light/dark);
  - strict CSP meta tag (`default-src 'none'`, `connect-src` without remote hosts);
  - `files.js`: File System Access API (picker, drag & drop with `getAsFileSystemHandle`,
    `createWritable` for atomic write-back) with download fallback;
  - KDBX via kdbxweb + hash-wasm Argon2; KeePassXC-compatible field names; auto-lock; protected
    fields stay protected in memory; browser storage only for the UI language;
  - tests with pytest + Playwright in Chromium and Firefox (incl. a test that the bundle has no external
    references and makes no network requests), pykeepass for interoperability, demo database;
  - documentation in EN/DE Markdown, Confluence storage format generated by `tools/build_docs.py`
    (Python-Markdown), screenshots generated by Playwright.
- Libraries: **otpauth** (MIT) for TOTP/HOTP, **jsQR** (Apache-2.0) for QR import via camera or image.

### 5.3 Office

The central question is **fidelity vs. license** (Q-1):

| Option | License | Fidelity DOCX/XLSX/PPTX | Size | file:// | Notes |
|---|---|---|---|---|---|
| **A. ONLYOFFICE engine (sdkjs + x2t-wasm)**, e.g. via **ranuts/document** | **AGPL-3.0** | Very high (it is the real ONLYOFFICE editor) | Very large (about 440 MiB of static files, 183 MiB fonts) | ❌ for a single file (iframe UI, loads code, fonts and WASM with XHR/fetch); ✅ in the **hosted PWA** variant (spike S-2) | Only possible if the suite is AGPL-compatible. ODF via conversion. |
| **B. Univer** (sheets, docs, slides) | Apache-2.0 core | Good for sheets. Docs/slides are younger. **XLSX/DOCX import/export are commercial "Pro" features**, so we would need our own import/export | Sheets: 9.1 MB HTML, ready in 3–5 s | ✅ (spike S-2: Univer Sheets 1.0.4 runs from `file://` under a strict CSP) | 1.0 release in Sept 2026. Own formula engine (Apache). |
| **C. Own editors on smaller libs** | MIT/Apache | Low to medium | Small | ✅ | Most work, lowest fidelity. |
| **D. LibreOffice WASM (ZetaOffice / LOWA)** | MPL-2.0 | High, native ODF | Very large (100 MB+) | ❌. Needs WASM threads, so **hosted PWA only** | Possible "pro mode" in the PWA variant. |

**Recommendation:** run a 2–3 day spike on options A and B. If the suite can be AGPL → A as the
primary office engine (best fidelity, least work), with B/C components for lightweight tasks.
If it must be permissive → B (sheets) + C (docs/slides), with our own OOXML import/export based on
the libraries below, accepting lower fidelity. D is optional for the hosted variant.

#### Spreadsheet ✅/🟡
- Grid/engine: **Univer Sheets** (Apache-2.0) or **Fortune-sheet** (MIT, successor of Luckysheet) or
  **Jspreadsheet CE** (MIT, lighter).
- File formats: **ExcelJS** (MIT, XLSX with styles), **SheetJS CE** (Apache-2.0, many formats
  incl. ODS/XLS/CSV, no styles in CE; distributed via cdn.sheetjs.com, not npm).
- Formulas: Univer's engine, or **formula.js** (MIT). **HyperFormula** is GPL-3.0/commercial
  (only with a GPL suite).
- Charts: ECharts (Apache-2.0). Pivot tables: own code.

#### Document editor 🟡
- Editor core: **ProseMirror** / **Tiptap** (MIT) or Univer Docs.
- DOCX: **mammoth** (BSD-2, DOCX → HTML, lossy), **docx-preview** (Apache-2.0, high-quality
  rendering, read-only), **docx** (MIT, writing DOCX).
- ODT: no maintained JS library (WebODF is dead). Own minimal ODT reader/writer, or option A/D.
- **Limits:** paginated WYSIWYG (exact page breaks, headers/footers, footnotes) is hard
  in HTML editors. Lossless DOCX round trips are not realistic with option C.
- Export to PDF: `window.print()` with print CSS, or pdf-lib/jsPDF.

#### Presentation editor 🟡
- **PptxGenJS** (MIT) for writing PPTX. Import: own parser (JSZip + XML) or **pptx-preview** / PPTXjs
  (MIT, rendering) **(verify maintenance)**. Canvas editing with **Konva** / **Fabric.js**, or Univer Slides.
- Presenter mode: second window (`window.open` + BroadcastChannel) or Presentation API.
- **Limits:** SmartArt, complex animations, embedded media and theme fidelity are limited with options B/C.

#### PDF viewer ✅
- **PDF.js** (Apache-2.0, Mozilla), including its viewer. It supports search, thumbnails, forms,
  and annotation editing (highlight, free text, ink, stamp, signatures). Worker inlined via Blob URL.
- **pdf-lib** (MIT, or the maintained fork `@cantoo/pdf-lib`) for merge/split/reorder, filling
  forms and adding pages.
- **Limits:** digital signature validation and creation (PAdES) need extra crypto work (later).

#### Calendar (iCal) ✅
- **ical.js** (MPL-2.0, Mozilla) for iCalendar/vCard incl. recurrence rules and time zones.
- UI: **Schedule-X** (MIT core) or **FullCalendar** (MIT standard edition; premium plugins are commercial).
- CalDAV sync via **tsdav** (MIT): works directly if the server allows CORS, otherwise through the relay's HTTP mode.
- Reminders only while the page is open (Notifications API; no background service on file://).

### 5.4 Web utilities (need the relay for most protocols, D-001)

#### E-mail client 🟡
- **Without relay:** read/write `.eml`/`.mbox` files (**postal-mime**, MIT, parsing; own MIME builder
  or **mimetext**, MIT), address books as vCard (ical.js), calendar (shared with the calendar app).
  **JMAP** (HTTP, e.g. Fastmail, Stalwart) works directly if CORS is allowed, otherwise through the relay HTTP mode.
- **With relay:** IMAP + SMTP through the TCP tunnel. Libraries: **emailjs-imap-client** /
  **emailjs-smtp-client** (MIT, browser IMAP/SMTP over raw sockets, archived) as a base, or our own
  IMAP client. ImapFlow/Nodemailer are Node-only. TLS in the browser (subtls) or terminated by the relay.
- OAuth2 (Gmail, Microsoft 365) needs a registered redirect URI. That is impossible from file://,
  but possible in the hosted PWA variant or with device-code flow **(verify per provider)**.
- **Limits:** no push/background sync when the page is closed. Local message storage (offline
  cache) in IndexedDB is limited and per browser. S/MIME/PGP: OpenPGP.js (LGPL) later.
- This is one of the largest apps. Recommended late in the roadmap.

#### Database editor (DBeaver-like) ✅ SQLite / 🟡 Postgres
- **SQLite:** official **sqlite-wasm** (public domain) or **sql.js** (MIT). Open a file → work in
  memory → save/download. Fully offline. ✅
- **Postgres (remote):** through the relay. **@neondatabase/serverless** (MIT) is a `pg` driver that
  already speaks the Postgres protocol over a WebSocket-to-TCP proxy, which matches our relay. Alternatively,
  write our own wire protocol client.
- **Postgres (local playground):** **PGlite** (Apache-2.0/PostgreSQL license, Postgres in WASM) to work
  with dumps offline.
- UI: CodeMirror SQL mode with schema-aware autocomplete, result grid **Glide Data Grid** (MIT, canvas,
  large result sets) or TanStack Table, ER diagram via maxGraph.

#### FTP/SFTP client (FileZilla-like) 🟡
- **SFTP:** compile an SSH/SFTP stack to WASM (Go `x/crypto/ssh` + `pkg/sftp`, or **libssh2.js**)
  and connect over the relay. Existing reference projects: **localssh** (Go-WASM engine + WebSocket
  relay + xterm.js), **sshterm** / **ssheasy** (Go/WASM) **(verify licenses)**.
- **FTP:** small text protocol, own JavaScript implementation over the relay (passive mode = second
  tunnel connection). FTPS needs browser-side TLS or relay termination.
- **Limits:** relay required. Transfer speed is limited by the relay and single-threaded WASM crypto.

#### SSH client (PuTTY-like) 🟡
- **xterm.js** (MIT) for the terminal + an SSH engine in WASM (shared with SFTP) + relay.
  Key formats: OpenSSH and PuTTY `.ppk` (own conversion). Keys and host profiles in the KeePass file.
- Upload/download over SFTP in the same session.
- **Limits:** relay required. No agent forwarding to the local OS.

#### HTTP request analyzer (Postman-like) 🟡
- **Own app** (no good embeddable component; **Hoppscotch** (MIT) is a full app and too heavy
  to embed, but a good reference). CodeMirror for bodies, import of curl, Postman collections v2.1,
  OpenAPI and HAR.
- **Without relay:** `fetch()` is limited by CORS (`Origin: null`), forbidden headers, no
  `Set-Cookie`, and limited timing info. Fine for CORS-enabled APIs.
- **With relay (HTTP proxy mode):** any header, raw request/response, cookies, redirects, TLS info.
- Bonus offline feature: HAR viewer/analyzer for HAR files exported from other browsers.

#### Browser wrapper 🔴 → reduced scope
- **Why not feasible as specified:** a page cannot read the DOM, network traffic or console of a
  cross-origin page. Most sites forbid framing (`X-Frame-Options`, CSP `frame-ancestors`), and there is no
  API to intercept another page's requests without a browser extension or debugger protocol.
- **Feasible alternatives:**
  1. **Eruda bookmarklet** (Eruda, MIT: mobile dev tools console, elements, network, storage).
     The user installs a bookmarklet that injects Eruda into the *real* page. This works on mobile
     browsers where dev tools are missing. Offline means the bookmarklet must contain the whole script.
     Size limits for bookmarklets and page CSP may block it on some sites **(verify Chrome/Firefox limits)**.
  2. **HAR / page source analyzer**: analyze HAR files, HTML source, headers, cookies and certificate
     info (the last two through the relay HTTP proxy).
  3. **Rewriting proxy mode** through the relay (fetch a page, rewrite URLs, inject an inspector).
     Technically possible, but complex, breaks many modern sites, and has security implications.
     Not recommended for v1.
- **Recommendation:** implement 1 + 2 as the "Web Inspector" app. Decide later about 3 (Q-3).

---

### 5.5 Data science

#### Python console / notebook (Jupyter-like) ✅ (added 2026-10-15)
- **Use:** **Pyodide** (MPL-2.0; CPython compiled to WebAssembly) with its WebAssembly builds of numpy, pandas,
  matplotlib, scipy, scikit-learn, statsmodels, sympy, pyarrow, duckdb, polars and many more; pure-Python
  wheels from PyPI (seaborn, openpyxl, …). CodeMirror 6 for the cells, marked for Markdown, DOMPurify for
  sanitizing outputs.
- **Own work:** notebook UI, kernel protocol (Jupyter output format), `.ipynb` import/export, file exchange,
  wheel installation, packaging of Pyodide for `file://` (spike S-9).
- **Limits:** large file (core set ≈ 32 MB HTML; heavy packages as optional add-ons), start-up 7–10 s,
  no interrupt and no `input()` on `file://` (no `SharedArrayBuffer`), only packages built for Pyodide or
  pure-Python wheels, no network installs (offline).

## 6. Decisions on build vs. reuse (overview)

| App | Reuse (primary) | Own development |
|---|---|---|
| Text editor | CodeMirror 6, prettier | Shell, tabs, sessions, encodings |
| Hex editor | — | Everything |
| Archive | fflate, zip.js, 7z-wasm / libarchive | UI, streaming |
| Media player | native, hls.js, Mediabunny, JASSUB, (ffmpeg.wasm) | Playlists, UI |
| Audio editor | wavesurfer.js, WebAudio, Mediabunny, (AudioMass as base?) | Multitrack, effects, UI |
| Video editor | WebCodecs, Mediabunny, (ffmpeg.wasm) | Timeline, compositor, UI |
| Image editor | miniPaint (embed/fork), ag-psd, UTIF | Integration, format support |
| Diagram editor | Excalidraw, maxGraph, Mermaid | draw.io format I/O, integration |
| KeePass | kdbxweb, hash-wasm | UI |
| Authenticator | existing app, otpauth | Integration into suite shell |
| Spreadsheet | Univer / ONLYOFFICE (Q-1), ExcelJS, SheetJS | Import/export mapping |
| Documents | ONLYOFFICE (Q-1) or Tiptap + mammoth/docx-preview/docx | Editor, OOXML mapping |
| Presentation | ONLYOFFICE (Q-1) or PptxGenJS + Konva | Editor, PPTX parser |
| PDF viewer | PDF.js, pdf-lib | Integration |
| Calendar | ical.js, Schedule-X, tsdav | UI, sync |
| E-mail | postal-mime, emailjs-*, ical.js | Most of the client |
| Database | sqlite-wasm, PGlite, @neondatabase/serverless, Glide Data Grid | Query UI, schema browser |
| FTP/SFTP | SSH/SFTP WASM engine | FTP client, UI |
| SSH | xterm.js, SSH WASM engine | Profiles, key handling |
| HTTP analyzer | CodeMirror | Everything else |
| Web inspector | Eruda | HAR/source analyzer |
| Python notebook | Pyodide (+ packages), CodeMirror 6, marked, DOMPurify | Notebook UI, kernel, `.ipynb`, packaging for `file://` |
| Relay | websockify concept, existing tools for the shell variant | Protocol spec, Python and PowerShell implementations, shell wrapper, conformance tests |

---

## 7. Testing, documentation, quality

- **Tests:** Python venv (`.venv/`, git-ignored) with `requirements.txt`: **playwright** (E2E tests
  against the built HTML files via `file://` in Chromium and Firefox, plus Android emulation for layout),
  **pykeepass** (verify KDBX files written by the apps), **pytest**. Logic is also tested through
  Playwright (`page.evaluate`), so no node-based unit test runner is needed. Relay implementations
  are tested by a shared conformance suite.
- **Test matrix:** Chromium desktop (FSA path), Firefox desktop (download path), Chrome Android,
  Firefox Android, and file:// vs. hosted PWA. Target: current stable browser versions (D-012).
- **Documentation** (AGENTS.md): user and technical documentation in **German and English**, as **Markdown
  and Confluence storage XHTML**. Markdown is the single source. A Python script generates the
  Confluence storage format (as `tools/build_docs.py` in the authenticator), so we never maintain four copies by hand.
- **License compliance:** `build.py` embeds a third-party license page into every HTML file
  (from `vendor/licenses/`), and the sources of LGPL/MPL components are published.

---

## 8. Proposed roadmap

| Phase | Content | Why first |
|---|---|---|
| 0 | Repository layout, `build.py` (single HTML + PWA), spikes S-1/S-3, shared modules (files, settings, kdbx, UI, i18n), test infrastructure (venv, pytest, Playwright), doc pipeline | Everything else depends on it. |
| 1 | Text editor, Hex editor, PDF viewer, KeePass editor, Archive manager, integration of the authenticator | Low risk, high value, validates the platform layer. |
| 2 | Media player, Image editor, Diagram editor, Calendar, DB tool (SQLite part) | Mostly integration of mature libraries. |
| 3 | Office spike (A vs. B) → Spreadsheet, Documents, Presentation | Needs the license decision. |
| 4 | Relay + SSH/SFTP, Postgres, HTTP analyzer, FTP | Shared relay and SSH engine. |
| 5 | E-mail client, Audio editor, Video editor | Large apps, higher risk. |
| 6 | Web inspector (reduced scope) | Lowest feasibility, lowest priority. |
| 2–3 | Python notebook (added later) | Prototype (S-9) already close to a first version. |

---

## 9. Open questions

| ID | Question | Status |
|---|---|---|
| Q-1 | **Suite license** (AGPL/GPL vs. permissive). Decides the office engine (ONLYOFFICE vs. Univer/own) and whether GPL components like HyperFormula can be used. | Open |
| Q-2 | Where will the relay run, and who terminates TLS? | Answered: locally on the thin client, several implementations (D-010); the relay may terminate TLS. |
| Q-3 | Is the reduced browser wrapper scope acceptable? | Answered: yes (D-004). |
| Q-4 | Is XML as a settings format really needed in addition to JSON and KDBX? | Answered: no, JSON + KDBX only for now (D-013). |
| Q-5 | Authenticator concepts | Answered: repo read from `../web-authenticator`, concepts carried over (D-011). |
| Q-6 | Minimum browser versions? | Answered: modern browsers (D-012). |
| Q-7 | UI framework | Answered: no node, so Preact + htm as in the authenticator (D-009). |
| Q-8 | Which shell tools (`websocat`, `socat`, `websockify`) can be expected on the target thin clients, and is Python or PowerShell usually allowed? | Answered: unclear, assume minimal rights (D-014). |

## 10. Spikes (short prototypes before committing)

Results: [`spike-results.md`](spike-results.md). Spikes S-1 to S-9 are done.

| ID | Topic |
|---|---|
| S-1 | ES-module libraries without a bundler: inline import map with `data:` URLs, built by `build.py`, from `file://` in Chromium and Firefox (CodeMirror 6 as the test case). |
| S-2 | Office engine: ONLYOFFICE (ranuts/document) vs. Univer from `file://`, without threads and without node. |
| S-3 | Relay: Python stdlib WebSocket relay + PowerShell relay; connection from a `file://` page to `ws://127.0.0.1` (Local Network Access prompts). |
| S-4 | SSH/SFTP engine as WASM (Go or libssh2), prebuilt and vendored, via the relay. |
| S-5 | Platform capabilities on `file://`: embedded WASM, workers, storage, API availability. |
| S-6 | XLSX/ODS import and export for Univer Sheets with ExcelJS/SheetJS (values, formulas, styles, merged cells, column widths). Docs/slides engine evaluation. |
| S-7 | Presentation editor: Univer Slides vs. own editor on Konva; PPTX import (renderer library or own parser) and export (PptxGenJS). |
| S-9 | Python notebook with Pyodide from `file://`; user-supplied wheels. |
| S-8 | Direct DOCX reader into Univer's document model (styles, numbering, alignment, colors, images, headers/footers) to replace the mammoth/HTML route. |
