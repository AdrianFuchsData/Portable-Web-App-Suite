# Portable Web App Suite

Office, file, security, data science and network tools that run completely in the browser: every application
is a single HTML file that works offline from `file://`, without installation and without a server – also on
thin clients with only a browser, and on Windows, Linux and Android.

> Status: version 1.1.0 (see the file `VERSION` and the [release notes](docs/release-notes/)). All applications of the suite exist in a first version, each with tests and user and
> technical documentation: text editor, hex editor, archive manager, media player, audio editor, video editor,
> image editor, diagram editor, KeePass, spreadsheet, document and presentation editors, web slides (reveal.js), PDF viewer, calendar,
> mail client, database tool, SSH and FTP/SFTP clients, HTTP analyzer, web inspector, barcode reader and generator and
> Python notebook
> (the authenticator is a separate project), plus the overview `overview.html` that contains all of them and passes files
> between them (“Open with…”). See the [feasibility study](docs/planning/feasibility-study.md), the
> [decision log](docs/planning/decisions.md) and the [spike results](docs/planning/spike-results.md).

## Documentation

| | English | Deutsch |
|---|---|---|
| User guide | [docs/en/user-guide.md](docs/en/user-guide.md) | [docs/de/benutzerhandbuch.md](docs/de/benutzerhandbuch.md) |
| Technical documentation | [docs/en/technical-documentation.md](docs/en/technical-documentation.md) | [docs/de/technische-dokumentation.md](docs/de/technische-dokumentation.md) |

The same documents in Confluence storage format are in [`docs/confluence/`](docs/confluence/)
(generated with `tools/build_docs.py`).

## Development

No node/npm is needed. The sources are bundled into single HTML files by a Python script:

```sh
python3 build.py                      # build all apps, prototypes and testbeds into dist/
python3 tools/build_pwa.py            # optional: installable web site (PWA) in build/pwa/ for a web server
python3 -m venv .venv                 # test environment
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium firefox
.venv/bin/pytest                      # tests in Chromium and Firefox
.venv/bin/python tools/build_docs.py  # regenerate the Confluence documentation
```

Repository layout, build details, shared modules and the relay are described in the technical documentation.

## Licence

Copyright © 2026 Adrian Fuchs. Licensed under the **EUPL-1.2** (European Union Public Licence):
[`LICENSE`](LICENSE) (English), [`LICENSE-de.txt`](LICENSE-de.txt) (German). Read [`NOTICE.md`](NOTICE.md) before you
distribute a modified version: it must say so visibly (put a file `MODIFIED` in the repository root, see there).
The software comes without warranty.

Third-party libraries and data in `vendor/` keep their own licences (among them GPL-licensed components such as the
German dictionary and pykeepass); see [`vendor/README.md`](vendor/README.md). Each application lists the components it
contains, with their licence texts, in its about dialog.
