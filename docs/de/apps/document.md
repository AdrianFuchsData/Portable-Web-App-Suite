# Textverarbeitung

Die Textverarbeitung (`document.html`) schreibt und bearbeitet Textdokumente wie Word oder LibreOffice Writer: Absätze und Überschriften, Schriften
und Farben, Ausrichtung und Abstände, Aufzählungen und nummerierte Listen, Tabellen, Bilder, Kopf- und Fußzeilen, Suchen und Ersetzen. Die
Bearbeitungskomponente ist Univer Docs.

## Dateien

| Format | Öffnen | Speichern | Hinweise |
|---|---|---|---|
| Word (`.docx`) | ja | ja | Seitengröße und Ränder, Formatvorlagen, Überschriften, Textformatierung, Listen, Tabellen, Bilder, Hyperlinks, Kopf- und Fußzeilen |
| OpenDocument (`.odt`, LibreOffice Writer) | ja (auch Vorlagen `.ott`) | ja | dasselbe wie bei Word; Fuß- und Endnoten werden ans Ende des Dokuments gesetzt |
| Word mit Makros (`.docm`), Vorlagen (`.dotx`) | ja | als `.docx` | Makros bleiben nicht erhalten; eine Vorlage wird ein neues Dokument |
| Text (`.txt`, `.md`) | ja | ja (`.txt`) | nur der Text; Formatierung, Tabellen und Bilder gehen verloren |
| Webseite (`.html`) | nein | ja | Text, Formatierung, Listen, Tabellen, Bilder und Links; kein Seitenlayout |
| PDF | nein | über **🖨** | siehe *Drucken und PDF* |

- **Öffnen** (`Strg+O`) öffnet eine Datei; sie kann auch auf das Fenster gezogen werden. **Neu** beginnt ein leeres Dokument.
- **Speichern** (`Strg+S`) speichert im Format der Datei: in Chrome/Edge am Desktop direkt in die Datei, in Firefox und unter Android als Download
  (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** (`Strg+Umschalt+S`) fragt nach Name und Format.
- Der Dateiname in der Werkzeugleiste zeigt •, solange es ungespeicherte Änderungen gibt.

### Drucken und PDF

**🖨** (`Strg+P`) druckt das Dokument mit seiner Seitengröße und seinen Rändern; wählen Sie *Als PDF speichern* (Chrome, Edge, Android) oder
*In Datei drucken* (Firefox) als Drucker, um ein PDF zu erhalten. Kopf- und Fußzeile des Dokuments wiederholen sich auf jeder Seite. Die
Seitenumbrüche setzt der Browser, sie können also von den Seiten im Editor abweichen; eingefügte Seitenumbrüche bleiben erhalten. Links sind
im PDF anklickbar, auch die Einträge eines Inhaltsverzeichnisses.

Dokumente aus Word und LibreOffice werden beim Öffnen umgewandelt; sehr komplexe Layouts (Textfelder, Spalten, Änderungsverfolgung, Kommentare)
können einfacher aussehen. Behalten Sie die ursprüngliche Datei, bis Sie das Ergebnis geprüft haben.

## Bearbeiten

Das Menüband hat die Reiter **Start** (Zwischenablage, fett/kursiv/unterstrichen/durchgestrichen, Hoch- und Tiefstellung, Absatzformat, Größe,
Schrift, Farben, Ausrichtung, Listen, Checklisten) und **Einfügen** (Tabellen, Bilder, Seitenumbrüche, Kopf- und Fußzeilen). Die üblichen
Tastenkombinationen funktionieren: `Strg+B/I/U`, `Strg+Z/Y`, `Strg+C/X/V`, `Strg+F` zum Suchen. Die Statusleiste zeigt die Wortanzahl und den Zoom.

Die Sprache der Bearbeitungskomponente folgt der Sprachumschaltung der Suite, ebenso das dunkle Design.

Rückgängig und Wiederholen sind die ersten beiden Schaltflächen der Editor-Werkzeugleiste (auch `Strg+Z` und `Strg+Y`).

### Inhaltsverzeichnis und Fußnoten

**📑 Inhalt** fügt am Absatz der Schreibmarke ein Inhaltsverzeichnis ein: die Überschriften (Absatzformate *Überschrift 1* bis
*Überschrift 5*), nach Ebene eingerückt. Nach Änderungen an den Überschriften genügt ein erneuter Klick, um das Verzeichnis an seiner Stelle zu
aktualisieren. In gespeicherten Word- und OpenDocument-Dateien sind die Einträge Links zu den Überschriften (Strg+Klick in Word, Klick in
LibreOffice); Seitenzahlen enthält das Verzeichnis nicht (der Editor kennt sie nicht) – Word und LibreOffice können bei Bedarf ein echtes
Verzeichnis mit Seitenzahlen einfügen.

### Rechtschreibung

**ABC✓** (`F7`) öffnet die Rechtschreibprüfung neben dem Dokument (am Smartphone darunter). Sie listet die unbekannten Wörter des
Dokumenttexts (Kopf- und Fußzeilen werden nicht geprüft); Wörter mit Ziffern, Wörter in Großbuchstaben (Abkürzungen), Web- und
Mailadressen werden übersprungen.

- Ein Klick auf ein Wort markiert es im Dokument, ein weiterer Klick springt zum nächsten Vorkommen. Die Liste zeigt Vorschläge: Ein
  Vorschlag ersetzt **alle** Vorkommen des Worts.
- **Ignorieren** überspringt das Wort, bis der Editor geschlossen wird; **Zum Wörterbuch hinzufügen** behält es dauerhaft im Browser
  (für alle Wörterbücher).
- **↻ Erneut prüfen** nach Änderungen am Text.

Englisch (USA) und Deutsch (Deutschland) sind eingebaut. Für andere Sprachen lädt **Wörterbuch laden…** ein Hunspell-Wörterbuch:
entweder die `.aff`- und die `.dic`-Datei zusammen (etwa aus einer LibreOffice-Installation) oder eine LibreOffice-Wörterbucherweiterung
(`.oxt`, etwa von extensions.libreoffice.org). Geladene Wörterbücher bleiben im Browser und werden in der Liste gewählt; 🗑 entfernt das
gewählte. Wörterbuch, hinzugefügte und ignorierte Wörter sind dieselben wie im Auswahlfeld **ABC** in der Kopfzeile und in den anderen
Anwendungen (siehe *Rechtschreibung* im Benutzerhandbuch); der Bereich funktioniert unabhängig davon, ob dieses Auswahlfeld ein- oder
ausgeschaltet ist, weil die Seite dieses Editors als Bild gezeichnet wird und keine Unterstreichungen zeigen kann.

**Fuß- und Endnoten** aus Word- und LibreOffice-Dateien erscheinen mit ihrer hochgestellten Nummer; ihre Texte stehen nach einer Linie am Ende
des Dokuments, weil der Editor keinen Fußnotenbereich hat. Seitenzahlfelder in Kopf- und Fußzeilen zeigen die in der Datei gespeicherte Zahl.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Strg+P` | Drucken / PDF |
| `F7` | Rechtschreibprüfung |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+B` / `Strg+I` / `Strg+U` | Fett / kursiv / unterstrichen |
| `Strg+A` | Alles auswählen |
| `/` | Befehlsmenü (am Anfang eines leeren Absatzes) |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Dokumente lassen sich lesen und bearbeiten; das Menüband lässt sich seitlich verschieben. Für längere Texte sind ein größerer Bildschirm und eine
Tastatur angenehmer.
