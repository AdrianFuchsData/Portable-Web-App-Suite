# Vendored libraries

Third-party code that `build.py` inlines into the apps. It is committed so that the apps can be built
without network access and without node/npm.

## ES-module packages (`esm/`)

Downloaded from jsDelivr's `+esm` endpoint by `tools/vendor_esm.py` (Python standard library only).
Each manifest lists the requested packages; the tool resolves all dependencies, keeps exactly one
version per package, rewrites imports to bare specifiers and writes an import map.

| Manifest | Output | Content |
|---|---|---|
| `codemirror.esm.json` | `esm/codemirror/` | CodeMirror 6 with languages, the One Dark theme and `@codemirror/merge` (comparing two texts) |
| `univer-sheets.esm.json` | `esm/univer-sheets/` | Univer Sheets 1.0 (presets, sheets core preset, German/English locales) with React 18 and RxJS; hyphenation dictionaries other than German/English excluded |
| `univer-docs.esm.json` | `esm/univer-docs/` | Univer Docs 1.0 (presets, docs core and docs drawing presets, German/English locales and hyphenation dictionaries) with React 18 and RxJS |
| `docx.esm.json` | `esm/docx/` | docx 9 (DOCX writer) |
| `univer-slides.esm.json` | `esm/univer-slides/` | Univer Slides 1.0 with the plugins it needs (only for the S-7 evaluation) |
| `slides.esm.json` | `esm/slides/` | Moveable 0.53 (move/resize/rotate) for the presentation editor |
| `fflate.esm.json` | `esm/fflate/` | fflate 0.8 (ZIP) for the PPTX and DOCX readers |
| `notebook.esm.json` | `esm/notebook/` | marked 16 (Markdown) and DOMPurify 3 (HTML sanitizing) for the notebook |
| `xterm.esm.json` | `esm/xterm/` | xterm.js 6 terminal and fit addon, plus `xterm.css` (in `assets/`) |
| `mail.esm.json` | `esm/mail/` | postal-mime 2 (MIME parser) for the mail client |
| `video.esm.json` | `esm/video/` | Mediabunny 1 (MPL-2.0; media demuxing/muxing with WebCodecs) for the video editor |
| `pdflib.esm.json` | `esm/pdflib/` | pdf-lib 1.17 (MIT, with pako, tslib) for the page operations of the PDF viewer |
| `yaml.esm.json` | `esm/yaml/` | js-yaml 4.1 (MIT) for OpenAPI descriptions in YAML (HTTP analyzer) |
| `spell.esm.json` | `esm/spell/` | hunspell-asm 4.0 (MIT; contains Hunspell 1.7 compiled to WebAssembly, MPL-1.1/GPL-2.0/LGPL-2.1, used under LGPL-2.1; with emscripten-wasm-loader, getroot, nanoid – two `patches` fix jsDelivr's conversion of namespace imports) and the Hunspell dictionaries of dictionary-en 4.0 (English (US), MIT AND BSD, SCOWL) and dictionary-de 3.0 (German, igerman98, GPL-2.0 OR GPL-3.0; unmodified) as `data_packages` (only `index.aff`/`index.dic`), for spell checking (eleven apps) |
| `psd.esm.json` | `esm/psd/` | ag-psd 31.0 (MIT, with pako, base64-js) for Photoshop files with layers (image editor) |
| `audio.esm.json` | `esm/audio/` | Mediabunny 1 with the MP3 (LAME, LGPL) and FLAC (libFLAC, BSD) WebAssembly encoder extensions (MPL-2.0) for the audio editor's export |

Manifests may exclude lazily loaded modules (`exclude`/`include`) and replace them with small stub modules
(`stub`), e.g. Univer's hyphenation dictionaries for languages other than German and English.

Each output directory contains `importmap.json` (specifier → file), `lock.json` (exact versions and
licenses) and `licenses/` (license texts; a few packages ship without a license file, their license is
recorded in `lock.json`). Licenses currently vendored: MIT, MIT-0, Apache-2.0, ISC, 0BSD, MPL-2.0 (Mediabunny: file-level copyleft, changes to its files would have to be published),
LGPL-2.1 (Hunspell, LAME) and GPL-2.0/GPL-3.0 (German dictionary; pykeepass in the Pyodide bundle) – all compatible with the suite's EUPL-1.2.

`vendor_esm.py` manifests can also list `data_packages` (packages that only provide files in `assets/`) and `patches`
(`{"package": [["find", "replace"]]}`, applied after the import rewrite; each `find` must occur exactly once).

Updating:

```sh
python3 tools/vendor_esm.py vendor/codemirror.esm.json
python3 tools/vendor_esm.py vendor/xterm.esm.json
python3 tools/vendor_esm.py vendor/univer-sheets.esm.json
python3 tools/vendor_esm.py vendor/univer-docs.esm.json
python3 tools/vendor_esm.py vendor/docx.esm.json
python3 tools/vendor_esm.py vendor/univer-slides.esm.json
python3 tools/vendor_esm.py vendor/slides.esm.json
python3 tools/vendor_esm.py vendor/fflate.esm.json
python3 tools/vendor_esm.py vendor/mail.esm.json
python3 tools/vendor_esm.py vendor/video.esm.json
python3 tools/vendor_esm.py vendor/audio.esm.json
python3 tools/vendor_esm.py vendor/pdflib.esm.json
python3 tools/vendor_esm.py vendor/notebook.esm.json
python3 tools/vendor_esm.py vendor/psd.esm.json
python3 tools/vendor_esm.py vendor/yaml.esm.json
python3 tools/vendor_esm.py vendor/spell.esm.json
python3 build.py && .venv/bin/pytest
```

## Licence information for the apps (`components.json`, `licenses/spdx/`)

`build.py` embeds in every app the third-party components it contains, with their licence texts (about dialog):
packages of the `esm/*/lock.json` files the app's import maps use (texts from `esm/*/licenses/`), Python packages from
`pyodide/licenses.json` (texts read from the wheels) and the entries of `components.json` – components of the vendored
files that have no lock file (classic builds, WebAssembly engines, fonts, code bundled inside other packages), keyed by
the path prefix below `vendor/` that an app references; an entry with `"extends"` adds licence texts to a component of
a lock file. `licenses/spdx/` holds the standard licence texts (from the SPDX licence list) for components that ship
none and for the copyleft licences the components refer to.

## Classic browser builds

Downloaded with `curl`; each defines a global. License texts in `licenses/`.

| File | Package | Version | License | Global | Download |
|---|---|---|---|---|---|
| `htm-preact-standalone.umd.js` | [htm](https://github.com/developit/htm) (includes [Preact](https://preactjs.com/)) | 3.1.1 | Apache-2.0 / MIT | `htmPreact` | `https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js` |
| `pico.conditional.min.css` | [Pico CSS](https://picocss.com/), conditional build (styles only inside `.pico` elements; for apps that embed Univer) | 2.1.1 | MIT | – | `https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.conditional.min.css` |
| `pico.min.css` | [Pico CSS](https://picocss.com/) | 2.1.1 | MIT | – | `https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css` |
| `kdbxweb.min.js` | [kdbxweb](https://github.com/keeweb/kdbxweb) | 2.1.1 | MIT | `kdbxweb` | `https://cdn.jsdelivr.net/npm/kdbxweb@2.1.1/dist/kdbxweb.min.js` |
| `hash-wasm-argon2.umd.min.js` | [hash-wasm](https://github.com/Daninet/hash-wasm) | 4.12.0 | MIT | `hashwasm` | `https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/argon2.umd.min.js` |
| `otpauth.umd.min.js` | [otpauth](https://github.com/hectorm/otpauth) | 9.5.2 | MIT | `OTPAuth` | `https://cdn.jsdelivr.net/npm/otpauth@9.5.2/dist/otpauth.umd.min.js` |
| `exceljs.min.js` | [ExcelJS](https://github.com/exceljs/exceljs) | 4.4.0 | MIT | `ExcelJS` | `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js` |
| `xlsx.full.min.js` | [SheetJS CE](https://sheetjs.com/) | 0.20.3 | Apache-2.0 | `XLSX` | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (npm only has 0.18.5) |
| `pptxgen.bundle.js` | [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 4.0.1 | MIT (bundles JSZip, MIT/GPL-3.0 dual) | `PptxGenJS` | `https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js` |
| `sql-wasm.js`, `sql-wasm.wasm` | [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WebAssembly) | 1.15.0 | MIT (SQLite: public domain) | `initSqlJs` | `https://cdn.jsdelivr.net/npm/sql.js@1.15.0/dist/sql-wasm.js` and `…/sql-wasm.wasm` |
| `mammoth.browser.min.js` | [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.13.0 | BSD-2-Clause | `mammoth` | `https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js` |

## reveal.js (`reveal/`)

[reveal.js](https://revealjs.com) 6.0.2 (MIT, `reveal/LICENSE`) for the web slides app: the classic (UMD) builds of
reveal.js and its plugins highlight (includes highlight.js, BSD-3-Clause), markdown (includes marked, MIT), notes, zoom
and search, `reveal.css`, the highlight themes and 14 themes. `tools/vendor_reveal.py` downloads them from jsDelivr and
moves the fonts that the themes embed as `data:` URLs into `reveal/fonts/` (each font once; `themes.json` lists the
fonts of each theme), so that the app stays small and exported presentations only contain the fonts of their theme.
Web font imports of the themes are removed (offline); those themes use their fallback fonts. Checksums in
`reveal/lock.json`.

```sh
python3 tools/vendor_reveal.py 6.0.2
```

## libarchive.js (`libarchive/`)

[libarchive.js](https://github.com/nika-begiashvili/libarchivejs) 2.0.2 (MIT, `libarchive/LICENSE`): libarchive (BSD 2-clause,
`LICENSE.libarchive`) compiled to WebAssembly, with comlink (Apache-2.0, `LICENSE.comlink`) bundled. The archive manager uses it
to read 7z, RAR, XZ/BZip2/Zstandard-compressed TAR, ISO, CAB and further formats and to write 7z: `libarchive.js` (API, ES
module), `worker-bundle.js` (worker) and `libarchive.wasm` (embedded by build.py). `tools/vendor_libarchive.py` downloads
them from jsDelivr; checksums in `libarchive/lock.json`.

```
python3 tools/vendor_libarchive.py 2.0.2
```

## KaTeX (`katex/`)

[KaTeX](https://katex.org) 0.16.22 (MIT, `katex/LICENSE`) typesets TeX formulas in the web slides app and in
presentations saved by it: `katex.min.js`, `contrib/auto-render.min.js` and `katex.min.css`. `tools/vendor_katex.py`
downloads them from jsDelivr and writes `katex.css` with only the WOFF2 fonts, embedded as `data:` URLs (offline, one
file). Checksums in `katex/lock.json`.

```sh
python3 tools/vendor_katex.py 0.16.22
```

## WebAssembly engines (`wasm/`)

Built from source in `engines/` by the scripts in `tools/` (only needed when an engine changes).

| File | Source | Content |
|---|---|---|
| `ssh-engine.wasm`, `wasm_exec.js` | `engines/ssh/`, built by `tools/build_engine_ssh.py` | SSH/SFTP client (Go, x/crypto/ssh + pkg/sftp), Go's JavaScript glue code. Versions in `ssh-engine.json`, license texts (BSD) in `licenses/`. |

## Pyodide (`pyodide/`)

The Python notebook needs Pyodide and Python packages (about 43 MiB, committed like all vendored files).
They are downloaded and updated with:

```sh
python3 tools/vendor_pyodide.py vendor/pyodide.json
```

`vendor/pyodide.json` lists the Pyodide version, the packages from the Pyodide distribution (dependencies are
added automatically), the packages preloaded after start-up, and pure-Python wheels from PyPI with their
dependencies. The tool checks every file against the SHA-256 in Pyodide's lock file / PyPI and against
`vendor/pyodide.lock.json`, adds the PyPI wheels to the reduced `pyodide-lock.json` (so they load on import),
converts Pyodide's ES modules to classic scripts for the worker, and writes `bundle.json` (embedded by
`build.py`) and `licenses.json`.

Bundled: numpy, pandas, matplotlib, seaborn, sympy, networkx, lxml, beautifulsoup4, pyyaml, xlrd, openpyxl,
regex, requests, sqlite3 (standard library), SQLAlchemy, pykeepass (with pycryptodome, argon2-cffi, construct,
pyotp), nzpy, micropip and their dependencies.
Licenses: Pyodide MPL-2.0, CPython PSF-2.0, numpy/pandas/seaborn BSD-3-Clause, matplotlib (PSF-based),
Pillow (MIT-CMU), openpyxl MIT, SQLAlchemy MIT, pykeepass GPL-3.0, nzpy Apache-2.0, others see `licenses.json`.

`hash-wasm-argon2.umd.min.js` ([hash-wasm](https://github.com/Daninet/hash-wasm) 4.12.0, MIT) is concatenated
into the notebook's worker: argon2-cffi cannot use threads in WebAssembly, so the kernel computes Argon2 (for
pykeepass) with hash-wasm.

## PDF.js (`pdfjs/`)

[PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`, Apache-2.0; bundled decoders: OpenJPEG BSD-2-Clause, JBIG2
Apache-2.0, QCMS MIT; standard fonts: Foxit BSD-style and Liberation OFL-1.1) for the PDF viewer:

```sh
python3 tools/vendor_pdfjs.py 6.4.299
```

The tool writes the library and viewer modules, the worker converted to a classic script, the viewer CSS with inlined
images, and the CMaps, standard fonts and WebAssembly decoders that are embedded as a bundle (`bundle.json`).

## zxing-wasm (`zxing/`)

[zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.5 (MIT; the WebAssembly contains [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp),
Apache-2.0) for the barcode application: the ES module of the "full" build, its shared chunk (`share.js`, imported as
`zxing-wasm/share`) and `zxing_full.wasm`. Checksums in `zxing/lock.json`.

```sh
python3 tools/vendor_zxing.py 3.1.5
```
