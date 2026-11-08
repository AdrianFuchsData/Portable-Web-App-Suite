# Präsentation

Der Präsentationseditor (`presentation.html`) erstellt und bearbeitet Folienpräsentationen wie PowerPoint oder LibreOffice Impress: Textfelder,
Formen, Bilder und Tabellen auf Folien und das Vorführen im Vollbild. Dateien sind PowerPoint-Präsentationen (`.pptx`).

## Dateien

- **Öffnen** (`Strg+O`) öffnet eine PowerPoint-Datei `.pptx` (auch Vorlagen `.potx` und Bildschirmpräsentationen `.ppsx`, die als neue `.pptx`
  gespeichert werden) oder eine OpenDocument-Präsentation `.odp` von LibreOffice Impress (auch Vorlagen `.otp`); die Datei kann auch auf das Fenster
  gezogen werden. **Neu** beginnt eine leere Präsentation.
- **Speichern** (`Strg+S`) schreibt die Datei in ihrem Format: in Chrome/Edge am Desktop direkt in die Datei, in Firefox und unter Android als
  Download (ersetzen Sie die ursprüngliche Datei damit). **Speichern unter** (`Strg+Umschalt+S`) fragt nach einem neuen Namen und dem Format –
  PowerPoint (`.pptx`) oder OpenDocument (`.odp`).
- **Drucken / PDF** druckt jede Folie auf eine eigene Seite; wählen Sie im Druckdialog „Als PDF speichern“, um ein PDF zu erhalten.

Folien aus PowerPoint behalten Texte, Schriften, Farben, Positionen, Formen, Bilder und Tabellen, auch die von Folienlayouts und -mastern geerbte
Formatierung, die Notizen, Folienübergänge und Eingangsanimationen. Andere Animationseffekte, Diagramme, SmartArt und Videos werden nicht
unterstützt. Behalten Sie die ursprüngliche Datei, bis Sie das Ergebnis geprüft haben.

OpenDocument-Präsentationen behalten Folien mit Größe, Hintergrund und Ausblendung, Texte mit Formatierung und Listen, Textfelder, Formen (Rechteck,
abgerundetes Rechteck, Ellipse, Dreiecke, Raute, Parallelogramm, Trapez, Fünfeck, Sechseck, Pfeile, Stern, Linie), Bilder (auch das Bild, das
LibreOffice für ein Diagramm oder ein anderes eingebettetes Objekt speichert), Tabellen, Gruppen, Drehung und Notizen, in beide Richtungen; die
eigenen Formen und der Hintergrund des Masters erscheinen (gesperrt) auf seinen Folien. Übergänge, Animationen, Verläufe und Freiformen werden nicht
gelesen oder geschrieben.

Auch **Web-Folien** (reveal.js-Präsentationen der App *Web-Folien*, `.html`, oder reveal.js-Markdown, `.md`) lassen sich öffnen: ihre Blöcke
werden von oben nach unten auf PowerPoint-Folien angeordnet (Überschriften, Texte, Listen, Code, Zitate, Bilder, Tabellen), Unterfolien folgen
ihrer Hauptfolie, Notizen, Hintergrundfarben, Übergänge und Fragmente (als Eingangsanimationen) werden übernommen, und Text auf dunklem
Hintergrund wird weiß. Speichern erzeugt dann eine `.pptx`-Datei neben dem Original. In der App *Web-Folien* lassen sich ebenso
PowerPoint-Dateien öffnen und Web-Folien als `.pptx` speichern.

## Folien

Die Miniaturansichten links zeigen alle Folien: Ein Klick bearbeitet eine Folie, Ziehen an eine andere Stelle ändert die Reihenfolge. **+ Neue
Folie** fügt nach der aktuellen Folie eine leere ein. Ohne gewähltes Element legt der Bereich rechts den **Hintergrund** der Folie und die
**Foliengröße** (16:9 oder 4:3) fest und dupliziert, löscht oder verschiebt die Folie (↑ ↓). `Bild auf` und `Bild ab` wechseln die Folie.

Das Menü **▤** neben *Neue Folie* fügt eine Folie mit **Layout** ein: *Titelfolie* (Titel und Untertitel), *Titel und Inhalt* (Titel und ein Text mit
Aufzählung), *Zwei Inhalte*, *Abschnittsüberschrift*, *Nur Titel* oder *Leer*. Seine Felder stehen dort, wo die eingebauten Layouts von PowerPoint
sie hinsetzen; ersetzen Sie ihre Texte (Doppelklick, `Strg+A`, tippen).

## Elemente

- **Textfeld**, **Form** (Rechteck, abgerundetes Rechteck, Ellipse, Dreieck, Raute, Sechseck, Pfeil, Stern, Linie), **Bild** (aus einer Datei) und
  **Tabelle** (3 × 3) fügen ein Element in der Mitte der Folie ein.
- Ein Klick wählt ein Element; Ziehen verschiebt es, Ziehen an den Griffen ändert die Größe, Ziehen am runden Griff dreht es. Hilfslinien helfen
  beim Ausrichten an der Folie und an anderen Elementen. Pfeiltasten verschieben um einen Punkt (`Umschalt`: 10 Punkte).
- **📐 Diagramm** öffnet ein leeres Diagramm im Diagramm-Editor (ein neues Fenster oder ein neuer Tab); jedes **Speichern** dort setzt das
  Diagramm als Bild auf die Folie (das erste Speichern fügt es ein, spätere aktualisieren es). Ein Diagrammbild zeigt im Bereich rechts
  **📐 Diagramm bearbeiten**, und ein Doppelklick darauf öffnet es wieder im Diagramm-Editor; das neue Bild behält Position und Breite. Das
  Diagramm steckt im Bild (ein PNG mit der draw.io-Datei, wie das „bearbeitbare PNG“ von draw.io) und bleibt daher in der `.pptx`-Datei
  bearbeitbar; PowerPoint zeigt das Bild. Der Diagramm-Editor (`diagram.html`) muss im selben Ordner liegen, oder Sie starten die
  Präsentation aus der Übersicht.
- Doppelklick auf einen Text (oder `Eingabe`) bearbeitet ihn; Doppelklick auf eine Tabellenzelle bearbeitet die Zelle. Ein Klick daneben beendet das
  Bearbeiten.
- Der Bereich rechts zeigt Position, Größe und Drehung, Füll- und Linienfarbe, Schrift, Größe und Farbe des Texts, fett, kursiv, unterstrichen,
  waagrechte und senkrechte Ausrichtung sowie **Nach vorne**, **Nach hinten**, **Duplizieren** und **Löschen**. Während ein Text bearbeitet wird,
  wirken fett, kursiv, unterstrichen, Schrift und Farbe auf die markierten Wörter.
- `Strg+C`, `Strg+X`, `Strg+V` kopieren, schneiden aus und fügen Elemente ein, `Strg+D` dupliziert, `Entf` löscht, `Strg+Z`/`Strg+Y` machen rückgängig
  und wiederholen.

### Video, Audio und zugeschnittene Bilder

**🎬 Video/Audio** setzt ein Video (`.mp4`, `.webm`, `.ogv`, `.mov`) oder einen Klang (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`) auf die Folie. Ein Video
zeigt sein erstes Bild (auch in PowerPoint), ein Klang ein Lautsprechersymbol; in der Vorführung haben beide Bedienelemente zum Abspielen. Sie werden in
PowerPoint- und OpenDocument-Dateien gespeichert und daraus gelesen (Videos und Klänge in der Datei selbst; verknüpfte Dateien nicht). Welche Formate
abgespielt werden, hängt vom Browser ab – MP4 (H.264) etwa nicht in jeder Chromium-Ausgabe; die Datei bleibt trotzdem in der Präsentation.

**Zuschneiden (%)** im Bereich eines markierten Bildes schneidet links, oben, rechts und unten Teile ab; das Bild behält seinen Maßstab, und **Nicht
zuschneiden** zeigt es wieder ganz. PowerPoint-Dateien behalten den Zuschnitt (und zugeschnittene Bilder von PowerPoint kommen mit ihrem); OpenDocument-
Dateien erhalten den zugeschnittenen Teil als Bild.

### Diagramme

**📊 Diagramm** öffnet den Diagrammdialog mit Beispieldaten: Wählen Sie Art (Säulen, Balken, Linien, Flächen, Kreis, Ring, Punkte), Titel, Legende,
gestapelt und Werte im Diagramm, und geben Sie Kategorien, Reihen und Werte ein; **OK** setzt das Diagramm auf die Folie. Ein Doppelklick darauf (oder
**📊 Diagramm bearbeiten** im Bereich rechts) öffnet den Dialog wieder. Das Diagramm ist ein Bild, das seine Daten mitträgt: PowerPoint zeigt das Bild,
die Suite bearbeitet es wieder. Diagramme von PowerPoint-Dateien werden als solche Bilder mit den Daten der Datei gezeigt und als Bilder gespeichert.

### Listen

Die Listen-Schaltflächen im Bereich rechts machen **Aufzählungen** (•≡) und **Nummerierungen** (1.≡) und ändern die **Listenebene** (⇠ ⇢).
Während ein Text bearbeitet wird, wirken sie auf die Absätze der Markierung (oder den Absatz der Schreibmarke), sonst auf alle Absätze der
markierten Elemente. Ein zweiter Klick auf dieselbe Listenart beendet die Liste. Beim Bearbeiten ändern `Tab` und `Umschalt+Tab` die Ebene,
`Eingabe` setzt die Liste fort, und `Eingabe` in einem leeren Listenabsatz rückt ihn eine Ebene höher oder beendet die Liste. Jede Ebene wird
für sich nummeriert. Listen bleiben in PowerPoint-Dateien erhalten (auch in PowerPoint erstellte, mit ihren Aufzählungszeichen und
Nummerierungsarten).

### Mehrere Elemente: ausrichten, verteilen, gruppieren

- **Mehrere Elemente markieren:** `Umschalt`+Klick (oder `Strg`+Klick) fügt ein Element zur Markierung hinzu oder nimmt es heraus; Ziehen auf einer
  leeren Stelle der Folie zieht einen Rahmen auf und markiert die Elemente darin; `Strg+A` markiert alle. Sie werden dann gemeinsam verschoben und
  skaliert (Ziehen irgendwo in ihrem Rahmen oder mit den Pfeiltasten) und gemeinsam kopiert, dupliziert, gelöscht, nach vorne oder hinten gebracht;
  Füllung, Linie und Textformate des Bereichs rechts wirken auf alle. Ein Klick in den Rahmen markiert nur das Element unter dem Zeiger.
- Die Schaltflächen oben im Bereich **richten** die markierten Elemente aneinander aus – links, Mitte, rechts, oben, Mitte, unten – oder, wenn nur ein
  Element oder eine Gruppe markiert ist, an der Folie. **Verteilen** (ab drei) gibt ihnen gleiche Abstände waagrecht oder senkrecht; die äußeren
  bleiben, wo sie sind.
- **Gruppieren** (`Strg+G`) fasst die markierten Elemente zusammen: Ein Klick markiert die ganze Gruppe, und sie wird als Einheit verschoben,
  ausgerichtet und angeordnet. **Gruppierung aufheben** (`Strg+Umschalt+G`) trennt sie wieder. Gruppen bleiben in PowerPoint-Dateien erhalten (auch
  in PowerPoint erstellte; eine Gruppe in einer Gruppe wird Teil der äußeren).

## Rechtschreibung

Mit einer im Auswahlfeld **ABC** der Kopfzeile gewählten Sprache werden unbekannte Wörter im bearbeiteten Text und in den Sprechernotizen
unterstrichen (Rechtsklick für Vorschläge, siehe *Rechtschreibung* im Benutzerhandbuch). **ABC✓** (`F7`) öffnet den Rechtschreibbereich, der alle
Folien auf einmal prüft – Textfelder, Formen, Tabellen und die Sprechernotizen: Ein Klick auf ein Wort springt zu seiner Folie und markiert das
Element (nochmals: das nächste Vorkommen), ein Vorschlag ersetzt **alle** Vorkommen (ein Rückgängig-Schritt; ein teilweise formatiertes Wort erhält
die Formatierung seines ersten Teils), **Ignorieren** und **Zum Wörterbuch hinzufügen** wirken wie im Dokument-Editor, und Wörterbücher werden dort
ebenso geladen und gewählt.

## Kopf- & Fußzeile, Foliennummern

**# Kopf- & Fußzeile** in der Werkzeugleiste setzt das Datum, einen Fußzeilentext und die Foliennummer unten auf die Folien:

- **Datum**: *Automatisch aktualisieren* zeigt das heutige Datum (in der Sprache der Anwendung), wann immer die Präsentation gezeigt oder geöffnet
  wird; *Fest* zeigt den eingegebenen Text.
- **Foliennummer**: die Nummer jeder Folie; sie passt sich an, wenn Folien verschoben, eingefügt oder gelöscht werden.
- **Fußzeile**: ein Text, z. B. der Titel des Vortrags.
- **Nicht auf der Titelfolie**: lässt die erste Folie ohne sie.

**Für alle Folien übernehmen** oder **Für diese Folie übernehmen**. Der Dialog zeigt die Einstellungen der aktuellen Folie; ein abgewählter Eintrag
wird von den Folien entfernt, für die übernommen wird. Die drei sind gewöhnliche Textfelder unten (Datum links, Fußzeile mittig, Nummer rechts): Sie
lassen sich verschieben und formatieren, und erneutes Übernehmen behält ihren Platz und ihr Aussehen. Foliennummern und automatische Datumswerte
werden als Felder in der PPTX-Datei gespeichert, sodass auch PowerPoint die Folien nummeriert; die aus PowerPoint-Dateien funktionieren genauso.

## Vorführen

**▶ Vorführen** (oder `F5` ab der ersten Folie, `Umschalt+F5` ab der aktuellen Folie) zeigt die Präsentation im Vollbild. Nächste Folie: Klick, `→`,
`↓`, `Bild ab`, `Leertaste`, `Eingabe` oder auf Touch-Geräten nach links wischen; vorherige Folie: `←`, `↑`, `Bild auf`, `Rücktaste` oder nach
rechts wischen. `Pos1` und `Ende` springen zur ersten und letzten Folie, `Esc` beendet die Vorführung.

**Ausgeblendete Folien**: *In der Vorführung ausblenden* im Bereich einer Folie (kein Element markiert) lässt sie in der Vorführung aus; ihre
Miniaturansicht ist blass und ihre Nummer durchgestrichen. Beginnt die Vorführung bei einer ausgeblendeten Folie (`Umschalt+F5`), wird sie gezeigt,
wie in PowerPoint. Ausgeblendete Folien bleiben in PPTX-Dateien erhalten.

**Während der Vorführung** zeigt eine Mausbewegung die Werkzeuge links unten (auf Touch-Bildschirmen sind sie immer da): ◀ ▶, **✎ Stift** (`Strg+P`)
– mit Maus, Stift oder Finger auf die Folie zeichnen; **● Laserpointer** (`Strg+L`) – ein roter Punkt folgt dem Zeiger; **⌫** (`E`) löscht die
Zeichnung der Folie; **■ schwarzer Bildschirm** (`B` oder `.`; `W` oder `,` ergibt einen weißen) – dieselbe Taste, ein Klick oder eine andere Taste
kehrt zurück; **✕** beendet die Vorführung. Ein Klick auf das aktive Werkzeug, `Strg+A` oder `Esc` schaltet Stift oder Laserpointer aus; solange eines
an ist, wechseln Klicks nicht die Folie. Die Zeichnungen bleiben bis zum Ende der Vorführung auf ihren Folien; sie werden nicht gespeichert.

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
| `F7` | Rechtschreibbereich |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+D` | Element duplizieren |
| `Umschalt`+Klick / `Strg`+Klick | Zur Markierung hinzufügen oder daraus entfernen |
| `Strg+A` | Alle Elemente der Folie markieren |
| `Strg+G` / `Strg+Umschalt+G` | Gruppieren / Gruppierung aufheben |
| `Entf` / `Rücktaste` | Element löschen |
| `Eingabe` / `F2` | Text bearbeiten |
| `Tab` / `Umschalt+Tab` | Beim Bearbeiten: Listenebene tiefer / höher |
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
| `Esc` | Vorführung beenden (mit Stift oder Laserpointer: ausschalten) |
| `Strg+P` / `Strg+L` / `Strg+A` | Stift / Laserpointer / zurück zum Pfeil |
| `E` | Zeichnung der Folie löschen |
| `B` / `W` | Schwarzer / weißer Bildschirm (nochmals: zurück) |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Miniaturansichten stehen unter der Folie; **Format** öffnet den Bereich rechts. Das Vorführen funktioniert mit Wischgesten.
