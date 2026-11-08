# Textverarbeitung

Die Textverarbeitung (`document.html`) schreibt und bearbeitet Textdokumente wie Word oder LibreOffice Writer: Absätze und Überschriften, Schriften
und Farben, Ausrichtung und Abstände, Aufzählungen und nummerierte Listen, Tabellen, Bilder, Kopf- und Fußzeilen, Suchen und Ersetzen. Die
Bearbeitungskomponente ist Univer Docs.

## Dateien

| Format | Öffnen | Speichern | Hinweise |
|---|---|---|---|
| Word (`.docx`) | ja | ja | Seitengröße und Ränder, Formatvorlagen, Überschriften, Textformatierung, Listen, Tabellen, Bilder, Hyperlinks, Kopf- und Fußzeilen mit Seitenzahlen |
| OpenDocument (`.odt`, LibreOffice Writer) | ja (auch Vorlagen `.ott`) | ja | dasselbe wie bei Word; Fuß- und Endnoten werden ans Ende des Dokuments gesetzt |
| Word mit Makros (`.docm`), Vorlagen (`.dotx`) | ja | als `.docx` | Makros bleiben nicht erhalten; eine Vorlage wird ein neues Dokument |
| Text (`.txt`, `.md`) | ja | ja (`.txt`) | nur der Text; Formatierung, Tabellen und Bilder gehen verloren; eine Markdown-Datei öffnet sich als ihr Text und wird unverändert gespeichert |
| Markdown (`.md`) | als Text | ja | Überschriften, fett, kursiv, durchgestrichen, Links, Aufzählungen, nummerierte Listen und Checklisten, Tabellen und Bilder (eingebettet); keine Farben, Schriften, Ausrichtung, Seitenlayout, Kopf- und Fußzeilen |
| Webseite (`.html`) | nein | ja | Text, Formatierung, Listen, Tabellen, Bilder und Links; kein Seitenlayout |
| PDF | nein | über **🖨** | siehe *Drucken und PDF* |

- **Öffnen** (`Strg+O`) öffnet eine Datei; sie kann auch auf das Fenster gezogen werden. **Neu** beginnt ein leeres Dokument.
- **Speichern** (`Strg+S`) speichert im Format der Datei: in Chrome/Edge am Desktop direkt in die Datei, in Firefox und unter Android als Download
  (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** (`Strg+Umschalt+S`) fragt nach Name und Format.
- Der Dateiname in der Werkzeugleiste zeigt •, solange es ungespeicherte Änderungen gibt.

### Drucken und PDF

**🖨** (`Strg+P`) druckt das Dokument mit seiner Seitengröße und seinen Rändern; wählen Sie *Als PDF speichern* (Chrome, Edge, Android) oder
*In Datei drucken* (Firefox) als Drucker, um ein PDF zu erhalten. Kopf- und Fußzeile des Dokuments wiederholen sich auf jeder Seite: in Chrome und
Edge als Text (Bilder darin entfallen) mit den richtigen Seitenzahlen, in Firefox mit leeren Seitenzahlen (Firefox kann dort keine Seiten zählen). Die
Seitenumbrüche setzt der Browser, sie können also von den Seiten im Editor abweichen; eingefügte Seitenumbrüche bleiben erhalten. Links sind
im PDF anklickbar, auch die Einträge eines Inhaltsverzeichnisses.

Dokumente aus Word und LibreOffice werden beim Öffnen umgewandelt; sehr komplexe Layouts (Textfelder, Spalten, Änderungsverfolgung, Kommentare)
können einfacher aussehen. Behalten Sie die ursprüngliche Datei, bis Sie das Ergebnis geprüft haben.
Ein „Wort“ mit mehr als 20.000 Zeichen ohne Leerzeichen (etwa eingefügte Base64-Daten) erhält alle 1.000 Zeichen eine unsichtbare
Umbruchstelle (U+200B), damit es angezeigt werden kann; sie wird mit dem Dokument gespeichert.

## Bearbeiten

Das Menüband hat die Reiter **Start** (Zwischenablage, fett/kursiv/unterstrichen/durchgestrichen, Hoch- und Tiefstellung, Absatzformat, Größe,
Schrift, Farben, Ausrichtung, Listen, Checklisten) und **Einfügen** (Tabellen, Bilder, Links, horizontale Linie, Emoji, Symbole, Kopf- und Fußzeile, Datum und Uhrzeit). Die üblichen
Tastenkombinationen funktionieren: `Strg+B/I/U`, `Strg+Z/Y`, `Strg+C/X/V`, `Strg+F` zum Suchen. Die Statusleiste zeigt die Wortanzahl und den Zoom.

**📐 Diagramm** in der Werkzeugleiste öffnet ein leeres Diagramm im Diagramm-Editor (ein neues Fenster oder ein neuer Tab); das erste
**Speichern** dort fügt das Diagramm als Bild an der Schreibmarke ein, spätere Speichervorgänge aktualisieren es. Ist ein Diagrammbild
ausgewählt (ein Klick darauf), öffnet **📐 Diagramm bearbeiten** es wieder im Diagramm-Editor. Ein aktualisiertes Bild behält Stelle und
Maßstab (höchstens die Textbreite); `Strg+Z` macht es rückgängig. Das Diagramm steckt im Bild (ein PNG mit der draw.io-Datei) und bleibt
daher in der `.docx`-Datei bearbeitbar; Word zeigt das Bild.

Die Sprache der Bearbeitungskomponente folgt der Sprachumschaltung der Suite, ebenso das dunkle Design.

Rückgängig und Wiederholen sind die ersten beiden Schaltflächen der Editor-Werkzeugleiste (auch `Strg+Z` und `Strg+Y`).

### Links

Markieren Sie einen Text, drücken Sie `Strg+K` (oder **Einfügen → 🔗**, oder 🔗 in der kleinen Werkzeugleiste über der Markierung) und geben
Sie die Adresse ein: `https://…`, `mailto:…` oder eine E-Mail-Adresse (sie wird zu einem `mailto:`-Link); eine Adresse ohne Schema erhält
`https://`. Zeigen auf (oder Tippen auf) einen verlinkten Text zeigt die Adresse mit Schaltflächen zum Kopieren, Bearbeiten und Entfernen des Links; auch `Strg+K`
auf einem verlinkten Text ändert ihn. Links werden in Word-, OpenDocument- und HTML-Dateien gespeichert und bleiben in einem aus dem Editor
gedruckten PDF anklickbar.

### Inhaltsverzeichnis und Fußnoten

**📑 Inhalt** fügt am Absatz der Schreibmarke ein Inhaltsverzeichnis ein: die Überschriften (Absatzformate *Überschrift 1* bis
*Überschrift 5*), nach Ebene eingerückt. Nach Änderungen an den Überschriften genügt ein erneuter Klick, um das Verzeichnis an seiner Stelle zu
aktualisieren. In gespeicherten Word- und OpenDocument-Dateien sind die Einträge Links zu den Überschriften (Strg+Klick in Word, Klick in
LibreOffice); Seitenzahlen enthält das Verzeichnis nicht (der Editor kennt sie nicht) – Word und LibreOffice können bei Bedarf ein echtes
Verzeichnis mit Seitenzahlen einfügen.

### Kommentare

Markieren Sie Text und drücken Sie `Strg+Alt+M` (oder die Kommentar-Schaltfläche der kleinen Leiste über einer Markierung), um ihn zu
kommentieren; beim ersten Mal fragt die Textverarbeitung nach Ihrem Namen, der bei Ihren Kommentaren steht (ändern in den Einstellungen:
`F1` → **⚙ Einstellungen** → *Ihr Name*). Der kommentierte Text wird markiert; **💬 Kommentare** zeigt den Kommentarbereich: jeden Kommentar
mit seinen Antworten, wo Sie antworten, Ihre eigenen Kommentare bearbeiten oder löschen, einen Verlauf als gelöst markieren (✓) und nach
gelösten oder offenen Verläufen filtern. Ein Klick auf einen Kommentar markiert seinen Text.

Kommentare bleiben in Word-Dateien (`word/comments.xml`; Antworten und der Zustand *gelöst*, wie Word ab 2013 sie schreibt) und in
OpenDocument-Dateien erhalten (`office:annotation`, mit den Antworten und dem Zustand *gelöst* von LibreOffice); Kommentare einer Word- oder
LibreOffice-Datei zeigen ihre Autoren. Webseiten, Markdown, Textdateien und Ausdrucke lassen die Kommentare weg.

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
des Dokuments, weil der Editor keinen Fußnotenbereich hat.

### Symbole, Emoji, Datum und Uhrzeit

**Einfügen → Ω** öffnet eine Auswahl von Symbolen (Mathematik, griechische Buchstaben und gebräuchliche Symbole), **Einfügen → ☺** eine von Emoji mit
Suche; ein Klick fügt das Zeichen an der Schreibmarke ein. Die Symbolauswahl der Suite (siehe Benutzerhandbuch) funktioniert hier ebenfalls.

**Einfügen → Datum & Uhrzeit** fügt das heutige Datum oder die aktuelle Uhrzeit als Text an der Schreibmarke ein: *Datum* und *Datum (lang)* im Format
Ihrer Region (z. B. 31.01.2026 und 31. Januar 2026), *Datum (ISO)* als 2026-01-31, *Uhrzeit* oder *Datum und Uhrzeit*. Das ist gewöhnlicher Text und
ändert sich später nicht; in Kopf- und Fußzeilen fügt der Reiter Kopf- und Fußzeile ein Datum ein, das sich aktualisieren lässt.

### Seite einrichten

Die Schaltfläche „Seite einrichten“ im Reiter **Start** (ganz rechts, auf einem Smartphone im ⋮-Menü) legt fest:

- **Darstellung**: **Seiten** wie in Word oder **Keine Seiten** – fortlaufender Text ohne Seitenränder (so öffnen sich Textdateien).
- **Papierformat** (A3, A4, A5, Letter, Legal oder eine eigene Breite und Höhe) und **Ausrichtung** (Hoch- oder Querformat).
- **Ränder** oben, unten, links und rechts, in Zentimetern.

**Übernehmen** ändert das Dokument (rückgängig mit `Strg+Z`). Seitengröße, Ausrichtung und Ränder bleiben in Word- und OpenDocument-Dateien
erhalten und gelten beim Drucken.

### Kopf- und Fußzeilen, Seitenzahlen

Kopf- und Fußzeilen brauchen ein Dokument mit Seiten (aus Word oder LibreOffice, oder nachdem in „Seite einrichten“ *Seiten* gewählt wurde). **Einfügen →
Kopf- & Fußzeile** → **Kopfzeile bearbeiten** oder **Fußzeile bearbeiten** (oder ein Doppelklick in den oberen oder unteren Rand einer Seite) öffnet sie
zum Bearbeiten und zeigt den Reiter **Kopf- und Fußzeile**:

- **Seitenzahl** → *Aktuelle Seite* oder *Gesamtseitenzahl* fügt die Zahl an der Schreibmarke ein, z. B. „Seite 3 von 12“; jede Seite zeigt ihre eigene
  Zahl. **Datum und Uhrzeit** fügt Datum oder Uhrzeit ein. *Felder aktualisieren* aktualisiert sie.
- **Zur Kopfzeile** / **Zur Fußzeile** wechseln zwischen beiden; **Andere erste Seite** und **Unterschiedliche ungerade und gerade Seiten** geben diesen Seiten
  eigene Kopf- und Fußzeilen; die Abstände von Kopf- und Fußzeile zum Seitenrand stehen rechts.
- **×** (oder `Esc`, oder ein Doppelklick in den Text) führt zurück in den Text.

Auf einem Smartphone stehen die Schaltflächen, die keinen Platz haben, im ⋮-Menü des Reiters.

Seitenzahlen bleiben als Seitenzahlfelder in Word- (`PAGE`, `NUMPAGES`) und OpenDocument-Dateien (`text:page-number`, `text:page-count`) erhalten, sodass
auch Word und LibreOffice die Seiten nummerieren; Seitenzahlfelder geöffneter Dateien funktionieren genauso. Andere Felder aus Word- und
LibreOffice-Dateien behalten den Text, den sie zeigten.

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
| `Strg+Alt+M` | Markierten Text kommentieren |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+B` / `Strg+I` / `Strg+U` | Fett / kursiv / unterstrichen |
| `Strg+A` | Alles auswählen |
| `Strg+K` | Link einfügen oder bearbeiten |
| `/` | Befehlsmenü (am Anfang eines leeren Absatzes) |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Dokumente lassen sich lesen und bearbeiten; das Menüband lässt sich seitlich verschieben. Für längere Texte sind ein größerer Bildschirm und eine
Tastatur angenehmer.
