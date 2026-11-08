# Tabellenkalkulation

Die Tabellenkalkulation (`spreadsheet.html`) bearbeitet Arbeitsmappen wie Excel oder LibreOffice Calc: Zellen mit Werten und Formeln (mehr als 400
Funktionen), Formatierung, mehrere Blätter, Sortieren, Filter, verbundene Zellen, fixierte Zeilen und Spalten, Suchen und Ersetzen. Die
Bearbeitungskomponente ist Univer Sheets.

## Dateien

| Format | Öffnen | Speichern | Hinweise |
|---|---|---|---|
| Excel (`.xlsx`) | ja | ja | Werte, Formeln, Formate, Zahlenformate, verbundene Zellen, Spaltenbreiten, Zeilenhöhen, fixierte Bereiche, Zeilen- und Spaltengruppen, Registerfarben, ausgeblendete Blätter, bedingte Formatierung, Datenüberprüfung, Filter, Hyperlinks, Notizen, Bilder |
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

**Bilder** schweben über den Zellen: Einfügen über das Menüband (**Einfügen** → Bild), Ziehen verschiebt sie, Ziehen an den Griffen ändert die
Größe. In `.xlsx`-Dateien behalten sie Zelle, Versatz und Größe (auch Bilder aus anderen Programmen, darunter Dateien von Pythons openpyxl).

**📐 Diagramm** in der Werkzeugleiste öffnet ein leeres Diagramm im Diagramm-Editor (ein neues Fenster oder ein neuer Tab); das erste
**Speichern** dort setzt das Diagramm als Bild an die gewählte Zelle, spätere Speichervorgänge aktualisieren es. Ist ein Diagrammbild
ausgewählt (ein Klick darauf), öffnet **📐 Diagramm bearbeiten** es wieder im Diagramm-Editor; ein aktualisiertes Bild behält Stelle und
Maßstab. Das Diagramm steckt im Bild (ein PNG mit der draw.io-Datei) und bleibt daher in der `.xlsx`-Datei bearbeitbar; Excel zeigt das Bild.

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

### Suchen und ersetzen

`Strg+F` öffnet das Suchfeld oben rechts: Text eingeben, ‹ › (oder `Enter`) gehen zum vorigen und nächsten Treffer, und das Feld zeigt, der wievielte
von wie vielen Treffern markiert ist. **Erweitertes Suchen & Ersetzen** (oder `Strg+H`) ergänzt den Ersetzungstext und die Optionen: **Suchbereich**
*Aktuelles Blatt* oder *Arbeitsmappe* (alle Blätter: die Treffer der anderen Blätter werden der Reihe nach angesprungen, dabei wechselt das Blatt), die
Suchrichtung (nach Zeilen oder Spalten), **Suchen nach** Wert oder Formel, *Groß-/Kleinschreibung beachten* und *Ganze Zelle vergleichen*.
**Ersetzen** ersetzt den aktuellen Treffer, **Alle ersetzen** nach einer Rückfrage alle Treffer im Bereich.

### Zeilen und Spalten fixieren

**Ansicht → Einfrieren** (die erste Schaltfläche des Reiters) hält Zeilen oder Spalten fest, während der Rest scrollt: *Erste Zeile einfrieren*,
*Erste Spalte einfrieren*, bis zur Zeile oder Spalte der markierten Zelle oder beides (*Bis zur aktiven Zelle einfrieren*); dasselbe Menü hebt es
wieder auf. Die Kontextmenüs der Zeilen- und Spaltenköpfe haben dieselben Einträge. Fixierte Bereiche bleiben in Excel-Dateien erhalten.

### Duplikate entfernen und Text aufteilen

**Daten → Bereinigen** (auf einem Smartphone im ⋮-Menü des Reiters) enthält zwei Werkzeuge:

- **Duplikate entfernen…** arbeitet auf dem markierten Bereich oder, wenn nur eine Zelle markiert ist, auf der Tabelle um sie herum. Enthält die erste
  Zeile nur Text, gilt sie als Überschrift (im Dialog abschaltbar). Kreuzen Sie die Spalten an, die verglichen werden: Eine Zeile ist doppelt, wenn ihre
  Werte in diesen Spalten denen einer früheren Zeile gleichen – Groß- und Kleinschreibung sowie Leerzeichen am Anfang oder Ende zählen nicht. Die
  Duplikate werden entfernt, die Zeilen darunter rücken innerhalb des Bereichs nach oben (Zellen außerhalb bleiben, wo sie sind); eine Meldung nennt die
  Zahl der entfernten Zeilen.
- **Text in Spalten…** teilt die markierten Zellen einer Spalte (oder, bei einer Zelle, die Spalte von dort nach unten) an einem Trennzeichen auf: Komma,
  Strichpunkt, Tabulator, Leerzeichen oder ein anderes Zeichen; das wahrscheinlichste ist vorgewählt, und die Vorschau zeigt das Ergebnis. Text in
  Anführungszeichen darf das Trennzeichen enthalten. Wie beim CSV-Import werden Zahlen (mit dem gewählten Dezimaltrennzeichen) und Datumswerte erkannt,
  oder alles bleibt Text. *Aufeinanderfolgende Trennzeichen als eines behandeln* überspringt leere Felder, z. B. bei Text, der mit mehreren Leerzeichen
  ausgerichtet ist. Die Teile kommen in die Zellen rechts davon; sind diese nicht leer, fragt die Anwendung, bevor sie sie ersetzt.

Beides lässt sich in einem Schritt rückgängig machen (`Strg+Z`).

### Zeilen und Spalten gruppieren

**Daten → Gruppieren** gruppiert die markierten Zeilen oder Spalten wie die Gliederung von Excel (auf einem Smartphone steht die Schaltfläche im ⋮-Menü des Reiters):

- **Zeilen gruppieren** / **Spalten gruppieren** fassen die markierten Zeilen (Spalten) zu einer Gruppe zusammen, oder eine Ebene tiefer, wenn sie
  schon in einer sind (bis zu sieben Ebenen); **Zeilengruppierung aufheben** / **Spaltengruppierung aufheben** nehmen sie eine Ebene heraus.
- **Details ausblenden** blendet die Gruppe an der markierten Zelle aus (die Markierung wandert in die Zeile darunter bzw. die Spalte rechts davon),
  **Details einblenden** zeigt sie wieder – auch von dieser Zeile oder Spalte aus, wo die Markierung nach dem Ausblenden steht.
- **Alle Gruppen des Blatts entfernen** entfernt die Gruppen und zeigt ihre Zeilen und Spalten.

Die Zeilen- und Spaltenköpfe zeigen die Gruppen: `│` für jede Ebene vor einer gruppierten Zeile oder Spalte, ⊟ an der Zeile unter einer Gruppe (der
Spalte rechts davon), solange sie angezeigt wird, und ⊞, solange sie ausgeblendet ist. Die Zeichen sind nur Markierungen: Ein- und ausgeblendet wird
über das Menü. Gruppen wandern mit, wenn Zeilen oder Spalten eingefügt oder gelöscht werden, lassen sich rückgängig machen (`Strg+Z`) und bleiben in
Excel-Dateien erhalten (Gliederungsebenen und ausgeblendete Zeilen von Excel); LibreOffice zeigt sie als Gruppen.

### Notizen

Rechtsklick auf eine Zelle und **Notiz hinzufügen** hängt ihr eine Notiz (einen Kommentar) an; Text in das Feld tippen und woanders hinklicken. Eine
Zelle mit Notiz hat eine kleine Markierung in der rechten oberen Ecke, und Zeigen auf die Zelle zeigt die Notiz. Das Kontextmenü einer solchen Zelle
bearbeitet sie (**Notiz anzeigen/ausblenden** hält sie offen, **Notiz löschen** entfernt sie). Notizen wandern mit ihren Zellen und lassen sich
rückgängig machen.

Notizen sind die Notizen von Excel (in älteren Excel-Versionen: Kommentare; LibreOffice: Kommentare): Sie werden aus Excel-Dateien gelesen und in sie
geschrieben, auch an leeren Zellen, mit ihrem Text (Formatierung des Texts und Größe des Felds bleiben nicht erhalten, Notizen werden ausgeblendet
gespeichert). In `.ods`-Dateien bleiben die Notizen von Zellen mit Inhalt erhalten. Die neueren Unterhaltungs-Kommentare von Excel werden nicht
angezeigt.

### Hyperlinks

**Einfügen → 🔗** (oder `Strg+K`) fügt der markierten Zelle einen Link hinzu: die **Beschriftung** (der Text, den die Zelle zeigt), einen
optionalen **Hinweistext** und den **Typ** – eine Web- oder E-Mail-Adresse (`https://…`, `mailto:…`), einen **Bereich** oder ein
**Arbeitsblatt** der Mappe oder einen **definierten Namen**. Zeigen auf (oder Tippen auf) eine Zelle mit Link zeigt ein kleines Feld, um den Link zu öffnen,
zu kopieren, zu bearbeiten oder aufzuheben. Webadressen öffnen sich in einem neuen Tab; Links in die Mappe markieren das Ziel.

Links werden aus Excel-Dateien gelesen und in sie geschrieben (auch Links auf Zellen anderer Blätter, denen LibreOffice und Excel folgen), und in
`.ods`-Dateien bleiben die Web- und E-Mail-Links erhalten. Ein Link auf einen definierten Namen wird als Link auf den Bereich des Namens
gespeichert. Excel kennt einen Link je Zelle: Hat eine Zelle mehrere Links, wird der erste gespeichert. Zellen mit Link werden in der
Linkfarbe von Excel (blau, unterstrichen) gespeichert, wenn sie keine eigene Schriftfarbe haben.

### Sortieren und Filtern

Im Reiter *Daten* schaltet die Schaltfläche **Filter** einen Autofilter für den markierten Bereich (oder die Tabelle um die markierte
Zelle) ein und wieder aus. Die erste Zeile bekommt Filterschaltflächen: Eine Spalte wird **nach Werten** gefiltert (eine Liste mit
Kontrollkästchen und Suchfeld) oder **nach Bedingung** (gleich, ungleich, größer/kleiner als, enthält, beginnt/endet mit, …). Zeilen, die
nicht passen, bleiben ausgeblendet, bis der Filter geändert oder ausgeschaltet wird.

Das Menü **Sortieren** daneben sortiert den markierten Bereich nach seiner ersten Spalte (**Aufsteigend**, **Absteigend**);
**Erweitert aufsteigend** und **Erweitert absteigend** sortieren die ganze Tabelle um die Markierung, sodass Zeilen zusammenbleiben. Die
**benutzerdefinierte Sortierung** sortiert nach mehreren Spalten nacheinander, jede auf- oder absteigend, mit oder ohne Kopfzeile. Das
Kontextmenü einer Zelle hat dieselben Einträge unter *Sortieren*.

Filter werden mit ihren Kriterien aus Excel-Dateien gelesen und in sie geschrieben (Filter nach Werten und nach Bedingungen; Farb-, Top-10-
und Datumsfilter von Excel werden nicht übernommen), und LibreOffice und Excel zeigen sie als Filter. ODS und CSV behalten nur die Werte.

## Diagramme

Markieren Sie eine Tabelle (Namen in der ersten Zeile und Spalte, Zahlen darunter; eine einzelne Zelle steht für die Tabelle um sie herum) und
klicken Sie **📊 Diagramm**: Daneben erscheint ein Säulendiagramm daraus. Klicken Sie das Diagramm und dann **📊 Diagramm bearbeiten**, um es im
Diagrammdialog zu ändern:

- **Art** (Säulen, Balken, Linien, Flächen, Kreis, Ring, Punkte), **Titel**, **Legende** (rechts, unten, keine), **gestapelt**, **Werte im Diagramm**;
- die **Daten** – Namen, Kategorien, Werte und die Farbe jeder Reihe –, mit Zeilen und Reihen zum Hinzufügen und Entfernen; die Vorschau folgt jeder
  Änderung;
- **Aus den Zellen aktualisieren** übernimmt die aktuellen Werte der Zellen, aus denen das Diagramm gemacht wurde (Art, Titel und Farben bleiben).

Ein Diagramm ist ein Bild, das seine Daten mitträgt: Es wird in der `.xlsx`-Datei als Bild gespeichert (Excel und LibreOffice zeigen es) und bleibt
bearbeitbar, wenn die Datei hier wieder geöffnet wird. Diagramme von Excel- und LibreOffice-Dateien werden als solche Bilder an ihrer Stelle gezeigt –
mit den Daten der Datei – und als Bilder gespeichert (nicht als Excel-Diagramme).

## Drucken und PDF

**🖨 Drucken / PDF** (`Strg+P`) druckt die Zellen mit ihren Formaten, Rahmen, verbundenen Zellen, Spaltenbreiten und Zeilenhöhen:

- **Drucken:** die Markierung (wenn mehr als eine Zelle markiert ist), dieses Blatt oder alle Blätter (jedes beginnt auf einer neuen
  Seite; ausgeblendete Blätter, Zeilen und Spalten entfallen). Ein Blatt druckt die Zellen mit Inhalt, Hintergrund oder Rahmen.
- **Papier** (A4 oder Letter) und **Ausrichtung** (Hoch- oder Querformat).
- **Größe:** tatsächliche Größe, **alle Spalten auf einer Seite** (Standard: breitere Tabellen werden verkleinert) oder **Blatt auf
  einer Seite**.
- **Zeilen, die oben auf jeder Seite wiederholt werden:** die ersten Zeilen des Blatts, etwa die Überschriftenzeile. Fixierte Zeilen
  werden vorgeschlagen.
- **Gitternetzlinien** zwischen allen Zellen.

Danach folgt der Druckdialog des Browsers: Wählen Sie einen Drucker oder **Als PDF speichern** für eine PDF-Datei. Papier, Ausrichtung,
Größe und Gitternetzlinien werden gemerkt. Bilder und Diagramme auf dem Blatt und die Farben der bedingten Formatierung werden nicht
gedruckt; die Einstellungen werden nicht in der Datei gespeichert.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Strg+P` | Drucken / PDF |

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
| `Strg+F` | Suchen |
| `Strg+H` | Suchen und ersetzen |
| `Strg+K` | Link einfügen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Tabelle lässt sich ansehen, verschieben und bearbeiten; das Menüband lässt sich seitlich verschieben. Für größere Änderungen ist ein größerer
Bildschirm angenehmer.
