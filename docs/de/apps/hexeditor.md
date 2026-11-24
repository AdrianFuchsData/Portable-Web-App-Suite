# Hex-Editor

Der Hex-Editor (`hexeditor.html`) zeigt und bearbeitet die Bytes beliebiger Dateien: hexadezimale und Textansicht,
Überschreib- und Einfügemodus, Suche nach Bytefolgen und Text, ein Dateninspektor sowie Rückgängig/Wiederholen, mit
mehreren Dateien in Tabs. Er kommt mit Dateien von mehreren hundert Megabyte zurecht; gezeichnet werden nur die sichtbaren
Zeilen.

## Öffnen, anlegen und speichern

- **Öffnen** (`Strg+O`) öffnet eine oder mehrere Dateien; Sie können Dateien auch in das Fenster ziehen. **Neu** beginnt
  eine leere Datei.
- Jede Datei öffnet sich in einem eigenen **Tab**; ein Punkt (●) am Tab zeigt ungespeicherte Änderungen. Jeder Tab behält
  seine Cursorposition, Auswahl, Rückgängig-Liste und seinen Vergleich. Schließen Sie einen Tab mit × oder `Alt+W`; bei
  ungespeicherten Änderungen wird vorher nachgefragt. Auch Dateien aus anderen Anwendungen (*Öffnen mit…*, etwa mehrere
  Dateien eines Archivs) öffnen sich in Tabs.
- **Speichern** (`Strg+S`) schreibt die Datei: in Chrome/Edge am Desktop direkt in die geöffnete Datei, in Firefox und
  unter Android als Download (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** speichert unter einem
  neuen Namen.

## Die Ansicht

Jede Zeile zeigt den Offset (hexadezimal), die Bytes hexadezimal und dieselben Bytes als Text (`.` für nicht druckbare
Bytes). **Bytes pro Zeile** wählt 8, 16 oder 32 Bytes oder passt sich der Fensterbreite an (Auto).

Das hervorgehobene Byte ist der Cursor. `Tab` wechselt zwischen der hexadezimalen und der Textspalte.

## Bearbeiten

| Funktion | Tasten |
|---|---|
| Cursor bewegen | Pfeiltasten, `Bild auf`/`Bild ab`, `Pos1`/`Ende` (Zeile), `Strg+Pos1`/`Strg+Ende` (Datei) |
| Auswählen | `Umschalt` + Bewegungstasten oder Ziehen mit der Maus; `Strg+A` wählt alles aus |
| Byte ändern | zwei hexadezimale Ziffern tippen (Hex-Spalte) oder ein Zeichen (Textspalte) |
| Überschreib- / Einfügemodus | `Einfg` oder die Modus-Schaltfläche |
| Bytes löschen | `Entf` (Byte unter dem Cursor oder Auswahl), `Rücktaste` (Byte vor dem Cursor oder Auswahl) |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Als Hex kopieren | `Strg+C` |
| Hexadezimale Bytes einfügen | `Strg+V` |

Tippen am Dateiende hängt Bytes an. Im Einfügemodus werden neue Bytes vor dem Cursor eingefügt.

## Suchen und Gehe zu

- **Suchen** (`Strg+F`, 🔍) sucht hexadezimale Bytes (zum Beispiel `DE AD BE EF`) oder Text (UTF-8). **Weiter** und
  **Zurück** springen zum nächsten Treffer; die Suche setzt am anderen Ende der Datei fort.
- **Gehe zu** (`Strg+G`, ↧) springt zu einem Offset, dezimal (`1024`) oder hexadezimal (`0x400`).

## Dateninspektor

Der Dateninspektor deutet die Bytes am Cursor: binär, Ganzzahlen mit und ohne Vorzeichen mit 8, 16, 32 und 64 Bit,
Gleitkommazahlen (32 und 64 Bit) und das UTF-8-Zeichen. **Little Endian** wechselt die Byte-Reihenfolge.

**Bytewert (hex)** schreibt die eingegebenen Bytes an den Cursor (zum Beispiel `FF` oder `48 65 6C`). So bearbeiten Sie
Bytes am einfachsten auf Smartphones und Tablets.

## Struktur

Der Reiter **Struktur** (neben dem Dateninspektor) zeigt den Aufbau einer Datei, wenn ihr Format bekannt ist: PNG, JPEG, GIF, BMP, WAV und
andere RIFF-Dateien, ZIP (auch Office-Dokumente, JAR, …), ELF (Linux-Programme und -Bibliotheken) und PE (Windows-`.exe` und -`.dll`). Jeder
Teil steht mit Offset (hex), Größe und Bedeutung in der Liste – etwa die Chunks eines PNG mit Breite, Höhe und Farbtyp, die Dateien eines ZIP
mit Verfahren und Größen, die Abschnitte eines Programms. Ein Klick auf einen Teil wählt seine Bytes aus; solange der Reiter offen ist,
sind die Teile in der Hex-Ansicht abwechselnd eingefärbt. Beschädigte Dateien werden gezeigt, so weit sie sich lesen lassen.

## Marken: Lesezeichen und eingefärbte Bereiche

`Strg+F2` setzt (oder entfernt) ein **Lesezeichen** auf dem Byte am Cursor – es erhält einen blauen Rahmen; `F2` und `Umschalt+F2` springen zur
nächsten und vorigen Marke. Um einen Teil der Datei **einzufärben**, wählen Sie ihn aus, öffnen den Reiter **Marken**, wählen eine Farbe, geben
wahlweise eine Bezeichnung ein (etwa „Kopf“) und klicken **Auswahl einfärben**. Der Reiter listet alle Marken der Datei mit Offset (und Länge);
ein Klick springt dorthin oder wählt den Bereich wieder aus, ✎ benennt um, × entfernt. Marken wandern mit, wenn Bytes eingefügt oder gelöscht
werden (und mit Rückgängig zurück); eine Marke, deren Bytes alle gelöscht sind, verschwindet. Jede geöffnete Datei hat eigene Marken; sie werden
nicht in der Datei gespeichert.

## Prüfsummen

**#** zeigt die Prüfsummen der Auswahl oder – ohne Auswahl – der ganzen Datei: CRC-32, Adler-32, MD5, SHA-1, SHA-256 und
SHA-512 (hexadezimal). ⧉ kopiert einen Wert, etwa um ihn mit einer veröffentlichten Prüfsumme zu vergleichen.

## Statistik

**📊** untersucht die Auswahl (oder die ganze Datei): die **Entropie** in Bit pro Byte (0 = immer dasselbe Byte, 8 = völlig zufällig) mit
einem Hinweis, was sie nahelegt – über 7,5 sind die Daten komprimiert oder verschlüsselt, Text liegt etwa bei 4 bis 5 –, den Anteil an
Null-Bytes und an druckbarem Text, ein **Histogramm**, wie oft jeder Bytewert 00–FF vorkommt (logarithmisch, um seltene Werte zu sehen), und
die häufigsten Werte. Bei größeren Daten zeigt eine Kurve die **Entropie entlang der Datei**: komprimierte oder verschlüsselte Teile fallen als
Plateaus nahe der gestrichelten Linie auf; ein Klick auf die Kurve springt dorthin.

## Zwei Dateien vergleichen

**⇆** öffnet eine zweite Datei und vergleicht sie Byte für Byte mit der aktuellen (an denselben Offsets). Ihre Bytes stehen
in einer zusätzlichen Spalte neben der Hex-Spalte (statt der Textspalte), beide scrollen gemeinsam, und abweichende Bytes
sind in beiden hervorgehoben. Die Leiste über der Ansicht zeigt die Zahl der Unterschiede; **↑** und **↓** springen zum
vorherigen/nächsten Unterschied. Bytes hinter dem Ende der kürzeren Datei zählen als Unterschiede. Bearbeiten aktualisiert
den Vergleich; **×** (oder erneut ⇆) beendet ihn.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Alt+W` | Datei (Tab) schließen |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+C` / `Strg+V` | Kopieren, einfügen |
| `Strg+A` | Alles auswählen |
| `0–9` / `A–F` | Hex-Ziffer eingeben (Hex-Spalte) |
| `Einfg` | Einfügen / Überschreiben |
| `Entf` / `Rücktaste` | Bytes löschen |
| `Tab` | Zwischen Hex- und Textspalte wechseln |

### Navigation

| Tasten | Funktion |
|---|---|
| `Strg+F` | Suchen |
| `Strg+G` | Gehe zu Adresse |
| `Strg+F2` | Lesezeichen ein/aus |
| `F2` / `Umschalt+F2` | Nächste / vorige Marke |
| `←` / `→` / `↑` / `↓` | Bewegen (mit Umschalt: auswählen) |
| `Bild↑` / `Bild↓` | Eine Seite nach oben / unten |
| `Pos1` / `Ende` | Anfang / Ende der Zeile |
| `Strg+Pos1` / `Strg+Ende` | Anfang / Ende der Datei |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Zeilen zeigen 8 Bytes, der Dateninspektor steht unter den Bytes. Tippen Sie auf ein Byte, um es auszuwählen, geben
Sie den neuen Wert unter **Bytewert (hex)** ein und tippen Sie auf **Setzen**.
