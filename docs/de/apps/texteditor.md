# Texteditor

Der Texteditor (`texteditor.html`) bearbeitet Textdateien und Quellcode: mehrere Dateien in Registerkarten,
Syntaxhervorhebung für mehr als 40 Sprachen, Suchen und Ersetzen, mehrere Cursor sowie Kontrolle über Kodierung und
Zeilenenden.

## Dateien öffnen und anlegen

- **Öffnen** (`Strg+O`) öffnet eine oder mehrere Dateien; Sie können Dateien auch in das Fenster ziehen.
- **Neu** (`Alt+N`) legt ein leeres Dokument an.
- **Zuletzt** (Chrome/Edge am Desktop) öffnet zuletzt verwendete Dateien erneut.

Jede Datei öffnet sich in einer eigenen Registerkarte. Ein Punkt (●) zeigt ungespeicherte Änderungen. Schließen Sie
eine Registerkarte mit × oder `Alt+W`; bei ungespeicherten Änderungen fragt der Editor vorher nach. Mit der Tastatur gelangen Sie mit
`Tab` zu einer Registerkarte; `Eingabe` zeigt sie, `Entf` schließt sie.

## Speichern

- **Speichern** (`Strg+S`) schreibt die Datei. In Chrome/Edge am Desktop wird die geöffnete Datei direkt geändert; in
  Firefox und unter Android wird die Datei heruntergeladen – ersetzen Sie die ursprüngliche Datei damit.
- **Speichern unter** (`Strg+Umschalt+S`) speichert unter einem neuen Namen. Neue Dokumente werden immer mit
  „Speichern unter“ gespeichert.

## Bearbeiten

| Funktion | Tasten |
|---|---|
| Suchen / Ersetzen (auch mit regulären Ausdrücken) | `Strg+F` oder 🔍 |
| Gehe zu Zeile | `Strg+G` oder ↧ |
| Cursor hinzufügen | `Strg+Klick` |
| Spalte von Cursorn (Rechteckauswahl) | `Alt+Ziehen` mit der Maus |
| Nächstes Vorkommen des Wortes auswählen | `Strg+D` |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` oder `Strg+Umschalt+Z` |
| Auswahl einrücken / ausrücken | `Tab` / `Umschalt+Tab` |
| Auskommentieren / einkommentieren | `Strg+/` |

Mit mehreren Cursorn geschieht alles, was Sie tippen, löschen oder einfügen, an jedem Cursor. `Esc` kehrt zu einem
Cursor zurück.

Die Schaltflächen ↩ (Zeilenumbruch), · (Leerzeichen und Tabulatoren anzeigen), A− und A+ (Schriftgröße) ändern die
Ansicht; der Editor merkt sich diese Einstellungen.

Jedes Dokument hat einen eigenen Verlauf: ↶ und ↷ in der Werkzeugleiste oder `Strg+Z` und `Strg+Y` / `Strg+Umschalt+Z`.

**Rechtschreibung:** Ist im Auswahlfeld **ABC** der Kopfzeile eine Sprache gewählt, werden unbekannte Wörter unterstrichen – in
reinem Text und Markdown überall, in Programmcode nur in Kommentaren und Zeichenketten; ein Rechtsklick auf ein Wort zeigt
Vorschläge ([Rechtschreibung](../benutzerhandbuch.md#rechtschreibung)).

## Geteilte Ansicht

**◫** zeigt das aktuelle Dokument ein zweites Mal neben dem ersten (am Smartphone untereinander), etwa um den Anfang einer langen
Datei zu sehen, während man ihr Ende bearbeitet. Beide Ansichten bearbeiten denselben Text und teilen einen Rückgängig-Verlauf; die
zweite Ansicht folgt dem aktiven Reiter. Erneut ◫ schließt sie.

## In Dateien suchen

**🔍🗂** (`Strg+Umschalt+F`) durchsucht alle geöffneten Dokumente auf einmal: Treffer werden je Datei mit Zeile und Spalte
aufgelistet; ein Klick öffnet das Dokument und markiert den Treffer. **Aa** beachtet Groß-/Kleinschreibung, **.\*** behandelt den
Text als regulären Ausdruck. In Chrome und Edge durchsucht **📁 Ordner…** stattdessen einen Ordner auf Ihrem Computer samt
Unterordnern (ohne `.git`, `node_modules`, Binärdateien und Dateien über 5 MB); ein Klick auf einen Treffer öffnet diese Datei.
Höchstens 2000 Treffer werden aufgelistet.

## Vergleichen

**⇔** vergleicht das aktuelle Dokument mit einem anderen geöffneten Dokument oder einer Datei. Auf breiten Bildschirmen stehen
beide Texte nebeneinander – links der andere Text (schreibgeschützt), rechts das aktuelle Dokument –, geänderte Zeilen und Wörter
sind hervorgehoben und gleiche Teile ausgerichtet; **→** dazwischen übernimmt eine Änderung des linken Textes ins Dokument. Am
Smartphone zeigt eine Ansicht die gelöschten Zeilen im Text mit **Accept**/**Reject** je Änderung. **↑**/**↓** springen zwischen den
Unterschieden; **Fertig** (oder erneut ⇔) beendet den Vergleich, Änderungen in der Zwischenzeit sind ein Rückgängig-Schritt.

## Werkzeuge

**🛠 Werkzeuge** in der Werkzeugleiste ändert den ausgewählten Text oder – ohne Auswahl – das ganze Dokument. Jedes
Werkzeug lässt sich mit `Strg+Z` rückgängig machen.

| Gruppe | Werkzeuge |
|---|---|
| Zeilen | sortieren A→Z oder Z→A (Zahlen in natürlicher Reihenfolge: 9 vor 10; Groß-/Kleinschreibung egal), nach Länge sortieren, Reihenfolge umkehren, doppelte Zeilen entfernen, leere Zeilen entfernen, Leerzeichen am Ende oder an beiden Enden entfernen, Zeilen verbinden |
| Groß/klein | GROSSBUCHSTABEN, kleinbuchstaben, Wörter Groß Beginnen, gROSS/kLEIN uMKEHREN |
| Kodieren / dekodieren | Base64 (UTF-8), URL-Kodierung (Prozentkodierung), HTML-Entitäten |
| Formatieren | JSON formatieren (einrücken) oder verkleinern, XML formatieren |

Zeilenwerkzeuge arbeiten immer mit ganzen Zeilen: denen, die die Auswahl berührt. Ungültige Eingaben (etwa fehlerhaftes JSON)
zeigen eine Meldung und lassen den Text unverändert.

## Statusleiste

Die Statusleiste zeigt die Cursorposition (Zeile und Spalte), die Länge der Auswahl und die Anzahl der Cursor. Außerdem
können Sie dort ändern:

- **Sprache** der Syntaxhervorhebung (wird am Dateinamen erkannt).
- **Kodierung** beim Speichern: UTF-8 (wahlweise mit BOM), UTF-16 LE/BE oder Windows-1252. Beim Öffnen wird die
  Kodierung automatisch erkannt. Wurde eine Datei falsch erkannt, liest **Neu laden mit Kodierung** sie mit einer
  anderen Kodierung ein (Chrome/Edge am Desktop).
- **Zeilenenden** beim Speichern: LF (Linux, macOS), CRLF (Windows) oder CR.

> **Hinweis:** Windows-1252 kann nicht alle Zeichen speichern. Der Editor warnt, bevor er solche Zeichen durch „?“ ersetzt.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Alt+N` | Neues Dokument |
| `Alt+W` | Dokument schließen |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+F` | Suchen und ersetzen |
| `Strg+Umschalt+F` | In allen geöffneten Dateien suchen |
| `Strg+G` | Gehe zu Zeile |
| `Strg+D` | Nächstes Vorkommen des Wortes auswählen |
| `Strg+Klick` | Cursor hinzufügen |
| `Alt+Ziehen` | Spalte von Cursorn (Rechteckauswahl) |
| `Esc` | Zurück zu einem Cursor |
| `Tab` / `Umschalt+Tab` | Einrücken / ausrücken |
| `Strg+/` | Auskommentieren / einkommentieren |
| `Strg+Umschalt+[` / `Strg+Umschalt+]` | Block falten / entfalten |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Werkzeugleiste lässt sich seitlich verschieben. Tippen Sie auf den Text, um die Tastatur einzublenden. Mehrere
Cursor mit `Alt+Ziehen` brauchen Maus und Tastatur.
