# Web-Folien

`reveal.html` erstellt Präsentationen mit [reveal.js](https://revealjs.com), dem HTML-Präsentationsframework (das auch der
Folienexport von Jupyter verwendet). Präsentationen werden als **eine HTML-Datei** gespeichert, die in jedem Browser läuft –
offline, ohne Installation – und wieder bearbeitet werden kann.

## Folien

Die Liste links zeigt die Folien. reveal.js ordnet sie zweidimensional an: Hauptfolien von links nach rechts und
**Unterfolien** unter einer Hauptfolie (in der Liste eingerückt, nummeriert 2.1, 2.2, …).

| Schaltfläche | Funktion |
|---|---|
| + Folie | fügt nach der aktuellen eine Folie ein: Titel, Titel und Liste, Abschnitt, Bild, Code, Zitat, leer, Markdown oder HTML |
| + Unterfolie | fügt unter der aktuellen Folie eine Unterfolie ein |
| ↑ ↓ | verschieben die Folie (innerhalb ihrer Ebene) |
| ⇥ ⇤ | machen eine Hauptfolie zur Unterfolie der vorigen Folie bzw. eine Unterfolie zur Hauptfolie |
| ⧉ 🗑 | duplizieren bzw. löschen die Folie |

Mit der Maus lassen sich Folien in der Liste auch **ziehen**: Ablegen auf einer Folie setzt die gezogene Folie davor (auf derselben
Ebene); Ablegen auf der rechten Hälfte einer Hauptfolie macht sie zu deren letzter Unterfolie. Eine Hauptfolie nimmt ihre Unterfolien
mit.

## Eine Folie bearbeiten

In der Mitte erscheint die Folie so, wie reveal.js sie zeigt. **Klicken** Sie ein Element an, um es auszuwählen;
**doppelklicken** Sie einen Text (oder drücken Sie `Eingabe`), um ihn direkt dort zu bearbeiten; die Leiste darüber bietet fett,
kursiv, unterstrichen, durchgestrichen, Code, Link, Farbe und Formatierung entfernen. `Esc` oder **Fertig** beendet die Bearbeitung.

**+ Element** fügt nach dem gewählten Element eine Überschrift, einen Text, eine Liste, ein Bild, Code, ein Zitat, eine Tabelle,
ein Diagramm oder einen HTML-Block ein. Der Reiter **Element** rechts bearbeitet das gewählte Element:

- Überschriftenebene und „Text an die Folie anpassen“, nummerierte Listen, Bilder (Datei, Alternativtext, Breite, restliche Höhe
  füllen), Code (Sprache mit Syntaxhervorhebung, Zeilennummern und hervorgehobene Schritte wie `1|2-3|5`), Tabellenzeilen und
  -spalten, HTML;
- **Einblenden (Fragment)**: Das Element erscheint auf Klick mit einem Effekt (einblenden, von unten, wachsen, schrumpfen,
  hervorheben, …); Listen können ihre Punkte einzeln zeigen; die Reihenfolge bestimmt, was zuerst kommt;
- **Auto-Animate-ID**: Elemente mit gleicher ID auf aufeinanderfolgenden Auto-Animate-Folien gehen fließend ineinander über;
- Ausrichtung, Größe und Farbe; verschieben, duplizieren und löschen.

Eine Folie kann auch in **Markdown** oder **HTML** geschrieben werden (Reiter Folie, Inhalt); Markdown unterstützt die
reveal.js-Schreibweise, zum Beispiel `<!-- .element: class="fragment" -->`.

### Diagramme

Ein **Diagramm**-Block zeichnet ein Mermaid-Flussdiagramm, das im Inspektor eingegeben wird, zum Beispiel `flowchart LR` und Zeilen wie
`A[Idee] --> B{Gut?}` und `B -->|ja| C([Folien])`. Kästen, abgerundete Kästen, Entscheidungen, Start/Ende, Datenbanken, Sechsecke und Kreise
werden automatisch angeordnet, wie beim *Mermaid-Import* des Diagrammeditors; andere Mermaid-Diagrammarten zeigen einen Fehler. Die Zeichnung
wird als SVG in der Präsentation gespeichert, braucht also keine Mermaid-Bibliothek und funktioniert offline; sie übernimmt die Textfarbe des
Designs. Beim Speichern als PowerPoint werden Diagramme ausgelassen.

### Formeln

Mathematische Formeln schreiben Sie in TeX (LaTeX-Schreibweise) in jedem Text, in Markdown oder HTML: `$$ … $$` oder
`\[ … \]` für eine Formel in eigener Zeile, `\( … \)` innerhalb eines Satzes, zum Beispiel `$$\int_0^1 x^2\,dx = \tfrac13$$`
oder `Pythagoras: \(a^2 + b^2 = c^2\)`. Ein einzelnes `$` bleibt ein gewöhnliches Dollarzeichen. Die Formeln werden mit KaTeX
in der Vorschau und in der gespeicherten Präsentation gesetzt, auch offline; nur Präsentationen mit Formeln enthalten KaTeX
(etwa 0,6 MB). Beim Bearbeiten eines Textes mit Formel bearbeiten Sie ihren TeX-Quelltext.

## Folien- und Präsentationseinstellungen

- Reiter **Folie**: Hintergrund (Farbe, CSS-Verlauf, Bild mit Größe und Deckkraft), Übergang und Geschwindigkeit, Auto-Animate,
  Sichtbarkeit (versteckt oder nicht gezählt), senkrechte Position, automatisches Weiterschalten, **Sprechernotizen**, CSS-Klasse.
- Reiter **Präsentation**: Titel, Design (14 reveal.js-Designs), Code-Farben, Übergänge, Foliengröße (z. B. 16:9),
  Pfeil-Steuerung, Fortschrittsbalken, Foliennummern, senkrechtes Zentrieren, Endlosschleife, Foliennummer in der Adresse,
  Navigationsart, Ansicht als scrollende Seite, automatisches Weiterschalten, Sprache und eigenes CSS.

## Präsentieren

**▶ Präsentieren** (`F5`) zeigt die Präsentation ab der aktuellen Folie im Vollbild. Tasten: Pfeile oder `Leertaste` zum Blättern,
`O` oder `Esc` Übersicht, `S` Referentenansicht mit Notizen und Uhr, `F` Vollbild. **↗** präsentiert in einem neuen Fenster
(praktisch mit einem zweiten Bildschirm), **🖨** öffnet die Druckansicht zum Speichern als PDF (im Druckdialog „Als PDF
speichern“ wählen) – mit *Drucken / PDF mit Sprechernotizen* folgt auf jede Folie eine Seite mit ihren Notizen.

## Dateien

| Format | Öffnen | Speichern |
|---|---|---|
| reveal.js-Präsentation (`.html`) | ja – eigene Dateien vollständig, andere reveal.js-Präsentationen mit ihren Folien als HTML | ja (Speichern, `Strg+S`) |
| Markdown (`.md`) | ja – `---` trennt Folien, `--` Unterfolien, `Note:` beginnt Sprechernotizen | Speichern unter → Markdown (nur Texte) |
| Jupyter-Notebook (`.ipynb`) | ja – die Folientypen der Zellen (slide, subslide, fragment, skip, notes) wie bei `jupyter nbconvert --to slides` | – |
| PowerPoint (`.pptx`) | ja – in Blöcke umgewandelt: Titel, formatierte Texte, Listen, Bilder, Tabellen, Notizen, Hintergründe, Übergänge, Eingangsanimationen als Fragmente | Speichern unter → PowerPoint (Blöcke von oben nach unten angeordnet) |

Markdown-Dateien und Notebooks werden umgewandelt; Speichern erzeugt eine neue HTML-Präsentation. Im Python-Notebook zeigt
**Folien** für jede Zelle einen Folientyp, und **🎞️ Folien** öffnet das Notebook hier. Rückgängig und Wiederholen (`Strg+Z`,
`Strg+Y`) wirken auf alle Änderungen.

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
| `Eingabe` | Ausgewähltes Element bearbeiten |
| `Esc` | Bearbeitung beenden |
| `Entf` / `Rücktaste` | Ausgewähltes Element löschen |

### Vorführen

| Tasten | Funktion |
|---|---|
| `F5` | Vorführen |
| `→` / `←` / `Leertaste` | Nächster / vorheriger Schritt |
| `↑` / `↓` | Vertikale Folien |
| `S` | Referentenansicht mit Notizen |
| `O` / `Esc` | Übersicht aller Folien |
| `F` | Vollbild |
| `B` | Schwarzer Bildschirm (Pause) |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Vorschau nutzt die volle Breite; ‹ und › wechseln die Folie, **Folien** öffnet die Folienliste und **Bereiche** die
Einstellungen. Doppeltippen auf einen Text bearbeitet ihn.
