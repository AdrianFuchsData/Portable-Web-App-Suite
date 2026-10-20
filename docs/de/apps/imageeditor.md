# Bildbearbeitung

Die Bildbearbeitung (`imageeditor.html`) bearbeitet Rasterbilder mit Ebenen: Malen, Formen, Text, Verläufe, Auswahlen, Korrekturen und
Filter, Größe ändern, Zuschneiden, Drehen und die Zwischenablage.

## Dateien

| Format | Öffnen | Speichern |
|---|---|---|
| PNG, JPEG, WebP | ja | ja (JPEG und WebP mit Qualitätseinstellung) |
| BMP | ja | ja (24 Bit) |
| GIF, ICO, SVG, AVIF | ja (GIF: erstes Bild; SVG wird in Pixel umgewandelt) | – |
| OpenRaster (`.ora`) | ja, mit Ebenen | ja, mit Ebenen, Deckkraft, Ebenenmodi und Sichtbarkeit |
| Photoshop (`.psd`) | ja, mit Ebenen | ja, mit Ebenen, Deckkraft, Ebenenmodi und Sichtbarkeit |

OpenRaster ist das Ebenenformat von GIMP, Krita und MyPaint; Photoshop-Dateien verstehen ebenfalls die meisten Bildprogramme. In
PSD-Dateien werden Ebenengruppen als ihre einzelnen Ebenen geöffnet (ausgeblendete Gruppen bleiben ausgeblendet), Ebenenmasken werden
auf die Ebenen angewendet, und Text-, Form- und Einstellungsebenen behalten die von Photoshop gespeicherten Pixel (sie lassen sich nicht
als Text oder Form bearbeiten). Beim Speichern in einem anderen Format werden die Ebenen zu einem Bild vereint; die Anwendung weist
darauf hin. JPEG und BMP haben keine Transparenz; transparente Bereiche werden weiß.

- **Datei → Neu** (`Strg+N`) fragt nach der Größe und dem Hintergrund (weiß, transparent oder die Hintergrundfarbe).
- **Datei → Öffnen** (`Strg+O`) öffnet ein Bild; **Als Ebene öffnen** fügt Bilder als neue Ebenen hinzu. Auf das Fenster gezogene
  Bilddateien werden geöffnet (oder als Ebenen hinzugefügt, wenn Sie bereits begonnen haben).
- **Datei → Speichern** (`Strg+S`) und **Speichern unter** (`Strg+Umschalt+S`, mit Format und Qualität): in Chrome/Edge am Desktop
  direkt in die Datei, in Firefox und unter Android als Download.

## Werkzeuge

| Werkzeug | Taste | Verwendung |
|---|---|---|
| ✥ Verschieben | `V` | verschiebt die aktive Ebene; bei einer Auswahl die ausgewählten Pixel |
| ⬚ Rechteckauswahl, ◌ Ellipsenauswahl | `M`, `Q` | ziehen zum Auswählen; ein Klick hebt die Auswahl auf; `Umschalt` für Quadrate/Kreise |
| ➰ Lasso | `F` | einen Bereich freihand umfahren, um ihn auszuwählen |
| ⬠ Polygon-Lasso | `P` | die Ecken anklicken; Doppelklick, `Eingabe` oder ein Klick auf die erste Ecke schließt die Form, `Rücktaste` entfernt die letzte Ecke, `Esc` bricht ab |
| 🪄 Zauberstab | `W` | wählt Pixel ähnlicher Farbe aus (Toleranz; zusammenhängend oder alle ähnlichen Pixel der Ebene) |
| 🖌 Pinsel | `B` | weich gezeichnetes Malen; der Stiftdruck von Grafiktabletts und Eingabestiften ändert die Größe |
| ✏ Stift | `N` | harte Pixel ohne Glättung (Pixelgrafik) |
| ⌫ Radierer | `E` | macht Pixel transparent |
| ⎘ Kopierstempel | `S` | `Alt`+Klick legt die Quelle fest (auf Touchscreens: **⊕ Quelle setzen**, dann tippen), dann malen: die Pixel an der Quelle werden kopiert. **Ausgerichtet**: die Quelle behält bei jedem Strich ihren Abstand zum Pinsel; sonst beginnt jeder Strich an der Quelle. Ein Kreuz zeigt die Quelle |
| 🩹 Reparaturpinsel | `J` | wie der Kopierstempel, aber die kopierte Struktur übernimmt Farbe und Helligkeit der Stelle, auf die gemalt wird – entfernt Flecken, Kratzer und Hautunreinheiten ohne sichtbare Flicken |
| 👆 Wischfinger | `U` | verschmiert Farben entlang des Strichs wie ein nasser Finger; die Deckkraft bestimmt die Stärke |
| ◍ Weichzeichnen / Schärfen | `K` | malt eine weichgezeichnete oder geschärfte (Modus) Fassung der Ebene; die Größe bestimmt den Radius, die Deckkraft die Stärke |
| 🪣 Füllen | `G` | füllt einen Bereich ähnlicher Farbe (Toleranz, zusammenhängend oder alle ähnlichen Pixel); Rechtsklick verwendet die Hintergrundfarbe |
| ▤ Verlauf | `D` | ziehen: linearer Verlauf von Vorder- zu Hintergrundfarbe |
| 💧 Farbpipette | `I` | übernimmt die Farbe unter dem Zeiger als Vordergrundfarbe (Rechtsklick oder `Alt`: Hintergrundfarbe) |
| ╱ Linie, ▭ Rechteck, ◯ Ellipse | `L`, `R`, `O` | ziehen; `Umschalt` für 45°-Linien, Quadrate und Kreise; optional mit der Hintergrundfarbe gefüllt |
| T Text | `T` | dort klicken, wo der Text beginnen soll; Text, Schrift, Größe, fett, kursiv eingeben |
| ✋ Hand | `H` oder `Leertaste` halten | verschiebt die Ansicht |

Die Werkzeugoptionen (Größe, Deckkraft, Füllung, Toleranz) stehen rechts. `[` und `]` ändern die Größe, `X` tauscht Vorder- und
Hintergrundfarbe. Alle Malwerkzeuge wirken nur innerhalb der Auswahl, falls es eine gibt.

### Auswahlen kombinieren

Bei jedem Auswahlwerkzeug fügt gedrücktes `Umschalt` der bestehenden Auswahl **hinzu**, `Alt` **zieht** davon **ab**; die
Werkzeugoption **Auswahl** (Neu, Hinzufügen, Abziehen, Schnittmenge) macht dasselbe ohne Tasten, etwa am Smartphone.
**Bearbeiten → Auswahl umkehren** (`Strg+Umschalt+I`) wählt alles andere aus. Kombinierte und Zauberstab-Auswahlen folgen den Pixeln
genau; das Verschiebewerkzeug verschiebt sie wie jede Auswahl.

### Auswahl nach Koordinaten

Die Statusleiste zeigt Position und Größe der Auswahl (`⬚ x, y · Breite × Höhe`). Bei einem Auswahlwerkzeug enthalten die
Werkzeugoptionen die Felder **X**, **Y**, **Breite** und **Höhe**: Werte eingeben und `Eingabe` (oder **Auswählen**) drücken
wählt genau diesen Bereich aus. **Bearbeiten → Auswahl nach Koordinaten…** macht dasselbe in einem Dialog (Rechteck oder
Ellipse), auch auf Smartphones. Als **Modus** gibt es frei, festes Seitenverhältnis und feste Größe (ein Klick setzt die Auswahl);
beim Ziehen wird die Größe angezeigt.

### Lineale, Hilfslinien und Raster

Lineale am oberen und linken Rand zeigen Bildpixel und die Zeigerposition (**Ansicht → Lineale**). Ziehen Sie aus einem Lineal ins
Bild, um eine **Hilfslinie** anzulegen (aus dem oberen Lineal eine waagrechte, aus dem linken eine senkrechte); mit dem Verschiebe-
oder Handwerkzeug lässt sie sich verschieben oder zurück auf ein Lineal (oder aus dem Bild) ziehen, um sie zu entfernen.
**Ansicht → Neue Hilfslinie…** setzt eine Hilfslinie an eine genaue Position, **Alle Hilfslinien entfernen** entfernt sie.

**Einrasten**: Auswahlen, Formen, Linien, Verläufe, Text und verschobene Auswahlen rasten an Hilfslinien und –
wenn eingeschaltet – an den Bildrändern und am **Raster** ein (Menü Ansicht: An Hilfslinien einrasten, Raster, Am Raster einrasten, An Bildrändern
einrasten). **Ansicht → Hilfslinien und Raster…** legt den Rasterabstand fest und wie nahe der Zeiger kommen muss (in
Bildschirmpixeln). Eingerastete Kanten liegen genau auf der Hilfslinie, eine Auswahl zwischen zwei Hilfslinien umfasst also genau
die Pixel dazwischen. Diese Einstellungen merkt sich der Browser; Hilfslinien gehören zum geöffneten Bild und werden nicht in der
Datei gespeichert.

## Ebenen

Die Ebenenliste rechts zeigt die Ebenen von oben nach unten. Ein Klick macht eine Ebene aktiv; das Kontrollkästchen blendet sie ein
oder aus, ein Doppelklick auf den Namen benennt sie um. Unter der Liste: **Deckkraft** und **Modus** (Multiplizieren, Negativ
multiplizieren, Überlagern, …) der aktiven Ebene und Schaltflächen zum Hinzufügen, Duplizieren, Nach-oben/-unten-Verschieben,
Nach-unten-Vereinen und Löschen. Das Menü **Ebene** spiegelt auch eine einzelne Ebene.

## Bearbeiten, Bild und Filter

- **Bearbeiten**: Rückgängig (`Strg+Z`) und Wiederholen (`Strg+Y`) bis zu 50 Schritte; Ausschneiden, Kopieren und Einfügen
  (`Strg+X/C/V`, über die System-Zwischenablage auch mit anderen Programmen; eingefügte Bilder werden eine neue Ebene); alles auswählen
  (`Strg+A`), Auswahl aufheben (`Strg+D`), Auswahl löschen (`Entf`), Auswahl mit der Vordergrundfarbe füllen.
- **Bild**: Bildgröße (mit oder ohne Glättung), Leinwandgröße (mit Anker), auf Auswahl zuschneiden, um 90° oder 180° drehen, spiegeln,
  auf eine Ebene reduzieren.
- **Filter**: Helligkeit/Kontrast, Farbton/Sättigung (mit Live-Vorschau), Tonwerte, Gradationskurven, Tonwerte automatisch,
  weichzeichnen, schärfen, Graustufen, Sepia, Farben umkehren, Relief, Kanten finden. Filter ändern die aktive Ebene (innerhalb der
  Auswahl).

**Tonwerte…** zeigt das Histogramm der aktiven Ebene (innerhalb der Auswahl) und setzt Schwarzpunkt, Mitteltöne (Gamma) und
Weißpunkt der Eingabe sowie den Ausgabebereich – für alle Farben (RGB) oder nur für Rot, Grün oder Blau. **Gradationskurven…** bildet
Helligkeitswerte über eine Kurve ab: Punkte ziehen, ein Klick auf die Linie fügt einen hinzu, ein Doppelklick auf einen Punkt entfernt
ihn; eine S-förmige Kurve erhöht den Kontrast. Beide zeigen das Ergebnis am Bild, solange der Dialog offen ist; **Zurücksetzen**
stellt den Kanal zurück, **Anwenden** ändert die Ebene (rückgängig mit `Strg+Z`).

## Ansicht

`Strg` + Mausrad oder eine Zweifingergeste auf dem Touchpad zoomt am Zeiger, das Mausrad verschiebt. `+`, `−`, `0` (an Fenster anpassen)
und `1` (100 %) funktionieren ebenfalls; die Schaltflächen sind unten rechts. Vergrößert werden Pixel scharf dargestellt.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+N` | Neues Bild |
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+A` / `Strg+D` | Alles auswählen / Auswahl aufheben |
| `Strg+Umschalt+I` | Auswahl umkehren |
| `Entf` / `Rücktaste` | Auswahl leeren |
| `Esc` | Abbrechen / Auswahl aufheben |
| `Strg+Umschalt+N` | Neue Ebene |
| `Strg+E` | Mit darunterliegender Ebene vereinen |
| `[` / `]` | Kleinerer / größerer Pinsel |
| `X` | Farben tauschen |

### Werkzeuge

| Tasten | Funktion |
|---|---|
| `V` / `H` | Verschieben / Hand |
| `M` / `Q` | Rechteck- / Ellipsenauswahl |
| `F` / `P` / `W` | Lasso / Polygon-Lasso / Zauberstab |
| `B` / `N` / `E` | Pinsel / Bleistift / Radierer |
| `S` / `J` / `U` / `K` | Kopierstempel / Reparaturpinsel / Wischfinger / Weichzeichnen und Schärfen |
| `G` / `D` | Füllen / Verlauf |
| `I` | Pipette |
| `L` / `R` / `O` / `T` | Linie / Rechteck / Ellipse / Text |

### Ansicht

| Tasten | Funktion |
|---|---|
| `+` / `-` / `Strg++` / `Strg+-` | Vergrößern / verkleinern |
| `0` / `Strg+0` | An das Fenster anpassen |
| `1` | 100 % |
| `Leertaste+Ziehen` | Ansicht verschieben |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Werkzeuge stehen in einer Leiste unter dem Bild. **Bereiche** öffnet Werkzeugoptionen und Ebenen. Ein Finger malt, zwei Finger
zoomen und verschieben die Ansicht. Die Menüs lassen sich seitlich verschieben.
