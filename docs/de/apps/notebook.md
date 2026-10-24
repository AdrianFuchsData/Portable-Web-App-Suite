# Python-Notebook

Das Python-Notebook (`notebook.html`) führt Python 3 im Browser aus – ohne Installation, Server oder Internetverbindung. Es arbeitet wie Jupyter:
Notebooks mit Code- und Textzellen, Ergebnisse direkt unter dem Code, Diagramme, Tabellen. Eine Konsole führt einzelne Befehle aus.

Enthaltene Bibliotheken: numpy, pandas, matplotlib, seaborn, sympy, networkx, lxml, beautifulsoup4, pyyaml, openpyxl, xlrd, regex, requests,
sqlite3, SQLAlchemy, pykeepass, nzpy und micropip. Sie werden beim ersten Import geladen; numpy, pandas und matplotlib werden nach dem Start im
Hintergrund vorbereitet. Der erste Start dauert einige Sekunden; der Status rechts oben zeigt, wann Python bereit ist.

## Notebooks

- **Öffnen** (`Strg+O`) öffnet ein Jupyter-Notebook (`.ipynb`) oder ein Python-Skript. In Skripten beginnt `# %%` eine Codezelle und
  `# %% [markdown]` eine Textzelle (das Format von VS Code, Spyder und Jupytext); ein Skript ohne Markierungen wird eine Zelle.
  Rohzellen (für nbconvert) werden als einfacher Text mit der Markierung *Roh* angezeigt und unverändert gespeichert.
- **Speichern** (`Strg+S`) speichert das Notebook als `.ipynb` (mit Ausgaben): in Chrome/Edge am Desktop direkt in die Datei, in Firefox und
  unter Android als Download. **Speichern unter** speichert unter neuem Namen. **Exportieren…** lädt das Notebook als Python-Skript (`.py`)
  herunter, als **HTML-Seite** mit Code, Markdown und Ausgaben (Tabellen, Diagramme), die sich in jedem Browser öffnen lässt, als **HTML-Seite ohne
  Code** (ein Bericht der Ergebnisse) oder druckt es (**PDF**: „Als PDF speichern“ als Drucker wählen).
- **Neu** beginnt ein leeres Notebook.

## Zellen

- **+ Code** und **+ Markdown** fügen unter der gewählten Zelle eine Zelle ein; die Schaltflächen neben einer Zelle führen sie aus (▶), wechseln
  ihren Typ (M / { }), verschieben sie (↑ ↓) oder löschen sie (✕).
- Markdown-Zellen zeigen nach dem Ausführen formatierten Text; ein Doppelklick bearbeitet sie wieder.
- **▶▶ Alle ausführen** führt alle Zellen von oben aus; **Ausgaben löschen** entfernt alle Ergebnisse.

| Taste | In einer Zelle (Bearbeiten) |
|---|---|
| `Umschalt+Eingabe` | ausführen und zur nächsten Zelle (am Ende eine neue) |
| `Strg+Eingabe` | ausführen und bleiben |
| `Alt+Eingabe` | ausführen und darunter eine neue Zelle einfügen |
| `Esc` | Editor verlassen (Befehlsmodus) |

Im Befehlsmodus (eine Zelle ist gewählt, die Schreibmarke steht nicht darin): `Eingabe` bearbeitet, `A`/`B` fügen eine Zelle darüber/darunter ein,
`M` macht eine Markdown-Zelle, `Y` eine Codezelle, `↑`/`↓` wählen, `Entf` löscht die Zelle.

Ausgaben: gedruckter Text, Fehler (im Traceback nur Ihr Code), das Ergebnis der letzten Zeile, Tabellen (pandas), Diagramme (matplotlib, auch ohne
`plt.show()`), HTML und Markdown. HTML und Markdown aus Notebooks werden ohne Skripte angezeigt.

Im Befehlsmodus macht `Z` oder `Strg+Z` (und ↶ in der Werkzeugleiste) die letzte Zellenaktion rückgängig: Einfügen, Löschen, Verschieben, Typ ändern, Ausgaben löschen; `Umschalt+Z`, `Strg+Y` oder ↷ wiederholt sie. In einer Zelle macht `Strg+Z` die Eingabe in dieser Zelle rückgängig. Das Ausführen von Zellen wird nicht rückgängig gemacht.

Im Modus **Folien** zeigt jede Zelle einen Folientyp (slide, subslide, fragment, skip, notes – im Notebook gespeichert wie in Jupyter), und **🎞️ Folien** öffnet das Notebook als reveal.js-Präsentation in den [Web-Folien](reveal.md).

**Rechtschreibung:** Ist im Auswahlfeld **ABC** der Kopfzeile eine Sprache gewählt, werden Markdown-Zellen vollständig und
Code-Zellen in Kommentaren und Zeichenketten geprüft; ein Rechtsklick auf ein unterstrichenes Wort zeigt Vorschläge
([Rechtschreibung](../benutzerhandbuch.md#rechtschreibung)).

## Konsole

Der Reiter **Konsole** führt einzelne Befehle in derselben Python-Sitzung wie das Notebook aus (Variablen werden geteilt). `Eingabe` führt aus,
`Umschalt+Eingabe` beginnt eine neue Zeile, `↑`/`↓` holen frühere Befehle zurück. **Leeren** leert die Konsole.

## Dateien und Pakete

Der Bereich **Dateien** zeigt den Arbeitsordner von Python (`/home/pyodide`):

- **Hochladen…** kopiert Dateien von Ihrem Computer in den Ordner (oder Dateien auf das Fenster ziehen), damit Python sie lesen kann, z. B. mit
  `pd.read_csv('daten.csv')`.
- Ein Klick auf eine Datei lädt sie herunter (z. B. von Python geschriebene Ergebnisse), × löscht sie, Ordner öffnen sich mit einem Klick.
- **Wheel installieren…** installiert weitere Python-Pakete aus Wheel-Dateien (`.whl`): reine Python-Pakete von PyPI oder für Pyodide gebaute
  Pakete. Sie bleiben installiert, bis die Seite geschlossen wird (auch nach einem Neustart).

Die Dateien existieren nur, solange die Seite geöffnet ist: Laden Sie Ergebnisse herunter, die Sie behalten möchten.

↗ neben einer Datei im Dateibereich (**Öffnen mit…**) öffnet sie in einer anderen Anwendung der Suite (z. B. Texteditor oder Tabellenkalkulation); Speichern dort schreibt sie ins Python-Dateisystem zurück.

## Variablen

**Variablen** neben **Dateien** in der Seitenleiste listet nach jedem Ausführen die Variablen der laufenden Python-Sitzung: Name,
Typ (mit dem `dtype` von NumPy-Arrays), Größe (`Zeilen × Spalten` bei DataFrames und Arrays, die Länge von Listen und Texten) und
einen kurzen Wert (bei DataFrames die Spaltennamen). Module, Funktionen, Klassen und Namen mit `_` am Anfang werden weggelassen.
Ein Klick auf einen DataFrame, eine Series oder ein Array (▦) zeigt sie als Tabelle (bis zu 500 Zeilen und 50 Spalten).

## Interaktive Widgets

Zellen können Bedienelemente mit der üblichen `ipywidgets`-API zeigen (eingebaut, keine Installation nötig):

```python
import ipywidgets as widgets

@widgets.interact(freq=(1, 10), kind=['sin', 'cos'])
def plot(freq=3, kind='sin'):
    ...                      # print, Rückgabewert oder matplotlib: die Ausgabe wird bei jeder Änderung erneuert
```

Verfügbar sind Schieberegler (`IntSlider`, `FloatSlider`, `FloatLogSlider`, Bereichsregler, `SelectionSlider`), Zahlen- und Textfelder,
`Checkbox`, `ToggleButton`, `Dropdown`, `RadioButtons`, `Select`, `SelectMultiple`, `ToggleButtons`, `Button` (`on_click`), `ColorPicker`,
`DatePicker`, `Play`, Fortschrittsbalken, `Label`, `HTML`, `Output` (`with out:` sammelt Ausgaben, Anzeigen und Grafiken), die Container
`HBox`, `VBox`, `GridBox`, `Tab` und `Accordion` sowie `interact`, `interactive`, `interact_manual`, `fixed`, `observe`, `link` und `dlink`.
Auch `from IPython.display import display, clear_output, HTML, Markdown` funktioniert.

Ausgaben und Fehler von Callbacks außerhalb eines `Output`-Widgets erscheinen unter der Zelle, die das Widget erzeugt hat. Gespeicherte
Notebooks behalten den Zustand der Widgets (im Format von Jupyter): Nach dem Öffnen werden die Bedienelemente wie zuvor angezeigt, sind
aber inaktiv, bis die Zelle erneut läuft; dasselbe gilt nach einem Neustart. Eigene Widget-Bibliotheken (etwa `ipyleaflet`, `bqplot`)
werden nicht unterstützt.

## Neustart

**⟲ Neu starten** hält eine laufende Zelle an und startet Python neu: Alle Variablen gehen verloren, Dateien und installierte Wheels bleiben.

## Grenzen

- Netzwerk: `requests` funktioniert bei Servern, die Zugriffe von Webseiten erlauben (CORS); direkte TCP-Verbindungen (Datenbanken, SSH, E-Mail) sind
  im Browser nicht möglich – verwenden Sie dafür das Datenbankwerkzeug, den SSH-Client oder den E-Mail-Client der Suite.
- Es können nur Pakete der Suite oder als Wheel verfügbare Pakete verwendet werden; Pakete mit kompiliertem Code brauchen für Pyodide gebaute Wheels.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |

### In einer Zelle

| Tasten | Funktion |
|---|---|
| `Umschalt+Eingabe` | Ausführen und zur nächsten Zelle |
| `Strg+Eingabe` | Ausführen |
| `Alt+Eingabe` | Ausführen und Zelle darunter einfügen |
| `Esc` | Zelle verlassen (Befehlsmodus) |

### Befehlsmodus

| Tasten | Funktion |
|---|---|
| `Eingabe` | Zelle bearbeiten |
| `A` / `B` | Zelle darüber / darunter einfügen |
| `M` / `Y` / `R` | In Markdown / Code / Roh (unverändert für nbconvert) umwandeln |
| `↑` / `↓` | Vorherige / nächste Zelle |
| `Entf` | Zelle löschen |
| `Z` / `Umschalt+Z` | Zellenoperationen rückgängig / wiederholen |

### Konsole

| Tasten | Funktion |
|---|---|
| `Eingabe` | Befehl ausführen |
| `↑` / `↓` | Vorheriger / nächster Befehl |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Zellen-Schaltflächen stehen unter jeder Zelle; **Dateien · Variablen** öffnet die Seitenleiste.
