# Diagrammeditor

Der Diagrammeditor (`diagram.html`) zeichnet Flussdiagramme und andere Diagramme: Formen, Verbinder, Text, Bilder, mehrere Seiten.
Er öffnet und speichert **draw.io**-Dateien, sodass Diagramme mit draw.io (diagrams.net) und dessen Desktop-Anwendung ausgetauscht
werden können, und er importiert **Excalidraw**-Zeichnungen.

## Dateien

| Format | Öffnen | Speichern |
|---|---|---|
| draw.io (`.drawio`, `.xml`), auch komprimiert | ja, alle Seiten | ja (**Speichern**, `Strg+S`) |
| SVG und PNG mit eingebettetem Diagramm (`.drawio.svg`, `.drawio.png`) | ja | **Speichern** schreibt wieder das Bild (erste Seite), Export **SVG** / **PNG** |
| Excalidraw (`.excalidraw`) | ja (Rechtecke, Ellipsen, Rauten, Text, Pfeile, Linien, Bilder) | – |
| Mermaid-Flussdiagramm (`.mmd`, `.mermaid`) | ja, automatisch angeordnet | – |

Die SVG- und PNG-Exporte zeigen die aktuelle Seite als Bild und enthalten das ganze Diagramm, wie die „bearbeitbaren“ Exporte von
draw.io: Öffnen Sie sie wieder in diesem Editor (oder in draw.io), um weiterzuarbeiten. Ein aus einem solchen Bild geöffnetes Diagramm
wird wieder als solches Bild gespeichert (mit der ersten Seite als Bild) – so werden Diagramme in Präsentationen, Dokumenten und
Tabellen bearbeitet (dort *Diagramm einfügen* und *Diagramm bearbeiten*). Eine auf das Fenster gezogene Diagrammdatei wird
geöffnet; ein gezogenes Bild wird eingefügt.

**🖨** druckt das Diagramm: jede Seite auf einem eigenen Blatt mit ihrem Namen, auf die Blattbreite skaliert. Wählen Sie „Als PDF
speichern“ als Drucker, um ein PDF zu erhalten.

> **Hinweis:** draw.io kennt viel mehr Formen und Optionen. Formen, die dieser Editor nicht kennt, werden als Rechtecke dargestellt, und
> Beschriftungen sind reiner Text (fette oder farbige Teile einer Beschriftung gehen verloren). Stileinstellungen, die der Editor nicht
> verwendet, bleiben beim Speichern erhalten, sodass sie beim Bearbeiten mit diesem Editor nicht verloren gehen.

## Zeichnen

- Die Formenleiste links fügt eine Form in der Mitte der Ansicht ein; eine Form kann auch auf die Zeichnung gezogen werden.
- Tastatur-Werkzeuge: `R` Rechteck, `O` Ellipse, `D` Entscheidung (Raute), `N` Notiz, `T` Text, `A` Verbinder, `V` Auswählen,
  `H` Verschieben. Mit einem Formwerkzeug ziehen Sie die Form in beliebiger Größe auf.
- **Verbinder**: Zeigen Sie auf eine Form; an der Mitte jeder Seite erscheinen kleine Kreise. Ziehen Sie von einem davon zu einer anderen
  Form (auf einen Kreis für eine feste Seite oder irgendwo auf die Form für ein freies Ende). Die Endpunkte eines ausgewählten Verbinders
  lassen sich an eine andere Stelle ziehen oder frei lassen.
- **Text**: Ein Doppelklick auf eine Form oder einen Verbinder bearbeitet die Beschriftung (`Strg+Eingabe` oder ein Klick daneben
  beendet, `Esc` bricht ab). Ein Doppelklick auf eine leere Stelle fügt einen Text ein. `F2` oder `Eingabe` bearbeitet das gewählte Element.
- **Bilder**: Die Bild-Schaltfläche fügt eine Bilddatei ein; eingefügte und gezogene Bilder funktionieren ebenfalls.

### Formenbibliotheken

Unter den allgemeinen Formen öffnen sich weitere Bibliotheken mit einem Klick auf ihren Namen (die geöffneten bleiben gespeichert):

| Bibliothek | Formen |
|---|---|
| UML | Klasse, Paket, Komponente, Akteur, Anwendungsfall (Ellipse), Notiz |
| BPMN | Aufgabe, Start-, Zwischen- und Endereignis, exklusives Gateway, Pool, Dokument, Datenspeicher |
| Netzwerk | Server, Computer, Firewall, Router, Wolke, Datenbank |
| Entity-Relationship | Entität, Beziehung (Raute), Attribut (Ellipse) |

**Klassen und Entitäten** haben ein Titelfeld: die erste Textzeile ist der Titel, die weiteren Zeilen stehen darunter, und eine Zeile
nur mit `--` zeichnet eine Trennlinie (z. B. zwischen Attributen und Methoden). Die **Verbinderenden** (Formatbereich, Anfang/Ende)
enthalten die Krähenfußnotation für Entity-Relationship-Diagramme (`er-one`, `er-mand-one`, `er-many`, `er-one-many`, `er-zero-one`,
`er-zero-many`) sowie das hohle Dreieck und die hohle Raute von UML (`block-open` für Generalisierung, `diamond-open` für Aggregation).
Alle werden als die entsprechenden draw.io-Formen und -Pfeile gespeichert.

## Auswählen und anordnen

- Klick wählt aus, `Umschalt`+Klick fügt hinzu oder entfernt, Ziehen auf einer leeren Stelle wählt alles im Rahmen, `Strg+A` wählt alles.
- Ziehen verschiebt (am Raster; `Alt` halten für freie Position), Ziehen an den Griffen ändert die Größe (`Umschalt` behält die Proportionen).
  Die Pfeiltasten verschieben um einen Punkt, mit `Umschalt` um einen Rasterschritt.
- **Drehen:** den runden Griff über der Auswahl ziehen (`Umschalt`: in 15°-Schritten; nahe 0°, 90°, 180° und 270° rastet er ein),
  den Winkel unter **Drehung** im Formatbereich eingeben oder dort mit ⟲ / ⟳ um 90° drehen. Eine Form dreht sich um ihre Mitte,
  mehrere Formen (etwa eine Gruppe) drehen sich gemeinsam um die Mitte der Auswahl. Verbinder bleiben an den gedrehten Formen, und
  die Griffe ändern die Größe einer gedrehten Form entlang ihrer eigenen Seiten.
- `Entf` löscht die Auswahl (Verbinder gelöschter Formen werden mitgelöscht). `Strg+D` dupliziert, `Strg+C`, `Strg+X` und `Strg+V` kopieren,
  schneiden aus und fügen ein – auch zwischen diesem Editor und draw.io, weil die Zwischenablage draw.io-XML enthält. Eingefügter reiner
  Text wird ein Text.
- Rückgängig `Strg+Z`, Wiederholen `Strg+Y` (oder `Strg+Umschalt+Z`).

### Gruppen, Sperren und Ebenen

- **Gruppieren** (`Strg+G`, im Formatbereich) fasst die gewählten Formen und Verbinder zusammen: ein Klick auf eine davon wählt die
  ganze Gruppe, die sich dann gemeinsam verschiebt; `Alt`+Klick wählt ein einzelnes Mitglied. Gruppen können Gruppen enthalten: Wer
  eine Gruppe mit weiteren Formen (oder einer anderen Gruppe) gruppiert, erhält eine neue Gruppe darum, so entsteht eine Hierarchie.
  **Gruppierung aufheben** (`Strg+Umschalt+G`) löst die äußerste gewählte Gruppe auf (ihre Mitglieder bleiben in der umgebenden
  Gruppe); ein mit `Alt`+Klick gewähltes einzelnes Mitglied verlässt seine Gruppe.
- **Elemente** (☰ über den Formen in der linken Seitenleiste) zeigt die Seite als Baum: die Ebenen (oberste zuerst), darin die Gruppen
  mit ihren Mitgliedern und die einzelnen Formen und Verbinder, die oberste zuerst (▸ / ▾ klappt eine Ebene oder Gruppe zu und auf). Ein
  Klick auf einen Eintrag wählt ihn im Diagramm aus – eine Gruppe oder Ebene steht für ihren ganzen Inhalt –, `Strg`+Klick fügt hinzu oder
  nimmt weg, `Umschalt`+Klick fügt hinzu; Verschieben, Stile, Drehen und die anderen Funktionen gelten dann für alle. Ein Doppelklick
  (oder `F2`) ändert die Beschriftung direkt im Baum: den Text einer Form oder eines Verbinders, den Namen einer Gruppe oder Ebene.
  `Enter` übernimmt (bei mehrzeiligen Beschriftungen fügt `Umschalt+Enter` eine Zeile ein), `Esc` bricht ab; jede Änderung lässt sich
  rückgängig machen. Mit der Tastatur: `↑` `↓` bewegen, `→` `←` öffnen und schließen eine Ebene oder Gruppe, `Enter` wählt aus.
- **Sperren** (`Strg+L`) fixiert die Auswahl: gesperrte Objekte lassen sich nicht versehentlich auswählen, verschieben oder löschen
  (Klicks gehen durch sie hindurch). **Alle entsperren** im Bereich *Diagramm* (nichts ausgewählt) oder `Strg+Umschalt+L` gibt sie frei.
- **Ebenen** (im Bereich *Diagramm*, oberste Ebene zuerst): ◉ wählt die Ebene für neue Formen, 👁 zeigt oder verbirgt eine Ebene
  (verborgene Ebenen werden auch nicht exportiert oder gedruckt), 🔒 sperrt sie, ▲ ▼ ändern die Reihenfolge, ein Doppelklick benennt sie
  um, × löscht sie (ihr Inhalt kommt auf die Ebene darunter), **+ Ebene hinzufügen** legt eine an. Bei mehreren Ebenen verschiebt
  **Auf Ebene verschieben** im Formatbereich die Auswahl.

Gruppen (mit Namen und Verschachtelung), Drehung, Sperren und Ebenen werden in der draw.io-Datei gespeichert und von draw.io
verstanden; Gruppen und Winkel aus Excalidraw-Dateien werden beim Öffnen übernommen.

### Automatisch anordnen und Mermaid

**Automatisch anordnen** (im Formatbereich, wenn nichts ausgewählt ist – oder bei mehreren ausgewählten Formen nur für diese)
ordnet die Formen in Ebenen entlang ihrer Verbinder an: von oben nach unten, von links nach rechts, von unten nach oben oder von
rechts nach links. Verbinder, die gegen diese Richtung zurückführen, werden seitlich herumgeführt. Rückgängig stellt die vorherige
Anordnung wieder her.

**Mermaid einfügen…** wandelt ein [Mermaid](https://mermaid.js.org)-Flussdiagramm in Formen und Verbinder um und ordnet sie an,
zum Beispiel:

```
flowchart TD
  A[Start] --> B{OK?}
  B -->|ja| C([Fertig])
  B -- nein --> D[(Datenbank)]
  D -.-> A
```

Unterstützt werden die Richtung (`TD`/`TB`, `LR`, `BT`, `RL`), die Knotenformen `[ ]` Rechteck, `( )` abgerundet, `([ ])` Start/Ende,
`[( )]` Zylinder, `(( ))` Kreis, `{ }` Entscheidung, `{{ }}` Sechseck, `[/ /]` Parallelogramm, Beschriftungen in Anführungszeichen und
`<br>`, die Verbindungen `-->`, `---`, `-.->` (gestrichelt), `==>` (dick), `<-->`, `--o`, `--x`, Beschriftungen als `-->|Text|` oder
`-- Text -->`, Ketten und `A & B --> C`. Untergraphen, Stile und Klassen werden ignoriert; andere Mermaid-Diagrammarten (Sequenz,
Klassen, …) lassen sich nicht importieren.

## Formatbereich

Der Bereich rechts zeigt die Einstellungen der Auswahl:

| Abschnitt | Einstellungen |
|---|---|
| Stil | Formtyp, Füllung (oder keine), Linienfarbe (oder keine), Linienbreite, gestrichelt, Deckkraft |
| Verbinder | Linienführung (gerade, gewinkelt, gebogen), Pfeil am Anfang und am Ende (keiner, klassisch, offen, Raute, Oval) |
| Text | Schriftgröße und -farbe, fett, kursiv, waagrechte und senkrechte Ausrichtung |
| Position und Größe | X, Y, Breite und Höhe einer einzelnen Form; Drehung in Grad (alle gewählten Formen), ⟲ / ⟳ um 90° |
| Anordnen | nach vorne, nach hinten, duplizieren, löschen; bei mehreren Formen: links/mittig/rechts/oben/Mitte/unten ausrichten, verteilen |

Ohne Auswahl schaltet der Bereich Raster und Einrasten ein oder aus.

## Seiten und Ansicht

Die Leiste unten zeigt die Seiten: Klick wechselt, Doppelklick benennt um, **+** fügt eine Seite hinzu, **×** löscht die aktuelle Seite.
`Strg` + Mausrad (oder Zweifingergeste) zoomt, das Mausrad verschiebt, `Leertaste` halten oder das Hand-Werkzeug verschiebt die Ansicht.
**Einpassen** (`Strg+0`) zeigt die ganze Seite.

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
| `Strg+A` | Alles auswählen |
| `Strg+D` | Duplizieren |
| `Strg+G` / `Strg+Umschalt+G` | Gruppieren / Gruppierung aufheben |
| `Alt+Klick` | Ein Mitglied einer Gruppe auswählen |
| `Strg+L` / `Strg+Umschalt+L` | Auswahl sperren / alle entsperren |
| `Entf` / `Rücktaste` | Löschen |
| `F2` / `Eingabe` | Text bearbeiten |
| `←` / `→` / `↑` / `↓` | Um 1 verschieben (mit Umschalt: um das Raster) |
| `Strg+]` / `Strg+[` | Nach vorne / nach hinten |
| `Esc` | Auswahl aufheben, zurück zum Auswahlwerkzeug |

### Werkzeuge

| Tasten | Funktion |
|---|---|
| `V` / `H` | Auswählen / Hand |
| `A` / `L` | Verbinder |
| `T` | Text |
| `R` / `O` / `D` / `N` | Rechteck / Ellipse / Raute / Notiz |

### Ansicht

| Tasten | Funktion |
|---|---|
| `Strg++` / `Strg+-` | Vergrößern / verkleinern |
| `Strg+0` | An das Fenster anpassen |
| `Leertaste+Ziehen` | Ansicht verschieben |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Formen stehen in einer Leiste unter der Zeichnung; Tippen fügt eine Form ein. **Format** öffnet den Formatbereich. Zwei Finger zoomen
und verschieben die Ansicht.
