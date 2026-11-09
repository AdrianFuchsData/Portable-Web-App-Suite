# Bildbearbeitung

Die Bildbearbeitung (`imageeditor.html`) bearbeitet Rasterbilder mit Ebenen: Malen, Formen, Text, Verläufe, Auswahlen, Korrekturen und
Filter, Größe ändern, Zuschneiden, Drehen und die Zwischenablage.

## Dateien

| Format | Öffnen | Speichern |
|---|---|---|
| PNG, JPEG, WebP | ja | ja (JPEG und WebP mit Qualitätseinstellung) |
| BMP | ja | ja (24 Bit) |
| GIF | ja (erstes Bild) | ja (bis zu 256 Farben, Transparenz, wahlweise gerastert) |
| ICO | ja | ja (Größen 16 bis 256 Pixel in einer Datei) |
| SVG, AVIF | ja (SVG wird in Pixel umgewandelt) | – |
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
- **Datei → Auswahl exportieren…** speichert den ausgewählten Teil der aktiven Ebene, **Ebene exportieren…** die aktive Ebene allein,
  als eigene Datei (in einem der Einzelbildformate); das geöffnete Bild bleibt, wie es ist.
- **Datei → Stapelverarbeitung…** ändert viele Bilder auf dieselbe Weise: Bilder wählen (auch aus einem Archiv), die Schritte ankreuzen –
  in eine Größe einpassen, drehen, spiegeln, Tonwerte automatisch, Graustufen, schärfen, ein Text-Wasserzeichen – sowie Ausgabeformat,
  Qualität und Dateinamen (`{name}`, `{n}`, `{w}`, `{h}`). **Bearbeiten und als ZIP speichern** schreibt alle Ergebnisse in ein ZIP
  (ohne Metadaten); Bilder, die sich nicht lesen lassen, stehen in `errors.txt`. Die Schritte werden gemerkt.
- Fotos öffnen sich **aufrecht**: Die Ausrichtung, die eine Kamera oder ein Smartphone in der Datei gespeichert hat (EXIF), wird in
  jedem Browser angewendet.
- **Datei → Bildinformationen…** zeigt die Größe und die **Metadaten** der geöffneten JPEG-, PNG- oder WebP-Datei: Kamera, Objektiv,
  Belichtung, Datum, Urheber, Copyright, Kommentare, XMP/IPTC und den **Ort**, an dem das Bild aufgenommen wurde (mit einer Warnung).
  **Kopie ohne Metadaten speichern** schreibt die Datei ohne all das – das Bild selbst wird nicht neu komprimiert und bleibt genau
  wie es war; nur Farbprofil und Ausrichtung bleiben erhalten. Speichern aus der Bildbearbeitung schreibt nie Metadaten.

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
| T Text | `T` | dort klicken, wo der Text beginnen soll; Text, Schrift, Größe, Farbe, Ausrichtung, fett, kursiv eingeben – er wird eine **Textebene**; ein Klick auf vorhandenen Text bearbeitet ihn |
| ⛶ Zuschneiden | `C` | den Bereich aufziehen, der bleiben soll – frei oder mit Seitenverhältnis (Original, 1:1, 4:3, 3:2, 16:9, 5:4; hochkant, wenn höher als breit gezogen); der Rest wird abgedunkelt, mit Dritteln; `Eingabe` oder **Zuschneiden** schneidet zu, `Esc` bricht ab |
| ⤡ Frei transformieren | `Strg+T` | die ausgewählten Pixel (oder die ganze Ebene) in einem Rahmen: einen Griff ziehen skaliert (`Umschalt` behält das Seitenverhältnis), der runde Griff oder außerhalb des Rahmens dreht (`Umschalt`: 15°-Schritte), innen verschiebt; Position, Größe und Winkel lassen sich eingeben, ⇋ / ⇵ spiegeln; `Eingabe`, **Übernehmen** oder ein anderes Werkzeug übernimmt, `Esc` bricht ab; die Auswahl folgt |
| ✋ Hand | `H` oder `Leertaste` halten | verschiebt die Ansicht |

Die Werkzeugoptionen (Größe, Deckkraft, Füllung, Toleranz) stehen rechts. `[` und `]` ändern die Größe, `X` tauscht Vorder- und
Hintergrundfarbe. Alle Malwerkzeuge wirken nur innerhalb der Auswahl, falls es eine gibt.

### Pinselspitzen

Pinsel und Radierer malen mit einer **Pinselspitze** (Werkzeugoptionen): rund, weich rund, Quadrat, Raute, Stern, Kalligrafie
(eine flache, schräge Spitze) und Streuung. **Härte** macht den Rand erzeugter Spitzen scharf oder weich, **Abstand** bestimmt die
Entfernung zwischen den Abdrücken der Spitze (in % der Größe: kleine Werte ergeben eine glatte Linie, große eine Reihe einzelner
Abdrücke), **Winkel** dreht die Spitze. Mit einem Stift folgen **Stiftdruck: Größe** (voreingestellt) und **Stiftdruck: Deckkraft**
dem Druck.

**+** lädt eigene Spitzen, auch aus einem Archiv: GIMP-Pinsel (`.gbr`, grau oder farbig – farbige malen in der Vordergrundfarbe),
parametrische GIMP-Pinsel (`.vbr`) und Bilder (PNG, JPEG, WebP, … – dunkle Pixel malen, helle und durchsichtige nicht). Eigene
Spitzen bleiben im Browser gespeichert und wandern mit exportierten Einstellungen (auch in einem Arbeitsbereich mit Einstellungen);
**×** entfernt eine.

### Auswahlen kombinieren

Bei jedem Auswahlwerkzeug fügt gedrücktes `Umschalt` der bestehenden Auswahl **hinzu**, `Alt` **zieht** davon **ab**; die
Werkzeugoption **Auswahl** (Neu, Hinzufügen, Abziehen, Schnittmenge) macht dasselbe ohne Tasten, etwa am Smartphone.
**Bearbeiten → Auswahl umkehren** (`Strg+Umschalt+I`) wählt alles andere aus. Kombinierte und Zauberstab-Auswahlen folgen den Pixeln
genau; das Verschiebewerkzeug verschiebt sie wie jede Auswahl.

### Weiche Auswahl: ausblenden, vergrößern, verkleinern, Rand

Eine Auswahl kann Pixel **teilweise** auswählen, wie in GIMP: Ein teilweise ausgewähltes Pixel ändert sich nur so weit, wenn Sie
malen, füllen, löschen, einen Filter oder eine Korrektur anwenden, kopieren (die Kopie ist dort teilweise durchsichtig) oder es
verschieben (so viel davon wandert mit, der Rest bleibt). Im Menü **Bearbeiten**:

- **Auswahl ausblenden…** gibt der Auswahl einen weichen Rand über den Radius (in Pixeln).
- **Auswahl vergrößern…** und **Auswahl verkleinern…** verschieben den Rand um den Radius nach außen oder innen; Ecken werden rund.
- **Auswahlrand…** wählt ein Band des Radius auf beiden Seiten des Rands aus, etwa um einen weichen Umriss zu malen.

Die Ameisenlinie zeigt, wo Pixel mindestens zur Hälfte ausgewählt sind. **Auswahl umkehren** behält den weichen Rand. Eine weiche
Auswahl mit einer anderen zu kombinieren (`Umschalt`, `Alt`) addiert oder subtrahiert die Anteile.

### Schnellmaske

Die **Schnellmaske** (`Umschalt+Q`, **Bearbeiten → Schnellmaske** oder die Schaltfläche **◐** in der Statusleiste) zeigt die
Auswahl als Bild: Was nicht ausgewählt ist, liegt unter Rot. Jetzt wirken alle Malwerkzeuge, Filter und Auswahländerungen auf
diese Maske statt auf das Bild: **weiß** malen wählt aus, **schwarz** wählt ab, **grau** wählt teilweise aus (etwa der Pinsel mit
weichem Rand, der Verlauf oder **Filter → Weichzeichnen** für einen weichen Rand). Schalten Sie die Schnellmaske wieder aus, ist das
Gemalte die Auswahl. Änderungen der Maske gehören nicht zum Rückgängig-Verlauf des Bildes; Bildoperationen (Größe, Drehen,
Zuschneiden) beenden die Schnellmaske zuerst.

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

**Ebenenmasken** verbergen Teile einer Ebene, ohne sie zu löschen: **Ebene → Ebenenmaske hinzufügen** (alles sichtbar) oder
**Ebenenmaske aus Auswahl** (sichtbar, wo ausgewählt). Die Maske erscheint neben der Ebene in der Liste; ein Klick darauf malt auf der
Maske – weiß zeigt, schwarz verbirgt, grau zeigt teilweise (alle Werkzeuge und Filter wirken auf sie, etwa ein Verlauf für einen
weichen Übergang) –, ein Klick auf das Ebenen-Vorschaubild oder den Namen malt wieder auf der Ebene. **Ebenenmaske deaktivieren** zeigt
die Ebene ohne sie, **Ebenenmaske anwenden** macht die verborgenen Teile endgültig durchsichtig, **Ebenenmaske löschen** entfernt sie.
Photoshop-Dateien behalten Ebenenmasken (auch in Photoshop angelegte bleiben bearbeitbar); OpenRaster-Dateien behalten sie für die
Suite, andere Programme zeigen das maskierte Ergebnis.

**Textebenen** (in der Liste mit **T** markiert) bleiben bearbeitbar: Klicken Sie den Text mit dem Textwerkzeug an, die Schaltfläche
**T** oder **Ebene → Text bearbeiten…**, um Text, Schrift, Größe, Farbe oder Ausrichtung zu ändern; ein geleerter Text entfernt die
Ebene. Verschieben der ganzen Ebene mit dem Verschiebewerkzeug, Zuschneiden und Ändern der Arbeitsfläche lassen sie eine Textebene.
Sobald sich ihre Pixel anders ändern (Malen, Filter, Spiegeln, Drehen oder Skalieren des Bildes, Vereinen), wird sie eine normale
Ebene – Rückgängig macht sie wieder zur Textebene; **Ebene → Textebene in Pixel umwandeln** tut das gezielt. OpenRaster-Dateien
(`.ora`) behalten Textebenen (andere Programme zeigen ihre Pixel), PSD-Dateien erhalten ihre Pixel.

## Bearbeiten, Bild und Filter

- **Bearbeiten**: Rückgängig (`Strg+Z`) und Wiederholen (`Strg+Y`) bis zu 50 Schritte; Ausschneiden, Kopieren und Einfügen
  (`Strg+X/C/V`, über die System-Zwischenablage auch mit anderen Programmen; eingefügte Bilder werden eine neue Ebene); alles auswählen
  (`Strg+A`), Auswahl aufheben (`Strg+D`), Auswahl löschen (`Entf`), Auswahl mit der Vordergrundfarbe füllen.
- **Bild**: Bildgröße (mit oder ohne Glättung), Leinwandgröße (mit Anker), auf Auswahl zuschneiden, um 90° oder 180° drehen,
  **um Winkel drehen…** (beliebiger Winkel; auf das Bild zuschneiden, sodass keine leeren Ecken bleiben, Arbeitsfläche vergrößern
  oder Größe behalten), **ausrichten…** (eine Linie entlang etwas ziehen, das waagrecht oder senkrecht sein soll, etwa dem Horizont;
  der Drehen-Dialog öffnet sich mit dem Winkel), spiegeln, auf eine Ebene reduzieren.
- **Filter**: Helligkeit/Kontrast, Farbton/Sättigung (mit Live-Vorschau), Tonwerte, Gradationskurven, Tonwerte automatisch,
  weichzeichnen, schärfen, Graustufen, Sepia, Farben umkehren, Relief, Kanten finden; mit Live-Vorschau: **Farbbalance** (Cyan–Rot,
  Magenta–Grün, Gelb–Blau für Schatten, Mitteltöne und Lichter, wahlweise mit erhaltener Helligkeit), **Dynamik** (mehr Sättigung für
  matte Farben, wenig für schon kräftige), **Schwellwert** (Schwarz-Weiß), **Tontrennung** (weniger Stufen je Farbe), **Unscharf
  maskieren** (Radius, Stärke, Schwellwert), **Median** (entfernt Rauschen und Staub) und **Vignette** (zu den Ecken dunkler – oder,
  negativ, heller). Filter ändern die aktive Ebene (innerhalb der Auswahl; teilweise ausgewählte Pixel teilweise).

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
| `Umschalt+Q` | Schnellmaske ein/aus |
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
| `C` | Zuschneidewerkzeug (`Eingabe` schneidet zu, `Esc` bricht ab) |
| `Strg+T` | Frei transformieren (`Eingabe` übernimmt, `Esc` bricht ab) |

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
