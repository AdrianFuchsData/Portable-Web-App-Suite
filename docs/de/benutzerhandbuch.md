# Portable Web App Suite – Benutzerhandbuch

Die Portable Web App Suite ist eine Sammlung von Anwendungen, die vollständig in Ihrem Webbrowser laufen:
Sie brauchen keine Installation, keinen Server und keine Internetverbindung. Jede Anwendung ist eine einzelne
HTML-Datei, die Sie auf einem USB-Stick, einem Netzlaufwerk oder Ihrem Smartphone aufbewahren können.

Dieses Handbuch beschreibt die gemeinsamen Funktionen aller Anwendungen; jede Anwendung hat ihr eigenes Handbuch (siehe
die Tabelle unten). Die Suite ist freie Software unter der EUPL-1.2 und wird ohne Gewährleistung bereitgestellt (siehe
[Lizenz](#lizenz)).

## Eine Anwendung starten

Öffnen Sie die HTML-Datei der Anwendung (zum Beispiel `texteditor.html`) in einer aktuellen Version von Chrome,
Edge, Firefox oder einem anderen Chromium-basierten Browser. Unter Android öffnen Sie die Datei aus einem
Dateimanager mit Chrome oder Firefox.

Die Datei `overview.html` enthält alle Anwendungen: Öffnen Sie sie, um jede Anwendung in einem Tab zu starten oder
einzelne Anwendungen als eigene Dateien zu speichern ([Übersicht](apps/overview.md)).

Alle Anwendungen funktionieren offline. Ihre Dateien und Daten verlassen Ihr Gerät nicht, außer Sie nutzen
selbst eine Netzwerkfunktion (zum Beispiel die Verbindung zu einem Server).

### Installiert von einem Webserver

Ihre Administration kann die Suite auch auf einem Webserver bereitstellen. Öffnen Sie die Adresse im Browser; jede
Anwendung lässt sich dann wie eine App installieren (Chrome/Edge: das Installationssymbol in der Adressleiste oder *App
installieren* im Menü; Android: *Zum Startbildschirm hinzufügen*). Eine installierte Anwendung öffnet in einem eigenen
Fenster und funktioniert ebenfalls offline: Jede Anwendung wird beim ersten Öffnen auf dem Gerät gespeichert und bei
bestehender Verbindung im Hintergrund aktualisiert (eine Aktualisierung gilt ab dem nächsten Start). Öffnen Sie jede
Anwendung einmal mit Verbindung, wenn Sie sie später offline nutzen möchten.

In Chrome und Edge am Desktop bietet das Betriebssystem installierte Anwendungen für ihre Dateitypen an (*Öffnen mit* im
Dateimanager): Die Datei öffnet sich in der Anwendung, und **Speichern** schreibt direkt in sie.

## Anwendungen

| Anwendung | Datei | Anleitung |
|---|---|---|
| Übersicht (alle Anwendungen) | `overview.html` | [Übersicht](apps/overview.md) |
| Texteditor | `texteditor.html` | [Texteditor](apps/texteditor.md) |
| Hex-Editor | `hexeditor.html` | [Hex-Editor](apps/hexeditor.md) |
| PDF-Betrachter | `pdfviewer.html` | [PDF-Betrachter](apps/pdfviewer.md) |
| KeePass | `keepass.html` | [KeePass](apps/keepass.md) |
| Archivmanager | `archive.html` | [Archivmanager](apps/archive.md) |
| Medienplayer | `mediaplayer.html` | [Medienplayer](apps/mediaplayer.md) |
| Bildbearbeitung | `imageeditor.html` | [Bildbearbeitung](apps/imageeditor.md) |
| Diagrammeditor | `diagram.html` | [Diagrammeditor](apps/diagram.md) |
| Kalender | `calendar.html` | [Kalender](apps/calendar.md) |
| Datenbankwerkzeug | `dbtool.html` | [Datenbankwerkzeug](apps/dbtool.md) |
| SSH-Client | `ssh.html` | [SSH-Client](apps/ssh.md) |
| FTP/SFTP-Client | `ftp.html` | [FTP/SFTP-Client](apps/ftp.md) |
| HTTP-Analyse | `http.html` | [HTTP-Analyse](apps/http.md) |
| Python-Notebook | `notebook.html` | [Python-Notebook](apps/notebook.md) |
| Tabellenkalkulation | `spreadsheet.html` | [Tabellenkalkulation](apps/spreadsheet.md) |
| Textverarbeitung | `document.html` | [Textverarbeitung](apps/document.md) |
| Präsentation | `presentation.html` | [Präsentation](apps/presentation.md) |
| Web-Folien (reveal.js) | `reveal.html` | [Web-Folien](apps/reveal.md) |
| E-Mail | `mail.html` | [E-Mail](apps/mail.md) |
| Audio-Editor | `audioeditor.html` | [Audio-Editor](apps/audioeditor.md) |
| Video-Editor | `videoeditor.html` | [Video-Editor](apps/videoeditor.md) |
| Web-Inspektor | `webinspector.html` | [Web-Inspektor](apps/webinspector.md) |
| Barcodes (QR-Codes und andere) | `barcode.html` | [Barcodes](apps/barcode.md) |

## Gemeinsame Funktionen

Jede Anwendung hat dieselbe Kopfzeile:

| Schaltfläche | Funktion |
|---|---|
| ABC / ABC✓ | Rechtschreibung: aus oder die Sprache, in der Textfelder geprüft werden (nur in Anwendungen mit Text, siehe [Rechtschreibung](#rechtschreibung)) |
| ⌘ | Befehlspalette: alle Aktionen der Anwendung durchsuchen (auch `Strg+Umschalt+P` oder `Strg+Umschalt+Leertaste`) |
| ◐ / ☀ / ☾ | Design: automatisch (wie das System), hell oder dunkel |
| DE / EN | Wechselt die Sprache zwischen Deutsch und Englisch |
| ? | Informationen über die Anwendung und ihre Tastenkürzel (auch `F1`, oder `?` außerhalb von Textfeldern) |

Die Anwendungen merken sich Sprache und Design in Ihrem Browser.

### Befehlspalette

**⌘** (oder `Strg+Umschalt+P` / `Strg+Umschalt+Leertaste`; am Mac `Cmd` statt `Strg`) listet alle Aktionen, die die Anwendung
gerade anbietet – ihre Schaltflächen und die Einträge ihrer Menüs, auch solche, die am Smartphone in Seitenleisten verborgen
sind. Tippen Sie ein paar Buchstaben des Gesuchten (mehrere Wörter in beliebiger Reihenfolge, Groß-/Kleinschreibung und Akzente
egal), wählen Sie mit `↑` `↓` und führen Sie die Aktion mit `Eingabe` oder einem Klick aus; `Esc` schließt die Palette. In
Firefox öffnet `Strg+Umschalt+P` stattdessen ein privates Fenster: Verwenden Sie dort `Strg+Umschalt+Leertaste` oder ⌘.

### Ungespeicherte Arbeit wiederherstellen

Solange ein Dokument ungespeicherte Änderungen hat, legen die Editoren eine Wiederherstellungskopie im Browser an (etwa alle 15
Sekunden und beim Wechsel in einen anderen Tab oder beim Schließen des Fensters). Stürzt der Browser oder der Computer ab oder
wird ein Tab ohne Speichern geschlossen, zeigt die Anwendung beim nächsten Öffnen **„Ungespeicherte Arbeit … wurde gefunden“**:
**Wiederherstellen** holt die Änderungen zurück (speichern Sie danach), **Verwerfen** löscht die Kopie. Auch Speichern oder
Verwerfen der Änderungen löscht die Kopie.

- Die Kopie bleibt im Browserprofil des Computers; sie ist keine Sicherung Ihrer Datei. Das Löschen der Browserdaten entfernt sie.
- Das gilt für alle Editoren außer KeePass: eine entsperrte Passwortdatenbank wird nie in den Browserspeicher geschrieben.
- Sehr große Dokumente (mehr als 64 MB, etwa lange Audioprojekte) bekommen keine Kopie; beim Video-Editor werden Mediendateien
  über insgesamt 48 MB nicht kopiert (sie werden wie bei einem gespeicherten Projekt neu verknüpft).
- Der Archivmanager speichert nie Passwörter; verschlüsselte Einträge bleiben in der Kopie verschlüsselt.

### Zuletzt verwendete Dateien

In Chrome und Edge am Computer listen die Editoren die geöffneten oder gespeicherten Dateien unter **🕘 Zuletzt** neben
**Öffnen** auf (bis zu zehn je Anwendung). Ein Eintrag öffnet die Datei erneut; der Browser fragt eventuell einmal nach der
Berechtigung. **Liste leeren** vergisst sie. Die Liste enthält Verweise auf die Dateien, keine Kopien; eine verschobene oder
gelöschte Datei lässt sich daraus nicht öffnen. Firefox und Browser unter Android können solche Verweise nicht speichern,
dort wird die Liste nicht angezeigt. Der Fenstertitel zeigt den Namen der geöffneten Datei.

### Smartphones und Tablets

Alle Anwendungen passen sich an schmale Bildschirme (unter 760 Pixel) an:

- Die Werkzeugleiste ist eine eigene Zeile unter dem Titel. Ist sie breiter als der Bildschirm, wischen Sie sie zur
  Seite, um die weiteren Schaltflächen zu erreichen.
- Seitenbereiche (Ordner, Verbindungen, Sites, Ebenen, Formatierung …) sind ausgeblendet und öffnen sich mit ☰ oder
  **Bereiche** als Schublade unter der Kopfzeile. Ein Tippen auf die abgedunkelte Fläche daneben (oder erneut auf die
  Schaltfläche) schließt sie; auch die Auswahl eines Eintrags, der etwas öffnet (Verbindung, Anfrage, Tabelle, Folie),
  schließt sie.
- Listen, Editoren und Ansichten, die am Computer nebeneinander liegen, erscheinen nacheinander, bei Bedarf mit
  Zurück-Schaltflächen (z. B. Mail und KeePass).
- Schaltflächen, die nur mit der Maus sinnvoll sind, sind ausgeblendet; ihre Funktionen stehen in den Menüs oder Dialogen.

### Tastatur und Bildschirmleser

Alle Schaltflächen, Reiter und Menüs sind mit `Tab` erreichbar und mit `Eingabe` oder `Leertaste` bedienbar; das Element mit
dem Tastaturfokus ist umrandet. Schaltflächen, die nur ein Symbol zeigen (✕, 🖨, ⏏ …), haben einen Namen, den Bildschirmleser
ansagen (derselbe Text wie der Tooltip), und die Eingabebereiche der Code-Editoren sind beschriftet. Ausgewählte Zeilen und
Listeneinträge sind hell hinterlegt, damit Links und farbiger Text darauf lesbar bleiben. Im Texteditor lassen sich die
Dateireiter fokussieren: `Eingabe` zeigt die Datei, `Entf` schließt sie. Die Bearbeitungsflächen der Textverarbeitung und der
Tabellenkalkulation stammen aus einer Fremdkomponente (Univer) und sind weniger barrierearm als der Rest der Suite.

### Rechtschreibung

Die Anwendungen, in denen Sie Text schreiben – Texteditor, Python-Notebook, E-Mail, Textverarbeitung, Präsentation,
Web-Folien, Kalender, KeePass (Notizen), Diagramm-Editor, Bildbearbeitung (Text) und Video-Editor (Titel) –, können die
Rechtschreibung prüfen. Wählen Sie die Sprache im Auswahlfeld **ABC** in der Kopfzeile: **Englisch (USA)** und **Deutsch
(Deutschland)** sind eingebaut; **ABC Rechtschreibung aus** schaltet die Prüfung ab (Voreinstellung). Die Wahl gilt für
alle diese Anwendungen.

- Unbekannte Wörter werden in Textfeldern, Textbereichen und formatiertem Text rot unterstrichen – im Texteditor und im
  Notebook in Markdown und reinem Text vollständig, in Programmcode nur in Kommentaren und Zeichenketten. Wörter mit
  Ziffern, Wörter in Großbuchstaben (Abkürzungen), Web- und E-Mail-Adressen werden nicht geprüft.
- **Rechtsklick** auf ein unterstrichenes Wort (am Smartphone langes Drücken): Das Menü zeigt Vorschläge – ein Klick
  ersetzt das Wort –, **Zum Wörterbuch hinzufügen** (bleibt im Browser, für alle Sprachen) und **Ignorieren** (bis die
  Anwendung geschlossen wird). **Umschalt+Rechtsklick** zeigt das Menü des Browsers.
- Die Textverarbeitung zeigt die unbekannten Wörter in ihrem Bereich **Rechtschreibung** (`F7`), weil ihre Seite als Bild
  gezeichnet wird.
- **Wörterbuch laden…** im Auswahlfeld fügt ein Hunspell-Wörterbuch für eine weitere Sprache oder Variante hinzu: die
  `.aff`- und die `.dic`-Datei zusammen (etwa aus einer LibreOffice-Installation) oder eine LibreOffice-Wörterbucherweiterung
  (`.oxt`, z. B. von extensions.libreoffice.org). Geladene Wörterbücher bleiben im Browser.
- Während die Suite ein Feld prüft, ist die Rechtschreibprüfung des Browsers dort aus, damit Wörter nicht doppelt markiert
  werden.

Chrome und Edge teilen die Einstellung zwischen allen aus Dateien geöffneten Anwendungen; Firefox hält sie je
Anwendungsdatei getrennt.

### Rückgängig und Wiederholen

Alle Editoren können Änderungen rückgängig machen und wiederholen: mit den Schaltflächen ↶ und ↷ in der Werkzeugleiste
(auch auf Smartphones und Tablets) oder mit `Strg+Z` (rückgängig) und `Strg+Y` oder `Strg+Umschalt+Z` (wiederholen);
auf dem Mac `Cmd` statt `Strg`. Während Sie in ein Textfeld tippen, wirken die Tasten auf die Eingabe in diesem Feld.
Der Verlauf bleibt erhalten, bis Sie eine andere Datei öffnen oder die Anwendung schließen; Speichern löscht ihn nicht.

### Öffnen mit…

Dateien in einer Anwendung – eine Datei in einem Archiv, auf einem FTP/SFTP-Server oder im SSH-Dateibereich, ein
KeePass- oder E-Mail-Anhang, eine Datei des Python-Notebooks – lassen sich mit **Öffnen mit…** (↗) in einer anderen
Anwendung öffnen. Wählen Sie die Anwendung; sie öffnet sich in einem neuen Tab (wenn aus der Übersicht gestartet) oder
einem neuen Fenster. **Speichern** in dieser Anwendung schreibt die Datei dorthin zurück, woher sie kam (Archiv, Server,
Datenbank, …); speichern Sie danach das Archiv bzw. die Datenbank, um die Änderung zu behalten. Anhänge empfangener
E-Mails öffnen sich als Kopie.

Bei Anwendungen, die als einzelne Dateien gestartet werden, legen Sie die HTML-Dateien **mit ihren ursprünglichen Namen
in einen Ordner** (`texteditor.html`, `archive.html`, …), damit eine Anwendung die andere findet.

## Dateien öffnen und speichern

Sie öffnen Dateien mit der Öffnen-Schaltfläche einer Anwendung oder indem Sie sie in das Anwendungsfenster ziehen.

Wie gespeichert wird, hängt vom Browser ab:

- **Chrome, Edge und andere Chromium-basierte Browser am Desktop:** Änderungen werden direkt in die geöffnete
  Datei gespeichert. Beim ersten Speichern fragt der Browser nach der Erlaubnis, die Datei zu ändern.
- **Firefox und Browser unter Android:** Diese Browser können nicht in geöffnete Dateien schreiben. Speichern
  erzeugt einen Download. **Ersetzen Sie die ursprüngliche Datei durch die heruntergeladene**, sonst gehen Ihre
  Änderungen verloren. Die Anwendung erinnert Sie nach jedem Download daran.

Wenn Sie eine Anwendung mit ungespeicherten Änderungen schließen, fragt der Browser, ob Sie die Seite wirklich
verlassen möchten.

## Anwendungsdaten: Einstellungen, Verbindungen und Passwörter

Manche Anwendungen speichern Einstellungen, Verbindungen oder Passwörter, zum Beispiel die Serververbindungen des
SSH-Clients. Diese Daten liegen in einer Datei, die **Sie** wählen, niemals im Browser. Eine Datei kann die Daten
mehrerer Anwendungen enthalten.

Sie haben die Wahl zwischen zwei Formaten:

| Format | Schutz | Verwendung |
|---|---|---|
| JSON-Datei (`.json`) | **nicht verschlüsselt** | für Einstellungen ohne Passwörter oder auf einem geschützten Laufwerk |
| KeePass-Datenbank (`.kdbx`) | verschlüsselt mit Ihrem Passwort und/oder einer Schlüsseldatei | empfohlen für Verbindungen und Passwörter |

Sie können auch Ihre bestehende KeePass-Datenbank verwenden. Die Anwendungen legen ihre Daten in der Gruppe
**Portable Web App Suite** ab, mit einer Untergruppe pro Anwendung, und lassen alle anderen Einträge unverändert.
Verbindungen sind normale KeePass-Einträge (Titel, Benutzername, Passwort, URL); Sie können sie daher auch in
KeePassXC, KeePass 2, KeePassDX oder Strongbox ansehen und bearbeiten.

> **Warnung:** Bewahren Sie eine Sicherung Ihrer KeePass-Datenbank und Ihrer Schlüsseldatei auf. Ohne Passwort
> oder Schlüsseldatei lassen sich die Daten nicht wiederherstellen.

### Einstellungen mitnehmen

Vorlieben wie das Design, die Sprache, die Schriftgröße des Texteditors oder die Diagrammbibliotheken speichert der Browser.
Um sie auf einen anderen Rechner oder in einen anderen Browser mitzunehmen, öffnen Sie den Info-Dialog (`F1` oder **?**),
klappen **⚙ Einstellungen** auf und wählen **Exportieren…**: Das speichert `suite-settings.json`. **Importieren…** liest eine
solche Datei in jeder Anwendung ein und bietet an, die Anwendung neu zu laden, damit die Einstellungen wirken.

Die Verbindungsdateien der Anwendungen mit Verbindungen (Datenbank-Werkzeug, SSH, FTP, Mail, HTTP) enthalten diese
Einstellungen ebenfalls – als JSON-Datei wie als KeePass-Datenbank. Öffnen Sie eine Verbindungsdatei, deren Einstellungen
von den aktuellen abweichen, bietet eine Leiste **Einstellungen übernehmen** an. Eine KeePass-Datenbank kann so die
Verbindungen, Passwörter und Einstellungen der ganzen Suite enthalten.

Chrome und Edge teilen die Einstellungen aller aus Dateien geöffneten Anwendungen; Firefox hält sie je Anwendungsdatei getrennt.
Dort exportieren und importieren Sie in jeder Anwendung, deren Einstellungen Sie mitnehmen möchten.

## Netzwerkfunktionen und das Relay

Browser können sich nicht direkt mit Mail-, SSH-, SFTP-, FTP- oder Datenbankservern verbinden. Die Anwendungen,
die solche Verbindungen brauchen, verwenden das **Relay**: ein kleines Programm, das Sie auf Ihrem Computer starten.
Das Relay ist optional; alle anderen Funktionen arbeiten ohne es.

Starten Sie das Relay mit Python oder PowerShell (ohne Installation und ohne Administratorrechte):

```sh
python3 relay.py
```

```sh
powershell -ExecutionPolicy Bypass -File relay.ps1
```

Das Relay zeigt seine Adresse (meist `127.0.0.1:8765`) und ein **Token** an. Tragen Sie beides in den
Relay-Einstellungen der Anwendung ein (Anmeldung „Token“). Das Relay nimmt nur Verbindungen von Ihrem eigenen Computer
und nur mit diesem Token an.

**Ein gemeinsames Relay.** Ihre Organisation kann das Relay auch auf einem Server betreiben, zum Beispiel hinter ihrem
Webserver unter `https://relay.example.org/relay`. Tragen Sie dann diese Adresse ein, wählen Sie die Anmeldung
**Benutzername und Passwort** und geben Sie Ihr Relay-Konto ein (die Administration legt es an). Prüft der Server selbst
ein Client-Zertifikat oder eine Firmenanmeldung, wählen Sie **Reverse-Proxy / Client-Zertifikat**. **Testen** prüft
Adresse und Anmeldung. Adressen anderer Rechner müssen `https` verwenden; eine unverschlüsselte `http`-Adresse
funktioniert nur, wenn Sie sie ausdrücklich erlauben (nur in vertrauenswürdigen Netzen).

Details finden Sie in [`relay/README.md`](../../relay/README.md) und der [technischen Dokumentation](technische-dokumentation.md).

## Python-Notebook

Das Python-Notebook (`notebook.html`) führt Python mit pandas, numpy, matplotlib und weiteren Bibliotheken vollständig im
Browser aus, mit Jupyter-Notebooks (`.ipynb`) und einer Konsole. Siehe [Python-Notebook](apps/notebook.md).

## Lizenz

Copyright © 2026 Adrian Fuchs. Die Suite ist unter der **EUPL-1.2** (Open-Source-Lizenz für die Europäische Union)
lizenziert: Sie dürfen sie unter den Bedingungen der Lizenz nutzen, kopieren, ändern und weitergeben – auch kommerziell.
Sie wird **ohne Gewährleistung** bereitgestellt: Prüfen Sie wichtige Ergebnisse und bewahren Sie Sicherungen Ihrer Dateien auf.

Der Info-Dialog jeder Anwendung (`F1` oder **?**) zeigt unter **⚖ Lizenz** den Lizenztext (Deutsch oder Englisch), den
Lizenzhinweis und alle Komponenten Dritter, die die Anwendung enthält, mit ihren Lizenzen.

Eine **geänderte Fassung** muss das sichtbar machen: Ihr Info-Dialog zeigt dann **Geänderte Fassung** mit dem Namen des
Bearbeiters und dem Datum, und ihr Titel ist mit *(geänderte Fassung)* gekennzeichnet. Sehen Sie diese Kennzeichnung,
wurde die Anwendung nicht vom Autor der Suite veröffentlicht – vertrauen Sie ihr nur, wenn Sie dem vertrauen, der sie
geändert hat. Das Original ist unter https://software.adrianfuchs.at/local-tools/portable-web-app-suite/ verfügbar.
