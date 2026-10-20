# Prototypes (spikes)

Short experiments that check the assumptions of the [feasibility study](../docs/planning/feasibility-study.md)
before they are used in the apps. Each prototype is built like an app (`python3 build.py` →
`dist/<name>.html`) and has tests in `tests/prototypes/`. Results are recorded in the
[spike results](../docs/planning/spike-results.md).

| Prototype | Spike | Question |
|---|---|---|
| `s1-esm-importmap` | S-1 | Can ES-module-only libraries (CodeMirror 6) run from a single HTML file via `file://`, without a bundler? |
| `s2-univer-sheets` | S-2 | Univer Sheets (Apache-2.0) as an ES-module library from `file://`. |
| `s3-relay` | S-3 | Manual test page for the relay (`relay/`) and its browser client `shared/js/relay.js`. |
| `s4-ssh` | S-4 | SSH terminal (xterm.js) and SFTP file list with the WebAssembly engine (`engines/ssh`) through the relay. |
| `s6-office-io` | S-6 | XLSX/XLSM/ODS/XLS/CSV import and export for Univer Sheets (`shared/js/univer-xlsx.js`). |
| `s6-univer-docs` | S-6, S-8 | Univer Docs with DOCX import (direct reader `shared/js/docx-import.js`; mammoth route for comparison) and export (`shared/js/univer-docx.js`). |
| `s7-slides` | S-7 | Own presentation editor with PPTX import/export and presenter mode. |
| `s7-univer-slides` | S-7 | Univer Slides assembled from its plugins (evaluated, not chosen). |
| `s9-notebook` | S-9 | Python notebook (Pyodide in a worker) with `.ipynb` files, matplotlib, file exchange and wheel installation. |
| `s10-webcodecs` | S-10 | Video encoding/decoding with WebCodecs and Mediabunny from `file://` (for the video editor). |
| `s5-platform` | S-5 | Embedded WASM (gzip + base64), workers from Blob URLs, storage and API availability on `file://`. |
