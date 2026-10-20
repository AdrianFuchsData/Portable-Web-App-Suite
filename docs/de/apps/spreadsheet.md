# Tabellenkalkulation

Die Tabellenkalkulation (`spreadsheet.html`) bearbeitet Arbeitsmappen wie Excel oder LibreOffice Calc: Zellen mit Werten und Formeln (mehr als 400
Funktionen), Formatierung, mehrere Blätter, Sortieren, Filter, verbundene Zellen, fixierte Zeilen und Spalten, Suchen und Ersetzen. Die
Bearbeitungskomponente ist Univer Sheets.

## Dateien

| Format | Öffnen | Speichern | Hinweise |
|---|---|---|---|
| Excel (`.xlsx`) | ja | ja | Werte, Formeln, Formate, Zahlenformate, verbundene Zellen, Spaltenbreiten, Zeilenhöhen, fixierte Bereiche, Registerfarben, ausgeblendete Blätter, bedingte Formatierung, Datenüberprüfung |
| Excel mit Makros (`.xlsm`) | ja | als `.xlsx` | Makros können nicht erhalten werden |
| OpenDocument (`.ods`) | ja | ja | Werte, Formeln, verbundene Zellen (ohne Formatierung) |
| Excel 97–2003 (`.xls`) | ja | ja | Werte und Formeln (ohne Formatierung) |
| CSV, TSV (`.csv`, `.tsv`, `.txt`) | ja, mit Optionen | `.csv` | nur die Werte des ersten Blatts |
| Numbers, Flat-ODS | ja | – | |

- **Öffnen** (`Strg+O`) öffnet eine Datei; sie kann auch auf das Fenster gezogen werden. **Neu** beginnt eine leere Arbeitsmappe.
- **Speichern** (`Strg+S`) speichert im Format der Datei: in Chrome/Edge am Desktop direkt in die Datei, in Firefox und unter Android als
  Download (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** (`Strg+Umschalt+S`) fragt nach Name und Format.
- Der Dateiname in der Werkzeugleiste zeigt •, solange es ungespeicherte Änderungen gibt.

### CSV- und Textdateien importieren

Beim Öffnen einer `.csv`-, `.tsv`- oder `.txt`-Datei erscheinen die Importoptionen mit einer Vorschau der ersten Zeilen:

- **Kodierung**: wird automatisch erkannt (UTF-8 mit oder ohne BOM, UTF-16 mit BOM, sonst Windows-1252); wählen Sie eine
  andere, wenn Umlaute falsch aussehen.
- **Trennzeichen**: Komma, Strichpunkt, Tabulator oder senkrechter Strich; das wahrscheinlichste ist vorausgewählt.
- **Werte**: *Zahlen und Datumswerte erkennen* wandelt Zahlen (mit dem gewählten **Dezimaltrennzeichen**, `1,234.5` oder
  `1.234,5`, auch mit `%`), Datumswerte (`2026-10-16`, `16.10.2026`, mit oder ohne Uhrzeit) und `TRUE`/`FALSE` um. Zahlen mit
  führenden Nullen (Postleitzahlen, Telefonnummern) bleiben Text. *Alles als Text* übernimmt jede Zelle genau wie in der Datei.

Felder in Anführungszeichen dürfen Trennzeichen, Anführungszeichen (`""`) und Zeilenumbrüche enthalten. **Speichern** schreibt
die CSV-Datei wieder mit dem Trennzeichen, mit dem sie importiert wurde.

## Bearbeiten

Das Menüband über der Tabelle hat die Reiter **Start** (Zwischenablage, Schrift, Farben, Rahmen, Ausrichtung, Verbinden, Zahlenformate),
**Formeln** und **Ansicht**. Tippen Sie in eine Zelle und bestätigen Sie mit `Eingabe`; Formeln beginnen mit `=`, z. B. `=SUMME(B2:B10)`. Die
Bearbeitungsleiste zeigt und bearbeitet den Inhalt der gewählten Zelle. Die Leiste unten fügt Blätter hinzu (+) und wechselt zwischen ihnen; ein
Rechtsklick auf ein Blattregister benennt es um, färbt, blendet aus oder löscht es. Der Zoom steht rechts unten. Ein Rechtsklick auf Zellen,
Zeilen und Spalten öffnet weitere Befehle (Einfügen, Löschen, Sortieren, …).

Die üblichen Tastenkombinationen funktionieren: `Strg+C/X/V`, `Strg+Z/Y`, `Strg+B/I/U`, Pfeiltasten, `Tab`, `F2` zum Bearbeiten einer Zelle.

Die Sprache der Bearbeitungskomponente folgt der Sprachumschaltung der Suite, ebenso das dunkle Design.

Rückgängig und Wiederholen sind die ersten beiden Schaltflächen der Editor-Werkzeugleiste (auch `Strg+Z` und `Strg+Y`).

### Bedingte Formatierung und Datenüberprüfung

Die **bedingte Formatierung** (Reiter *Daten*, zweites Menü) färbt Zellen nach ihrem Wert: Zellen hervorheben
(größer/kleiner als, zwischen, Text enthält/beginnt/endet mit, Datumsangaben, obere/untere Werte, über/unter dem Durchschnitt, Duplikate,
eigene Formel), Farbskalen und Datenbalken. Die **Datenüberprüfung** (Reiter *Daten*, erstes Menü) schränkt Eingaben ein: eine Liste mit Auswahlfeld,
ganze oder Dezimalzahlen, Datumsangaben, Textlänge oder eine eigene Formel, mit Eingabehinweis und Fehlermeldung.

Beides wird aus Excel-Dateien gelesen und in sie geschrieben. Symbolsätze werden aus Excel-Dateien nicht übernommen; „Duplikate“ und
„eindeutige Werte“ werden als Formelregeln gespeichert, und Listen, die auf Bereiche der Mappe verweisen, bleiben Verweise.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+B` / `Strg+I` / `Strg+U` | Fett / kursiv / unterstrichen |
| `F2` | Zelle bearbeiten |
| `Eingabe` / `Tab` | Übernehmen und nach unten / rechts |
| `Entf` | Zellen leeren |
| `Strg+F` | Suchen und ersetzen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Tabelle lässt sich ansehen, verschieben und bearbeiten; das Menüband lässt sich seitlich verschieben. Für größere Änderungen ist ein größerer
Bildschirm angenehmer.
