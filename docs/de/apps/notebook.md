# Python-Notebook

Das Python-Notebook (`notebook.html`) führt Python 3 im Browser aus – ohne Installation, Server oder Internetverbindung. Es arbeitet wie Jupyter:
Notebooks mit Code- und Textzellen, Ergebnisse direkt unter dem Code, Diagramme, Tabellen. Eine Konsole führt einzelne Befehle aus.

Enthaltene Bibliotheken: numpy, pandas, matplotlib, seaborn, scipy, scikit-learn, sympy, networkx, lxml, beautifulsoup4, pyyaml, openpyxl, xlrd, regex, requests,
sqlite3, SQLAlchemy, pykeepass, nzpy, micropip; für Office-Dateien python-docx, python-pptx, XlsxWriter (auch als Excel-Schreiber von pandas), pypdf und
icalendar; für Datenbanken über das Relay pg8000 (PostgreSQL) und PyMySQL (MySQL/MariaDB), auch über SQLAlchemy; Jinja2 (mit MarkupSafe), Markdown,
tabulate und tqdm. Sie werden beim ersten Import geladen; numpy, pandas und matplotlib werden nach dem Start im
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
| `Tab` / `Umschalt+Tab` | einrücken / ausrücken (4 Leerzeichen) |
| `Strg+Alt+I` | ein Tabulatorzeichen einfügen |

Im **Befehlsmodus** (eine Zelle ist gewählt, die Schreibmarke steht nicht darin) arbeiten die Tasten wie in JupyterLab: `Eingabe` bearbeitet,
`A`/`B` fügen eine Zelle darüber/darunter ein, `M`/`Y`/`R` machen die Zellen zu Markdown-, Code- oder Rohzellen, `↑`/`↓` (oder `K`/`J`) wählen
die vorherige/nächste Zelle.

**Mehrere Zellen:** `Umschalt+↑`/`Umschalt+↓` (oder `Umschalt+K`/`Umschalt+J`) und `Umschalt+Klick` wählen mehrere Zellen, `Strg+A` alle. Die
Tasten gelten dann für alle gewählten Zellen: `Umschalt+Eingabe`, `Strg+Eingabe` und `Alt+Eingabe` führen sie aus, `C` kopiert, `X` schneidet
aus, `V` fügt darunter ein (`Umschalt+V` darüber), `D`, `D` (zweimal) oder `Entf` löscht, `Umschalt+M` fügt sie zu einer Zelle zusammen (eine
gewählte Zelle: mit der nächsten), `Strg+Umschalt+↑`/`↓` verschiebt sie.

**Ausführen:** Zellen laufen nacheinander; wartende Zellen zeigen `[*]`. **Bei Fehler anhalten** (standardmäßig an, neben **▶▶ Alle
ausführen**): Löst eine Zelle einen Fehler aus, werden die danach wartenden Zellen nicht ausgeführt, wie in Jupyter. Ausgeschaltet laufen
sie trotzdem.

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

## Terminal

Der Reiter **Terminal** hat eine bash-ähnliche Shell auf dem Dateisystem von Python (dieselben Dateien wie im Dateibereich und in den Zellen; es
existiert nur im Speicher). Sie ist in Python geschrieben und läuft im Python des Notebooks, funktioniert also überall offline.

- **Befehle:** `ls`, `cd`, `pwd`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `rmdir`, `touch`, `find` (`-name`, `-iname`, `-type`, `-maxdepth`), `du`,
  `head`, `tail`, `wc`, `grep` (reguläre Ausdrücke von Python; `-i -v -n -c -l -r -o -w -x -F`), `sed` (`s///` mit `g`, `i` und einer Zahl, `d`,
  `p`, `=`, `q`; Adressen `N`, `$`, `/re/` und Bereiche; `-n`, `-i`, `-e`), `sort` (`-r -n -u -k -t -f`), `uniq` (`-c -d -u`), `cut` (`-d -f -c`),
  `tr` (Bereiche, Klassen, `-d -s`), `diff` (`-u`, `-q`), `echo`, `printf`, `tar` (`-c -x -t`, `-z -j -J`, `-f`, `-C`), `zip` (`-r`), `unzip` (`-l -d`),
  `python skript.py` / `python -c …`, `pip install` (micropip; braucht das Netzwerk), `mount` / `umount` (Archive des Archivmanagers, siehe
  [Archive in Python](#archive-in-python)), `env`, `export`, `unset`, `history`, `clear`, `which`, `basename`, `dirname`, `date`, `sleep`, `true`,
  `false` und `help`.
- **Befehlszeilen** werden wie in einer POSIX-Shell zerlegt (`shlex`): Anführungszeichen, `\`, Kommentare (`#`), Pipes `|`, Umleitungen `>`, `>>`, `<`,
  `2>`, `2>&1`, `&&`, `||` und `;`, Globs (`*`, `?`, `[…]`), Variablen (`NAME=wert`, `$NAME`, `${NAME}`, `$?`, `~`) und `!N` (eine Zeile des Verlaufs).
  Es gibt keine Kontrollstrukturen (`if`, `for`, `while`), keine Hintergrundprozesse und keine anderen Programme.
- **Skripte:** `sh skript.sh argumente` (auch `bash`, `source` oder `./skript.sh`) führt die Zeilen eines Skripts in dieser Shell aus, mit `$1`…`$9`,
  `$#` und `$@`; `set -e` hält beim ersten Fehler an, `exit` beendet das Skript. Skripte aus einem Archiv laufen nach dem Einbinden, z. B.
  `mount daten.zip && sh /mnt/daten.zip/start.sh`.
- **Tasten:** `↑`/`↓` Verlauf, `Tab` ergänzt Befehle und Pfade (zweimal: zeigt die Möglichkeiten), `Strg+C` verwirft die Zeile (oder unterbricht einen
  laufenden Befehl, wo möglich), `Strg+L` leert den Bildschirm, `Strg+U` löscht die Zeile, `Strg+A`/`Strg+E` Anfang/Ende der Zeile.
- **less** zeigt eine Datei oder die Ausgabe einer Pipe (`… | less`): `Leertaste`/`Bild↓` und `b`/`Bild↑` blättern, `↑`/`↓`/`j`/`k` zeilenweise,
  `g`/`G` Anfang/Ende, `/Text` sucht, `n`/`N` nächster/vorheriger Treffer, `q` beendet.
- **nano** bearbeitet eine Datei: tippen, Pfeiltasten, `Strg+O` speichert (fragt nach dem Namen), `Strg+X` beendet (fragt bei ungespeicherten
  Änderungen), `Strg+W` sucht, `Strg+K` schneidet die Zeile aus, `Strg+U` fügt ein. Änderungen werden in das Dateisystem von Python geschrieben.
- **In Zellen:** `await suite.shell.run("ls -l | head")` führt eine Befehlszeile aus und gibt ihre Ausgabe aus (less zeigt den Text, nano funktioniert
  nur im Reiter Terminal).

## Dateien und Pakete

Der Bereich **Dateien** zeigt den Arbeitsordner von Python (`/home/pyodide`):

- **Hochladen…** kopiert Dateien von Ihrem Computer in den Ordner (oder Dateien auf das Fenster ziehen), damit Python sie lesen kann, z. B. mit
  `pd.read_csv('daten.csv')`.
- Ein Klick auf eine Datei lädt sie herunter (z. B. von Python geschriebene Ergebnisse), × löscht sie, Ordner öffnen sich mit einem Klick.
- **Wheel installieren…** installiert weitere Python-Pakete aus Wheel-Dateien (`.whl`): reine Python-Pakete von PyPI oder für Pyodide gebaute
  Pakete. Sie bleiben installiert, bis die Seite geschlossen wird (auch nach einem Neustart).

Die Dateien existieren nur, solange die Seite geöffnet ist: Laden Sie Ergebnisse herunter, die Sie behalten möchten.

Andere Anwendungen der Suite öffnen Dateien aus diesem Dateisystem und speichern Dateien hinein (*Öffnen* / *Speichern unter*, Abschnitt
*Python-Notebooks (im Speicher)*, siehe [Dateien in Archiven](../benutzerhandbuch.md#dateien-in-archiven)): Das Notebook zeigt dann, was angefragt
wird – Ordner und Namen zum Speichern oder die zu öffnenden Dateien – mit dem Hinweis, dass die Dateien nur im Speicher existieren. **Speichern**
in der anderen Anwendung schreibt die Datei wieder hierher. Ein Neustart von Python fragt nach, solange solche Dateien anderswo geöffnet sind.

↗ neben einer Datei im Dateibereich (**Öffnen mit…**) öffnet sie in einer anderen Anwendung der Suite (z. B. Texteditor oder Tabellenkalkulation); Speichern dort schreibt sie ins Python-Dateisystem zurück.

### Pakete zur Laufzeit hinzufügen

Für Pyodide gebaute Pakete, die nicht mitgeliefert werden – zum Beispiel **statsmodels**, **shapely**, **pyproj** und **scikit-image** –
lassen sich hinzufügen, während das Notebook läuft. Sie müssen zur mitgelieferten Pyodide-Version (314.0.7) passen; die Dateien liegen in der
Pyodide-Distribution unter `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/<Datei>`:

| Paket | Dateien (in dieser Reihenfolge, nach den mitgelieferten Abhängigkeiten) |
|---|---|
| statsmodels | `patsy-1.0.2-py2.py3-none-any.whl`, `statsmodels-0.14.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| shapely | `shapely-2.1.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| pyproj | `pyproj-3.7.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |
| scikit-image | `imageio-2.37.3-py3-none-any.whl`, `pywavelets-1.9.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl`, `lazy_loader-0.5-py3-none-any.whl`, `scikit_image-0.26.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl` |

- **Offline:** Laden Sie die Dateien einmal herunter und wählen Sie sie dann alle auf einmal mit **Wheel installieren…** im Dateibereich. Sie bleiben
  installiert, bis die Seite geschlossen wird, auch nach einem Neustart.
- **Mit Internetzugang:** Installieren Sie sie in einer Zelle (nach einem Neustart sind sie weg):

  ```python
  import micropip
  base = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/"
  await micropip.install([base + "patsy-1.0.2-py2.py3-none-any.whl", base + "statsmodels-0.14.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl"])
  import statsmodels.api as sm
  ```

Reine Python-Pakete von PyPI (Wheels mit der Endung `py3-none-any.whl`) werden genauso hinzugefügt; Pakete mit kompiliertem Code brauchen für
Pyodide gebaute Wheels.

## Archive in Python

Im [Archivmanager](archive.md) geöffnete Archive lassen sich **einbinden**: Ihre Dateien erscheinen als gewöhnliche Dateien unter
`/mnt/<Archivname>`, sodass `os`, `open`, `pathlib`, `shutil`, `glob` und Bibliotheken wie pandas sie ohne Besonderheiten verwenden.

- **📦 Archiv einbinden…** im Dateibereich führt die geöffneten Archive auf (oder startet den Archivmanager, um eines zu öffnen oder
  anzulegen); der Archivmanager fragt nach Ihrer Erlaubnis. Eingebundene Archive stehen im Dateibereich; ⏏ löst eines.
- Nach **jeder Zelle** (und jedem Konsolenbefehl) werden neue, geänderte und gelöschte Dateien in das Archiv zurückgeschrieben. Der
  Archivmanager markiert es als geändert – speichern Sie das Archiv dort, um die Änderungen zu behalten.
- Das ganze Archiv wird in den Speicher des Notebooks kopiert (über 512 MiB fragt es vorher). Änderungen, die im Archivmanager gemacht
  werden, während das Archiv eingebunden ist, sieht das Notebook nicht: lösen und neu einbinden.
- Wird das Archiv im Archivmanager geschlossen oder ersetzt, meldet das Notebook das nach der nächsten Zelle; die Dateien bleiben in
  `/mnt`, weitere Änderungen werden aber nicht mehr in das Archiv gespeichert. Ein Neustart von Python löst alle Archive.

Im Code macht das Modul `suite` dasselbe (in einer Zelle mit `await`):

```python
import suite
path = await suite.archives.mount()            # das im Archivmanager geöffnete Archiv (er fragt nach Ihrer Erlaubnis)
path = await suite.archives.mount("daten.zip") # eines von mehreren geöffneten Archiven, nach Namen
await suite.archives.sync()                    # die Änderungen jetzt zurückschreiben
await suite.archives.mounted()                 # [{"name", "path", "closed"}]
await suite.archives.unmount("daten.zip")      # die Änderungen zurückschreiben und den Ordner entfernen
```

`suite.archives.mount()` erreicht nur bereits geöffnete Archivmanager (in der Übersicht ihre Reiter, sonst die aus dem Notebook
gestarteten Fenster des Archivmanagers oder das, das es gestartet hat): Zum Öffnen oder Anlegen eines Archivs dient die Schaltfläche.
Notebooks, die auch in einer gewöhnlichen Jupyter-Installation laufen sollen, importieren `suite` in einem `try`-Block und verwenden
dort einen Ordner (siehe die Beispiel-Notebooks).

## Netzwerk aus Python

Python im Browser kann selbst keine Netzwerkverbindungen öffnen; das Notebook verwendet dafür das
[Relay](../benutzerhandbuch.md#netzwerkfunktionen-und-das-relay). Stellen Sie es im Dateibereich unter **Netzwerk: Relay** ein (Adresse und Token
oder eine Verbindungsdatei). Die Kopfzeile zeigt, was möglich ist:

- **Als Datei geöffnet** (`file://`): **`requests`** läuft über das Relay – jede Anfrage des Moduls, an jeden Server, mit allen Headern und
  Cookies. Ohne Relay erreicht `requests` nur Server, die Zugriffe von Webseiten erlauben (CORS). Sockets und SSH sind nicht möglich, und
  das Anhalten einer Zelle startet Python neu.
- **🔓 Netzwerk und Unterbrechen** – das vom Relay bereitgestellte Notebook (`relay.py --serve`): zusätzlich **Sockets** – die Netzwerkmodule der
  Standardbibliothek funktionieren unverändert über das Relay: `smtplib` (auch `starttls()` und `SMTP_SSL`), `imaplib`, `poplib`, `ftplib`
  (passiver Modus), `http.client`, `urllib.request` und reine Python-Datenbanktreiber. TLS übernimmt das Relay, das das Zertifikat des Servers
  prüft (außer der Code schaltet die Prüfung ab). Lauschende Sockets, UDP und Raw-Sockets sind nicht möglich. Laufende Zellen lassen sich
  unterbrechen.

```python
import requests
r = requests.get("https://api.example.org/items", params={"q": "x"}, timeout=10)
r.raise_for_status(); r.json()

import smtplib                                   # nur vom Relay bereitgestellt
with smtplib.SMTP("mail.example.org", 587) as s:
    s.starttls(); s.login("anna", passwort); s.send_message(nachricht)
```

**SSH und SFTP** (nur vom Relay bereitgestellt) verwenden die SSH-Engine der Suite mit einer Teilmenge von Fabrics `Connection` – so kann ein
Notebook in einer gewöhnlichen Jupyter-Installation Fabric selbst verwenden:

```python
try:
    from suite.ssh import Connection             # in der Suite
except ModuleNotFoundError:
    from fabric import Connection                # gewöhnliches Jupyter mit Fabric

with Connection("server.example.org", user="anna", connect_kwargs={"key_filename": "id_ed25519"}) as c:
    result = c.run("df -h", hide=True)           # Result: stdout, stderr, exited, ok; warn=True: keine Ausnahme bei Fehlern
    print(result.stdout)
    c.put("bericht.csv", "/tmp/bericht.csv")     # hochladen
    c.get("/var/log/syslog", "syslog.txt")       # herunterladen
    sftp = c.sftp()                              # wie SFTPClient von paramiko
    print(sftp.listdir("/tmp"))
    with sftp.open("/tmp/notiz.txt", "w") as f:
        f.write("hallo")
```

`connect_kwargs` nimmt `password`, `key_filename` (eine Schlüsseldatei im Dateibereich, OpenSSH- oder PEM-Format), `passphrase` oder `pkey_text`
(der Schlüssel als Text). Die erste Verbindung zu einem Server zeigt den Fingerabdruck seines Host-Schlüssels und fragt, ob ihm vertraut wird
(in diesem Browser gespeichert); ein geänderter Schlüssel wird mit einer Warnung nachgefragt. Die Verschlüsselung reicht vom Browser bis zum Server.
`suite.net.status()` meldet, was verfügbar ist.

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

## Anhalten und Neustart

Während Zellen laufen, zeigt die Werkzeugleiste eine Schaltfläche zum Anhalten (auch `I`, `I` im Befehlsmodus):

- **⏹ Unterbrechen** – wenn das Notebook vom Relay bereitgestellt wird (`relay.py --serve`, siehe [Relay](../benutzerhandbuch.md#netzwerkfunktionen-und-das-relay)): Die
  laufende Zelle endet mit einem `KeyboardInterrupt`, wie in Jupyter; Variablen und Importe bleiben erhalten. Die danach wartenden Zellen
  werden nicht ausgeführt. Code in einem langen einzelnen Aufruf von kompiliertem Code (eine riesige numpy-Operation) hält an, wenn dieser
  Aufruf zurückkehrt.
- **⏹ Stoppen** – wenn das Notebook als Datei geöffnet ist (`file://`): Browser lassen eine Seite Python nur unterbrechen, wenn sie mit
  besonderen Headern bereitgestellt wird; Anhalten bedeutet daher nach einer Rückfrage einen Neustart von Python, die Variablen gehen
  verloren.

**⟲ Neu starten** (auch `0`, `0` im Befehlsmodus) startet Python jederzeit neu, auch während Code läuft: Alle Variablen gehen verloren, Dateien
und installierte Wheels bleiben.

## Grenzen

- Netzwerk: nur über das Relay (siehe [Netzwerk aus Python](#netzwerk-aus-python)); Sockets und SSH nur, wenn das Notebook vom Relay bereitgestellt
  wird.
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
| `Tab` / `Umschalt+Tab` | Einrücken / ausrücken |
| `Strg+Alt+I` | Tabulatorzeichen einfügen |

### Befehlsmodus

| Tasten | Funktion |
|---|---|
| `Eingabe` | Zelle bearbeiten |
| `Umschalt+Eingabe` / `Strg+Eingabe` / `Alt+Eingabe` | Gewählte Zellen ausführen und weiter / bleiben / Zelle darunter einfügen |
| `A` / `B` | Zelle darüber / darunter einfügen |
| `M` / `Y` / `R` | In Markdown / Code / Roh (unverändert für nbconvert) umwandeln |
| `↑` / `↓`, `K` / `J` | Vorherige / nächste Zelle |
| `Umschalt+↑` / `Umschalt+↓`, `Umschalt+K` / `Umschalt+J` | Weitere Zellen wählen |
| `Strg+A` | Alle Zellen wählen |
| `C` / `X` / `V` | Kopieren / ausschneiden / darunter einfügen |
| `Umschalt+V` | Darüber einfügen |
| `D`, `D` / `Entf` | Gewählte Zellen löschen |
| `Umschalt+M` | Gewählte Zellen zusammenfügen |
| `Strg+Umschalt+↑` / `Strg+Umschalt+↓` | Gewählte Zellen verschieben |
| `I`, `I` | Unterbrechen (oder durch Neustart anhalten) |
| `0`, `0` | Python neu starten |
| `Z` / `Umschalt+Z` | Zellenoperationen rückgängig / wiederholen |

### Terminal

| Tasten | Funktion |
|---|---|
| `↑` / `↓` | Vorheriger / nächster Befehl |
| `Tab` | Befehl oder Pfad ergänzen |
| `Strg+C` | Zeile verwerfen, Befehl unterbrechen |
| `Strg+L` | Bildschirm leeren |

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
