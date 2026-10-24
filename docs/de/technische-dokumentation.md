# Portable Web App Suite – Technische Dokumentation

Dieses Dokument beschreibt Architektur, gemeinsame Module, Build und Tests der Portable Web App Suite. Die
Anleitung für Anwenderinnen und Anwender ist das [Benutzerhandbuch](benutzerhandbuch.md). Planungsdokumente
(Machbarkeitsstudie, Entscheidungsprotokoll, Spike-Ergebnisse) liegen in `docs/planning/` (nur Englisch).

## Grundsätze

- **Eine Datei pro Anwendung:** Jede Anwendung ist eine einzelne HTML-Datei mit allem Code, allen Styles,
  Bibliotheken und WebAssembly-Modulen. Sie läuft über `file://` ohne Server und ohne Internetverbindung.
- **Kein node/npm:** Die Quellen sind reines JavaScript. Ein Python-Skript (`build.py`, nur Standardbibliothek)
  bündelt sie. Bibliotheken von Drittanbietern liegen in `vendor/`.
- **Keine Geheimnisse im Browserspeicher:** Alle `file://`-Seiten teilen sich einen Speicherbereich (Chromium und
  Firefox). Anwendungsdaten (Verbindungen, Zugangsdaten) liegen deshalb in Dateien der Anwender (JSON oder KeePass). Im
  Browserspeicher stehen nur Einstellungen (Sprache, Design, App-Einstellungen, Rechtschreibsprache und eigene Wörter), zuletzt
  verwendete Datei-Handles, Wiederherstellungskopien ungespeicherter Arbeit (nie von einer entsperrten KeePass-Datenbank) und vom
  Anwender geladene Wörterbücher.
- **Standardmäßig offline:** Eine Content Security Policy in jeder Seite verbietet Netzwerkverbindungen, außer die
  Anwendung hat Netzwerkfunktionen.
- **Eingabefelder und Neuzeichnen:** Preact setzt `value` bei jedem Zeichnen, wenn es vom DOM abweicht. Felder, die erst bei `change`,
  `blur` oder Eingabetaste übernommen werden (Umbenennen, Tags, Namen), verwenden daher `defaultValue` (mit einem `key`, der sich mit dem
  Wert im Modell ändert); sonst würde ein Neuzeichnen dazwischen (ein Timer, ein Hover) halb getippten Text ersetzen.

## Aufbau des Repositorys

| Pfad | Inhalt |
|---|---|
| `apps/<app>/src/` | Quellen einer Anwendung (`index.html`, `js/`, Styles) |
| `shared/js/`, `shared/css/` | Module und Styles aller Anwendungen |
| `vendor/` | Bibliotheken, ES-Modul-Sätze (`esm/`), WebAssembly-Engines (`wasm/`), Pyodide (`pyodide/`) |
| `engines/` | Quellen eigener WebAssembly-Engines (SSH/SFTP in Go) |
| `relay/` | Relay-Implementierungen (Python, PowerShell) |
| `prototypes/` | Prototypen aus den Spikes |
| `testbeds/` | Seiten, die nur für Tests existieren |
| `tools/` | Werkzeuge für Vendoring, Engine-Build, PWA und Dokumentation |
| `tests/` | Tests mit pytest und Playwright |
| `docs/` | Dokumentation (Markdown, Confluence-Speicherformat, Planung, Versionshinweise in `docs/release-notes/` – der Text des GitHub-Release) |
| `build.py` | Baut alle `apps/*`, `prototypes/*` und `testbeds/*` nach `dist/<name>.html` |
| `LICENSE`, `LICENSE-de.txt`, `NOTICE.md` | EUPL-1.2 (Englisch, Deutsch) und der Hinweis des Lizenzgebers; eine Datei `MODIFIED` kennzeichnet eine geänderte Fassung |

## Build

```sh
python3 build.py                 # alle Anwendungen, Prototypen und Testbeds
python3 build.py apps/texteditor # ein Verzeichnis
python3 build.py --check         # schlägt fehl, wenn eine gebaute Datei veraltet ist
```

`build.py` ersetzt in `src/index.html`:

| Quelle | Ergebnis |
|---|---|
| `<link rel="stylesheet" href>` | eingebettetes `<style>` |
| `<script src>` / `<script type="module" src>` | eingebettetes Skript |
| `<script type="importmap" data-src="a.json b.json">` | ES-Module als Text; ein kleines Skript erzeugt Blob-URLs und die Import-Map, bevor ein Modul läuft |
| `<script type="application/octet-stream" id data-src>` | Binärdatei, gzip + Base64 (`shared/js/embed.js` entpackt sie) |
| `<script type="application/octet-stream" data-bundle="bundle.json">` | alle Dateien eines Bündels (für Pyodide und für die Anwendungen der Übersicht, die zuletzt gebaut wird) |
| `<script type="text/plain" id data-src>` | Text, z. B. Worker-Code |
| `</head>` (jede Seite) | `#suite-about` (Copyright, Lizenz, Quellcode-Adresse, Version, die Zeile aus `MODIFIED`) und `#suite-licenses` (siehe *Lizenzen*) |

Der Build ist reproduzierbar: Dieselben Quellen ergeben eine byte-gleiche Datei.

### Lizenzen

Vor dem Einbetten fügt `build.py` in jede Seite zwei Elemente ein. `#suite-about` (JSON) liest die Shell sofort: Der Info-Dialog zeigt
Copyright, Lizenz und Quellcode-Adresse, und wenn die erste Zeile der Datei `MODIFIED` (oder von `$SUITE_MODIFIED_FILE`) vorhanden ist,
beginnt der Dialog mit „Geänderte Fassung: …“, die Kopfzeile zeigt eine Plakette und der Fenstertitel endet mit „(geänderte Fassung)“ – der
sichtbare Hinweis, den `NOTICE.md` von geänderten Fassungen verlangt. `#suite-licenses` (gzip + base64 JSON, beim Öffnen des Lizenzbereichs
mit `DecompressionStream` dekodiert) enthält die EUPL auf Englisch und Deutsch, die beiden Hälften von `NOTICE.md` und die Komponenten
Dritter der Seite mit ihren Lizenztexten (per Hash entdoppelt): die Pakete der `vendor/esm/*/lock.json`-Dateien, die die Import-Maps der
Seite verwenden, die Python-Pakete aus `vendor/pyodide/licenses.json` (Texte aus den Wheels gelesen) und die Einträge von
`vendor/components.json`, deren Pfadpräfix die Seite verwendet (klassische Builds, Engines, Schriften, in anderen Paketen gebündelter
Code; `extends` ergänzt Texte zu einer Komponente einer Lock-Datei); fehlende Texte kommen aus `vendor/licenses/spdx/`. Die Übersicht
listet die Komponenten aller Apps, die sie enthält. Tests: `tests/apps/test_licence.py` (Lizenz, Hinweis und Komponenten mit Texten auf
Englisch und Deutsch, nur die Komponenten einer App, die Kennzeichnung eines Builds mit `MODIFIED`).

Eingebettete Module erhalten `blob:`-URLs, gegen die sich relative Bezeichner nicht auflösen lassen. Die eigenen Module einer
Anwendung importieren einander daher mit reinen Bezeichnern (`@app/doc.js`), die die `js/importmap.json` der Anwendung auf die Dateien
abbildet; das funktioniert im Quellbaum und in der gebauten Datei gleich.

### Gehostete PWA-Variante

`python3 tools/build_pwa.py [Verzeichnis]` (Standard `build/pwa`, von git ignoriert) macht aus den gebauten Apps eine installierbare
Website: Jede `<app>.html` bekommt ein `<link rel="manifest">`, die Registrierung von `sw.js` (nur unter http/https) und eine um
`manifest-src 'self'` und `'self'` in `worker-src`/`img-src` erweiterte CSP; daneben `<app>.webmanifest` (ID/Start-URL `./<app>.html`,
standalone, das Favicon als `icons/<app>.svg`, `file_handlers` mit den Endungen der App aus der App-Liste in `shared/js/bridge.js`) und
`index.html`, das zur Übersicht weiterleitet. Der Service Worker verwendet einen Cache: Übersicht, Manifeste und Symbole werden bei der
Installation aufgenommen, jede andere Datei beim ersten Laden; Anfragen werden aus dem Cache beantwortet und im Hintergrund erneuert
(stale-while-revalidate, Query-Strings ignoriert). Über einen Datei-Handler geöffnete Dateien kommen in `window.launchQueue` an;
`Suite.bridge.receive` gibt die erste (Anwendungen mit Tabs: alle) mit ihrem echten `FileSystemFileHandle` an die App weiter (Speichern schreibt also zurück).
`.webmanifest` als `application/manifest+json` ausliefern. Test: `tests/apps/test_pwa.py` (Ausgabe, Neuladen offline und die
weiterleitende Startseite in Chromium, die Launch Queue mit einem Stub).

### Releases und das öffentliche Repository

Ein Release setzt `VERSION` (in den Info-Dialogen angezeigt), baut `dist/` und die Dokumentation neu, schreibt `dist/SHA256SUMS`
(Prüfsummen der gebauten Apps, damit Anwender prüfen können, dass sie einen unveränderten Build verwenden) und wird mit `v<Version>`
getaggt. `python3 tools/publish_release.py v<Version> [Verzeichnis]` spiegelt den Tag dann in das öffentliche Repository (Standard
`../portable-web-app-suite-public`): ein Commit und ein annotierter Tag pro Release, als „Adrian Fuchs <github@adrianfuchs.at>“, mit
den versionierten Dateien des Tags (`git archive`), aber ohne `dist/` (die gebauten Apps und `SHA256SUMS` werden stattdessen an das
GitHub-Release angehängt). Die Entwicklungsgeschichte wird nicht veröffentlicht. Vor dem Commit verweigert das Werkzeug Dateien mit
privaten Informationen: E-Mail-Adressen außer Beispiel-Domains und der öffentlichen Adresse (außerhalb von `vendor/`), private
Schlüssel, Zugriffstoken, lokale Home-Pfade. Die Versionshinweise, `docs/release-notes/v<Version>.md`, sind der Text des
GitHub-Release (`gh release create … --notes-file`): was sich seit der vorigen Version geändert hat, die Downloads.

### Einschränkungen von `file://`

- Externe Modul-Skripte werden blockiert; Module werden daher eingebettet und über Blob-URLs geladen.
- Worker können keine ES-Module laden (keine Modul-Worker aus Blob-URLs in Chromium, kein `import()` oder
  `importScripts()` von Blob-URLs in Workern). Worker-Code ist ein einziges klassisches Skript.
- Kein `SharedArrayBuffer` (keine Cross-Origin-Isolation): nur WebAssembly ohne Threads.
- File System Access API nur in Chromium am Desktop; sonst werden Dateien heruntergeladen.

## Eingebundene Bibliotheken

- Klassische Browser-Builds werden mit `curl` geladen (siehe `vendor/README.md`).
- ES-Modul-Pakete werden mit `tools/vendor_esm.py <Manifest>` vom `+esm`-Endpunkt von jsDelivr eingebunden:
  eine Version pro Paket, Importe auf reine Bezeichner umgeschrieben, Lizenztexte und Versionen erfasst, optional
  Platzhaltermodule für ausgeschlossene, nachgeladene Module.
- Pyodide und Python-Pakete: `tools/vendor_pyodide.py vendor/pyodide.json` (SHA-256-geprüft).
- Die SSH/SFTP-Engine: `tools/build_engine_ssh.py` (braucht Go; das Ergebnis ist eingecheckt).
- Emoji- und Symboldaten: `tools/build_symbols.py` nach dem Einbinden von `vendor/symbols.esm.json` (das Ergebnis ist eingecheckt).

## Gemeinsame Module

Die gemeinsamen Module der ersten Tabelle sind klassische Skripte, die das globale Objekt `Suite` erweitern; die zweite Tabelle nennt
ES-Module, die Anwendungen über ihre Import-Maps importieren.

| Modul | Global | Zweck |
|---|---|---|
| `i18n.js` | `Suite.i18n`, `Suite.t`, `Suite.LocalizedError` | Englische/deutsche Texte mit Platzhaltern (`{0}`), Spracherkennung und -wechsel, lokalisierte Fehler |
| `files.js` | `Suite.files` | Öffnen (File System Access API oder Dateiauswahl), Ziehen & Ablegen, Speichern (zurückschreiben oder Download mit Hinweis), Speichern unter, zuletzt verwendete Dateien |
| `kdbx.js` | `Suite.kdbx` | KeePass-Datenbanken mit kdbxweb und Argon2 aus hash-wasm: öffnen, anlegen (KDBX 4, Argon2id), Gruppen nach Pfad, Einträge, geschützte Felder, Anhänge, Gruppen anlegen/verschieben/löschen, Papierkorb, Verlauf von Einträgen, Hauptschlüssel ändern, geprüftes Speichern |
| `ical.js` | `Suite.ical` | iCalendar: tolerantes Lesen und Falten/Schreiben (unbekannte Eigenschaften und Komponenten bleiben erhalten), Termine, Zeitzonen (TZID über `Intl`, Windows-Zonennamen, erzeugte `VTIMEZONE`), Auflösen von RRULEs mit EXDATE und RECURRENCE-ID-Ausnahmen |
| `history.js` | `Suite.UndoHistory` | Verlauf zum Rückgängigmachen/Wiederholen aus Momentaufnahmen (eigene Kopierfunktion, Zusammenfassen von Schritten mit gleichem Schlüssel innerhalb einer Sekunde, Größenlimit) und die gemeinsame Tastenprüfung `UndoHistory.key(event)` (`Strg/Cmd+Z`, `Strg/Cmd+Y`, `Strg/Cmd+Umschalt+Z`; nicht, während ein Textfeld den Fokus hat) |
| `diagram-embed.js` | `Suite.diagrams` | Diagramme als PNG-Bilder mit der draw.io-Datei darin: erkennen, einfügen und über den Diagramm-Editor bearbeiten (siehe *Diagramme in anderen Anwendungen*) |
| `bridge.js` | `Suite.bridge` | „Öffnen mit…“ zwischen Anwendungen: Anwendungsverzeichnis (IDs, Namen, Endungen, `multi` für Anwendungen mit Tabs), Auswahldialog, `openIn`/`openWith`/`openWithMany` (Quelle) und `receive` (Ziel) mit einem Ersatz für Datei-Handles, der über einen `MessagePort` zurückspeichert; erkennt die Übersicht (`hub()`) |
| `appdata.js` | `Suite.appdata` | Oberfläche für die Anwendungsdatendatei von Anwendungen mit Verbindungen: Speicher im Arbeitsspeicher, bis eine JSON-/KeePass-Datei geöffnet oder gespeichert wird (`settings.js`), Passwortdialog, von allen Anwendungen geteilte Relay-Einstellungen (App `suite`), Komponenten `Bar`, `Dialog`, `RelayFields` |
| `settings.js` | `Suite.settings` | Anwendungsdaten in einer JSON-Datei oder KeePass-Datenbank (Gruppe `Portable Web App Suite/<App>`) |
| `shell.js` | `Suite.shell` | Gemeinsamer Rahmen mit Preact + htm: Kopfzeile, Sprach- und Designwechsel, Info-Dialog, Meldungen, Banner, Bestätigungsdialog, Warnung bei ungespeicherten Änderungen |
| `embed.js` | `Suite.embed` | Zugriff auf eingebettete Binärdateien und Worker-Code |
| `relay.js` | `Suite.relay` | Client des Relays (TCP über WebSocket, STARTTLS, HTTP-Proxy) |
| `ssh.js` | `Suite.ssh` | SSH/SFTP-Engine (WebAssembly) über das Relay |
| `python-kernel.js`, `python-worker.js` | `Suite.python` | Python-Kernel (Pyodide in einem Worker) für das Notebook |
| `univer-xlsx.js`, `univer-docx.js`, `docx-import.js` | | Import/Export von Tabellen und Dokumenten für Univer |
| `pptx-import.js`, `pptx-export.js`, `slide-render.js` | | Präsentationsmodell, PPTX-Import/-Export, Darstellung |
| `autosave.js` | `Suite.autosave` | Wiederherstellungskopien ungespeicherter Arbeit in IndexedDB (siehe *Wiederherstellungskopien*) |
| `colorpicker.js` | `Suite.colors` | Farbauswahl-Dialog; übernimmt jedes `<input type="color">`, außer die des Browsers ist gewählt (siehe *Farbauswahl*) |
| `symbols.js` | `Suite.symbols` | Emoji und Symbole in allen Textfeldern: Auswahl, Codes beim Tippen, Alt+X, Einstellungen (siehe *Emoji und Symbole*) |

| ES-Modul | Zweck |
|---|---|
| `cm-colors.js` | Farbquadrate vor Hex-Farben in CodeMirror, geändert mit der Farbauswahl |
| `cm-symbols.js` | Emoji und Symbole in CodeMirror-Editoren (Adapter für `symbols.js`) |
| `spell.js`, `spell-dom.js`, `cm-spell.js` | Rechtschreibprüfung: Hunspell-Dienst, Markierungen und Menü in Textfeldern und contenteditable-Elementen, Auswahlfeld in der Kopfzeile; CodeMirror-Erweiterung (siehe *Rechtschreibprüfung*) |
| `odt.js`, `doc-toc.js`, `doc-html.js` | Textverarbeitung: OpenDocument-Text, Inhaltsverzeichnis, HTML-Darstellung zum Drucken und Speichern |
| `deck-convert.js` | Umwandlung zwischen PowerPoint-Präsentationen und Web-Folien |
| `python-widgets.py` | Interaktive Widgets des Notebooks (als Python-Modul `ipywidgets` installiert) |

Reihenfolge der Skripte in einer Anwendung: `vendor/htm-preact-standalone.umd.js`, `vendor/kdbxweb.min.js`,
`vendor/hash-wasm-argon2.umd.min.js`, dann `i18n.js`, `files.js`, `kdbx.js`, `settings.js`, `shell.js`, danach die
Skripte der Anwendung.

### Rechtschreibprüfung

`shared/js/spell.js` kapselt hunspell-asm (Hunspell nach WebAssembly kompiliert; die CSP der Apps erlaubt `'wasm-unsafe-eval'` und
`connect-src data:`). Wörterbücher werden vor dem Einlesen nach UTF-8 umgewandelt (im Zeichensatz der `SET`-Zeile dekodiert, `SET UTF-8`
geschrieben), sodass Wörter bei jedem Wörterbuch als JavaScript-Zeichenketten hinein- und herausgehen. Der Dienst `spell` hält die
suiteweite Einstellung (`suite.spell.enabled`, `suite.spell.language` – voreingestellt nach der Oberflächensprache), die eingebauten
Wörterbücher (eingebettet als `#dict-en_US-aff/-dic`, `#dict-de_DE-aff/-dic`, gzip, mit `Suite.embed.bytes` erst beim Start der Prüfung
gelesen), Wörterbücher der Anwender (IndexedDB `suite-dictionaries`; `.aff`+`.dic`-Paare oder `dictionaries/` einer `.oxt`, ohne
`hyph_`/`th_`-Dateien), eigene Wörter (`suite.spell.words`, in jeden Prüfer übernommen) und ignorierte Wörter (Sitzung); `words()`
verwirft Folgen mit Ziffern, `_`, `@`, `/`, `://`, einzelne Buchstaben und Wörter in Großbuchstaben; `onChange` informiert die Ansichten,
auch über Änderungen in anderen Tabs (`storage`-Ereignis).

`shared/js/spell-dom.js` (von den elf Apps mit Fließtext importiert; Kalender und KeePass laden es als Modul-Skript) fügt das Auswahlfeld
in die Kopfzeile ein (`Suite.shell.addHeaderItem`) und markiert unbekannte Wörter mit einem CSS Custom Highlight (`suite-spell`): in
contenteditable-Elementen auf ihren Textknoten (nicht in `code`, `pre`, Links); bei `<textarea>` und `<input data-spell>` auf einem
Spiegel – einer festen, durchsichtigen Kopie des Felds mit gleicher Box, Schrift und Scrollposition in einer Ebene über der Seite, nur
sichtbar, solange ein Punkt des Felds zuoberst liegt (`elementFromPoint`), sodass Dialoge und Schubladen, die es verdecken, auch seine
Markierungen verdecken. Felder mit `spellcheck="false"` (Code, Adressen), schreibgeschützte und Nicht-Text-Eingaben sowie
CodeMirror-Editoren bleiben ausgenommen; in geprüften Feldern ist die Prüfung des Browsers abgeschaltet (`spellcheck="false"`,
zurückgesetzt, wenn die Rechtschreibung aus ist). Aktualisiert wird in `requestAnimationFrame` nach Eingaben, Scrollen, Größenänderungen
und DOM-Änderungen. Das Kontextmenü (`contextmenu` in der Capture-Phase, nicht mit Umschalt) findet das Wort an der Schreibmarke (Felder)
oder über `caretPositionFromPoint`/`caretRangeFromPoint` (contenteditable) und ersetzt über `execCommand('insertText')`, das den
Rückgängig-Verlauf erhält und `input` auslöst. `shared/js/cm-spell.js` ist das Gegenstück für CodeMirror: ein View-Plugin erzeugt
Mark-Dekorationen (`cm-spell-error`) für die sichtbaren Bereiche – im Modus „prose“ alles außer Markdown-Code, URLs und HTML, im Modus
„code“ nur Syntaxknoten namens `*Comment*`, `*String*`, `*Docstring*` – und behandelt das Kontextmenü; der Texteditor wählt den Modus
nach der Sprache des Dokuments, das Notebook nach dem Zelltyp. Die Textverarbeitung behält ihren Bereich (Canvas). Tests:
`tests/apps/test_spelling.py` (deutsche Komposita und Vorschläge im Texteditor, eigene Wörter, Code-Modus, Textarea-Spiegel und
contenteditable in der E-Mail mit Menü, Ignorieren und Umschalt, die zwischen Apps geteilte Einstellung, eine `.oxt` in ISO-8859-1 aus der
Kopfzeile, das Menü am Smartphone), Rechtschreibung in Zellen in `test_notebook.py`, der Bereich in `test_document.py`.

### Emoji und Symbole

`shared/js/symbols.js` (ein klassisches Skript nach `shell.js` in jeder Anwendung außer der Übersicht) ergänzt alle Textfelder
um Emoji und Symbole. Die Daten, `vendor/esm/symbols/symbols.json`, erzeugt `tools/build_symbols.py` aus den eingebundenen
Datenpaketen (`vendor/symbols.esm.json`: emojibase-data 17 – Emoji mit englischen und deutschen Namen und Stichwörtern,
Gruppen, Hautfarben-Varianten, Emoticons, GitHub- und deutsche CLDR-Codes – sowie die CLDR-Annotationen 48.2 mit englischen
und deutschen Namen von Symbolen) und aus Pythons `unicodedata` für die Namen der übrigen Symbole (ausgewählte Blöcke:
Satzzeichen, Währungen, Pfeile, Mathematik, buchstabenähnlich und technisch, Griechisch, Lateinisch, Formen, Dingbats;
deutsche Namen lateinischer und griechischer Buchstaben werden aus den Unicode-Namen abgeleitet; Varianten mit Nase wie
`:-)` werden ergänzt). Jede Anwendung bettet sie als `#suite-symbols` ein (gzip + Base64, etwa 120 KB); dekodiert werden sie,
sobald zum ersten Mal ein Textfeld den Fokus erhält.

Felder werden über Adapter erreicht: `<input>` (text, search, ohne Typ) und `<textarea>` behalten ihre Auswahl, während die
Auswahl der Zeichen den Fokus hat, und werden mit `execCommand('insertText')` geändert (Rückgängig des Browsers, `input`-
Ereignisse für die Anwendung), contenteditable-Elemente über einen gespeicherten `Range` und `Selection.modify()`,
CodeMirror-Editoren über `shared/js/cm-symbols.js` (ein ES-Modul von Texteditor, Notebook, Datenbankwerkzeug und
HTTP-Analysator, das `EditorView.findFromDOM` einträgt; eine Transaktion mit `isolateHistory`). Felder in
`[data-no-symbols]` (KeePass-Geheimnisse) und `.xterm` bleiben außen vor, ebenso Passwörter und andere Eingabetypen. Die
Auswahl ist reines DOM (Rolle `dialog`, ein `listbox`-Raster mit wanderndem `tabindex`), unter oder über dem Feld platziert
(auf Bildschirmen unter 600 px eine Leiste am unteren Rand). Die Suche reiht Codepunkte, Emoticons und Codes zuerst, dann
Namen (genau, Anfang, alle Wörter – kürzere Namen zuerst), Stichwörter, sonst die Reihenfolge der Daten. Tasten werden in
der Capture-Phase behandelt: `Strg+.` (öffnen/schließen), `Alt+X` (Codepunkt ⇄ Zeichen, wie in Word) und bei offener
Vorschlagsliste die Pfeiltasten, `Enter`/`Tab` und `Esc`. `input`-Ereignisse vom Typ `insertText` steuern die Umwandlungen
beim Tippen (`:name:` beim schließenden Doppelpunkt nach einem Leerzeichen oder am Anfang, `U+XXXX`/`UXXXX` und – wenn
eingeschaltet – Emoticons mit Satzzeichen vor einem getippten Leerzeichen); nicht in Code-Editoren. Einstellungen:
`suite.symbols.button`, `suite.symbols.emoticons` (Info-Dialog, Teil der exportierten Einstellungen), `suite.symbols.recent`,
`suite.symbols.skin`. Tests: `tests/apps/test_symbols.py` (Suche auf Englisch und Deutsch, Tastatur, zuletzt verwendet,
Hautfarben, Codes beim Tippen und Vorschläge, Uhrzeiten und URLs unverändert, Alt+X, formatierter Text, Einstellungen und
ihre Speicherung, Code-Editor mit Rückgängig, ausgenommene Felder, Leiste am Smartphone).

### Farbauswahl

`shared/js/colorpicker.js` (ein klassisches Skript nach `symbols.js` in jeder Anwendung außer der Übersicht) stellt
`Suite.colors.pick({ value, alpha, anchor, onInput })` bereit – einen Dialog aus reinem DOM (Fläche für Sättigung/Helligkeit,
Regler für Farbton und Deckkraft mit Pointer-Capture und Tasten nach `role="slider"`, Felder für Hex und RGB(A),
Vergleich alt/neu, zuletzt verwendete Farben in `suite.colors.recent`, Grundfarben, die `EyeDropper`-API wo vorhanden), der
`#rrggbb` (`#rrggbbaa` mit `alpha` und Deckkraft unter 100 %) oder `null` liefert; `onInput` meldet jede Änderung nach der
ersten Darstellung. Ein `click`-Handler in der Capture-Phase übernimmt jedes `<input type="color">` (außer in
`[data-native-color]`): Er setzt den Wert des Feldes und löst `input` (laufend) und `change` (bei OK) aus, sodass die
Anwendungen unverändert bleiben; Abbrechen stellt den Wert wieder her. Die globale Einstellung `suite.colors.native`
(Info-Dialog) wechselt zur Auswahl des Browsers: Dann nutzt `pick()` ein verstecktes `<input type="color">` mit `showPicker()`
und behält die ursprüngliche Deckkraft. `shared/js/cm-colors.js` (Texteditor) versieht Hex-Farben mit einem Widget
(`MatchDecorator`, regulärer Ausdruck mit Lookbehind; rein numerische Formen in Text/Markdown ausgelassen) und ändert sie über
`pick()`: laufende Änderungen mit `Transaction.addToHistory.of(false)`, danach das Original und das Ergebnis als ein
Rückgängig-Schritt (`input.color`); die Form im Text bleibt erhalten (`styled()`). Tests: `tests/apps/test_colors.py`.

### Rückgängig und Wiederholen

Jeder Editor kann Änderungen rückgängig machen und wiederholen, mit Schaltflächen in der Werkzeugleiste
(`data-testid` `undo`/`redo`, nötig auf Touch-Geräten) und den Tasten von `Suite.UndoHistory.key`. Textfelder behalten
das eigene Rückgängig des Browsers. Verfahren:

| Anwendung | Rückgängig |
|---|---|
| Texteditor, SQL-/Body-Editoren, Text in Notebook-Zellen | CodeMirror-Verlauf je Dokument/Editor (`@codemirror/commands` `undo`/`redo`) |
| Tabellenkalkulation, Dokument | Befehlsverlauf von Univer (Schaltflächen der Univer-Werkzeugleiste) |
| Archivmanager | Momentaufnahmen der Eintragsliste (flache Kopien; die `load()`-Funktionen halten die Daten) |
| KeePass | `Database.snapshot()`/`restore()` in `kdbx.js`: tiefe Kopie des Gruppenbaums mit `copyFrom` von kdbxweb (geschützte Werte bleiben im Speicher verschlüsselt), gelöschte Objekte und Metadaten; nach jeder Änderung wird eine Momentaufnahme erstellt und die vorherige kommt in den Verlauf; Sperren löscht ihn |
| Kalender | Momentaufnahmen der Termine, des Namens, der Farbe und des `VCALENDAR` aller offenen Kalender (Öffnen/Schließen von Dateien ist kein Schritt) |
| Notebook | Momentaufnahmen der Zellenliste mit Verweisen auf die Zellenobjekte (die Editoren bleiben erhalten); Ausgaben werden nur beim Löschen von Ausgaben und Typwechseln wiederhergestellt |
| Datenbankwerkzeug | SQLite: exportierte Datenbankdatei vor jeder Änderung (`driver.restore()`), bis zu 20 Schritte und 32 MiB; Postgres: umgekehrte Anweisungen für Änderungen in der Ergebnistabelle |
| HTTP-Analysator | Momentaufnahmen der Sammlung nach jeder Änderung; Tippen in ein Feld (nach Ziel des input-Ereignisses) innerhalb einer Sekunde wird zusammengefasst |
| Hex-, Bild-, Diagramm-, Präsentations-, Audio-, Video-Editor | eigene Verläufe aus Momentaufnahmen (siehe die Abschnitte der Anwendungen) |

### Anwendungsbrücke („Öffnen mit…“)

`shared/js/bridge.js` gibt eine Datei von einer Quellanwendung an eine Zielanwendung weiter und speichert sie zurück:

1. Die Quelle ruft `Suite.bridge.openWith(name, { data, save, source, exclude })` aus einem Klick auf. Der Auswahldialog
   zeigt die für die Endung eingetragenen Anwendungen (`APPS`; der Hex-Editor öffnet alles).
2. **Einzeln gestartet:** Die Quelle öffnet `new URL('<app>.html', location.href)` mit `window.open` (synchron, wegen
   Pop-up-Blockern). Das Ziel ruft beim Start `Suite.bridge.receive(onOpen)` auf und sendet
   `{ suite: 'suite-bridge', type: 'ready' }` an sein `opener`-Fenster; die Quelle antwortet mit
   `{ type: 'open', name, fileType, bytes, writable, source }` und überträgt bei beschreibbaren Dateien ein Ende eines
   `MessageChannel`. **In der Übersicht** (Fenstername `suite-hub-app`) sendet die Quelle stattdessen
   `{ type: 'open-in', app, files: [{ name, fileType, bytes, writable, source, port }] }` an die Übersicht (`port`: Index in
   die übertragenen Ports, -1 bei Kopien ohne Zurückschreiben), die einen Tab öffnet und Dateien und Ports weitergibt, sobald
   der Tab bereit ist.
   **Mehrere Dateien:** `Suite.bridge.openWithMany([{ name, data, save }, …], { source, exclude })` (und `openIn(app, [...])`)
   bietet nur die Anwendungen mit `multi: true` an (Text- und Hex-Editor; bevorzugt jene, die jede Endung öffnen) und sendet
   je Datei eine `open`-Nachricht an dasselbe Fenster bzw. denselben Tab. `receive` verarbeitet die Dateien nacheinander
   (Promise-Warteschlange) und zeigt am Ende eine Meldung.
3. Das Ziel erhält `{ file, handle }`. Das Handle (`bridged: true`) bietet `getFile`, `queryPermission`,
   `requestPermission` und `createWritable`; `Suite.files.save()` schreibt darüber, was `{ type: 'save', id, bytes }`
   über den Port sendet. Die `save(bytes)`-Funktion der Quelle schreibt die Daten zurück (Archiveintrag, SFTP/FTP-Upload,
   KeePass-Anhang, Pyodide-Datei) und antwortet mit `saved` oder `error`. Nur lesbare Kopien (Anhänge empfangener
   E-Mails) haben kein Handle, Speichern erzeugt dann einen Download.

Quellen: Archivmanager, FTP/SFTP-Client, SSH-Dateibereich, KeePass-Anhänge, E-Mail-Anhänge, Notebook-Dateien, die
Übersicht. Ziele: jede Anwendung, die Dateien öffnet.

### Diagramme in anderen Anwendungen

`shared/js/diagram-embed.js` (`Suite.diagrams`, ein klassisches Skript von Präsentation, Web-Folien, Dokument und Tabellenkalkulation) setzt
Spike S-11 um: Ein Diagramm ist ein PNG mit dem draw.io-XML in einem `tEXt`-Chunk `mxfile` (das „bearbeitbare PNG“ von draw.io), das PPTX
(pptxgenjs, eigener Import), DOCX (`docx`, eigener Import), XLSX (ExcelJS) und das HTML/Markdown der Web-Folien Byte für Byte erhalten.
`isDiagram()` sucht den Chunk (oder bei SVG ein `content` mit `<mxfile`); `insert()` beginnt mit einem 1×1-PNG mit leerem Diagramm, `edit()`
mit dem Bild; beide rufen `Suite.bridge.openIn('diagram', { name: '….drawio.png', data, save })` auf. Der Diagramm-Editor behält das Bildformat
einer aus PNG/SVG geöffneten Datei und speichert die erste Seite als 2×-PNG mit dem Diagramm darin, sodass jedes **Speichern** dort
`onSave({ src, width, height })` des Gastgebers aufruft (`width`/`height`: halbe Pixelzahl). Gastgeber fügen das erste Bild ein und aktualisieren
es danach; `newSize()` behält den Maßstab eines aktualisierten Bildes (höchstens Seiten- bzw. Folienbreite):

| Gastgeber | Einfügen | Bearbeiten / aktualisieren |
|---|---|---|
| Präsentation | Bildelement auf der Folie | `el.image.src`, `w`/`h`; Doppelklick oder Schaltfläche im Bereich; `record()` = ein Rückgängig-Schritt |
| Web-Folien | Bildblock (`📐 Diagramm (draw.io)`) | `block.src` |
| Dokument | `FDocument.insertImage` an der Schreibmarke (gemerkt, bevor das Fenster aufgeht) | fokussierte Zeichnung (`IDrawingManagerService.getFocusDrawings`, `focus$` zeichnet die Werkzeugleiste neu); eine `RichTextEditingMutation` mit JSON1-`replaceOp`s auf `drawings/<id>/source`, `docTransform.size` und `transform` und `historyAction: UpdateImage` – ein Univer-Rückgängig-Schritt (die Facade kennt kein „Quelle setzen“) |
| Tabellenkalkulation | `newOverGridImage()…buildAsync()` + `insertImages` an der aktiven Zelle | `getActiveImages()` (eine ID; die Quelle über `getImageById(id).toBuilder().getSource()`), `toBuilder().setSource().setWidth().setHeight()` + `updateImages` |

Tests: `tests/apps/test_diagram_embedding.py` (Einfügen, zweites Speichern, Bearbeiten, Rückgängig, Dateiformate je Gastgeber, XLSX-Bilder),
`tests/apps/test_embedded_diagrams.py` (Byte-Erhalt der Formate).

### Format der Anwendungsdaten

JSON:

```json
{ "format": "portable-web-app-suite", "version": 1,
  "apps": { "sftp": { "settings": {}, "connections": [ { "id": "…", "name": "Server", "url": "sftp://host" } ] } } }
```

KeePass: Gruppe `Portable Web App Suite/<App>`. Die Einstellungen sind der Anhang `settings.json` des Eintrags
`Settings`. Jede Verbindung ist ein Eintrag mit dem benutzerdefinierten Feld `SuiteId`; `name`, `username`,
`password`, `url` und `notes` stehen in den Standardfeldern, weitere Eigenschaften in benutzerdefinierten Feldern
(Text unverändert, andere Werte als JSON); `password`, `privateKey`, `passphrase`, `token`, `secret` und `apiKey` sind geschützt.

Die App `suite` enthält, was alle Apps teilen: `settings.relay` und `settings.preferences`, die localStorage-Einträge der Suite
(Schlüssel `suite.*` und `<app>.prefs`, ohne `suite.mediaplayer.resume`) als Zeichenketten. `Suite.preferences` (Ende von
`shared/js/shell.js`) sammelt und übernimmt sie; der Info-Dialog exportiert sie als JSON-Datei in diesem Format
(`suite-settings.json`, nur `apps.suite.settings.preferences`) und importiert denselben Teil aus jeder JSON-Anwendungsdatendatei,
danach fragt er, ob neu geladen werden soll. `Suite.appdata` schreibt die aktuellen Einstellungen in jede gespeicherte
Verbindungsdatei und zeigt beim Öffnen einer Datei mit abweichenden Einstellungen eine Leiste zum Übernehmen. Test:
`tests/apps/test_preferences.py`.

## Anwendungen

### Texteditor (`apps/texteditor`)

| Datei | Inhalt |
|---|---|
| `js/encoding.js` | `TE.encoding`: Erkennung (BOM, gültiges UTF-8, UTF-16 ohne BOM anhand der Nullbytes, sonst Windows-1252) und Kodierung von UTF-8 (± BOM), UTF-16 LE/BE (± BOM), Windows-1252; Zeilenenden LF/CRLF/CR. Intern arbeitet der Editor mit `\n` und wandelt beim Speichern um. |
| `js/languages.js` | Modul `app/languages`: Sprache nach Dateiname/Endung, CodeMirror-Sprachunterstützung (lang-*-Pakete und Legacy-Modi). |
| `js/sas.js` | Modul `app/sas`: SAS als CodeMirror-Stream-Parser (Zustand: Block-/Anweisungskommentar, Anweisungsbeginn, laufender Schritt, DATALINES, Einrückungstiefe). Anweisungswörter zählen am Anweisungsbeginn oder nach THEN/ELSE, `do`/`to`/`end` … überall, SQL-Wörter überall in PROC SQL; `x=` ist eine Option, `lib.member` ein Name, `name9.` ein Format. `indent()` nutzt die Tiefe (DATA/PROC … RUN/QUIT, DO/SELECT/CASE … END, %MACRO/%DO … %MEND/%END); `languageData.autocomplete` vervollständigt nach Zusammenhang (nach PROC, CALL, %, &; sonst Anweisungen, Funktionen und die Namen des Programms, in der getippten Schreibweise; nichts in Kommentaren und Zeichenketten, laut Syntaxbaum). |
| Geteilte Ansicht | Ein zweiter `EditorView` mit eigenem Zustand auf demselben Dokument: Beide Ansichten haben ein eigenes `dispatch`, das Dokumentänderungen an die andere weitergibt, markiert mit einer `Annotation`, damit sie nicht zurückgeschickt werden (mit dem ursprünglichen Benutzerereignis, damit der Verlauf der Hauptansicht sie gruppiert). Nur die Hauptansicht führt den Verlauf; die zweite leitet Rückgängig/Wiederholen dorthin. |
| In Dateien suchen | `runFind()` durchsucht die `EditorState`-Dokumente aller Reiter oder – mit einem `FileSystemDirectoryHandle` aus `showDirectoryPicker` – die Dateien eines Ordners (asynchroner Generator, verzögerte Eingabe, eine neuere Suche bricht eine ältere ab); Treffer behalten ihre Dokument-Positionen, damit ein Klick sie markiert. |
| `@codemirror/merge` | Vergleichen: `MergeView` (zwei Editoren; der linke schreibgeschützt, `revertControls: "a-to-b"`) oder unter 760 px `unifiedMergeView` in einem Editor; beide mit `diffConfig: { override: lineDiff }` (`js/linediff.js`: Myers-Diff über ganze Zeilen nach Abschneiden gleicher Zeilen am Anfang und Ende, danach der Zeichen-Diff von `@codemirror/merge` innerhalb jedes geänderten Blocks bis 20 000 Zeichen – dessen Zeichen-Diff allein gibt nach seinem Suchlimit auf und meldet eine Änderung vom ersten Unterschied bis zum Ende); `getChunks` zählt die Unterschiede, `goToNextChunk`/`goToPreviousChunk` springen. Das Ergebnis ersetzt das Dokument am Ende in einer Transaktion. |
| `js/tools.js` | Modul `app/tools`: Textwerkzeuge als reine Zeichenkettenfunktionen (`apply(id, text, options)`); SQL mit sql-formatter (`formatSql`: Dialekt, Schreibweise von Schlüsselwörtern/Funktionen/Datentypen, Einrückung, `indentStyle`, `logicalOperatorNewline`, `expressionWidth`; Syntaxfehler werden zu `ToolError`) und `minifySql` (ein kleiner Scanner: Zeichenketten, Namen in Anführungszeichen, Dollar-Quotes und `/*+`-Hinweise bleiben, Kommentare entfallen, Leerraum wird zusammengefasst); Werkzeuge mit `options: "sql"` öffnen zuerst den Optionsdialog mit Vorschau (`SqlDialog` in `main.js`, Optionen in den Einstellungen); Zeilenwerkzeuge sortieren mit `Intl.Collator` (numerisch, Grundzeichen, stabil), XML wird aus einem `DOMParser`-Baum neu eingerückt. `main.js` wendet ein Werkzeug auf die Auswahl (bei Zeilenwerkzeugen auf ganze Zeilen erweitert) oder das Dokument als eine Transaktion an (`userEvent: input.tool`). |
| `js/main.js` | Ein CodeMirror-`EditorView`; jede Registerkarte hat ihren eigenen `EditorState` (Rückgängig-Verlauf, Auswahl), der mit `setState` getauscht wird. Einstellungen (Umbruch, Leerzeichen, Schriftgröße, dunkles Design) sind Compartments, die beim Wechsel neu gesetzt werden. Werkzeugleiste, Registerkarten und Statusleiste sind Preact-Komponenten im gemeinsamen Rahmen. |

Die Einrückung gilt je Dokument (`doc.indent`: `s2`/`s4`/`s8` Leerzeichen oder `t2`/`t4`/`t8` Tabulatoren) in einem Compartment
mit `indentUnit` und `tabSize`; `detectIndent()` wählt Tabulatoren, wenn die meisten eingerückten Zeilen mit einem beginnen,
sonst den häufigsten Schritt (2/4/8) zwischen aufeinanderfolgenden Zeilen; die letzte Wahl gilt für neue Dokumente. Tab führt
`indentOrInsert` aus (Auswahl: `indentMore`; sonst Leerzeichen bis zur nächsten Stufe oder ein Tabulator), Umschalt+Tab
`indentLess`, `Strg+Alt+I` fügt `\t` ein. Der Tab-Fokusmodus von CodeMirror hält den Editor barrierefrei: nach `Esc` (2 s)
oder mit `Strg+M` bewegt Tab den Fokus.

Mehrere Cursor nutzen die eingebaute Unterstützung von CodeMirror (`allowMultipleSelections`, `Strg+Klick`,
Rechteckauswahl mit `Alt+Ziehen`, `selectNextOccurrence`). Ein Dokument gilt als geändert, wenn sein Text vom zuletzt
gespeicherten abweicht (`Text.eq`). Ansichtseinstellungen liegen in `localStorage` (`texteditor.prefs`), Dateiinhalte nie.

Tests: `tests/apps/test_texteditor.py` (Sprachen, Kodierungen hin und zurück, Umwandlung, Registerkarten, Suchen/Ersetzen,
Gehe zu Zeile, mehrere Cursor, Einstellungen, deutsche Oberfläche, Smartphone-Layout, Zurückschreiben mit der File System
Access API, Textwerkzeuge auf Dokument und Auswahl, Kodierer/Formatierer, ungültige Eingaben, SQL-Formatierung (Optionen, Vorschau, gespeicherte
Optionen, Auswahl, Syntaxfehler) und SQL in eine Zeile, SAS-Hervorhebung, -Vervollständigung und -Einrückung, Einrückungseinstellung,
Erkennung und Tab-Tasten (samt Verlassen des Editors mit Esc, Tab), Vergleich mit einem offenen Dokument und
einer Datei, geteilte Ansicht (Änderungen in beide Richtungen, gemeinsames Rückgängig,
folgt dem Reiter), Suche in geöffneten Dateien (Groß-/Kleinschreibung, reguläre Ausdrücke, Fehler) und in einem Ordner (OPFS-Verzeichnis
statt der Auswahl; `.git` und Binärdateien übersprungen)).

### Hex-Editor (`apps/hexeditor`)

| Datei | Inhalt |
|---|---|
| `js/buffer.js` | `HE.ByteBuffer`: Bytes in einem wachsenden `Uint8Array` mit den Operationen Ersetzen, Einfügen und Entfernen; jede Operation liefert ihre Umkehrung, daraus entsteht Rückgängig/Wiederholen (die beiden Halbbytes eines getippten Bytes sind ein Schritt). `find()` sucht vorwärts/rückwärts, `HE.parseHex()` liest hexadezimale Eingaben, `HE.inspect()` deutet Bytes für den Dateninspektor (`DataView`, `BigInt`). |
| `js/checksum.js` | `HE.checksums()`: CRC-32 und Adler-32 (Tabelle/Schleifen), MD5 (RFC 1321, WebCrypto kennt es nicht) und SHA-1/256/512 über `crypto.subtle.digest`; `HE.differences()` zählt abweichende Bytes zweier Arrays. |
| `js/main.js` | Oberfläche im gemeinsamen Rahmen: Tabs (`state` enthält das aktive Dokument; `docs` hält die Felder aus `DOC_KEYS` – Puffer, Name, Handle, Cursor, Auswahl, Scrollposition, Vergleich – der übrigen, getauscht von `activate()`), virtualisierte Ansicht (nur sichtbare Zeilen plus Rand werden in einen absolut positionierten Platzhalter gezeichnet; Zeilenhöhe 22 px), Tastatur- und Zeigerbehandlung, Suchleiste, Gehe-zu-Leiste, Inspektor, Statusleiste, Prüfsummendialog, Vergleich (zweite Spalte je sichtbarer Zeile, daher gemeinsames Scrollen; die Zahl der Unterschiede wird bei geänderter Pufferversion neu gezählt, nächster/vorheriger Unterschied wird ab dem Cursor gesucht). |

Die ganze Datei liegt im Arbeitsspeicher; ab 256 MiB erscheint eine Warnung. Öffnen fügt einen Tab hinzu (eine unberührte
leere Datei wird ersetzt; eine bereits geöffnete Datei wird angezeigt); die Wiederherstellungskopie (Autosave) enthält jeden
geänderten Tab. Bytes pro Zeile sind standardmäßig 8
(schmale Bildschirme), 16 oder 32 (breite Bildschirme). Einstellungen (Bytes pro Zeile, Byte-Reihenfolge) liegen in
`localStorage` (`hexeditor.prefs`).

Tests: `tests/apps/test_hexeditor.py` (Überschreiben, ASCII-Eingabe, Anhängen, Einfügen, Löschen, Rückgängig/Wiederholen,
Suchen, Gehe zu, Inspektor, Speichern, 16-MiB-Datei, Mausauswahl und Kopieren, deutsche Oberfläche, Bearbeiten am
Smartphone über den Inspektor, Zurückschreiben, Tabs (mehrere Dateien, eigener Zustand und Rückgängig je Tab, geöffnete
Dateien angezeigt, Schließen mit Nachfrage), Prüfsummen gegen Pythons `hashlib`/`zlib` samt MD5-Randfällen beim Auffüllen,
Vergleich mit Navigation und Neuzählung nach Bearbeiten).

### PDF-Betrachter (`apps/pdfviewer`)

Signaturen (`js/signatures.js`, ohne Bibliotheken): `findSignatures` durchsucht die Rohdaten nach `/ByteRange [0 a b c]`; `/Contents` ist die
Hex-Zeichenkette in der Lücke zwischen den beiden Bereichen, die übrigen Schlüssel (`/Name`, `/M`, `/Reason`, `/Location`, `/SubFilter`)
werden aus dem Dictionary-Text darum gelesen. Ein kleiner DER-Leser zerlegt die CMS-SignedData: das Zertifikat des Unterzeichners (Aussteller +
Seriennummer oder das erste), den Hash-Algorithmus, die signierten Attribute (`messageDigest`, `signingTime`) und die Signatur. Integrität =
SHA-Hash beider Bereiche gleich `messageDigest`; Signatur = `crypto.subtle.verify` über die als SET umgekennzeichneten signierten Attribute
(RSASSA-PKCS1-v1_5, RSA-PSS mit Hash und Salt aus den Parametern, ECDSA mit der DER-Signatur umgewandelt in r‖s; RSA-Schlüssel werden als
`rsaEncryption`-SPKI neu verpackt). Daten nach dem letzten Bereich bedeuten Änderungen nach dem Signieren. Die in der Signatur enthaltene
Zertifikatskette wird Glied für Glied geprüft; über das Vertrauen wird nicht entschieden (offline kein Stammzertifikatsspeicher).

PDF.js (`pdfjs-dist`, Apache-2.0) wird mit `tools/vendor_pdfjs.py <Version>` nach `vendor/pdfjs/` übernommen:

| Datei | Verwendung |
|---|---|
| `pdf.min.mjs`, `pdf_viewer.mjs` | ES-Module (Import-Map `pdfjs-dist`, `pdfjs-dist/web/pdf_viewer`); die Viewer-Komponenten lesen die Bibliothek aus `globalThis.pdfjsLib`, daher setzt `main.js` diese vor dem Import |
| `pdf.worker.classic.js` | der Worker als klassisches Skript (`export` entfernt, `import.meta.url` ersetzt), gestartet über eine Blob-URL (`GlobalWorkerOptions.workerPort`) |
| `pdf_viewer.css` | Viewer-Styles mit eingebetteten Bildern als `data:`-URLs |
| `cmaps/`, `standard_fonts/`, `wasm/` | eingebettet mit `data-bundle`; eine eigene `BinaryDataFactory` (`useWorkerFetch: false`) liefert sie aus dem Bündel statt sie über URLs zu laden |

`getDocument` läuft mit `isEvalSupported: false` (kein `eval` unter der CSP) und `useSystemFonts: false` (der Weg über
Systemschriften würde die Standardschriften über URLs laden). Der Container des `PDFViewer` wird einmal außerhalb von Preact
angelegt und in das Layout eingehängt (er muss absolut positioniert sein und Neuzeichnungen überstehen). Seitenvorschauen
werden bei Bedarf mit einem `IntersectionObserver` gezeichnet. Gespeichert wird mit `saveDocument()`, wenn Formulardaten
oder Kommentare vorhanden sind, sonst mit `getData()`. Zum Drucken wird jede Seite als Bild in `#pv-print` gezeichnet und
`window.print()` aufgerufen; ein Druck-Stylesheet blendet die Anwendung aus.

Seitenoperationen (`js/pages.js`) nutzen pdf-lib 1.17 (MIT, `vendor/esm/pdflib`, beim ersten Gebrauch importiert). Jede
Operation lädt die aktuellen Bytes (mit Formulardaten und Kommentaren, `saveDocument()`), ändert das Dokument an Ort und Stelle
(`setRotation`, `removePage`, `insertPage` der vorhandenen Seitenobjekte zum Umordnen, `copyPages` aus anderen Dateien),
speichert es und öffnet das Ergebnis im Betrachter an der betroffenen Seite; die vorherigen Bytes kommen auf einen
Rückgängig-Stapel (30 Schritte). Beim Extrahieren werden Seiten in ein neues Dokument kopiert. pdf-lib kann keine
verschlüsselten Dateien schreiben; bei solchen PDFs erscheint eine Fehlermeldung. Auch das Unterschreiben ist eine
Seitenoperation: Das Unterschriftsfeld (ein Canvas mit 600×200 Pixeln, Zeigerstriche oder getippter Text in Schreibschrift)
wird auf die Tinte zugeschnitten und als PNG gespeichert; die Klickposition auf der Seite wird mit
`viewport.convertToPdfPoint()` der Seitenansicht umgerechnet, und `pages.stamp()` zeichnet das Bild dort ein (`embedPng`,
`drawImage`, höchstens 180 pt breit).

Tests: `tests/apps/test_pdfviewer.py` mit PDFs aus `tests/helpers/office_samples.make_pdf()` (nicht eingebettete
Helvetica-Schrift, Inhaltsverzeichnis, interner Link, Formularfeld; mit pypdf verschlüsselt): Darstellung, Textebene,
Seitenvorschau, Blättern, Inhaltsverzeichnis, Links, Zoom, Drehen, Suche, Ausfüllen von Formularen und Zeichnungen
(mit pypdf geprüft), Passwort, Drucken, Seitenoperationen (verschieben, drehen, löschen und rückgängig, anhängen,
extrahieren; Reihenfolge, Drehung und Formular mit pypdf geprüft), geschützte PDFs, deutsche Oberfläche, Smartphone-Layout,
Unterschreiben (gezeichnete Unterschrift als Bild-XObject, leeres Feld, abgebrochenes Platzieren).

### KeePass (`apps/keepass`)

Die Anwendung arbeitet direkt mit dem Datenbankobjekt von `Suite.kdbx` (kdbxweb); `vendor/otpauth.umd.min.js` (otpauth, MIT)
berechnet TOTP-Codes aus einem Feld `otp` (`otpauth://`-URI, Konvention von KeePassXC). `js/generator.js` stellt
`KP.generatePassword(options)` (Verwerfungsverfahren mit `crypto.getRandomValues`, mindestens ein Zeichen jeder gewählten
Klasse) und `KP.entropy(password)` (Schätzung über den Zeichenvorrat) bereit.

- Bearbeiten: `setFields(entry, values, { history })` legt den vorherigen Stand nur bei der ersten Änderung einer
  Bearbeitung (`state.historyPushed`) im Verlauf ab, nicht bei jedem Tastendruck. Geschützte eigene Felder sind `ProtectedValue`s.
- Gelöschte Einträge und Gruppen werden in den Papierkorb verschoben (bei Bedarf angelegt, `meta.recycleBinUuid`);
  `groups()` und `entries()` von `Suite.kdbx` lassen den Papierkorb aus, die Oberfläche sucht die gewählte Gruppe
  einschließlich Papierkorb.
- Gespeichert wird über `db.save()` (öffnet das Ergebnis zur Prüfung erneut) und `Suite.files.save/saveAs`; eine neue
  Datenbank wird mit „Speichern unter“ gespeichert. Schlüsseldateien entstehen mit `kdbxweb.Credentials.createRandomKeyFile(2)`
  (XML-Schlüsseldatei v2, `.keyx`).
- Automatisches Sperren nach 15 Minuten ohne Zeiger- oder Tastaturaktivität, ausgelassen bei ungespeicherten Änderungen;
  die Zwischenablage wird 30 Sekunden nach dem Kopieren geleert.
- Layout: drei Bereiche (Gruppen, Einträge, Editor); unter 760 px ist nur ein Bereich (`pane-groups|entries|entry`) sichtbar.

Tests: `tests/apps/test_keepass.py` erstellt Datenbanken mit pykeepass und prüft jede gespeicherte Datei mit pykeepass: falsches
Passwort, Blättern, Suche, TOTP-Code, Bearbeiten mit Verlauf, eigene und geschützte Felder, Tags, Gruppen, Verschieben,
Wiederherstellen aus dem Verlauf, Papierkorb, neue Datenbank mit Schlüsseldatei, Hauptschlüssel ändern, Generator, Anhänge,
Sperren und automatisches Sperren (Playwright-Uhr), Zusammenführen einer Kopie (mit kdbxwebs `merge` abgeglichen, das dieselbe
UUID der Stammgruppe voraussetzt) und einer anderen Datenbank (mit `importEntry` in eine neue Gruppe übernommen), Passwortbericht,
deutsche Oberfläche, Smartphone-Layout.

### Archivmanager (`apps/archive`)

`js/archive.js` (ES-Modul, fflate für Deflate/Gzip) liest und schreibt die Containerformate selbst; `js/multi.js` liest die übrigen
Formate und schreibt 7z über libarchive.js 2.0 (libarchive als WebAssembly, `vendor/libarchive`, `tools/vendor_libarchive.py`):

- Das Worker-Bündel (als klassisches Skript, nachdem `import.meta.url` ersetzt wurde; Modul-Worker aus Blob-URLs starten in
  `file://`-Seiten nicht) und das Wasm bettet build.py ein. Der Worker hat einen eigenen opaken Ursprung und kann die Blob-URLs der Seite
  nicht laden, daher wird das Wasm als `data:`-URL hineingesetzt. Zwei weitere Anpassungen: ein größerer Ausgabepuffer beim Schreiben
  (libarchive.js reserviert nur 128 Byte je Datei, zu wenig für die Kopfdaten) und `printErr` als Warnung. `Archive.init({ getWorker })`
  startet ihn.
- `detectMulti` erkennt die Formate an ihren Signaturen; `readMulti` entpackt alle Einträge auf einmal (`client.extractFiles()`, libarchive
  liest sequenziell) und hält sie im Speicher. libarchive entschlüsselt kein 7z/RAR: verschlüsselte ergeben `ar.encryptedUnsupported`; keine
  Einträge aus xz/bzip2/zstd/lzma-Daten bedeuten eine einzelne komprimierte Datei (das Format `raw` ist nicht aktiviert).
- `write7z`: libarchive.js hat keine funktionierende Option „ohne Filter“, daher wird der 7z-Strom durch den gzip-Filter geschrieben und mit
  `DecompressionStream` wieder entpackt. Einträge haben keine Ordnereinträge (Ordner ergeben sich aus den Pfaden) und keine Verschlüsselung.

- **ZIP lesen** beginnt beim End-of-Central-Directory-Eintrag (ZIP64-Locator und -Zusatzfeld werden unterstützt). Die Einträge werden
  aus dem zentralen Verzeichnis gelistet, ohne zu entpacken; `load()` entpackt bei Bedarf und prüft die CRC-32. Namen sind UTF-8
  (Flag 11 oder gültiges UTF-8) oder CP437; der Info-ZIP-Unicode-Pfad (0x7075), der erweiterte Zeitstempel (0x5455) und Unix-Rechte
  werden gelesen.
- **ZIP schreiben** setzt das UTF-8-Flag und einen erweiterten Zeitstempel. Unveränderte Einträge des geöffneten Archivs werden mit
  ihren komprimierten Daten kopiert (`entry.zip.raw()`); verschlüsselte Einträge behalten Flags, Zusatzfelder und Data Descriptor.
  Neue oder geänderte Einträge werden mit der gewählten Stufe komprimiert (gespeichert, wenn das nicht kleiner ist). ZIP64 wird nicht
  geschrieben: mehr als 4 GiB oder 65.535 Einträge ergeben einen Fehler.
- **TAR** liest ustar-Köpfe mit Präfix, pax (`path`, `linkpath`, `mtime`), lange GNU-Namen (`L`/`K`) und Base-256-Größen und schreibt
  ustar mit pax-Köpfen für lange oder Nicht-ASCII-Namen. **GZ** behält den ursprünglichen Dateinamen (`FNAME`).
- 7z, RAR, bzip2 und xz werden an ihrer Signatur erkannt und als nicht unterstützt gemeldet.
- **Verschlüsselung** (`js/zipcrypto.js`, synchron, damit `load()` synchron bleibt): SHA-1, HMAC-SHA1, PBKDF2 und die
  AES-Blockverschlüsselung (T-Tabellen; gegen die Testvektoren aus FIPS-197 und RFC 6070 geprüft) stecken im Modul, weil
  WebCrypto asynchron ist und sein AES-CTR big-endian zählt, WinZip AES aber Gladmans little-endian-Zähler verwendet.
  WinZip AES (Methode 99, Zusatzfeld 0x9901): PBKDF2-HMAC-SHA1 mit 1000 Iterationen leitet Schlüssel, HMAC-Schlüssel und den
  2-Byte-Prüfwert aus Passwort (UTF-8) und Salt ab; Daten = Salt + Prüfwert + AES-CTR-Daten + 10 Byte HMAC-SHA1; geschrieben wird
  AE-2 (ohne CRC) mit AES-256. ZipCrypto: das 12. Kopfbyte prüft das Passwort gegen die CRC (bzw. die DOS-Zeit bei Flag 3).
  Der Zähler wird mit ausdrücklichem Übertrag über die ersten 8 Bytes erhöht (`++nonce[j]` auf einem `Uint8Array` ergibt 256,
  nicht die gespeicherte 0). Versionen bis 1.0.0 übertrugen nicht; ihr Schlüsselstrom wiederholte sich nach 256 Blöcken (4 KiB),
  und andere Programme konnten ihre AES-Einträge nicht lesen. Solche Einträge erkennt das Archiv an der Kennung dieses Schreibers –
  erstellt von `0x031e`, AE-2, genau die Zusatzfelder 0x5455 und 0x9901 (`legacyAes`); neue Einträge tragen `0x033f`. Sie werden
  mit dem alten Schlüsselstrom entschlüsselt (bei Deflate wird, wenn das Entpacken scheitert, der andere versucht) und nach Eingabe
  des Passworts beim Speichern korrekt neu verschlüsselt; gesperrte werden roh kopiert und behalten ihre Kennung.
  `archive.js` merkt sich die eingegebenen Passwörter (`addPassword`), `locked(entry)` prüft sie günstig über den Prüfwert, und
  `write(..., { encryption: { password, method, all } })` verschlüsselt neue und geänderte (mit `all` auch unveränderte
  unverschlüsselte) Einträge; verschlüsselte unveränderte Einträge werden roh kopiert.

`js/main.js` hält eine flache Liste der Einträge; Ordner, die sich nur aus Pfaden ergeben, werden ohne eigenen Eintrag angezeigt.
Beim Hinzufügen entstehen explizite Ordnereinträge für die Elternordner. Nach dem Speichern werden die geschriebenen Bytes neu
gelesen, damit der Zustand der Datei entspricht. Mehrere Elemente werden mit `showDirectoryPicker()` entpackt, wo vorhanden, sonst
als ein ZIP-Download. Gezogene Ordner werden mit `webkitGetAsEntry()` gelesen. `main.js` importiert `@app/archive.js` (siehe Build).

Tests: `tests/apps/test_archive.py` erstellt Archive mit `zipfile`, `tarfile` und `gzip` (und ein vom Test geschriebenes
ZipCrypto-Archiv) und prüft jede gespeicherte Datei damit: Durchsuchen, Vorschau, Sortieren, Hinzufügen, Ordner, Umbenennen,
Löschen, unveränderte Übernahme bestehender Einträge, Kompressionsstufe, lange und Unicode-Namen sowie symbolische Verknüpfungen
in TAR.GZ, Umwandlung nach TAR und ZIP, GZ, ZipCrypto-Passwortabfrage und Verschlüsselung hinzugefügter Dateien (mit `zipfile`
geprüft), AES-Archive aus pyzipper gelesen und als AES-256 und ZipCrypto geschrieben (mit pyzipper und `zipfile` geprüft), Einträge
über 4 KiB (gespeichert und komprimiert) im Austausch mit pyzipper und, falls installiert, 7-Zip (`7z a -mem=AES256`, `7z t`),
AES-Einträge älterer Versionen (vom Test mit dem alten Schlüsselstrom erzeugt) gelesen und beim Speichern repariert, Entpacken (Download, ZIP, Ordner über OPFS),
Integritätstest (intaktes Archiv, gespeicherter Eintrag mit geändertem Byte), nicht unterstützte Formate, Ziehen und Ablegen, deutsche Oberfläche, Smartphone-Layout.

### Medienplayer (`apps/mediaplayer`)

Ein `<video>`-Element (einmal außerhalb von Preact angelegt und in die Bühne eingehängt) spielt Audio und Video aus Blob-URLs der
gewählten Dateien oder aus Stream-URLs; die CSP erlaubt `media-src blob: data: http: https:`. Es ist kein Decoder eingebunden: die
Formate sind die des Browsers.

- `js/tags.js` liest Tags aus den ersten 512 KiB (ID3v2.2–2.4 mit APIC, FLAC-Vorbis-Kommentare und PICTURE, Ogg-Vorbis/Opus-Kommentare,
  RIFF-INFO- und `id3 `-Blöcke, MP4 `ilst`) und ID3v1 vom Dateiende.
- `js/playlist.js` liest M3U/M3U8 (`#EXTINF`), PLS und XSPF, schreibt M3U8 und wandelt SRT in WebVTT um (Untertitel werden als
  `<track>` mit Blob-URL angehängt).
- Einträge von Wiedergabelisten werden den hinzugefügten Dateien über den Dateinamen zugeordnet (ohne Beachtung der
  Groß-/Kleinschreibung); fehlende Einträge warten auf eine Datei mit diesem Namen. `.m3u`-Dateien haben den MIME-Typ
  `audio/x-mpegurl` und werden daher ausdrücklich von den Mediendateien ausgenommen.
- Die Dauer wird nacheinander mit einem verborgenen `<audio preload=metadata>` ermittelt.
- Die Zufallswiedergabe hält eine zufällige Reihenfolge mit dem aktuellen Titel zuerst; bei „alle wiederholen“ wird am Ende eine neue
  Reihenfolge gezogen.
- Media-Session-Metadaten und -Aktionen; Einstellungen (Lautstärke, Stummschaltung, Geschwindigkeit, Zufall, Wiederholen,
  Anzeige der Wiedergabeliste) in `localStorage` (`suite.mediaplayer`).

Equalizer: beim ersten Gebrauch entsteht ein zweites Medienelement, das über `createMediaElementSource` → zehn
`BiquadFilterNode`s (Tiefenregler, acht Glockenfilter mit Q 1,4, Höhenregler) → wahlweise einen `DynamicsCompressor` (Schwelle
−24 dB, Verhältnis 4) mit Ausgleichsverstärkung → Ausgang geführt wird. Lokale Dateien laufen über dieses Element, solange der
Equalizer an ist; Stream-URLs nutzen immer das einfache Element, weil Medien ohne CORS-Header über Web Audio stumm würden.
`useElement()` tauscht die Elemente (mit Lautstärke, Geschwindigkeit und Position). Die A–B-Wiederholung prüft die Position in
jedem Animationsframe; Bildschritte gehen um 1/30 s; Schnappschüsse zeichnen das Video in eine Canvas. Fortsetzungspositionen
(Dateien ab zwei Minuten, Name und Größe als Schlüssel) liegen in `localStorage` (`suite.mediaplayer.resume`, 200 Einträge).

Tests: `tests/apps/test_mediaplayer.py` mit WAV-Dateien aus `tests/helpers/media_samples.py` (RIFF-INFO- und ID3-Tags, Cover) und einem
mit ffmpeg erzeugten WebM-Video (ohne ffmpeg übersprungen): Tags, Dauer, Wiedergabe, automatisches Weiterschalten,
Wiederholungsarten, Tastatur, Einstellungen, Import (M3U, PLS, XSPF) und Export von Wiedergabelisten, fehlende Einträge, Untertitel,
Video, nicht abspielbare Dateien, Zufallswiedergabe, Umsortieren, Filter, URLs, Equalizer (Elementwechsel während der Wiedergabe,
Filterwerte, Einstellungen), A–B-Wiederholung, Fortsetzungsposition, Albenansicht, Bildschritte und Schnappschussgröße, deutsche
Oberfläche, Smartphone-Layout.

### Bildbearbeitung (`apps/imageeditor`)

ES-Module: `doc.js` (Dokumentmodell und Dateiformate, importiert fflate), `tools.js`, `filters.js`, `guides.js` (Lineale, Einrasten), `main.js` (Oberfläche).

- **Retusche** (`tools.js`): Kopierstempel, Reparaturpinsel und Weichzeichnen/Schärfen malen weiche runde Tupfer (eine zwischengespeicherte
  radiale Alpha-Maske, alle Größe/4 Pixel entlang des Strichs) aus einem Quellbild in die Strich-Canvas: die Ebenenkopie am Versatz der Quelle
  bzw. eine weichgezeichnete (`ctx.filter = blur()`) oder unscharf maskierte Kopie (`x + (x − blur(x))`). Der Reparaturpinsel ersetzt am Ende
  des Strichs die Kopie innerhalb des bemalten Bereichs durch `Kopie + blur(Ebene) − blur(Kopie)` (`healArea`): die Struktur kommt von der
  Quelle, die tiefen Frequenzen (Farbe, Helligkeit) vom Ziel. Der Wischfinger arbeitet auf einer Kopie der Ebene, die Tupfer für Tupfer
  aktualisiert wird: jeder Tupfer kopiert die Pixel der vorigen Position mit der Deckkraft als Stärke.

- **Dokument**: Jede Ebene ist ein Canvas in Bildgröße mit `visible`, `opacity` und `blend` (Canvas-Composite-Operationen); beim
  Zusammensetzen werden die Ebenen der Reihe nach gezeichnet. Die Auswahl ist ein Rechteck oder eine Ellipse und dient als Clip-Pfad;
  `selectionMask()` liefert eine Alphamaske für Pixeloperationen (Füllen, Faltung, Tonwerte).
- **Verlauf**: Vor einer Änderung wird der betroffene Zustand festgehalten (`layer`: Kopie einer Ebene, `props`: Ebeneneigenschaften,
  beim Ziehen eines Reglers zusammengefasst, `doc`: alle Ebenen und die Größe). Rückgängig legt den aktuellen Zustand in den
  Wiederholen-Stapel und stellt die Momentaufnahme wieder her. Der Verlauf ist auf 50 Schritte und 512 MiB begrenzt.
- **Ansicht**: ein Canvas (außerhalb von Preact) in Bühnengröße in Gerätepixeln; Zoom und Verschieben sind eine Transformation. Beim
  Malen wird in ein Strich-Canvas gezeichnet, das mit der Ebenenkopie zu `ed.preview` zusammengesetzt wird (gleichmäßige Deckkraft
  innerhalb eines Strichs, Radierer als `destination-out`, auf die Auswahl beschnitten); die Vorschau ersetzt die Ebene beim Zeichnen
  und wird am Ende zur Ebene. Zusammengefasste Zeigerereignisse und Stiftdruck werden genutzt; zwei Touch-Zeiger schalten auf
  Pinch-Zoom.
- **Lineale, Hilfslinien, Raster**: Die Bühne ist ein Raster aus zwei Lineal-Canvas und dem Canvas-Bereich (außerhalb von Preact).
  Hilfslinien (`ed.guides`, `{ axis: 'h' | 'v', pos }`) liegen auf Pixelgrenzen; das Ziehen aus einem Lineal nutzt Pointer-Capture am
  Lineal. `guides.js` `snapPoint` rastet an Hilfslinien, Bildrändern und den nächsten Rasterlinien innerhalb von
  `snapDistance / zoom` ein; Werkzeuge mit `snaps: true` erhalten eingerastete Koordinaten (markiert mit `snappedX/Y`), die die
  Auswahlwerkzeuge als Pixelgrenzen behandeln, statt das Pixel unter dem Zeiger einzuschließen. Das Verschiebewerkzeug rastet die Kanten
  der verschobenen Auswahl ein (`snapRect`). Die Einstellungen liegen im `localStorage` (`suite.imageeditor.view`).
- **Filter**: CSS-Filter über `ctx.filter` (Live-Vorschau, solange der Dialog offen ist), 3×3-Faltung und Tonwertkorrektur auf `ImageData`.
  Auswahlen sind `rect`, `ellipse`, `poly` (Lasso; Punkte relativ zu x/y) oder `mask` (Zauberstab und jede kombinierte Auswahl:
  Pixelläufe `[dx, dy, Länge, …]` relativ zu x/y); Verschieben ändert also nur x und y, und `selectionPath` kann mit allen
  beschneiden. Kombinieren (hinzufügen, abziehen, Schnittmenge, umkehren) arbeitet auf `selectionMask()` und wandelt das Ergebnis
  wieder in Läufe um (`maskSelection`); die Ameisenlinie einer Maske folgt ihrem Pixelrand (`selectionOutline`, je Auswahl
  zwischengespeichert). Der Zauberstab nutzt die Bereichssuche des Füllwerkzeugs (`regionMask`).
  Tonwerte und Gradationskurven erzeugen Nachschlagetabellen mit 256 Einträgen (Tonwerte: `outBlack + (outWhite − outBlack) · x^(1/γ)`;
  Kurven: monotone kubische Hermite-Interpolation nach Fritsch–Carlson, die Kurve schießt also nie über); zuerst wirkt die RGB-Tabelle,
  dann die des Kanals (`channelLuts`). Die Vorschau ist die Ebene mit angewendeten Tabellen, gezeigt über `ed.preview` und einmal je
  Bild neu berechnet; diese Dialoge (und die Korrekturen) dunkeln das Bild nicht ab.
- **Dateien**: Dekodieren über `<img>`/Blob-URL; Kodieren mit `canvas.toBlob` (PNG, JPEG, WebP), einem eigenen 24-Bit-BMP-Schreiber und
  OpenRaster (`mimetype` unkomprimiert zuerst, `stack.xml` oberste Ebene zuerst, `data/*.png`, `mergedimage.png`, Vorschaubild). PSD mit
  ag-psd (`vendor/esm/psd`, MIT, mit pako; beim ersten Gebrauch importiert): Ebenen werden von unten nach oben mit ihrem Versatz gelesen,
  Gruppen aufgelöst (Ausblenden/Deckkraft vererbt), Ebenenmasken in den Alphakanal multipliziert (`defaultColor` außerhalb des
  Maskenrechtecks); die Namen der Ebenenmodi werden auf Composite-Operationen abgebildet (`color dodge` ↔ `color-dodge`, `linear dodge` ↔
  `lighter`). Beim Schreiben wird jede Ebene bei 0/0 gespeichert, dazu das Gesamtbild und ein Vorschaubild.
- **Zwischenablage**: `navigator.clipboard.write/read` mit PNG, wo verfügbar, `paste`-Ereignisse mit Bilddateien und eine interne
  Zwischenablage als Rückfall.

Tests: `tests/apps/test_imageeditor.py` erstellt Bilder mit Pillow und prüft Pixel des zusammengesetzten Bildes und der gespeicherten
Dateien: Pinsel, Stift, Rückgängig/Wiederholen, Pipette, Füllen, Formen, Auswahl, Kopieren/Einfügen, Verschieben, Zuschneiden, Ebenen mit
Deckkraft und Modi, OpenRaster hin und zurück, PSD aus psd-tools und zurück, Spiegeln, Drehen, Bild- und Leinwandgröße, Korrekturen mit Vorschau, Filter,
Tonwerte (Vorschau, Abbrechen, je Kanal, Rückgängig) und Gradationskurven (Punkt durch Ziehen hinzugefügt, monotones Ergebnis),
Zauberstab mit Umschalt/Alt, Umkehren, Schnittmenge, Lasso und Polygon-Lasso,
JPEG/WebP/BMP/PNG, Öffnen von GIF, Text, Verlauf, Zoom, deutsche Oberfläche, Smartphone-Layout. Firefox meldet ganzzahlige
Mauskoordinaten, daher zielen die Tests auf ganzzahlige Seitenkoordinaten innerhalb eines Pixels.

### Diagrammeditor (`apps/diagram`)

ES-Module: `model.js` (Formen, Geometrie, Linienführung, Textumbruch, Verlauf), `drawio.js` (Dateiformate, verwendet fflate), `main.js`
(Oberfläche).

- **Modell**: Ein Dokument hat Seiten mit Formen (`type`, `x`, `y`, `w`, `h`, `text`, `style`) und Kanten (`from`/`to` = `{ id, ax?, ay? }` für
  ein verbundenes Ende, fest an einem relativen Punkt, wenn `ax`/`ay` gesetzt sind, sonst frei gleitend; `{ x, y }` für ein freies Ende;
  `route`; `style`). Gleitende Enden treffen den Umriss (Polygon) auf der Linie zum anderen Ende; gewinkelte Kanten verlassen die Form an der
  dem anderen Ende zugewandten Seite und erhalten einen oder zwei Knicke; gebogene Kanten sind kubische Bézierkurven entlang der
  Austrittsrichtungen. Pfeilspitzen sind Pfade (keine Marker), damit Exporte überall gleich aussehen.
- **Formenbibliotheken** (`model.js` `LIBRARIES`, `PRESETS`): jede Bibliotheksform ist ein eigener Typ mit SVG-Pfad (`shapePath`) und
  draw.io-Stil (`drawio.js` `TYPE_STYLE`): eingebaute draw.io-Formen, wo es sie gibt (`folder`, `component`, `doubleEllipse`, `swimlane`,
  `mxgraph.networks.*`-Schablonen), sonst eine eingebaute Form plus der Schlüssel `dgType` (draw.io behält unbekannte Schlüssel), z. B. das
  Gateway als `rhombus`. Klassen und Entitäten sind eine Zelle mit HTML-Beschriftung (fetter Titel, `<hr>`, Zeilen; `--`-Zeilen werden weitere
  `<hr>`), wie die Klassenform von draw.io. Krähenfuß- und hohle Pfeilspitzen werden auf `ERmandOne`… bzw. `block`/`diamond` mit `endFill=0`
  abgebildet; hohle Spitzen sind weiß gefüllt, damit die Linie nicht durchscheint.
- **Darstellung**: Preact zeichnet SVG; dieselbe Komponente `PageContent` zeichnet für den SVG-Export in ein losgelöstes Element. Text wird mit
  `measureText` umbrochen und als `<tspan>`-Zeilen gezeichnet (kein `foreignObject`, das das Canvas des PNG-Exports sperren würde).
- **Gruppen und Drehung** (`model.js`): `page.groups` = `[{ id, name, parent }]`; `group` eines Objekts ist seine innerste Gruppe,
  `parent` verschachtelt Gruppen. `groupsOf()` legt Einträge für Gruppen-IDs ohne Eintrag an (ältere Dokumente) und entfernt Gruppen ohne
  Mitglieder; `ancestors()` und `groupMembers()` durchlaufen die Hierarchie. Ein Klick wählt alle Mitglieder der äußersten Gruppe
  (`withGroups`), Alt+Klick ein Objekt. `group()` sucht die gemeinsame umgebende Gruppe der Auswahl und legt darin eine neue Gruppe an,
  deren Kinder die gewählten Untergruppen (bzw. die Untergruppen gewählter Mitglieder) und einzelnen Objekte sind; `ungroup()` löst die
  äußersten vollständig gewählten Gruppen auf (Kinder kommen in die umgebende Gruppe). Formen haben `rotation` (Grad, im Uhrzeigersinn um
  die Mitte): gezeichnet als `rotate(r, w/2, h/2)`; `shapePoint()` (Anschlusspunkte, feste Anker), das Umriss-Polygon (freie Enden),
  `containsPoint()` (Treffertest) und `shapeBounds()` (Rahmenauswahl, Seitengrenzen, Gruppenrahmen) berücksichtigen sie; die
  Austrittsrichtung eines festen Ankers wird gedreht und für den rechtwinkligen Router auf die nächste Achse gerundet. Auswahlrahmen und
  Griffe werden im Koordinatensystem der Form gezeichnet; die Größenänderung einer gedrehten Form rechnet in lokalen Koordinaten und lässt
  die gegenüberliegende Seite stehen; der Drehgriff dreht eine Form um ihre Mitte oder mehrere um die Mitte ihres Rahmens (Positionen,
  Winkel und freie Kantenenden), Umschalt in 15°-Schritten, 0/90/180/270 ziehen an.
- **Elementbaum** (`Elemente` in der linken Seitenleiste): `elementTree()` baut Ebenen-Knoten (oberste zuerst) mit den Gruppen und
  Objekten in Zeichenreihenfolge (eine Gruppe nach ihrem obersten Mitglied); Zeilen sind `role="treeitem"` mit `aria-level`/
  `aria-expanded`/`aria-selected` und wanderndem `tabindex`; `selectItems()` überträgt Zeilen in die Auswahl (eine Gruppe oder Ebene =
  ihr Inhalt). `TreeLabelEditor` ändert die Beschriftung einer Zeile direkt (ein Eingabefeld, bei mehrzeiligen Texten ein Textbereich);
  `setLabel()` schreibt `text` des Objekts, `group.name` oder den Ebenennamen als einen Rückgängig-Schritt.
- **Bedienung**: ein Zeiger-Handler am SVG mit Pointer Capture (Doppelklicks werden mit `elementsFromPoint` getroffen), Ziehmodi für
  Verschieben, Größe, Rahmenauswahl, Verbinden und Neuverbinden der Enden, Einrasten am Raster, Zweifinger-Zoom. Die Anschlusspunkte werden
  unter den Endgriffen einer ausgewählten Kante gezeichnet (ein verbundenes Ende liegt auf einem Anschlusspunkt).
- **draw.io**: `<mxfile>` mit einem `<diagram>` pro Seite; komprimierte Diagramme (Base64, Raw-Deflate, URI-Kodierung) werden gelesen.
  Ebenenzellen (Kinder der Wurzel) werden zu `page.layers` (`visible="0"`, `locked=1`); eine Form oder Kante erhält die ID ihrer Ebene und
  ihres innersten `group`-Vorfahren, jede `group`-Zelle wird ein Eintrag in `page.groups` (ihre Beschriftung als Name, die umgebende
  `group`-Zelle als `parent`; absolute Geometrie: die Geometrie von Kindern ist relativ zum Elternteil); `locked=1` setzt `locked`,
  `rotation=…` die Drehung. Beim Schreiben entstehen die Ebenenzellen und je Gruppe eine benannte `group`-Zelle, verschachtelt wie die
  Gruppen (umschließendes Rechteck der Mitglieder, Zellen relativ zu ihrer Gruppe). Die Modellfunktionen `layersOf`, `layerOf`, `isShown`, `isSelectable` und `inLayerOrder` bestimmen Zeichenreihenfolge, Sichtbarkeit
  und was Klicks, der Auswahlrahmen und `Strg+A` auswählen dürfen; neue Objekte erhalten in `changed()` die aktive Ebene, eingefügte Gruppen
  neue IDs. `UserObject`-Beschriftungen, HTML-Beschriftungen (in
  Text umgewandelt), Kantenbeschriftungen als eigene Zellen, `exitX/entryX`-Anker und die üblichen Formstile werden abgebildet.
  Stilschlüssel, die der Editor nicht verwendet, landen in `extra` und werden zurückgeschrieben. Die Zwischenablage enthält ein
  `<mxGraphModel>` wie bei draw.io. SVG-Exporte tragen die Datei im Attribut `content`, PNG-Exporte in einem `tEXt`-Block `mxfile`.
- **Excalidraw**: Rechtecke, Ellipsen, Rauten, Text (auch in Containern), Pfeile/Linien mit Bindungen, Bilder aus `files`; `angle`
  (Bogenmaß) wird zur Drehung, `groupIds` (innerste zuerst) zu verschachtelten Gruppen.
- **Verlauf**: `structuredClone`-Momentaufnahmen des Dokuments (100 Schritte), zusammengefasst bei schnellen Eigenschaftsänderungen und
  beim Verschieben mit Pfeiltasten.
- **Automatisch anordnen** (`js/layout.js`): ein kleines Ebenen-Layout wie Graphviz `dot`: Zyklen werden durch Umdrehen von
  Rückwärtskanten aufgelöst (Tiefensuche), Ebenen nach längstem Pfad, acht Baryzentrum-Durchläufe gegen Kreuzungen, Ebenen als Zeilen
  oder Spalten mit zentrierten Knoten; unverbundene Formen kommen in eine Reihe nach dem Graphen. Kanten gegen die Richtung erhalten
  seitliche Anker, damit die rechtwinklige Linienführung sie herumführt.
- **Mermaid** (`js/mermaid.js`): ein zeilenweiser Parser für Flussdiagramme (Knotenformen, Verbindungsarten, Beschriftungen, Ketten,
  `&`); unbekannte Anweisungen werden übersprungen. Die Formen erhalten ihre Größe aus der Beschriftung und werden mit dem Layout
  platziert; `.mmd`/`.mermaid`-Dateien öffnen sich als Diagramme.
- **Drucken**: `printDiagram()` legt den SVG-Export jeder nicht leeren Seite in `#dg-print` (je ein Blatt mit Titel); das
  Druck-Stylesheet zeigt nur diesen Container und skaliert jedes SVG auf die Blattbreite; nach `afterprint` wird er entfernt.

Tests: `tests/apps/test_diagram.py` mit vom Test geschriebenen draw.io-Dateien (komprimierte Seite, Gruppe, HTML-Beschriftung,
Austrittsanker, unbekannter Stilschlüssel) und einer Excalidraw-Datei: Zeichnen, Verbinden über Anschlusspunkte, Beschriftungen,
Speichern (mit ElementTree geprüft), Seiten, Stile, Rückgängig/Wiederholen, Ausrichten, Verteilen, Formtyp, Reihenfolge, Verschieben mit
Einrasten, Größe, Pfeiltasten, Löschen mit Kanten, Kopieren/Einfügen/Duplizieren, Linienführung, Pfeile, Lösen von Enden, SVG/PNG-Export und
erneutes Öffnen, deutsche Oberfläche, Smartphone-Layout, Drucken (leeres Diagramm, ein Blatt je Seite, Druckmedium), Mermaid-Parser (Formen, Verbindungen, Beschriftungen, übersprungene
Anweisungen), Import mit Anordnung von links nach rechts ohne Überlappung, automatisches Anordnen mit Rückgängig, `.mmd`-Dateien,
nicht unterstützte Diagrammarten.

### Kalender (`apps/calendar`)

Eine Anwendung mit klassischen Skripten auf Basis von `shared/js/ical.js`:

- **Zeiten** sind Wandzeiten mit Zone (`{ y, m, d, hh, mm, ss, date, tz }`, `tz` = `floating`, `UTC` oder eine TZID). `toInstant` löst TZIDs mit
  `Intl.DateTimeFormat` auf (IANA-Kennungen, Windows-Namen aus einer Tabelle, `/mozilla.org/…/Region/Stadt`); unbekannte Zonen fallen auf
  Ortszeit zurück. Die Ansichten arbeiten mit Zeitpunkten in der Zone des Browsers; beim Bearbeiten behält ein Termin seine Zone. Neue Termine
  erhalten die IANA-Zone des Browsers und eine aus den Offset-Wechseln des laufenden Jahres erzeugte `VTIMEZONE` (jährliche `RRULE` mit `BYDAY=nXX`).
- **Wiederholung** (`expand`): Perioden der Regel (Tag, Woche ab `WKST`, Monat, Jahr) liefern Kandidatentage (`BYDAY` mit Ordinalzahlen,
  `BYMONTHDAY` auch negativ, `BYMONTH`, `BYSETPOS`); `COUNT`, `UNTIL`, `EXDATE` und Ausnahmen (`RECURRENCE-ID`) werden angewendet. Wandzeiten werden
  numerisch verglichen und nur Termine nahe dem Bereich in Zeitpunkte umgerechnet, damit lange Serien schnell bleiben.
- **Hin und zurück**: Ein Termin behält seine ursprüngliche Komponente; beim Schreiben werden die verwalteten Eigenschaften (UID, DTSTAMP,
  DTSTART/DTEND, SUMMARY, LOCATION, DESCRIPTION, RRULE, EXDATE, RECURRENCE-ID, CATEGORIES, STATUS, SEQUENCE, LAST-MODIFIED) neu erzeugt und alle
  anderen (ATTENDEE, VALARM, X-Eigenschaften) übernommen. VTODO/VJOURNAL und vorhandene VTIMEZONEs bleiben erhalten.
- **Serien bearbeiten**: „Nur diesen“ schreibt ein Ausnahme-VEVENT (gleiche UID, RECURRENCE-ID = ursprünglicher Beginn) oder ein EXDATE; „Alle“
  ändert den Haupttermin (Verschiebung um denselben Versatz wie beim bearbeiteten Termin). SEQUENCE wird erhöht.
- **Ansichten**: Monatsraster, Zeitraster mit Überlappungslayout (Spalten je Gruppe), Liste; Anlegen/Verschieben/Größe per Zeiger mit
  15-Minuten-Raster, HTML5-Drag-&-Drop in der Monatsansicht.
- **Frei/Belegt** (`ical.js`): ein Termin belegt Zeit, außer er ist `CANCELLED` oder `TRANSP:TRANSPARENT`; ganztägige Termine nur mit
  ausdrücklichem `TRANSP:OPAQUE` (`TRANSP` wird gelesen, aber nicht verwaltet, also mit der Komponente zurückgeschrieben).
  `STATUS:TENTATIVE` ergibt `BUSY-TENTATIVE`. `mergeBusy` fasst Zeiträume je Typ zusammen, `freeSlots` geht die Tage des Bereichs
  innerhalb der Arbeitszeit durch (Ortszeit, wahlweise ohne Wochenenden) und liefert die Lücken von mindestens der Dauer,
  `freeBusyPeriods` liest `FREEBUSY`-Werte von `VFREEBUSY`-Komponenten (Beginn/Ende oder Beginn/Dauer, `FBTYPE=FREE` übersprungen) und
  `freeBusyText` schreibt einen Kalender mit `METHOD:PUBLISH` und einer `VFREEBUSY` in UTC. Die importierten Zeiträume werden je
  Kalenderkomponente zwischengespeichert (`WeakMap`), sodass Rückgängig, das die Komponente ersetzt, sie neu berechnet.
- **Drucken**: `printView()` setzt `body.cal-printing` und eine `@page`-Regel (A4 quer für Monat und Woche); das Druck-Stylesheet
  blendet Rahmen, Seitenleiste und Dialoge aus, zeigt eine Überschrift und skaliert das Zeitraster mit `zoom`, damit 24 Stunden auf
  ein Blatt passen.
- **Erinnerungen**: der erste VALARM mit relativem Auslöser (RELATED=START) ist die `reminder` des Termins (Minuten vor Beginn); beim Speichern
  wird nur dieser Alarm ersetzt (`-PnDTnHnM`, ACTION:DISPLAY), die übrigen bleiben. Alle 30 s prüft `checkReminders()` die Termine der nächsten
  8 Tage und zeigt fällige einmal je Sitzung an (Notification API, wenn eingeschaltet und erlaubt, sonst das Banner des Rahmens).

Tests: `tests/shared/test_ical.py` vergleicht das Auflösen von Wiederholungen mit `dateutil.rrule` (zehn Regeln über einen Sommerzeitwechsel) und
prüft Lesen, Falten, Zeitzonen, `VTIMEZONE`, EXDATE/Ausnahmen und geschriebene Termine mit `icalendar`. `tests/apps/test_calendar.py` lässt die
Anwendung in `Europe/Vienna` mit fester Uhr laufen: Ansichten, Suche, Anlegen durch Ziehen, Ändern eines oder aller Termine einer Serie, Löschen
von Terminen und Serien, Verschieben und Größe ändern, Drag & Drop im Monat, ganztägige Termine, Wiederholungsregeln aus dem Dialog,
Sichtbarkeit, Import nach UID, Umbenennen, deutsche Oberfläche, Smartphone-Layout, Erinnerungen (aus VALARM gelesen, einmal fällig,
geschrieben und entfernt), Drucken (Seitengröße, Druck-Stylesheet).

### Datenbankwerkzeug (`apps/dbtool`)

ES-Module `drivers.js` und `main.js`; CodeMirror mit `@codemirror/lang-sql` (Dialekt und Schema für die Vervollständigung werden je Sitzung
neu eingestellt).

- **SQLite**: sql.js (`vendor/sql-wasm.js`, global `initSqlJs`); die WASM-Datei ist eingebettet (`data-src`, gzip + Base64) und wird als
  `wasmBinary` übergeben, die CSP erlaubt `'wasm-unsafe-eval'`. Anweisungen laufen einzeln mit `iterateStatements`, sodass jede ihr eigenes
  Ergebnis oder ihre Änderungszahl hat. Beim Speichern wird die Datenbank exportiert (`db.export()`).
- **Postgres**: eigener Client für Protokollversion 3 über eine TCP-Verbindung des Relays: SSLRequest und `startTls` im Relay,
  Startnachricht, Klartext-, MD5- (eigene MD5-Implementierung; WebCrypto hat keine) und SCRAM-SHA-256-Anmeldung (PBKDF2/HMAC aus WebCrypto,
  Serversignatur geprüft), einfaches Abfrageprotokoll (RowDescription, DataRow, CommandComplete, ErrorResponse mit allen Feldern,
  NoticeResponse); Abfragen werden nacheinander ausgeführt. Numerische Typ-OIDs werden zu Zahlen außer `int8`/`numeric` (bleiben Text, um
  Genauigkeitsverluste zu vermeiden). Das Schema kommt aus `information_schema` (Tabellen, Sichten, Spalten, Primärschlüssel).
- **Bearbeiten**: Beim Anzeigen werden die Schlüsselspalten (Primärschlüssel oder `rowid` bei SQLite) mit abgefragt und ausgeblendet, wenn sie
  keine Tabellenspalten sind; Zelländerungen, Einfügen und Löschen sind einzelne Anweisungen mit `WHERE` auf den Schlüssel.
- **Aufteilen in Anweisungen** für „an der Schreibmarke ausführen“ beachtet Anführungszeichen, Bezeichner, Kommentare und Postgres-Dollar-Quoting.
- **Verbindungen** werden über `Suite.appdata` gespeichert (Felder: name, host, port, database, username, password, ssl, insecure, url).
- **ER-Diagramm** (`js/er.js`): Fremdschlüssel aus `PRAGMA foreign_key_list` (SQLite) bzw. `information_schema` (Postgres, leer, wenn die
  Sichten nicht lesbar sind); je Tabelle ein draw.io-Knoten (Beschriftung mit den Spalten), je Fremdschlüssel eine Kante, platziert mit dem
  Ebenen-Layout des Diagrammeditors (`apps/diagram/src/js/layout.js`, über die Import-Map geteilt); das XML geht mit `Suite.bridge.openIn` an
  den Diagrammeditor.
- **Verlauf**: vom Benutzer ausgeführte Anweisungen (nicht Anzeigen oder Erklären) liegen in `localStorage` (`suite.dbtool.history`,
  200 Einträge, neueste zuerst, Doppelte nach oben verschoben, mit Datenbankname, Zeit und Erfolg). **Erklären** stellt der aktuellen
  Anweisung `EXPLAIN QUERY PLAN` (SQLite; die Zeilen `id`/`parent`/`detail` werden zu einem eingerückten Baum) bzw. `EXPLAIN` (Postgres) voran.

Tests: `tests/apps/test_dbtool.py` – SQLite-Dateien aus Pythons `sqlite3` (Schema, mehrere Ergebnisse, Ausführen an der Schreibmarke, Fehler,
Anlegen, Anzeigen, Bearbeiten, Einfügen, Löschen, rowid-Tabellen, CSV/JSON-Export, Speichern mit `sqlite3` geprüft); Postgres über beide Relays
gegen `tests/helpers/pg_fake.py`, einen kleinen Protokollserver auf SQLite-Basis (SCRAM-, MD5- und Klartext-Anmeldung, falsches Passwort, SSL
mit der Test-CA, Anzeigen und Bearbeiten), gespeicherte Verbindungen in KeePass (mit pykeepass geprüft und erneut geöffnet) und JSON (ohne Passwort),
Abfrageverlauf (fehlgeschlagene Einträge, Anzeigen ausgenommen, Neuladen, Löschen), der SQLite-Abfrageplan und das im Diagrammeditor
geöffnete ER-Diagramm (Tabellen, Sicht, Schlüsselmarken, Beziehungen, Ebenen).

### SSH-Client (`apps/ssh`)

xterm.js-Terminals (ES-Module aus `vendor/esm/xterm`, ein `Terminal` mit `FitAddon` pro Reiter, außerhalb von Preact angelegt und in den Container
des aktiven Reiters verschoben) auf der SSH-Engine (`shared/js/ssh.js`, Go `x/crypto/ssh` und `pkg/sftp` als WebAssembly, Transport =
TCP-Verbindung des Relays). `client.shell()` fordert ein PTY an (`xterm-256color`) und leitet Terminaleingaben (`term.onData`) und
Größenänderungen weiter; die Touch-Tastenleiste sendet Escape-Sequenzen und macht aus der nächsten Taste ein Steuerzeichen. Der SFTP-Bereich
verwendet `client.sftp()` (`realpath`, `list`, `readFile`, `writeFile`, `mkdir`, `rename`, `remove`, `rmdir`). Host-Schlüssel: Die Engine ruft den
`hostKey`-Callback mit Typ, SHA-256-Fingerabdruck und Schlüssel auf; die Anwendung vergleicht ihn mit dem Feld `hostKey` der gespeicherten
Verbindung und fragt sonst nach (einmal akzeptieren, akzeptieren und speichern, ablehnen; ein geänderter Schlüssel zeigt eine Warnung).
Verbindungen werden mit `Suite.appdata` gespeichert (Felder: name, host, port, username, auth, password, privateKey, passphrase, hostKey, url).
Schlüsselpaare erzeugt die Engine (`engine.generateKey(type, comment, passphrase)`: `crypto/ed25519`, `ecdsa` P-256 oder `rsa` 4096,
`ssh.MarshalPrivateKey(WithPassphrase)` im OpenSSH-Format, `MarshalAuthorizedKey`, `FingerprintSHA256`; Engine 0.2.0). Sitzungsprotokolle sammeln
während der Aufzeichnung die dekodierte Ausgabe und entfernen beim Speichern die Escape-Sequenzen.

Tests: `tests/apps/test_ssh_client.py` gegen einen lokalen OpenSSH-Server (`tests/helpers/ssh_fixtures.py`, Schlüsselanmeldung) über beide Relays:
Terminal-Ein- und -Ausgabe (aus dem xterm-Puffer gelesen), Sitzungsende und Neu-verbinden-Schaltfläche, abgelehnter Host-Schlüssel,
passphrasegeschützter Schlüssel, SFTP-Liste/Download/Upload/Ordner anlegen/Umbenennen/Löschen/Navigation, gespeicherte Verbindung mit
Host-Schlüssel in KeePass (mit pykeepass geprüft), Warnung bei geändertem Host-Schlüssel, deutsche Oberfläche, Smartphone-Layout mit Tastenleiste,
Schlüsselerzeugung (mit `ssh-keygen -y` und `-l` geprüft, dann autorisiert und zur Anmeldung verwendet), Sitzungsprotokoll ohne Escape-Codes,
Terminalausgabe, bekannte Host-Schlüssel gelistet und vergessen.

### FTP/SFTP-Client (`apps/ftp`)

`js/remote.js` bietet eine Schnittstelle (`home`, `list`, `read`/`write` mit Fortschritt und `offset`, `size`, `setTime`, `mkdir`, `rmdir`,
`remove`, `rename`, `close`) für:

- **FTP** – eigener Client über Relay-Verbindungen: Antworten mit mehrzeiliger Verarbeitung, explizites FTPS (`AUTH TLS` + `startTls` im Relay),
  implizites FTPS (TLS-Verbindung), `PBSZ 0`/`PROT P`, `TYPE I`, `FEAT`/`MLSD` mit Rückfall auf `LIST` (Unix- und Windows-Format), passiver Modus
  mit `EPSV` und Rückfall auf `PASV`. Datenverbindungen sind eigene Relay-Verbindungen zum Host der Steuerverbindung (Adressen in
  PASV-Antworten werden ignoriert, sie sind oft privat); bei FTPS sind es TLS-Verbindungen. Uploads enden mit dem Schließen der
  Datenverbindung. Befehle werden nacheinander ausgeführt. Server, die die Wiederverwendung der TLS-Sitzung auf der Datenverbindung verlangen
  (z. B. vsftpd `require_ssl_reuse=YES`), werden nicht unterstützt, weil das Relay jede TLS-Verbindung unabhängig aufbaut.
- **SFTP** – die SSH-Engine (`client.sftp()`), Host-Schlüssel werden bestätigt und mit dem Server gespeichert. Dateien werden in Stücken zu
  1 MiB gelesen und geschrieben (`readAt`/`writeAt`, Engine 0.3.0), was Fortschritt liefert und Fortsetzen ermöglicht; `chtimes` setzt die
  Änderungszeit.

Die lokale Seite verwendet `showDirectoryPicker()` (Verzeichnis-Handles; rekursives Hoch- und Herunterladen von Ordnern); ohne diese Schnittstelle
kommen Dateien aus der Dateiauswahl und Downloads laufen über `Suite.files.download`. Übertragungen laufen nacheinander aus einer Warteschlange
mit Fortschritt.

- **Fortsetzen**: Ein fehlgeschlagenes Lesen trägt `error.partial` (FTP: die Stücke der Datenverbindung vor dem Fehler; SFTP: die gelesenen
  Stücke). Download-Aufträge behalten es in `job.partial`, der nächste Lauf liest ab diesem Versatz (FTP `REST n` vor `RETR`) und hängt an.
  Upload-Wiederholungen fragen `size()` (FTP `SIZE`, SFTP `stat`) und senden den Rest (FTP `APPE`, SFTP `writeAt` ab dem Versatz). Eine kleinere
  Datei gleichen Namens auf der anderen Seite bietet vor dem Start das Fortsetzen an.
- **Synchronisieren**: `localTree`/`remoteTree` sammeln die Dateien unter beiden Ordnern (je höchstens 5000) als relative Pfade;
  `compareEntry(local, remote, { mode, useTimes })` liefert den Status (gleiche Größe = gleich, außer Zeiten werden verglichen, mit 2 Minuten
  Toleranz wegen der Minutengenauigkeit von `LIST`) und die vorgeschlagene Aktion für die Richtung. Die Ausführung legt fehlende Ordner an
  (lokal `getDirectoryHandle(…, { create })`, auf dem Server `MKD`) und stellt normale Aufträge ein; Uploads setzen die Serverzeit auf das
  lokale `lastModified` (`MFMT` / `chtimes`).

Tests: `tests/apps/test_ftp.py` gegen pyftpdlib (ohne TLS, explizites und implizites TLS mit der Test-CA; jeder Server erhält eigene IOLoop,
Sperre und Stop-Ereignis, weil pyftpdlib diese zwischen Instanzen teilt) und die OpenSSH-Fixture: Blättern, Download, Upload (300 kB), Ordner
anlegen, Umbenennen, rekursives Löschen, Navigation, FTPS, falsches Passwort, SFTP, LIST/MLSD-Auswertung, lokale Ordner über einen OPFS-Stub (mit
eigenem Relay, das den HTTP-Test-Origin akzeptiert), gespeicherter Server, deutsche Oberfläche, Smartphone-Layout.

### HTTP-Analyse (`apps/http`)

ES-Module `model.js` (Anfragemodell, Variablen, Body-Kodierung, cURL, Postman v2.1) und `main.js` (Oberfläche, CodeMirror für Anfrage- und
Antwort-Body).

- **Senden**: `build()` löst `{{Variablen}}` auf (Umgebung vor Sammlungsvariablen), ergänzt Basic-/Bearer-Anmeldung und kodiert den Body (roh mit
  Content-Type je Sprache, URL-kodiert mit `+` für Leerzeichen, Multipart mit eigener Boundary, Datei). Über das Relay wird `Suite.relay.http()`
  verwendet (alle Header in beide Richtungen, optional Weiterleitungen folgen und nicht vertrauenswürdige Zertifikate); direkt `fetch` mit
  `credentials: 'omit'` (ein Fehler wird als mögliche CORS-Sperre gemeldet). Die CSP erlaubt `connect-src http: https:` für den direkten Modus.
- **Zeilen** (Parameter, Header, Formularfelder, Variablen): Die leere letzte Zeile legt bei der ersten Eingabe eine Zeile an und merkt sie sich an
  ihrem Tabellenzeilen-Element, sodass schnelles Tippen vor dem nächsten Zeichnen keine zwei Zeilen erzeugt. Query-Parameter werden aus der URL
  abgeleitet und in sie zurückgeschrieben.
- **cURL**: ein Parser für Shell-Wörter (Anführungszeichen, `$'…'`, Zeilenfortsetzung mit Backslash) und die üblichen Optionen (`-X`, `-H`,
  `-d`/`--data-*`, `--json`, `-F`, `-u`, `-G`, `-A`, `-e`, `-b`); der Export setzt jede Option mit ihrem Wert in eine Zeile.
- **Sammlungen** sind Postman-v2.1-JSON (Ordner, Header, Bodies roh/urlencoded/formdata, Basic-/Bearer-Anmeldung, Sammlungsvariablen); Umgebungen
  werden mit `Suite.appdata` gespeichert. Der Verlauf (50 Einträge) liegt nur im Arbeitsspeicher, weil Anfragen Geheimnisse enthalten können.
- **Skripte** (`scripts.js`): Jeder Lauf erzeugt einen `Worker` aus einer `data:`-URL, die die `pm`-Laufzeit und den Code des Benutzers als
  Rumpf einer asynchronen Funktion enthält (kein `eval`; die CSP erhält `worker-src data:`). Ein `data:`-Worker hat einen opaken Ursprung,
  kann also IndexedDB und Speicher der Suite nicht öffnen; er erhält nur Anfrage, Antwort und Variablen und liefert Testergebnisse,
  Konsolenausgaben, geänderte Variablen und die geänderte Anfrage zurück; nach 5 s wird er beendet (Endlosschleifen). Geänderte Umgebungs-
  und Sammlungsvariablen werden zurückgeschrieben; Postman-`event`-Einträge (`prerequest`, `test`) werden importiert und exportiert.
- **WebSocket**: Eine URL mit `ws:`/`wss:` (nach dem Auflösen der Variablen) schaltet Sende-Schaltfläche und Antwortbereich auf einen
  `WebSocket` des Browsers um (`binaryType = 'arraybuffer'`, Unterprotokolle aus dem Header `Sec-WebSocket-Protocol`, höchstens 2000
  Protokolleinträge).
- **OpenAPI** (`openapi.js`, js-yaml aus `vendor/esm/yaml`): Lokale `$ref`s werden mit Schutz vor Zyklen aufgelöst; Beispiele stammen aus
  `example`/`default`/`enum`, `allOf`/`oneOf` sowie Typ und Format; die Sammlung wird als Postman-Sammlung gespeichert.

Tests: `tests/apps/test_http.py` gegen den Echo-Server der Relay-Tests über beide Relays und direkt: Abgleich Parameter/URL, Header,
Basic-Anmeldung, Antwort-Header, JSON-/urlencoded-/Multipart-Bodies mit Umgebungsvariablen, Statusklassen, Weiterleitungen, Verlauf, direkter Modus
mit und ohne CORS-Header, cURL-Import und -Export, Postman hin und zurück (mit Skripten), deutsche Oberfläche, Smartphone-Layout,
Skript vor der Anfrage und Tests (Header und Variablen aus dem Skript, bestandene und fehlgeschlagene Tests, Konsole, zurückgeschriebene
Variablen, Zeitüberschreitung, Syntaxfehler, Abschottung ohne Speicher und DOM), WebSocket gegen `tests/helpers/ws_echo.py`
(Unterprotokoll, Echo, Schließen durch den Server mit Code und Grund, erneutes Verbinden, Trennen), OpenAPI-3-YAML-Import (Tags,
Servervariablen, Pfad-/Query-Parameter, `$ref`-Schemata mit Zyklus, Bearer- und API-Key-Sicherheit).

### Python-Notebook (`apps/notebook`)

Die Anwendung baut auf dem Kernel aus Spike S-9 auf (`shared/js/python-kernel.js`, `python-worker.js`, Pyodide-Bündel aus
`vendor/pyodide/bundle.json`, siehe Entscheidungen D-025 bis D-027): Der Worker wird aus eingebettetem Text als klassisches Skript gestartet, die
Pyodide-Dateien sind mit `data-bundle` eingebettet. Die Kernel-Schnittstelle hat `removeFile` erhalten.

- **Zellen**: Jede Zelle besitzt eine CodeMirror-Ansicht (Python oder Markdown), einmal angelegt und von Preact in das Zellelement eingehängt.
  Ausgaben werden im nbformat-4-Format gehalten (Streams wie bei Jupyter zusammengefasst) und von einer Komponente `Output` gezeichnet; HTML, SVG
  und Markdown laufen durch DOMPurify (keine Skripte, Ereignis-Handler, externe URLs).
- **Dateien**: `.ipynb` wird als nbformat 4.5 gelesen und geschrieben (Zell-IDs bleiben oder werden erzeugt); `.py` mit `# %%`- /
  `# %% [markdown]`-Markierungen (Percent-Format) wird gelesen und exportiert.
- **Konsole**: eine CodeMirror-Eingabe mit Verlauf auf demselben Kernel; die Ausführungszähler werden mit dem Notebook geteilt.
- **Tastatur**: in einer Zelle `Umschalt/Strg/Alt+Eingabe`; Befehlsmodus (Fokus auf dem Zellelement) `Eingabe`, `A`, `B`, `M`, `Y`, Pfeiltasten, `Entf`.
- Ein Neustart beendet den Worker und startet einen neuen; in der Sitzung installierte Wheels werden erneut installiert.
- **Export**: `toHtml()` schreibt aus den Zellen eine eigenständige Seite (CSS eingebettet): Markdown und HTML-/SVG-Ausgaben durch denselben
  DOMPurify-Filter wie am Bildschirm, Bilder als `data:`-URLs, Code maskiert; PDF druckt diese Seite aus einem verborgenen `srcdoc`-Rahmen.
- **Variablen**: `_variables()` im Worker durchläuft den Zell-Namensraum `_ns` (ohne Module, Funktionen, Klassen und `_`-Namen) und liefert
  Name, Typ, Form/Länge, dtype und eine auf 200 Zeichen gekürzte Darstellung als JSON; die Anwendung fragt sie nach jedem Ausführen ab.
  `_table(name)` setzt einen DataFrame/eine Series (andere Objekte über `pandas.DataFrame(...)`) mit `to_html(max_rows=500, max_cols=50)` um,
  angezeigt nach DOMPurify.
- **Widgets**: `shared/js/python-widgets.py` (eingebettet als `#python-widgets`, beim Start nach `/tmp/suite/ipywidgets.py` geschrieben und
  daher erst bei Bedarf importiert) bildet die ipywidgets-8-API ohne traitlets nach: Jedes Widget hat eine Modell-ID (`<Sitzung>-<n>`) und
  ein Zustands-Dict mit den Schlüsselnamen der Jupyter-Modelle (`_options_labels`/`index` bei Auswahlen, `IPY_MODEL_<id>`-Verweise für
  Kinder, `outputs` bei Output). Der Kernel sendet `{op: open|update|close, id, model, state}` über `_post_comm` (Worker-Nachricht `comm`,
  `onComm` von `Suite.python.start`); `_repr_mimebundle_` legt `application/vnd.jupyter.widget-view+json` in Anzeige-Ausgaben.
  `apps/notebook/src/js/widgets.js` hält die Modelle, zeichnet die Bedienelemente (Preact) und sendet Änderungen mit `kernel.widget(id, data)`
  (`{value}`, `{index}`, `{click}`, `{submit}`, `{selected_index}`), eine nach der anderen, wobei je Widget nur der neueste wartende Wert bleibt,
  der sofort angezeigt wird. `_widget_event` im Worker ruft die Beobachter/Callbacks des Widgets auf; Ausgaben gehen an die Anfrage und damit
  an die Zelle, die das Widget erzeugt hat, außer ein `Output` fängt sie ab: `_emit` im Kernel leitet Ausgaben (Anzeigen, Grafiken,
  Ergebnisse) an das innerste `with out:`, und `Output.__enter__` ersetzt `sys.stdout`/`stderr`. `clear_output()` außerhalb eines Output
  sendet `{output_type: "clear_output"}`, das die Seite auf die Zelle anwendet. `interactive` erzeugt Bedienelemente aus Kurzformen (Tupel →
  Schieberegler, Listen/Dicts → Dropdown, bool → Checkbox, str → Text, Zahl v → Schieberegler von −v bis 3v) und führt die Funktion in
  seinem Output erneut aus. Beim Speichern kommt der Zustand der angezeigten Widgets (mit Kindern und verschachtelten Ausgaben) im
  Widget-State-Format von Jupyter nach `metadata.widgets`; Öffnen und Neustart behalten sie als inaktive Modelle. Zusätzlich wird ein kleines
  `IPython.display`-Modul registriert.

Tests: `tests/apps/test_notebook.py` (eine Seite pro Browser): Start ohne Netzwerkzugriffe, Ausführen per Tastatur und Befehlsmodus,
Markdown-Darstellung und Bereinigung, Konsole mit Verlauf, Dateibereich (Hochladen, Aktualisieren nach dem Ausführen, Download, Löschen),
Wheel-Installation, Öffnen und Speichern von `.ipynb` (mit nbformat geprüft), `.py`-Import und -Export, Neustart, deutsche Oberfläche,
Smartphone-Layout, Variablen (Filterung, Typen, Größen, Tabellenansicht, Aktualisierung nach dem Ausführen), HTML-Export mit und ohne Code (bereinigtes Markdown,
maskierter Code, Ausgaben) und Drucken, Widgets (Schieberegler mit observe und Output, interact mit Dropdown, Schaltflächen mit Ausgabe in die
Zelle und mit Fehler, Checkbox, Tab, matplotlib in interact, gespeicherter Zustand inaktiv angezeigt). Der Kernel selbst wird von `tests/prototypes/test_s9_notebook.py` abgedeckt.

### Tabellenkalkulation (`apps/spreadsheet`)

Univer Sheets 1.0 (`vendor/esm/univer-sheets`, Entscheidung D-019) in einem Container, der außerhalb von Preact angelegt und in das Layout eingehängt
wird, mit der Dateikonvertierung aus Spike S-6 (`shared/js/univer-xlsx.js`: ExcelJS für XLSX/XLSM, SheetJS für ODS/XLS/CSV).

Bedingte Formatierung und Datenüberprüfung kommen aus den Presets `@univerjs/preset-sheets-conditional-formatting` und `-data-validation`
(auf die Version 1.0.4 des Kerns festgelegt). Univer hält ihre Regeln in den `resources` der Mappe (`SHEET_CONDITIONAL_FORMATTING_PLUGIN`,
`SHEET_DATA_VALIDATION_PLUGIN`: JSON `{ sheetId: [Regeln] }`); `univer-xlsx.js` bildet sie auf ExcelJS `worksheet.conditionalFormattings` /
`addConditionalFormatting` (cellIs, containsText, expression, timePeriod, top10, aboveAverage, colorScale, dataBar; Differenzformate ↔ Univer
`bg`/`cl`/`bl`/`it`/`ul`/`st`) und auf `dataValidation` der Zellen ab. ExcelJS listet Überprüfungen je Zelle; gleiche Einstellungen werden wieder
zu Spaltenläufen zusammengefasst. Fehlerstile: Univer INFO=0, STOP=1, WARNING=2. ExcelJS schreibt containsText-Regeln ohne das Attribut `text`,
daher entnimmt das Lesen den Text der Formel.

- **Styles**: Die Anwendung lädt `vendor/pico.conditional.min.css`, das nur Elemente innerhalb von `.pico` gestaltet; Kopfzeile, Banner, Hinweise und
  Dialoge der Shell tragen diese Klasse, die Univer-Oberfläche behält ihr eigenes Aussehen. Dialoge mit `.pico` erhalten einen `z-index` über
  eingebetteten Editoren.
- **Geändert-Zustand**: `CommandExecuted`-Ereignisse vom Typ Mutation zählen nur innerhalb von 3 Sekunden nach einer Benutzereingabe (Zeiger, Taste,
  Einfügen, Ausschneiden, Ablegen) im Editor-Container als Änderung und nur, wenn diese Eingabe nach dem letzten Laden kam: Univer erzeugt nach dem
  Anlegen einer Einheit asynchron Einrichtungs-Mutationen. Die Textverarbeitung verwendet dieselbe Regel.
- **Design und Sprache** folgen der Shell: `univerAPI.toggleDarkMode()` und `univerAPI.setLocale()`.
- **Speichern** behält das geöffnete Format (XLSM wird als XLSX gespeichert); CSV und XLS zeigen einen Hinweis, dass Formatierung verloren geht.
- **CSV-Import** (`js/csv.js`, `SSCSV`): Dekodieren (BOM, striktes UTF-8, sonst Windows-1252), Erkennen des Trennzeichens (der Kandidat mit der
  gleichmäßigsten Spaltenzahl über 20 Zeilen), ein Parser nach RFC 4180 (Zeilenumbrüche in Anführungszeichen werden zu `\n`) und Umwandlung der
  Werte; die Zeilen laufen über `Suite.univerXlsx.importRows()` (SheetJS `aoa_to_sheet` → XLSX → ExcelJS → Univer). Datumswerte werden als in UTC
  berechnete Seriennummern mit Format `yyyy-mm-dd` geschrieben, weil SheetJS `Date`-Objekte in der lokalen Zone umrechnen würde. Der CSV-Export gibt
  das Trennzeichen des Imports an SheetJS weiter (`FS`).

- **Bilder** kommen aus `@univerjs/preset-sheets-drawing` (1.0.4); Univer hält sie in der Ressource `SHEET_DRAWING_PLUGIN`
  (`{ sheetId: { data: { id: drawing }, order } }`, eine Zeichnung mit `source`, `column`/`row` + Versatz, `width`/`height`, `sheetTransform`,
  `transform`). `univer-xlsx.js` liest `getImages()` von ExcelJS (Anker: `nativeCol`/`nativeColOff` in EMU, `ext` oder der `br`-Anker für die Größe)
  in ein nicht aufzählbares `data.images`; die App fügt sie nach dem Laden über die Facade ein (Univer berechnet die Platzierung) und leert danach
  den Rückgängig-Verlauf. Der Export schreibt `workbook.addImage({ base64 })` + `addImage(id, { tl, ext, editAs: 'oneCell' })` mit den unveränderten
  Bytes. Bevor ExcelJS eine Datei liest, schreibt `normalizeRelationships()` um, was es in Dateien anderer Programme (openpyxl) nicht lesen kann:
  absolute `.rels`-Ziele werden relativ, Zeichnungen im Standard-Namensraum erhalten das Präfix `xdr:` (ein kleines ZIP-Umschreiben mit
  `DecompressionStream`; geänderte Teile gespeichert, die übrigen kopiert).

Tests: `tests/apps/test_spreadsheet.py` – Öffnen, Eingabe mit Neuberechnung, Geändert-Markierung, Speichern als XLSX (mit openpyxl geprüft), ODS, CSV,
XLS, XLSM, Verwerfen von Änderungen, Sprache und Design, Smartphone-Layout, CSV-Importdialog (Windows-1252, Strichpunkte, Dezimalkomma,
Zeilenumbrüche in Anführungszeichen, führende Nullen, Datumswerte, alles als Text, Speichern mit demselben Trennzeichen). Genauigkeit von Import/Export: `tests/prototypes/test_s6_office_io.py`.

### Textverarbeitung (`apps/document`)

Univer Docs 1.0 mit den Presets Docs Core und Docs Drawing (`vendor/esm/univer-docs`, Entscheidung D-020), im selben Aufbau wie die
Tabellenkalkulation (Container außerhalb von Preact, bedingtes Pico, Geändert-Regel, Design und Sprache). Der DOCX-Import verwendet den direkten
Leser aus Spike S-8 (`shared/js/docx-import.js`, über `importDocx` von `shared/js/univer-docx.js`), der Export die Bibliothek `docx` (`exportDocx`).
DOCM und DOTX werden geöffnet und als neue DOCX-Dateien gespeichert. ODT (`shared/js/odt.js`, eigener Code auf fflate): der Leser löst automatische
und gemeinsame Formatvorlagen samt Elternketten auf (Text- und Absatzeigenschaften, Längen in cm/mm/in/pt), `text:h`-Gliederungsebenen,
Titel/Untertitel, Listen mit den Ebenenarten von `text:list-style`, Tabellen (verdeckte Zellen: horizontale Verbindungen entfallen, vertikale
werden `rowSpan: 0`), Rahmen mit Bildern, Links, `text:s`/`text:tab`, Notizen (ans Ende angehängt) und die erste Masterseite (Seitenlayout, Kopf-,
Fußzeile); er baut den Univer-Inhalt mit dem `Body`-Baustein aus `docx-import.js`. Der Schreiber geht den Univer-Inhalt wie `exportDocx` durch und
schreibt `content.xml` mit automatischen Formatvorlagen, die gleiche Eigenschaften teilen, verschachtelten `text:list`, Tabellen mit verdeckten
Zellen, `Pictures/`, dazu `styles.xml` (Überschriften, Seitenlayout, Kopf- und Fußzeile), `meta.xml` und das Manifest, mit `mimetype`
unkomprimiert zuerst. Inhaltsverzeichnis (`shared/js/doc-toc.js`): gewöhnliche Absätze, deren Text ein Hyperlink auf `#toc-<n>` ist (n = Position unter
den Überschriften, namedStyleType 4–8); `insertToc` schneidet ein vorhandenes Verzeichnis heraus (an diesen Links erkannt) oder nimmt den Absatz der
Schreibmarke (`DocSelectionManagerService.getActiveTextRange()`), fügt die neuen Absätze ein und verschiebt alle Indizes des Inhalts; das Dokument
wird als neue Einheit neu geladen. Der DOCX-Export umschließt Überschriften mit `Bookmark` und die Einträge mit `InternalHyperlink`, der ODT-Export
schreibt `text:bookmark` und `#toc-n`-Links. Der DOCX-Leser macht aus `footnoteReference`/`endnoteReference` hochgestellte Nummern und hängt die
Notentexte am Ende an (wie der ODT-Leser). Reiner Text: Zeilen werden Absätze (`fromText`); beim Speichern als Text
wird der Datenstrom mit Absatzmarken als Zeilenumbrüchen und ohne eingebettete Objekte geschrieben (`toText`). Drucken und HTML (`shared/js/doc-html.js`, `toHtml`): die Univer-Daten werden eine
eigenständige Seite (benannte Formate → `h1`–`h5`/Titel/Untertitel, Absatz- und Zeichenformate als Inline-CSS, Links, verschachtelte
`ul`/`ol` aus `bullet.nestingLevel`, Tabellen mit `colgroup`-Breiten, Verbindungen und Schattierung, Zeichnungen als `img`, Seitenumbrüche
als `break-before:page`, Überschriften mit `id="toc-<n>"` für die Links des Inhaltsverzeichnisses); `@page` übernimmt Seitengröße und Ränder
aus `documentStyle`, und mit `print` stehen Standard-Kopf- und -Fußzeile mit `position: fixed` in den Randbereichen, sodass sie sich auf jeder
Seite wiederholen. Die Schaltfläche 🖨 (`Strg+P`) lädt sie in einen versteckten `srcdoc`-Frame und ruft dessen `print()` auf (CSP
`frame-src 'self' about:`); Speichern als `.html` schreibt dieselbe Seite ohne `print`. Rechtschreibbereich (`apps/document/src/js/spelling.js`, `F7`) auf der Rechtschreibprüfung der Suite (siehe
*Rechtschreibprüfung*): `spell.errors` des Datenstroms des Body, nach Wort gruppiert mit ihren Positionen; Sprache, eigene und ignorierte
Wörter sind die des Auswahlfelds in der Kopfzeile. Markieren und Ersetzen verwenden die Fassade (`FDocument.setSelection`,
`getTextRange(start, end).setText`, vom letzten Vorkommen rückwärts); die Positionen werden vor jeder Aktion neu berechnet, da sich der
Text seit der Prüfung geändert haben kann.

Tests: `tests/apps/test_document.py` – Öffnen einer DOCX-Datei, Eingabe am Anfang, Geändert-Markierung, Speichern (mit python-docx geprüft),
Eingabe in ein neues Dokument und Speichern als Text, Öffnen von Textdateien, reichhaltige DOCX mit Kopf-/Fußzeile, Vorlagen, Sprache und Design,
Smartphone-Layout, ODT hin und zurück, Inhaltsverzeichnis und Fußnoten, Druckdarstellung (Kopfzeile, Listen, Tabellenverbindungen, Bilder, Überschriftenanker; Firefox blockiert unter Playwright die Seite in `print()`, dort wird der Frame vor dem Laden abgefangen) und HTML-Export, Rechtschreibung (Vorschlag ersetzt alle Vorkommen, eigenes Wörterbuch, `.oxt` in ISO-8859-1, Ignorieren, erhalten nach
Neuladen, `.aff`+`.dic`-Paar). DOCX-Genauigkeit: `tests/prototypes/test_s8_docx_reader.py` und `test_s6_univer_docs.py`. In Firefox verdoppelt die
Eingabeverarbeitung von Univer Docs von Playwright getippte Umlaute; die Eingabetests verwenden ASCII-Text.

### Präsentationseditor (`apps/presentation`)

Eigener Editor auf dem Foliendatenmodell aus Spike S-7 (Entscheidung D-021): `shared/js/pptx-import.js` (PPTX-Leser mit Vererbung von Layout und
Master, fflate), `shared/js/slide-render.js` (Darstellung als DOM/SVG, Text als bearbeitbares HTML), `shared/js/pptx-export.js` (PptxGenJS) und
Moveable zum Verschieben, Skalieren und Drehen (mit Hilfslinien).

- **Übergänge und Animationen** (`slide.transition = { type, dir, duration, advanceAfter }`, `slide.animations = [{ id, effect, start }]`):
  der Leser nimmt das erste `p:transition` (PowerPoint ab 2010 schreibt es in `mc:AlternateContent` mit `p14:dur`; sonst `spd`, `advTm`) und die
  Eingangs-`p:cTn` von `p:timing` (presetClass `entr`, presetID 1/10/2/53 → Erscheinen/Einblenden/Hineinfliegen/Zoom, nodeType → Klick/mit/nach)
  und ordnet `spTgt spid` über die mitgelesenen `p:cNvPr`-IDs den Elementen zu. PptxGenJS schreibt beides nicht, daher entpackt `pptx-export.js`
  seine Ausgabe und fügt `p:transition` und eine Hauptsequenz (`p:timing`, eine Klickgruppe je „bei Klick“) nach `p:clrMapOvr` ein; die Form-IDs
  stammen aus den `p:cNvPr`-Elementen in der Reihenfolge, in der die Elemente hinzugefügt wurden. Die Vorführung gruppiert die Animationen genauso:
  Elemente späterer Gruppen sind verborgen, ein Schritt spielt die nächste Gruppe mit der Web Animations API (`opacity`, `translate`, `scale`);
  Übergänge animieren die neue (bei *Schieben* auch die alte) Folienansicht; *nächste Folie nach* ist ein Timer, den jedes Blättern neu startet.

- Bühne und Miniaturansichten werden imperativ in Container außerhalb von Preact gezeichnet; die Bereiche sind Preact. Pico wird in der bedingten
  Fassung geladen, damit Folieninhalte (Tabellen, Text) nicht umgestaltet werden; Werkzeugleiste, Bereich und Dialoge tragen `.pico` (in der
  Media-Query lautet der Selektor der Werkzeugleiste `nav.pr-toolbar`, weil sonst `.pico nav` gewinnt).
- Textbearbeitung verwendet `contenteditable` auf dem gezeichneten Textfeld (oder der Tabellenzelle) und liest das Ergebnis mit `readText` zurück;
  Formatierung während der Bearbeitung nutzt `document.execCommand`, sonst werden die Eigenschaften aller Textabschnitte des Elements geändert.
- Rückgängig/Wiederholen halten `structuredClone`-Momentaufnahmen des Foliensatzes (60 Schritte, schnelle gleichartige Änderungen zusammengefasst).
  Die Zwischenablage enthält Kopien von Elementen innerhalb der Seite.
- Vorführen zeichnet eine Folie skaliert in eine Vollbild-Ebene; Navigation über Tastatur, Klick und Wischen. Drucken zeichnet jede Folie in einen
  Druckcontainer mit `@page` in Foliengröße.
- Notizen (`slide.notes`) werden aus dem Body-Platzhalter des `notesSlide`-Teils der Folie gelesen (`pptx-import.js`) und mit PptxGenJS `addNotes`
  geschrieben. Die Referentenansicht öffnet ein `about:blank`-Fenster (gleicher Ursprung), kopiert die `<style>`-Elemente der Seite hinein und zeichnet
  dort die aktuelle Folie; die Konsole im Hauptfenster zeigt aktuelle und nächste Folie, die Notizen, eine Stoppuhr und die Uhrzeit. Tastendrücke in
  beiden Fenstern gehen an denselben Handler.

Tests: `tests/apps/test_presentation.py` – Öffnen einer PPTX-Datei, Bearbeiten von Position, Größe und Textformatierung im Bereich, Speichern (mit
python-pptx geprüft), Hinzufügen von Text, Formen, Tabellen (Zellbearbeitung) und Bildern, Folien (hinzufügen, duplizieren, umordnen, löschen),
Rückgängig/Wiederholen, Verschieben mit Pfeiltasten, Kopieren/Einfügen, Verschieben mit der Maus, Vorführen, Speichern unter und Vorlagen, deutsche
Oberfläche, Smartphone-Layout, Notizen (mit python-pptx importiert, bearbeitet, gespeichert) und die Referentenansicht (Konsole, Publikumsfenster,
Tasten in beiden Fenstern, Beenden). Genauigkeit von Import/Export: `tests/prototypes/test_s7_slides.py`.

### E-Mail-Client (`apps/mail`)

Eigene Protokoll-Clients auf den TCP-Verbindungen des Relays (`Suite.relay.connect`, TLS oder `startTls`):

- `js/imap.js`: IMAP4rev1-Client. Antworten werden in vollständige Zeilen samt Literalen (`{n}`) zerlegt und dann in Tokens
  aufgeteilt (Atome mit `[...]`-Abschnitten, Zeichenketten in Anführungszeichen, Literale als Bytes, NIL, Listen). Befehle
  laufen nacheinander über eine Promise-Kette; ungetaggte Antworten gehören zum laufenden Befehl, `EXISTS`/`EXPUNGE` des
  gewählten Ordners werden zusätzlich an `onUpdate` gemeldet. Anmeldung mit `AUTHENTICATE PLAIN` (SASL-IR oder Fortsetzung)
  oder `LOGIN`; Literale mit LITERAL+ oder synchronisierend. Ordnernamen in modifiziertem UTF-7; Special-Use-Flags, ersatzweise
  anhand der (deutschen/englischen) Namen. Verschieben mit `MOVE` oder `COPY` + `\Deleted` + `UID EXPUNGE` (`EXPUNGE` ohne
  UIDPLUS).
- `js/smtp.js`: Einlieferung mit EHLO, STARTTLS, AUTH PLAIN/LOGIN, Ablehnungen je Empfänger, Punkt-Maskierung.
- `js/mime.js`: Erstellen von Nachrichten (nur 7 Bit: Quoted-Printable-Text, Base64-Anhänge, RFC-2047-Kopfzeilen,
  RFC-2231-Dateinamen, umbrochene Kopfzeilen, `multipart/alternative`, `related` für eingefügte Bilder, `mixed`),
  Adresslisten, mbox zerlegen/zusammenfügen, vCard 2.1/3.0/4.0 lesen (unbekannte Eigenschaften bleiben erhalten) und vCard 3.0
  schreiben. Nachrichten werden mit postal-mime (`vendor/esm/mail`) gelesen.

Mehrere Konten: `sessions` ordnet Konto-IDs `{ account, imap, folders, unread, folder, selected }` zu; `state.account/imap/folders/unread`
sind die der aktiven Sitzung (`activate`), ein Wechsel lässt die anderen Verbindungen offen, alle erhalten jede Minute ein NOOP.
`selected` merkt sich den auf jeder Verbindung gewählten Ordner (`selectIn` wählt nur bei Bedarf). Der gemeinsame Posteingang (`source:
'unified'`) wählt jeden Posteingang, holt die neuesten 50 Übersichten und kennzeichnet sie mit `uid = "<Konto>:<uid>"`, `acc` und `realUid`;
Lesen, Markierungen und Löschen gruppieren die UIDs nach Konto (`byAccount`) und arbeiten auf dessen Verbindung; Antworten nehmen das Konto
der Nachricht (`messageAccount`) und legen die gesendete Kopie und `\Answered` über dessen Sitzung ab. `EXISTS` eines Posteingangs im
Hintergrund aktualisiert dessen Zahl ungelesener Nachrichten oder lädt die gemeinsame Liste neu.

`js/main.js`: Konten sind appdata-Verbindungen (Passwörter nur auf Wunsch; `smtpPassword` ist ein geschütztes KeePass-Feld),
Kontakte stehen in den App-Einstellungen (`settings.contacts`). Listen holen `UID FLAGS INTERNALDATE RFC822.SIZE` und
ausgewählte Kopfzeilen in Seiten zu 50 (Sequenzbereiche); Nachrichten werden mit `BODY.PEEK[]` geholt, gelesen,
zwischengespeichert (40) und ausdrücklich als `\Seen` markiert. HTML-Mails werden mit DOMPurify bereinigt (Formulare,
Frames, `base` entfernt; externe `src`/`url()` entfernt und gezählt; `cid:`-Bilder durch Data-URLs ersetzt) und in einem
`srcdoc`-iframe mit `sandbox` ohne `allow-scripts` angezeigt; das iframe erbt die CSP der Seite, externe Inhalte können also
auch so nicht laden. Einladungen werden mit `shared/js/ical.js` gelesen; Antworten sind iMIP-Nachrichten mit `METHOD:REPLY`
und dem `PARTSTAT` des Teilnehmers. Gesendete Nachrichten werden an den Ordner `\Sent` angehängt, Entwürfe an `\Drafts`
(mit Bcc, Flags `\Draft \Seen`); beim Senden eines bearbeiteten Entwurfs wird dieser gelöscht. Ein `NOOP` pro Minute holt
neue Post.

Unterhaltungen (`js/threads.js`): die Übersichten holen auch `In-Reply-To` und `References`; die übergeordnete Nachricht ist die
letzte geladene Nachricht der Verweiskette, sonst (keine Verweise, Betreff mit Antwortpräfix) die früheste Nachricht mit demselben
Grundbetreff; Zyklen werden aufgelöst. Die Liste zeigt Unterhaltungen zugeklappt (neueste Aktivität zuerst) und klappt sie bei
Bedarf auf; die Tastaturnavigation folgt der angezeigten Reihenfolge.

Regeln und Vorlagen liegen im Kontodatensatz (`rules: [{field, contains, action, folder}]`,
`templates: [{name, subject, text, html, mode}]`) und wandern so mit der Anwendungsdatendatei. `applyRules` läuft über die
Übersichten ungelesener Nachrichten im Posteingang, wenn dieser geöffnet wird und wenn IDLE/NOOP neue Post meldet; die
bearbeiteten Paare `Ordner/UID` werden für die Sitzung gemerkt, die UIDs je Aktion gruppiert und je Gruppe ein
MOVE/STORE/Expunge abgesetzt. Die Schaltfläche ⚙ wendet die Regeln auf alle geladenen Nachrichten des Ordners an.

Tests: `tests/apps/test_mail.py` mit `tests/helpers/mail_fake.py` (IMAP- und SMTP-Server mit Threads: Literale mit und ohne
LITERAL+, mit oder ohne MOVE, implizites TLS und STARTTLS, AUTH PLAIN/LOGIN) – Lesen von HTML/Anhängen aus `.eml`, mbox und
Suche, Schreiben (mit Pythons `email` geprüft), Kontakte und vCard, Einladungen, MIME-Hilfsfunktionen, deutsche Oberfläche
und Smartphone-Layout sowie über das Relay (Python und PowerShell): Ordner, ungelesene Nachrichten, Flags, Suche, Verschieben,
Löschen, neue Post, Antworten/Weiterleiten/Senden mit Kopie in „Gesendet“ und `\Answered`, Entwürfe, TLS/STARTTLS mit
COPY+EXPUNGE und Einladungsantworten, falsches Passwort, Ordner anlegen und Ziehen und Ablegen; Unterhaltungen aus einer mbox
(Verweise, Betreff als Ersatz, Tiefe, flache Liste); Regeln (Verschieben auf Knopfdruck, Markieren beim Eintreffen) und
Vorlagen.

### Audio-Editor (`apps/audioeditor`)

Die Web Audio API sowie, nur für den komprimierten Export, Mediabunny mit seinen WebAssembly-Encoder-Erweiterungen für MP3
(LAME) und FLAC (libFLAC) (`vendor/esm/audio`, MPL-2.0, per dynamischem `import()` beim Öffnen des Export-Dialogs geladen).
`js/dsp.js` arbeitet auf `{ rate, channels: [Float32Array] }` und liefert immer neue Arrays. Enthalten sind
Bereichsbearbeitung (slice, remove, insert, replace, pad), Effekte (Verstärkung, Normalisieren, Blenden mit einer Rampe, die
über mehrere Clips reichen kann, Umkehren, Invertieren, Echo), Generatoren, ein Mischer (Verstärkung in dB, Panorama mit
konstanter Leistung, stumm, solo), Spitzenwerte zum Zeichnen (Min/Max je 256 Samples), ein eigener WAV-Decoder (PCM
8/16/24/32 Bit, Gleitkomma 32/64, Extensible, RF64) und -Encoder (16/24 Bit PCM gleich skaliert wie der Decoder, sodass
unverändertes PCM bitgleich zurückgeschrieben wird; 32 Bit Gleitkomma). Umrechnen der Abtastrate, Geschwindigkeitsänderung
und Biquad-Filter werden mit einem `OfflineAudioContext` berechnet. Andere Formate dekodiert `decodeAudioData` eines
`OfflineAudioContext` in der Projektrate.

`js/clips.js`: eine Spur ist eine Liste von Clips `{ id, offset (Samples), audio, name, beats?, cues? }`. Clips sind
unveränderlich; jede Operation liefert eine neue Liste, sodass Undo-Momentaufnahmen (50) nur die Spurobjekte kopieren.
Bereichsoperationen verschieben wie in Audacity: `removeRange` schneidet den Bereich aus den betroffenen Clips und schiebt
spätere Clips nach links, `insertGap`/`insertClips` teilen an der Stelle und schieben spätere Clips nach rechts,
`sliceRange` kopiert die Clips eines Bereichs (Zwischenablage, Zuschneiden), `mapRange` bearbeitet die Teile der Clips in
einem Bereich bei gleicher Länge (die meisten Effekte), `mergeRange` mischt den Bereich zu einem Clip für Effekte, die die
Länge ändern (Geschwindigkeit, Tempo, Umkehren), `flatten` mischt eine Spur (Lücken sind Stille, überlappende Clips addieren
sich). Beats sind ein Raster mit konstantem Tempo `{ bpm, phase }` relativ zum Clip, Cues Sample-Positionen im Clip; Teilen
und verschiebende Bearbeitungen nehmen sie mit, Geschwindigkeit/Tempo skalieren sie.

`js/beats.js`: eine Onset-Hüllkurve per Spectral Flux (Radix-2-FFT, Hann-Fenster, Schrittweite ≈ 11,6 ms, logarithmischer
Betrag, positive Differenzen, lokaler Mittelwert abgezogen); das Tempo aus der Autokorrelation der Hüllkurve, gewichtet mit
einer Log-Normal-Kurve um 120 BPM (parabolische Interpolation des Maximums); danach eine Feinsuche nach Periode (±3 %, Schritte
von 0,05 %) und Phase (¼ Frame), die die interpolierte Hüllkurve an den Rasterpositionen maximiert. Genauigkeit mit
Klick-Spuren: ±0,05 BPM, Phase auf 2 ms. Cues: das erste Sample über −40 dBFS und Spitzen der Hüllkurve über Mittelwert + k·σ
(k aus der Empfindlichkeit), stärkste zuerst, mit Mindestabstand. `timeStretch` ist WSOLA (40-ms-Hann-Frames, 50 % Überlappung,
±10 ms Suche: grob auf der um 4 dezimierten Mono-Mischung, dann ±3 Samples in voller Rate; alle Kanäle nutzen dieselben
Frame-Positionen), etwa 0,5 s je 30 s Audio mit 44,1 kHz.

`js/main.js`: Wellenformen werden in eine Canvas je Spur gezeichnet, die so breit wie der sichtbare Bereich ist; der sichtbare
Bereich wird in einer Offscreen-Canvas zwischengespeichert (Schlüssel: Ansicht, Größe, Spurversion, Farben, gewählter Clip),
mit Clips, ihren Titelleisten, Beat-Linien und Cues; Auswahl, Einfügemarke, Einrastlinie und Abspielposition werden darüber
gezeichnet, beim Abspielen in jedem Frame. Spitzenwerte und `AudioBuffer` werden je Audio-Objekt in `WeakMap`s
zwischengespeichert. Das Ziehen eines Clips an der Titelleiste verschiebt ihn live (auch zwischen Spuren) und legt beim
Loslassen einen Undo-Schritt an. Zum Einrasten werden Ränder, Beats und Cues aller anderen Clips, die Abspielposition und 0 in
einem sortierten Array gesammelt; für jeden Rand, Beat und Cue des gezogenen Clips sucht eine binäre Suche das nächste Ziel
(Schwelle 8 px). Beim Abspielen startet je hörbarem Clip ein `AudioBufferSourceNode` in eine Verstärkung und einen
`StereoPannerNode` je Spur; Pegel ändern sich live. Die Aufnahme nutzt `getUserMedia` und `MediaRecorder` und dekodiert das
Ergebnis in eine neue Spur. Menüs sind fest positionierte Bereiche (ein Dropdown in der waagrecht blätternden Werkzeugleiste
würde abgeschnitten).

`js/project.js`: `.audioproj`-Dateien sind ZIPs (fflate) mit `project.json` (`format: "suite-audio-project"`, Version, Rate,
Spuren mit Name/Lautstärke/Balance/Stumm/Solo und Clips mit Name, Position in Samples, Beat-Raster, Cues und dem Pfad ihres
Audios) und `audio/<n>.wav` (32 Bit Gleitkomma, unkomprimiert abgelegt; Clips mit demselben Audio-Objekt teilen sich die Datei).
Beim Öffnen wird in die Projektrate umgerechnet, Positionen, Beat-Phasen und Cues werden entsprechend skaliert.
Beschriftungen des Projekts stehen als `labels: [{start, end, text}]` in Sekunden darin.

`js/effects.js`: Kompressor/Limiter (Spitzenwertfolger über alle Kanäle mit Ansprech-/Abkling-Koeffizienten, Kennlinie in dB), Equalizer und
Hall als Offline-Web-Audio-Graphen (`BiquadFilterNode` Kuhschwanz/Glocke; `ConvolverNode` mit deterministisch abklingender Rausch-Impulsantwort),
Tonhöhenänderung = WSOLA-Zeitdehnung um 1/r und anschließende Umrechnung mit `playbackRate` r, Rauschminderung = spektrales Gate (STFT 2048/512
mit Hann-Fenstern, Rauschpegel je Band aus den leisesten 10 % der vollständig im Bereich liegenden Frames, Verstärkungen über Nachbarbänder
geglättet und zeitlich abklingend, Overlap-Add mit Fensternormierung).

Clip-Lautstärke und Blenden (`clips.envelopeAt`): Verstärkung in dB und Blendenkurven gleicher Leistung (`sin` über die Blendenlänge) je
Clip, angewendet in `flatten()` (Speichern, Export, mischende Effekte) und beim Abspielen als `GainNode` mit `setValueCurveAtTime` von der
Abspielposition bis zum Clip-Ende. Beim Teilen bleibt die Einblendung am linken, die Ausblendung am rechten Teil; die Projektdatei
speichert `gain`, `fadeIn` und `fadeOut`. *Überblenden* setzt die Blenden überlappender Nachbarn auf die Länge der Überlappung.

Lautstärkeautomation: `track.envelope` ist eine sortierte Liste von Punkten `{ t, db }` (Sekunden, −40…+6 dB), zwischen den
Punkten linear in dB, vor dem ersten und nach dem letzten konstant. `withEnvelope()` wendet sie auf die Mischung der Spur an
(Abmischen, Export, „Zu einer Spur abmischen“); beim Abspielen liegt hinter den Clip-Quellen je Spur ein weiterer `GainNode`, der die
Kurve per `setValueCurveAtTime` erhält (alle 10 ms abgetastet, höchstens 8000 Werte). Die Punkte werden bei aktivem ⤴ über der Spur gezeichnet; beim
Ziehen bleiben sie zwischen ihren Nachbarn, ein Doppelklick entfernt einen Punkt. Die Projektdatei speichert `envelope` je Spur.

`js/labels.js`: Beschriftungstext im Audacity-Format (`start\tend\ttext`, eine je Zeile; Zeilen mit `\` am Anfang –
Frequenzbereiche – werden übersprungen, ohne Ende entsteht eine Punktbeschriftung). Die Beschriftungsleiste ist ein Canvas,
der mit dem Zeitlineal gezeichnet wird; überlappende Beschriftungen wechseln zwischen zwei Zeilen, die Trefferprüfung nutzt
dasselbe Layout (`labelBoxes()`). Beschriftungen gehören zu den Rückgängig-Schnappschüssen und zu den Einrastzielen.

Spektrogramm (`beats.spectrogram()`): FFTs mit 1024 Punkten und Hann-Fenster über die Mono-Mischung mit einem Vorschub, der
höchstens 6000 Frames je Audio-Objekt ergibt, Pegel als Bytes quantisiert (-100…0 dB) und in einer `WeakMap` zwischengespeichert;
`drawClipSpectrum()` ordnet jeder Pixelspalte einen Frame und jeder Zeile ein Frequenzband auf logarithmischer Achse zu und
schreibt ein `ImageData` über eine Farbtabelle mit 256 Einträgen.

`js/encode.js`: `available()` fragt Mediabunnys `canEncodeAudio` je Format (zuerst die Encoder des Browsers; die LAME- und
libFLAC-Encoder werden nur registriert, wo der Browser keinen hat). `encode()` speist die Mischung in 2-Sekunden-`AudioSample`s
(`f32-planar`) in eine `AudioSampleSource` eines `Output` (`Mp3OutputFormat`, `FlacOutputFormat`, `OggOutputFormat` mit
Opus, `Mp4OutputFormat` mit AAC) mit `BufferTarget`. MP3 wird in der Projektrate (höchstens 48 kHz) kodiert, Opus mit 48 kHz,
AAC mit 44,1 oder 48 kHz. Die Encoder laufen in Workern aus Blob-URLs; die CSP erlaubt daher `worker-src blob:` und
`'wasm-unsafe-eval'`.

Tests: `tests/apps/test_audioeditor.py` (WAV-Dateien mit `wave`/`struct` erzeugt und geprüft) – Öffnen, Löschen mit
Rückgängig/Wiederholen und bitgleiches Speichern, Mausauswahl über Spuren, Kopieren/Einfügen, Import mit Umrechnung, Stumm/
Panorama und Abmischen, alle Effekte, Generatoren, WAV-Export (24 Bit Stereo-Auswahl, 32 Bit Gleitkomma), 24-Bit-Dekodierung,
Abspielen mit Wiederholung, Aufnahme (Mikrofon-Attrappe aus einem Oszillator), Teilen, Ziehen von Clips mit und ohne
Einrasten sowie in eine andere Spur, verschiebendes Löschen, Clip-Menü (verschieben nach, duplizieren, entfernen),
Beat-Erkennung und Beat-auf-Beat-Einrasten zweier Klick-Spuren, Cue-Erkennung, Tempo angleichen mit erneuter Erkennung,
Beat-Raster als Zahlen, MP3/FLAC-Export (und Ogg Opus, wo verfügbar), deutsche Oberfläche und Smartphone-Layout mit Touch,
Beschriftungen (Tastatur und Doppelklick, Auswählen, Rückgängig, Audacity-Export/-Import, Entfernen, Projektdatei), Spektrogramm
(Spitzenband und Pegel eines 1-kHz-Tons, hellste Zeile der gezeichneten Ansicht), Ziehen eines Blendengriffs mit Rückgängig/Wiederholen,
Clip-Lautstärke, Überblenden überlappender Clips, Abspielen mit Blenden, Blenden in der Projektdatei, Kompressor, Limiter, Equalizer, Hallfahne,
Tonhöhe um eine Oktave (Nulldurchgänge, Länge), Rauschminderung (>10 dB weniger Rauschen, Ton innerhalb 1,5 dB) und Effekte über das Menü.

### Barcodes (`apps/barcode`)

ZXing-C++ als WebAssembly (zxing-wasm 3, MIT; ZXing-C++ Apache-2.0) liest und kodiert alle Codes. `tools/vendor_zxing.py`
legt das ES-Modul des „full“-Builds (Leser und Schreiber), seinen gemeinsamen Teil und `zxing_full.wasm` in `vendor/zxing/` ab;
das WASM wird eingebettet (`data-src`, gzip + base64) und als `wasmBinary` an `prepareZXingModule` übergeben, sodass zxing-wasm
es nicht von seinem CDN lädt.

- Lesen: `readBarcodes(ImageData, { tryHarder, maxNumberOfSymbols: 16 })` auf Bildern, die in eine Canvas gezeichnet werden
  (Dateien, abgelegte und eingefügte Bilder), und auf Kamerabildern (`getUserMedia`, etwa fünf Bilder pro Sekunde, höchstens
  1280 px breit). Ergebnisse erscheinen einmal je Format und Text; ihre Positionen werden auf einer Overlay-Canvas gezeichnet.
- `js/content.js` erkennt Inhalte (URL, `WIFI:`, vCard und MeCard, `mailto:`/`MATMSG:`, `tel:`, `SMSTO:`, `geo:`,
  `otpauth://`, VEVENT) und baut sie für den Generator (mit der Maskierung von `WIFI:`/vCard). Links werden nur für `http(s)`
  angeboten und mit `rel="noopener noreferrer"` geöffnet.
- Erzeugen: `writeBarcode(text, { format, options: 'ecLevel=…' })` liefert das Symbol als Bitmap (0 = dunkel, ohne Ruhezone);
  `js/render.js` zeichnet es als SVG (gleiche Zeilen zu einem Pfad zusammengefasst) und auf eine Canvas (PNG) mit Modulgröße,
  Ruhezone, Farben und bei 1D-Codes Balkenhöhe und Text. Das Ergebnis wird zur Kontrolle mit `tryInvert` zurückgelesen
  (EAN/UPC dürfen die Prüfziffer ergänzen).

Tests: `tests/apps/test_barcode.py` – ein Bild mit QR-Code (segno) und EAN-13 (zxing-cpp) gemeinsam gelesen, Duplikate, Links,
leere Bilder, vCard als .vcf und in den Generator, PNG/SVG mit zxing-cpp zurückgelesen, WLAN-Maskierung, Fehlerkorrektur,
EAN-Beispiel und ungültiger Inhalt, Data Matrix/Aztec/PDF417/Code 128, helle Codes auf dunklem Grund, eine Kamera-Attrappe
(Canvas-Stream), deutsche Oberfläche und Smartphone-Layout.

### Video-Editor (`apps/videoeditor`)

Auf Basis von Spike S-10: WebCodecs über Mediabunny (`vendor/esm/video`, MPL-2.0).

- `js/timeline.js`: das Projektmodell als einfache Objekte und reine Funktionen (Überschreiben mit `clearRange`, Verschieben,
  Kürzen, Teilen, Löschen mit Lückenschluss, Einrasten, Blendenfaktor) sowie das Zeichnen eines Clips (Einpassen,
  Versatz, Größe, Deckkraft, Blenden, Titel), das Vorschau und Export gemeinsam nutzen. Übergänge (`transitionIn`/`transitionOut`) beschneiden
  (Wischen, Kreis) oder verschieben/skalieren (Schieben, Zoom) die Zeichnung abhängig vom Blendenfortschritt; Ausgänge sind gespiegelt; nur
  „fade“ ändert die Deckkraft, der Ton wird immer geblendet. Bildeinstellungen: ein CSS-`filter` (brightness, contrast, saturate) am 2D-Kontext
  (auch an der `OffscreenCanvas` des Exports), der Zuschnitt als Quellrechteck von `drawImage`, die Drehung um die Bildmitte und `motion(c, t)`,
  das Größe und Versatz über den Clip interpoliert (Ken Burns). Geschwindigkeit und Rückwärts: ein Clip belegt `(out - in) / speed`
  Sekunden der Zeitleiste; `sourceTime(c, t)` rechnet Zeitleisten- in Quellzeit um (rückwärts ab `out` bei `reverse`), und
  `subClip(c, a, b)` wird beim Überschreiben, Kürzen und Teilen verwendet, damit der Quellausschnitt jedes Teils stimmt. Der Export
  fordert von `CanvasSink.canvasesAtTimestamps` die umgerechneten Zeiten an (bei rückwärts laufenden Clips absteigend) und spielt den
  Ton des Clips als ein Puffer (an Ort und Stelle umgedreht) mit `playbackRate` = Geschwindigkeit; die Vorschau setzt `playbackRate`
  (ohne `preservesPitch`) und spult rückwärts laufende Clips Bild für Bild, stumm.
- Untertitel (`js/subtitles.js`): SRT-/WebVTT-Einträge (Zeitstempel mit `,` oder `.`, Stunden optional, Tags entfernt) werden Textclips auf einer
  Videospur namens *Subtitles*; `toSrt` schreibt die Textclips als nummerierte Einträge zurück. Rückgängig behält die vorherigen
  Projektobjekte (100).
- Vorschau (`js/main.js`): ein `<video>`/`<audio>`-Element je Clip (nicht im DOM); `syncMedia` spult oder spielt sie zur Zeit
  der Zeitleiste (Driftkorrektur 0,3 s beim Abspielen), `compose` zeichnet die aktiven Clips der sichtbaren Videospuren von
  unten nach oben auf die Vorschau-Canvas. Im Stillstand wird nach `seeked` gezeichnet. Die Lautstärke ist in der Vorschau auf
  100 % begrenzt (Grenze des Medienelements); der Export wendet die echte Verstärkung an.
- Export (`js/export.js`): `availableFormats` fragt `canEncodeVideo`/`canEncodeAudio`; `render` setzt jedes Bild auf einer
  `OffscreenCanvas` (`CanvasSource`) zusammen, mit einem sequenziellen `CanvasSink.canvasesAtTimestamps`-Iterator je Videoclip;
  Bilder sind `ImageBitmap`s. Der Ton aller hörbaren Clips wird mit `AudioBufferSink` dekodiert, in einem `OfflineAudioContext`
  (48 kHz Stereo, Verstärkungsautomation für Lautstärke und Blenden) platziert und als eine `AudioBufferSource` hinzugefügt.
  Abbrechen bricht ab und ruft `output.cancel()` auf.
- Medien werden mit Mediabunny untersucht (Dauer, Größe, `canDecode`, Vorschaubild); Dateien, die es nicht lesen kann, fallen
  auf die Metadaten eines Medienelements zurück (nur Vorschau). Projektdateien sind JSON (`app: "videoeditor"`) mit Zeitleiste
  und Quellmetadaten; Medien werden über den Dateinamen neu verknüpft (Import oder „Suchen…“).
- Wellenformen: Nach dem Laden einer Quelle mit Ton dekodiert `loadPeaks` sie einmal mit `OfflineAudioContext.decodeAudioData`
  (Dateien bis 400 MB) zu 50 Spitzenwerten je Sekunde; jeder Audio-/Videoclip zeichnet seinen Teil (`in`…`out`, mal der
  Lautstärke des Clips) in eine Canvas, deren Inhalt nur neu gezeichnet wird, wenn sich Clip, Zoom oder Größe ändern.

Tests: `tests/apps/test_videoeditor.py` mit Medien aus `tests/helpers/media_samples.py` (ffmpeg aus `imageio-ffmpeg`): Import und
Untersuchung, Aufbau der Zeitleiste, Vorschau-Pixel, Teilen/Löschen mit Lückenschluss/Rückgängig, Ziehen zwischen Spuren,
Kürzen, Eigenschaften, Titel, Export mit ffmpeg geprüft (Codecs, Größe, Dauer, Pixel zu bestimmten Zeiten), Projekt speichern/
öffnen/neu verknüpfen, Abspielen und Einzelbildschritte, deutsche Oberfläche und Smartphone-Layout, Wellenformen (Höhe eines Tons,
Skalierung mit der Lautstärke, Videoclips), Übergänge (Pixel in der Mitte von Überblendung, Wischen, Schieben und Kreis),
Bildeinstellungen (Helligkeit, Drehung, Zuschnitt, Zurücksetzen, Bewegung an Anfang und Ende; Helligkeit in einer exportierten Datei),
Untertitel (SRT- und WebVTT-Import, eingebrannter Text, SRT-Export).

### Web-Inspektor (`apps/webinspector`)

Reduzierter Browser-Wrapper (Entscheidung D-004), ohne Bibliotheken.

- Seiten werden mit `Suite.relay.http` geladen (alle Header, kein CORS) oder ohne Relay mit `fetch` (die CSP erlaubt dafür
  `connect-src http: https:`). Inhalte werden mit dem Zeichensatz aus `Content-Type` oder `<meta charset>` dekodiert. Jede
  Anfrage wird aufgezeichnet (Methode, Header, Status, Inhalt, Zeit) und kann als HAR 1.2 exportiert werden (`analyze.js`
  `toHar`).
- `js/analyze.js`: `securityChecks` (Header-Regeln mit i18n-Schlüsseln), `structure` (DOMParser: Meta, Überschriften, Links,
  Bilder, Skripte, Stile, Formulare, Frames und Hinweise zu Barrierefreiheit/Sicherheit), HAR-Hilfen (`parseHar`, `mimeGroup`,
  `bodyOf`, `curl`), `previewDocument` und `highlightHtml`.
- Die Vorschau entfernt Skripte, `noscript`, Frames, Objekte, `base`, `meta http-equiv`, Event-Handler-Attribute und
  `javascript:`-URLs, macht Links absolut und entfernt Formularziele. Über das Relay bettet sie Stylesheets (samt der `url()`s
  darin), Bilder, Poster und Bilder aus Inline-Stilen als Data-URLs ein (höchstens 80 Anfragen). Angezeigt wird sie in einem
  `srcdoc`-iframe mit `sandbox="allow-same-origin allow-popups …"` (ohne `allow-scripts`); das iframe erbt die CSP der Seite,
  es lädt also nichts aus dem Netz. Ein Klick-Handler am iframe-Dokument lädt angeklickte Links im Inspektor. Ressourcen, die nicht
  geladen werden konnten oder blockiert sind, verlieren ihre Adresse (`data-original-src`, CSS `url(data:,)`), damit die Vorschau
  nichts anfordert. Die Vorschaugrößen setzen die Inhaltsbox des iframes auf die Gerätegröße (`box-sizing: content-box`), damit
  `innerWidth` und Media-Queries stimmen.
- Cookies (`analyze.js`): `parseSetCookie` (RFC 6265 vereinfacht: Domain muss zum Host passen, Max-Age hat Vorrang vor Expires,
  Standardpfad aus dem Anfragepfad), `storeCookies` (ersetzt nach Name/Domain/Pfad, abgelaufene Cookies löschen), `cookieMatches`
  und `cookieHeader` (längere Pfade zuerst). Mit *Cookies behalten* liegt der Cookie-Speicher im Zustand der Seite und `request()`
  ergänzt den Cookie-Header bei Relay-Anfragen. `blockedBy(rules, url)` vergleicht Host-Regeln über das Suffix und `*`-Muster mit
  der ganzen URL (oder ohne Schema); blockierte Ressourcen werden als Anfragen mit Status 0 aufgezeichnet. Vorschaugröße, Drehung,
  Regeln und der Schalter für Cookies sind Einstellungen je Browser in localStorage.
- `js/bookmarklet.js` ist als Text eingebettet (`<script type="text/plain">`); `bookmarkletUrl()` entfernt Kommentare, fasst
  Leerraum zusammen und kodiert den Code als URL (die Datei vermeidet Zeilenkommentare und setzt Semikolons). Der Bereich liegt
  in einem Shadow Root, fängt `console.*`, `error` und `unhandledrejection` ab, wertet Eingaben mit indirektem `eval` aus und
  liest Resource Timing, Cookies und Speicher. Erneutes Ausführen blendet ihn ein und aus (`window.__suiteInspector`).

Tests: `tests/apps/test_webinspector.py` mit einer lokalen Test-Website – Laden über das Relay (Python und PowerShell) mit
eingebetteten Stilen/Bildern, Sicherheitsprüfungen, Strukturhinweise, Quelltextsuche, Anfragen und HAR-Export, Navigation in
der Vorschau und zurück; direktes Laden mit CORS und eingefügte Quelltexte ohne Relay; der HAR-Betrachter (Filter, Sortierung,
JSON-/Bildinhalte, Parameter/POST-Daten, Zeiten, cURL); das Bookmarklet auf einer HTTP-Seite (Konsole, Auswertung, Info,
Netzwerk, Elementauswahl, Ein-/Ausblenden) und in der App; deutsche Oberfläche und Smartphone-Layout.

### Übersicht (`apps/overview`)

Enthält alle gebauten Anwendungen: `bundle.json` listet `dist/<app>.html`, die `build.py` gzip + base64 einbettet (die
Übersicht wird deshalb zuletzt gebaut). Eine Anwendung wird bei der ersten Verwendung entpackt (`DecompressionStream`)
und gestartet, indem **ihr HTML in einen leeren Rahmen oder ein leeres Fenster geschrieben** wird
(`document.open/write/close` auf `about:blank`). Ein solches Dokument hat den Origin der Übersicht und behält damit einen
sicheren Kontext mit File System Access API, Web Crypto und Speicher. Dokumente aus Blob-URLs haben das unter `file://`
in Chromium nicht (opaker, unsicherer Origin) und können von anderen Fenstern aus nicht aufgerufen werden („Not allowed
to load local resource“). Geschriebene Dokumente erben die Content-Security-Policy der Übersicht zusätzlich zu ihrer
eigenen, daher ist die Richtlinie der Übersicht die Vereinigung aller Richtlinien der Anwendungen (geprüft von
`tests/apps/test_overview.py`).

Rahmen und Fenster erhalten den Namen `suite-hub-app`; `Suite.bridge.hub()` liefert dann den Elternrahmen bzw. das
`opener`-Fenster. Die Übersicht leitet „Öffnen mit…“-Anfragen in neue Tabs (keine Pop-ups) und erhält `dirty`-Nachrichten
von `Suite.shell.setDirty` für die Markierungen der Tabs. „Alle Anwendungen speichern“ schreibt in einen Ordner
(`showDirectoryPicker`) oder erzeugt ein ZIP (`js/zip.js`, unkomprimierte Einträge). Die Übersicht ist etwa 90 MB groß;
sie lädt in etwa 2 s, weil die Anwendungen erst beim Start entpackt werden.

### Web-Folien (`apps/reveal`)

Diagrammblöcke (`js/mermaid-svg.js`) importieren `mermaid.js`, `layout.js` und `model.js` des Diagrammeditors über die Import-Map
(`@diagram/…`): das Flussdiagramm wird gelesen, angeordnet und als SVG-Zeichenkette gezeichnet (Formpfade, Kanten mit Pfeilspitzen,
Beschriftungen mit Hintergrundrechteck) in `currentColor`; der Block behält `source`, `svg` und `error`, `renderBlock` fügt nur das SVG ein.
Ziehen und Ablegen in der Folienliste nutzt HTML5-Drag-Ereignisse (`application/x-rv-slide`); `dropSlide` nimmt die Folie heraus (eine
Hauptfolie mit ihren Unterfolien) und setzt sie vor das Ziel oder als dessen letzte Unterfolien ein. Drucken mit Notizen übergibt
`showNotes: 'separate-page'` an die Druckansicht.

Umwandlung mit PowerPoint (`shared/js/deck-convert.js`, hier und im Präsentationseditor verwendet, der für `fromHtml`/`fromMarkdown` die
`deck.js` dieser App importiert): `pptxToWebSlides` ordnet die nicht gesperrten Elemente nach Position (Zeilen innerhalb von 20 px, dann x) und
bildet Titelplatzhalter auf Überschriften, Aufzählungs-/Textplatzhalter auf Listen (Ebenen als Einrückung), übrigen Text auf Textblöcke (Runs
als `<strong>`, `<em>`, … und farbige Spans außer Grautönen), Bilder und Tabellen ab; Eingangsanimationen werden Fragmente (`fragmentIndex` =
Klickgruppe), Übergänge reveal.js-Übergänge. `webSlidesToPptx` löst die Stapel auf und ordnet die Blöcke von oben an (HTML- und Markdown-Folien
werden zuerst mit `DOMParser` bzw. einer kleinen Markdown-Teilmenge in Blöcke zerlegt), schätzt Höhen aus Schriftgröße und Textlänge und
verkleinert alles, wenn es höher als die Folie ist; Fragmente (auch an Listeneinträgen) werden Eingangsanimationen, Folien mit dunklem
Hintergrund erhalten weißen Text.

Visueller Editor für reveal.js-Präsentationen. ES-Module `deck.js` (Modell, HTML-Erzeugung, Import) und `main.js`
(Oberfläche). Die reveal.js-Builds, Plugins, Stylesheets, Designs und Schriften sind als Text eingebettet
(`<script type="text/plain">`, siehe `vendor/README.md`), weil die Anwendung sie in die erzeugten Präsentationen schreibt.

- **Modell**: `deck = { title, lang, theme, highlightTheme, css, config, slides: [stack] }`; ein Stack ist eine Hauptfolie mit
  `children` (senkrechte Unterfolien). Eine Folie hat `kind` `blocks` (Blöcke Überschrift, Text, Liste, Bild, Code, Zitat,
  Tabelle, HTML mit Fragment-Effekt und -Index, Auto-Animate-`data-id`, Ausrichtung, Größe, Farbe), `markdown` (vom
  Markdown-Plugin dargestellt: `<section data-markdown><textarea data-template>`) oder `html`, dazu Hintergrund, Übergang,
  Auto-Animate, Sichtbarkeit, Position, automatisches Weiterschalten und Notizen (`<aside class="notes">`).
- **Ausgabe**: `renderPage(deck, assets)` schreibt eine eigenständige HTML-Seite: reveal.css, die Schriften des Designs, das
  Design, das Code-Farbschema und eigenes CSS, die Folien, das Editormodell als `<script type="application/json"
  id="suite-reveal-deck">`, reveal.js und die Plugins eingebettet sowie `Reveal.initialize` mit der Konfiguration.
  Gespeicherte Präsentationen laufen daher offline und lassen sich verlustfrei wieder öffnen.
- **Skripte in Folien** (Härtung): `renderPage` beginnt die Seite mit einer Content Security Policy
  `script-src 'nonce-…'; object-src 'none'; base-uri 'none'; form-action 'none'` mit einer neuen zufälligen Nonce je Seite;
  nur die eigenen `<script>`-Elemente des Editors (reveal.js, Plugins, Initialisierung, KaTeX, die Teile `extraHead`/`extraBody`)
  tragen sie. Inline-Skripte, Ereignis-Handler und `javascript:`-URLs aus Folien-HTML, Markdown oder importierten Dateien sind
  daher in der Vorschau, beim Vorführen, im Druckfenster und in der gespeicherten Datei gesperrt. `hasActiveContent(deck)`
  erkennt solches Markup (nicht in Codeblöcken und Notizen); `main.js` fragt dann (`askTrust`), ob der Datei vertraut wird.
  `state.trusted` (nicht gespeichert, bei jeder geöffneten Datei zurückgesetzt) erzeugt die Seite ohne Richtlinie
  (`renderPage(…, { trusted: true })`); die Schaltfläche `[data-testid=scripts]` schaltet um. Tests:
  `tests/security/test_malicious_files.py`.
- **Vorschau**: dieselbe Seite mit `editable: true` (Blöcke tragen `data-block`) in einem `<iframe srcdoc>` (gleicher Origin,
  erbt die CSP der Anwendung), konfiguriert mit `embedded`, ohne Fragmente, Übergänge und automatisches Weiterschalten. Der
  Editor hängt sich an das Dokument des Rahmens: Klicks wählen Blöcke, Doppelklicks machen sie `contentEditable` (die
  Tastaturnavigation von reveal.js ist so lange aus), Formatierungen nutzen `document.execCommand` im Rahmen, und der
  bearbeitete Inhalt wird ohne Neuaufbau ins Modell zurückgelesen. Andere Änderungen bauen den Rahmen (verzögert) neu auf und
  kehren zur aktuellen Folie zurück.
- **Präsentieren**: ein Vollbild-Overlay mit Rahmen oder ein neues, über `about:blank` beschriebenes Fenster (dort
  funktionieren das Fenster der Sprechernotizen und die Druckansicht); die Druckansicht verwendet `view: 'print'`.
- **Import**: eigene HTML-Dateien (eingebettetes Modell), andere reveal.js-HTML-Dateien (Abschnitte werden HTML-Folien;
  Hintergründe, Übergänge, Notizen, Design-Link und gängige `Reveal.initialize`-Optionen werden erkannt), Markdown mit
  den Trennern `---`/`--`/`Note:` und Jupyter-Notebooks mit `metadata.slideshow.slide_type` (slide, subslide, fragment,
  skip, notes) wie `nbconvert --to slides`. Export auch als Markdown.
- **Rückgängig**: `Suite.UndoHistory` mit Momentaufnahmen des Decks; Tippen in ein Feld oder einen bearbeiteten Text ist ein
  Schritt.

Das Notebook behält Zellmetadaten, zeigt je Zelle eine Auswahl des Folientyps („Folien“) und öffnet das Notebook über die
Anwendungsbrücke in den Web-Folien („🎞️ Folien“).

**Formeln** (D-042): `usesMath(deck)` sucht `$$…$$`, `\(…\)` und `\[…\]`; nur dann bettet `renderPage` KaTeX ein (`vendor/katex`:
`katex.min.js`, `auto-render.min.js` und `katex.css` mit den WOFF2-Schriften als `data:`-URLs) und ruft `renderMathInElement` auf,
sobald reveal.js bereit ist (`body[data-math=rendered]`). Das Mathe-Plugin von reveal.js wird nicht verwendet, weil es KaTeX von
einem CDN lädt. Markdown-Folien laufen durch marked, das Backslashes vor Satzzeichen entfernen und `_`/`*` als Hervorhebung deuten
würde: `mathForMarked` maskiert sie innerhalb von Formeln beim Erzeugen der Seite, `mathFromMarked` macht das beim Import einer
fremden Präsentation rückgängig. In der Bearbeitungsvorschau behält jeder Block seinen Quelltext (`el.suiteSource`), den
`startEditing` wiederherstellt; Texte werden also als TeX bearbeitet.

Tests: `tests/apps/test_reveal.py` bearbeitet Texte in der Vorschau, fügt Folien und Elemente ein, setzt Hintergründe,
Übergänge, Fragmente, Notizen und Präsentationsoptionen, prüft das gespeicherte HTML und spielt es offline in einer neuen
Seite ab (`Reveal.getTotalSlides`, Hervorhebung), öffnet es wieder, importiert Markdown, ein Notebook und eine fremde
reveal.js-Datei, präsentiert und öffnet ein Notebook aus der Notebook-Anwendung; dazu Folienstruktur mit Rückgängig,
deutsche Oberfläche und Smartphone-Layout; Formeln (abgesetzt und im Text in Markdown, `$` bleibt unverändert, Bearbeiten des
TeX-Quelltexts, Maskierung in der gespeicherten Datei und beim Import, Satz offline, kein KaTeX ohne Formeln).

## Relay

Das Relay leitet TCP-Verbindungen (WebSocket, mit STARTTLS) und HTTP-Anfragen (ohne CORS-Beschränkungen) weiter.
Implementierungen: `relay/python/relay.py` (Standardbibliothek) und `relay/powershell/relay.ps1` (ohne Module, ohne
Administratorrechte). Protokoll (Version 2), Optionen und Beispiele für Reverse-Proxys stehen in `relay/README.md`.

Protokollversion 2 ermöglicht den Betrieb auf anderen Rechnern: Lauschen auf anderen Adressen (`--bind`) mit eigenem
TLS-Zertifikat oder hinter einem Reverse-Proxy (`--trusted-proxy`, `--base-path`, `--host`), Benutzerkonten (`--users`,
PBKDF2-SHA256-Hashes, angelegt mit `--add-user`, erlaubte Ziele je Konto), Sitzungen (`POST /auth`, gleitender Ablauf),
Begrenzung fehlgeschlagener Anmeldungen und Anmeldung durch den Reverse-Proxy (`--proxy-user-header`). Zugangsdaten
werden nur über TLS oder vom eigenen Rechner angenommen. Beide Implementierungen verwenden dasselbe Format der
Kontendatei und bestehen `tests/relay/test_auth.py`. Das PowerShell-Relay hält Sitzungen und Fehlversuche in
synchronisierten Hashtabellen, die alle Runspaces der Verbindungen teilen, und liest die Browserseite eines Tunnels
asynchron, damit es auch über einen `SslStream` funktioniert.

`shared/js/relay.js` nimmt `{ url, token, user, password, allowInsecure }` (`Suite.relay.config`): Mit Benutzername
meldet es sich an, merkt sich die Sitzung je Relay und Zugangsdaten und meldet sich einmal neu an, wenn das Relay
`invalid token` oder `session expired` antwortet. Zugangsdaten an `http://`-Adressen anderer Rechner sendet es nur mit
`allowInsecure`. Das Formular der Relay-Einstellungen (`appdata.js` `RelayFields`) bietet die Anmeldungen Token,
Benutzername und Passwort sowie Reverse-Proxy / Client-Zertifikat; `data.relayConfigured()` sagt den Anwendungen, ob die
Einstellungen vollständig sind. Die Anwendungen, die das Relay verwenden, erlauben `connect-src http: https: ws: wss:`,
damit das Relay auf jedem Rechner laufen kann.

## Tests

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium firefox
python3 build.py
.venv/bin/pytest
```

Die Tests öffnen die gebauten HTML-Dateien über `file://` in Chromium und Firefox. Sie prüfen, dass die Seiten keine
Netzwerkanfragen stellen und keine Konsolenfehler erzeugen. Gemeinsame Module werden über das Testbed
`testbeds/shared` getestet; der Dateizugriff mit der File System Access API verwendet Platzhalter für die
Dateiauswahl, die auf dem Origin Private File System beruhen (über http ausgeliefert). Die Zusammenarbeit mit anderen
Programmen prüfen pykeepass, openpyxl, python-docx, python-pptx, nbformat, LibreOffice und ein OpenSSH-Server.

`pytest --mobile` führt alle Browsertests auf einem Smartphone-Bildschirm aus (393 × 851 CSS-Pixel, Skalierung 2,75,
Touch; Chromium emuliert mit `is_mobile` zusätzlich einen mobilen Browser): die Fixture `browser` umhüllt `new_context`, sodass
jeder Kontext diese Optionen erhält, sofern ein Test keinen eigenen Viewport setzt (`tests/helpers/devices.py`). Die Tests
verhalten sich dann wie ein Smartphone-Benutzer: vor einer Aktion (oder `expect(...).to_be_visible()`) auf ein Element, das
existiert, aber verborgen ist, werden die Navigationsschaltflächen (☰/Bereiche, Folien, ‹ Gruppen, ‹ Einträge, ←, Reiter
Medien/Eigenschaften) angetippt, bis es sichtbar ist; vor einer Aktion auf ein Element, das eine offene Schublade oder ihre
Abdunkelung verdeckt, und vor direkten Mauseingaben an einer verdeckten Stelle wird die Schublade durch Tippen auf die
Abdunkelung geschlossen. Elemente, die keine sichtbare Schaltfläche zeigt, schlagen weiterhin fehl. Führen Sie die Tests
einmal normal und einmal mit `--mobile` aus.

`SUITE_DIST=<Verzeichnis>` lässt `build.py` die Apps in ein anderes Verzeichnis schreiben (auch die Übersicht bettet die Apps
von dort ein), und die Tests öffnen sie von dort – so lassen sich Änderungen bauen und testen, während ein anderer Testlauf
`dist/` verwendet.

### Härtung, Fuzzing und Konformität

Drei Testordner prüfen Dateien, die nicht aus der Suite selbst stammen:

- `tests/security/` – **bösartige Dateien**: Jede App öffnet Dateien, deren Texte, Namen, Links, Metadaten und Markup
  Nutzlasten tragen (`tests/helpers/hostile.py`: `<script>`, Ereignis-Handler, `javascript:`-URLs, `srcdoc`-Rahmen, SVG mit
  Skripten, mXSS-Formen). Eine ausgeführte Nutzlast setzt `top.__pwned`; `assert_safe()` durchsucht zusätzlich die Seite und
  jeden Rahmen, der im Origin der App Skripte ausführen kann, nach Ereignis-Handlern, Skripten und `javascript:`-URLs einer
  Nutzlast (ein Dokument, dessen Content Security Policy Inline-Skripte sperrt, ist wirkungslos und wird übersprungen).
  PDFs mit JavaScript, Vorschauen im Archivmanager, Drucken, Vorführen in einem neuen Fenster und Exporte sind ebenfalls
  abgedeckt. Web-Folien müssen Skripte sperren, solange der Benutzer sie nicht erlaubt hat (`test_web_slides_trusted_scripts`).
  Die Shell verweigert in jeder App Klicks auf `javascript:`/`vbscript:`-Links und solche URLs in `window.open`, gleich welche
  Komponente (Univer, Betrachter) einen Link aus einer Datei öffnet (`test_script_links_are_refused`).
- `tests/robustness/test_fuzz.py` – **Fuzzing der Dateileser**: Ausgangsdateien jedes Formats, das die Apps öffnen, werden mit
  anderer Software erzeugt (`tests/helpers/corpus.py`: python-docx, openpyxl, python-pptx, LibreOffice für ODT/ODS, py7zr,
  pykeepass, SQLite, Pillow, handgeschriebenes PDF, iCalendar, E-Mail, HAR, Postman, OpenAPI, …). `tests/helpers/fuzz.py`
  erzeugt deterministische Mutanten: auf Byte-Ebene (Abschneiden, Bitfehler, überschriebene, eingefügte, gelöschte und
  wiederholte Bereiche, Extremwerte), auf Text-Ebene (Störzeichen, entfernte/verdoppelte/vertauschte Zeilen, unausgeglichene
  Klammern, eine Zeile mit 200 000 Zeichen, tiefe Verschachtelung) und auf Container-Ebene (ein Teil in einem ZIP wird
  verändert, entfernt oder verdoppelt und das Archiv mit gültigen Prüfsummen neu gebaut). Jede App öffnet die Mutanten
  nacheinander; es darf keine nicht abgefangene Ausnahme und keine unbehandelte Ablehnung auftreten, die Seite muss
  ansprechbar bleiben, und danach muss sich die intakte Datei öffnen lassen. `FUZZ_COUNT` (Standard 12) und `FUZZ_SEED`
  ändern Anzahl und Auswahl der Mutanten; fehlschlagende Mutanten werden in den `tmp_path` des Tests geschrieben.
- `tests/conformance/test_formats.py` – **Rundreisen, geprüft von anderer Software**: Eine App öffnet eine von anderer Software
  erzeugte Datei, speichert sie in jedem Format, das sie schreibt, und LibreOffice (Umwandlung in Text, CSV, PDF), 7-Zip und
  unzip, ffprobe, pdfinfo/pdftotext, xmllint, SQLite (`integrity_check`), python-docx, openpyxl, python-pptx, icalendar,
  pykeepass, nbformat, Pillow, psd-tools und pypdf lesen das Ergebnis; Texte, Werte, Formeln, Einträge und Termine müssen
  erhalten bleiben. Text- und Hex-Editor müssen unveränderte Dateien Byte für Byte gleich speichern (Kodierungen, BOM,
  Zeilenenden).

Fuzzing und Konformität laufen nur im Desktop-Layout (`--mobile` überspringt sie).

### Wiederherstellungskopien (Autosave)

`shared/js/autosave.js`: Apps rufen `Suite.autosave.register({ app, save, restore })` auf; `save()` liefert eine strukturiert
klonbare Momentaufnahme (oder null), die in IndexedDB `suite-autosave` gespeichert wird (ein Datensatz je App, funktioniert unter
`file://` in Chromium und Firefox; Datei-Handles und Blobs bleiben erhalten). `Suite.shell.setDirty(true)` plant eine Kopie
(Intervall 15 s, in Tests `localStorage['suite.autosave.interval']`), `visibilitychange` auf verborgen speichert sofort;
`setDirty(false)` löscht sie, außer eine gefundene Kopie wartet noch auf die Entscheidung des Benutzers. Beim Start bietet ein
Banner (`Suite.shell.banner(Meldung, Aktionen)`) Wiederherstellen/Verwerfen an; das Wiederherstellen speichert eine neue Kopie und
markiert die App als geändert. Momentaufnahmen über 64 MB werden übersprungen. Je App: Texteditor (geänderte Dokumente mit Handles
und gespeichertem Text), Hex-Editor (Bytes), Diagramm (draw.io-XML), Bildbearbeitung (OpenRaster), Tabellenkalkulation und Dokument
(Univer-Momentaufnahmen), Präsentation und Web-Folien (Foliensatz-Objekte), Notebook (ipynb), Audio-Editor (Projektdatei),
Video-Editor (Projekt und Medien bis 48 MB), Kalender (iCalendar-Texte geänderter Kalender), Datenbankwerkzeug (SQLite-Exporte
geänderter Datenbanken), HTTP-Analysator (Postman-Sammlung), Archiv (das mit Stufe 1 geschriebene Archiv, ohne Passwörter),
PDF-Betrachter (Bytes mit Formulardaten, Kommentaren und Seitenänderungen); nicht KeePass. Test: `tests/apps/test_autosave.py`
(je App: ändern, kopieren, zweiter Tab stellt wieder her, verwerfen).

### Übersicht der Tastenkürzel

Der Abschnitt „## Tastenkürzel“ (englisch „## Keyboard shortcuts“) von `docs/<Sprache>/apps/<App>.md` ist die einzige Quelle
der Tastenkürzel einer App: Tabellen `| `Strg+S` | Speichern |` (Alternativen `a` / `b`), gruppiert durch `### Gruppe`.
`build.py` ersetzt `<script type="application/json" data-shortcuts="<App>">` durch `#suite-shortcuts`
(`{"en": [{group, keys, text}], "de": [...]}`); der Build bricht ab, wenn eine App keine hat. Die Shell zeigt sie im ?-Dialog
in der aktuellen Sprache und öffnet ihn mit `F1` (und `?` außerhalb von Textfeldern). Test: `tests/apps/test_shortcuts.py`
(jede App, beide Sprachen, die Zeilenzahl entspricht der Dokumentation).

### Befehlspalette

Am Ende von `shared/js/shell.js` steht `Suite.palette`: Beim Öffnen sammelt sie die aktiven Schaltflächen, Reiter,
`a[href="#"]`-Links und die Optionen von `select`-Menüs in `#app` (nicht in Dialogen, nicht die Design-/Sprach-/Info-/⌘-Schaltflächen
der Shell), beschriftet über `title`/`aria-label` und Text, ohne Doppelte; `Suite.palette.register(provider)` fügt eigene Einträge
einer App hinzu. Ein Eintrag klickt das Element an (bzw. setzt den Wert des Menüs und löst `input`/`change` aus), nachdem die Palette
geschlossen und der Fokus zurückgegeben ist, sodass die App eine gewöhnliche Benutzeraktion sieht. Die Suche ignoriert
Groß-/Kleinschreibung und Akzente; alle Wörter müssen passen. Tasten: `Strg/Cmd+Umschalt+P` und `Strg/Cmd+Umschalt+Leertaste`
(Capture-Phase; Firefox reserviert die erste). Test: `tests/apps/test_palette.py` (jede App hat Einträge ohne die Shell-Schaltflächen;
Ausführen eines Menüeintrags und einer Schaltfläche; von der App registrierte Einträge; Kalender und Hex-Editor).

### Barrierefreiheit

`shared/js/shell.js` gibt Schaltflächen, die nur ein Symbol zeigen (`button`, `[role=button]`, `a`, `summary` mit `title` und ohne
Wort aus zwei Buchstaben im Text), ihren Titel als `aria-label`, über einen MutationObserver auf dem ganzen Dokument (auch Titel, die
sich mit der Sprache ändern); von einer App gesetzte Beschriftungen bleiben (die automatischen sind mit `data-auto-label` markiert).
`shared/css/suite.css` definiert `--suite-selected` (hell und dunkel) für ausgewählte Zeilen und Listeneinträge – Picos
`--pico-primary-focus` ist für Links und farbigen Text darauf zu dunkel (WCAG 4,5:1) – und einen `:focus-visible`-Rahmen für jedes
Element. Die Befehlspalette ist eine Combobox mit `aria-activedescendant`; Reiterleisten verwenden `role=tablist`/`tab` mit
`aria-selected` als Zeichenkette (Preact lässt `false` weg); CodeMirror-Editoren bekommen über `EditorView.contentAttributes` ein
`aria-label`. Test: `tests/apps/test_accessibility.py` führt axe-core (axe-playwright-python, Regeln für WCAG 2.1 A/AA) auf dem
Startbildschirm jeder App in hellem und dunklem Design und auf den Dialogen der Shell (Tastenkürzel, Palette) aus; die
Univer-Flächen und die Syntaxfarben von CodeMirror sind ausgenommen.

### Zuletzt verwendete Dateien und Fenstertitel

`Suite.files.remember(app, handle)` speichert bis zu zehn `FileSystemFileHandle`s je App in IndexedDB (`suite-recent-files`)
und löst ein `suite-recent`-Ereignis aus; `Suite.files.forget(app)` leert die Liste. `Suite.shell.Recent`
(`<${Suite.shell.Recent} app=… onOpen=… before=… />`) ist die gemeinsame Auswahlliste: sie lädt beim Ereignis neu, fragt
`before()` (ungespeicherte Änderungen), ruft `Suite.files.reopen` (Berechtigungsabfrage) und `onOpen({ file, handle })` auf.
Ohne File System Access API zeigt sie nichts. `Suite.shell.setFileName(name)` setzt den Fenstertitel auf „Name – App“.
Test: `tests/apps/test_recent_files.py` (elf Editoren, Dateiauswahl-Platzhalter auf dem Origin Private File System).

### Smartphone-Layout

Unter 760 px macht das Stylesheet der Shell die Werkzeugleiste der Kopfzeile (`.suite-header > nav`) zu einer eigenen,
waagrecht blätternden Zeile unter dem Titel. Seitenbereiche tragen die Klasse `suite-drawer` (feste Position, von
`--suite-top` bis unten, höchstens 20 rem breit) und werden über die eigene `open`-Klasse der App eingeblendet. `shell.js`
hält `--suite-top` an der Unterkante von Kopfzeile und Banner (ResizeObserver), denn die Kopfzeile bricht auf Smartphones in
zwei oder drei Zeilen um; Schubladen dürfen sie nie verdecken, damit die Schaltfläche, die eine Schublade geöffnet hat, sie
immer auch schließen kann. Apps zeigen neben einer offenen Schublade `Suite.shell.backdrop(onClose)`: eine Abdunkelung unter
der Schublade (auf breiten Bildschirmen verborgen), die sie beim Tippen schließt. Meldungen (Toasts) ignorieren den Zeiger und
blockieren daher nie Schaltflächen.

## Dokumentation

Die Dokumentation wird in Markdown in `docs/en/` und `docs/de/` geschrieben. `tools/build_docs.py` wandelt sie in
das Confluence-Speicherformat in `docs/confluence/` um (Codeblöcke werden Code-Makros, Hinweise werden Info- und
Warnungs-Makros, Links zwischen den Dokumenten werden Seitenlinks). `tools/build_docs.py --check` schlägt fehl, wenn die
erzeugten Dateien veraltet sind.
