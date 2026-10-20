# Präsentation

Der Präsentationseditor (`presentation.html`) erstellt und bearbeitet Folienpräsentationen wie PowerPoint oder LibreOffice Impress: Textfelder,
Formen, Bilder und Tabellen auf Folien und das Vorführen im Vollbild. Dateien sind PowerPoint-Präsentationen (`.pptx`).

## Dateien

- **Öffnen** (`Strg+O`) öffnet eine `.pptx`-Datei (auch Vorlagen `.potx` und Bildschirmpräsentationen `.ppsx`, die als neue `.pptx` gespeichert
  werden); die Datei kann auch auf das Fenster gezogen werden. **Neu** beginnt eine leere Präsentation.
- **Speichern** (`Strg+S`) schreibt die `.pptx`-Datei: in Chrome/Edge am Desktop direkt in die Datei, in Firefox und unter Android als Download
  (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** (`Strg+Umschalt+S`) fragt nach einem neuen Namen.
- **Drucken / PDF** druckt jede Folie auf eine eigene Seite; wählen Sie im Druckdialog „Als PDF speichern“, um ein PDF zu erhalten.

Folien aus PowerPoint behalten Texte, Schriften, Farben, Positionen, Formen, Bilder und Tabellen, auch die von Folienlayouts und -mastern geerbte
Formatierung, die Notizen, Folienübergänge und Eingangsanimationen. Andere Animationseffekte, Diagramme, SmartArt und Videos werden nicht
unterstützt. Behalten Sie die ursprüngliche Datei, bis Sie das Ergebnis geprüft haben.

Auch **Web-Folien** (reveal.js-Präsentationen der App *Web-Folien*, `.html`, oder reveal.js-Markdown, `.md`) lassen sich öffnen: ihre Blöcke
werden von oben nach unten auf PowerPoint-Folien angeordnet (Überschriften, Texte, Listen, Code, Zitate, Bilder, Tabellen), Unterfolien folgen
ihrer Hauptfolie, Notizen, Hintergrundfarben, Übergänge und Fragmente (als Eingangsanimationen) werden übernommen, und Text auf dunklem
Hintergrund wird weiß. Speichern erzeugt dann eine `.pptx`-Datei neben dem Original. In der App *Web-Folien* lassen sich ebenso
PowerPoint-Dateien öffnen und Web-Folien als `.pptx` speichern.

## Folien

Die Miniaturansichten links zeigen alle Folien: Ein Klick bearbeitet eine Folie, Ziehen an eine andere Stelle ändert die Reihenfolge. **+ Neue
Folie** fügt nach der aktuellen Folie eine leere ein. Ohne gewähltes Element legt der Bereich rechts den **Hintergrund** der Folie und die
**Foliengröße** (16:9 oder 4:3) fest und dupliziert, löscht oder verschiebt die Folie (↑ ↓). `Bild auf` und `Bild ab` wechseln die Folie.

## Elemente

- **Textfeld**, **Form** (Rechteck, abgerundetes Rechteck, Ellipse, Dreieck, Raute, Sechseck, Pfeil, Stern, Linie), **Bild** (aus einer Datei) und
  **Tabelle** (3 × 3) fügen ein Element in der Mitte der Folie ein.
- Ein Klick wählt ein Element; Ziehen verschiebt es, Ziehen an den Griffen ändert die Größe, Ziehen am runden Griff dreht es. Hilfslinien helfen
  beim Ausrichten an der Folie und an anderen Elementen. Pfeiltasten verschieben um einen Punkt (`Umschalt`: 10 Punkte).
- Doppelklick auf einen Text (oder `Eingabe`) bearbeitet ihn; Doppelklick auf eine Tabellenzelle bearbeitet die Zelle. Ein Klick daneben beendet das
  Bearbeiten.
- Der Bereich rechts zeigt Position, Größe und Drehung, Füll- und Linienfarbe, Schrift, Größe und Farbe des Texts, fett, kursiv, unterstrichen,
  waagrechte und senkrechte Ausrichtung sowie **Nach vorne**, **Nach hinten**, **Duplizieren** und **Löschen**. Während ein Text bearbeitet wird,
  wirken fett, kursiv, unterstrichen, Schrift und Farbe auf die markierten Wörter.
- `Strg+C`, `Strg+X`, `Strg+V` kopieren, schneiden aus und fügen Elemente ein, `Strg+D` dupliziert, `Entf` löscht, `Strg+Z`/`Strg+Y` machen rückgängig
  und wiederholen.

## Vorführen

**▶ Vorführen** (oder `F5` ab der ersten Folie, `Umschalt+F5` ab der aktuellen Folie) zeigt die Präsentation im Vollbild. Nächste Folie: Klick, `→`,
`↓`, `Bild ab`, `Leertaste`, `Eingabe` oder auf Touch-Geräten nach links wischen; vorherige Folie: `←`, `↑`, `Bild auf`, `Rücktaste` oder nach
rechts wischen. `Pos1` und `Ende` springen zur ersten und letzten Folie, `Esc` beendet die Vorführung.

**Übergänge**: Ohne gewähltes Element legt *Übergang* im Bereich rechts fest, wie die Folie erscheint: Verblassen, Schieben, Wischen,
Aufdecken oder Zoom, die Richtung (Schieben, Wischen, Aufdecken), die Dauer und wahlweise *Nächste Folie nach* einer Anzahl Sekunden (sonst kommt
die nächste Folie per Klick). **Auf alle Folien anwenden** überträgt den Übergang auf jede Folie.

**Animationen**: Wählen Sie ein Element und einen *Eingang* (Erscheinen, Einblenden, Hineinfliegen, Zoom) sowie den Start: *bei Klick*, *mit
vorheriger* oder *nach vorheriger*. In der Vorführung warten die Elemente auf ihren Klick; zurückblättern blendet sie wieder aus. Ohne gewähltes
Element listet der Bereich die Animationen der Folie in der Abspielreihenfolge (↑ ↓ ändern die Reihenfolge, × entfernt eine). Übergänge und
Animationen werden in der PPTX-Datei gespeichert und aus PowerPoint-Dateien gelesen (andere PowerPoint-Effekte werden als der nächstliegende
gelesen, z. B. Teilen als Wischen; Hervorhebungs- und Ausgangseffekte werden nicht übernommen).

**Notizen**: Ohne gewähltes Element enthält der Bereich rechts ein Feld *Notizen* für die aktuelle Folie. Notizen werden in der PPTX-Datei
gespeichert und aus PowerPoint-Dateien gelesen.

**🎤 Referentenansicht** (`Alt+F5`) öffnet die Folien in einem zweiten Fenster – ziehen Sie es auf den Beamer oder Zweitbildschirm und schalten
Sie es dort auf Vollbild (`F11`) – und zeigt in diesem Fenster eine Konsole: aktuelle Folie, nächste Folie, die Notizen in großer Schrift, die
Zeit seit dem Start (⏸ hält sie an, ⟲ beginnt neu), die Uhrzeit und die Foliennummer. Die Tasten oben wirken in beiden Fenstern; **Beenden** (oder
`Esc`) schließt das zweite Fenster. Blockiert der Browser das zweite Fenster, erlauben Sie Pop-ups für die Seite.

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
| `Strg+D` | Element duplizieren |
| `Entf` / `Rücktaste` | Element löschen |
| `Eingabe` / `F2` | Text bearbeiten |
| `←` / `→` / `↑` / `↓` | Element um 1 verschieben (mit Umschalt: 10) |
| `Esc` | Auswahl aufheben |
| `Bild↑` / `Bild↓` | Vorherige / nächste Folie |

### Vorführen

| Tasten | Funktion |
|---|---|
| `F5` / `Umschalt+F5` | Vorführen vom Anfang / ab der aktuellen Folie |
| `Alt+F5` | Referentenansicht (Notizen, Zeit, nächste Folie) |
| `→` / `Leertaste` / `Eingabe` / `N` | Nächste Folie |
| `←` / `Rücktaste` / `P` | Vorherige Folie |
| `Pos1` / `Ende` | Erste / letzte Folie |
| `Esc` | Vorführung beenden |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Miniaturansichten stehen unter der Folie; **Format** öffnet den Bereich rechts. Das Vorführen funktioniert mit Wischgesten.
