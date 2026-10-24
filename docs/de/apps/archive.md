# Archivmanager

Der Archivmanager (`archive.html`) öffnet, erstellt und bearbeitet Archive: Ordner durchsuchen, Dateien ansehen, Dateien entpacken,
Dateien und Ordner hinzufügen, Ordner anlegen, umbenennen, löschen und zwischen Formaten umwandeln.

| Format | Öffnen | Speichern |
|---|---|---|
| ZIP (auch `.jar`, `.docx`, `.xlsx`, `.odt`, `.epub`, `.apk`, `.whl` und andere ZIP-basierte Dateien) | ja, auch ZIP64 | ja (bis 4 GiB und 65.535 Einträge) |
| TAR | ja (ustar, pax, lange GNU-Namen, symbolische Verknüpfungen) | ja |
| TAR.GZ / TGZ | ja | ja |
| GZ (eine einzelne komprimierte Datei) | ja | ja |
| 7z | ja | ja (ohne Verschlüsselung; Dateinamen nur aus ASCII-Zeichen) |
| RAR (Version 4 und 5) | ja | – (als 7z oder ZIP speichern) |
| TAR.XZ, TAR.BZ2, TAR.ZST, TAR.LZMA | ja | – |
| ISO, CAB, DEB, RPM, CPIO, AR, XAR | ja | – |

7z, RAR und die weiteren Formate werden mit libarchive gelesen (in die Anwendung eingebaut). Beim Öffnen wird das ganze Archiv entpackt,
große Archive brauchen also so viel Speicher wie ihr Inhalt. **Speichern** öffnet bei einem nur lesbaren Format **Speichern unter** mit
7z als Vorschlag. Verschlüsselte 7z- und RAR-Archive lassen sich nicht öffnen (eine Meldung weist darauf hin; verschlüsselte ZIP-Archive
werden unterstützt, siehe unten), ebenso wenig eine einzelne komprimierte Datei ohne Archiv darin (z. B. `notizen.txt.xz`).

## Öffnen und anlegen

- **Öffnen** (`Strg+O`) öffnet ein Archiv. Sie können ein Archiv auch auf das Fenster ziehen, solange kein Archiv geöffnet ist.
- **Neu** beginnt ein leeres ZIP-Archiv. Werden Dateien auf das Fenster gezogen, während nichts geöffnet ist, entsteht ebenfalls
  ein neues Archiv.
- In Chrome/Edge am Desktop listet die Startseite die zuletzt verwendeten Archive.

## Durchsuchen

- Die Liste zeigt den Inhalt des aktuellen Ordners: Name, Größe (bei Ordnern die Anzahl der Elemente), gepackte Größe (ZIP) und
  Änderungsdatum. Ein Klick auf eine Spaltenüberschrift sortiert.
- Ein Doppelklick (am Smartphone: Tippen) auf einen Ordner öffnet ihn. ↑, `Rücktaste` oder der Pfad über der Liste führen zurück.
- Ein Doppelklick (Tippen) auf eine Datei zeigt eine Vorschau: Text, Bilder, Audio und Video. **Herunterladen** in der Vorschau
  speichert die Datei.

## Auswählen

Ein Klick wählt ein Element, `Strg`+Klick fügt Elemente hinzu oder entfernt sie, `Umschalt`+Klick wählt einen Bereich, `Strg+A` wählt
alle Elemente des Ordners. Auch die Kontrollkästchen wählen Elemente aus (auf Smartphones und Tablets sind sie der Weg zur Auswahl).

## Entpacken

- **Entpacken** entpackt die gewählten Elemente, **Alles entpacken** den ganzen aktuellen Ordner.
- Eine einzelne Datei wird direkt heruntergeladen.
- In Chrome/Edge am Desktop wählen Sie einen Zielordner; die Dateien werden mit ihren Unterordnern hineingeschrieben.
- In Firefox und unter Android werden mehrere Dateien gemeinsam als eine ZIP-Datei heruntergeladen.

**✓ Testen** prüft das ganze Archiv: Jede Datei wird entpackt und bei ZIP-Archiven mit ihrer gespeicherten Prüfsumme (CRC-32)
verglichen. Das Ergebnis listet beschädigte Dateien mit dem Grund; dabei wird nichts entpackt oder verändert. Verschlüsselte
Dateien brauchen das Passwort.

## Bearbeiten

| Funktion | Beschreibung |
|---|---|
| Dateien hinzufügen / Ordner hinzufügen | fügt Dateien oder einen ganzen Ordner in den aktuellen Ordner ein; Dateien und Ordner können auch auf das Fenster gezogen werden |
| Neuer Ordner | legt einen Ordner an und lässt Sie seinen Namen eingeben |
| Umbenennen (`F2`) | benennt die gewählte Datei oder den gewählten Ordner um |
| Löschen (`Entf`) | entfernt die gewählten Elemente aus dem Archiv |

Vorhandene Dateien mit gleichem Namen werden nach einer Bestätigung ersetzt.

Rückgängig (↶, `Strg+Z`) und Wiederholen (↷, `Strg+Y`) wirken auf Hinzufügen, Umbenennen, Löschen und neue Ordner.

**Öffnen mit…** (Werkzeugleiste oder Vorschau) öffnet die gewählte Datei in einer anderen Anwendung der Suite; Speichern dort ersetzt die Datei im Archiv (rückgängig machbar). Speichern Sie danach das Archiv. Sind **mehrere Dateien** gewählt, bietet Öffnen mit… die Anwendungen mit Tabs an – Texteditor und Hex-Editor –, die alle in einem Fenster öffnen, jede in einem eigenen Tab (Ordner lassen sich so nicht öffnen).

## Speichern

- **Speichern** (`Strg+S`) schreibt das Archiv in seinem Format: in Chrome/Edge am Desktop direkt in die geöffnete Datei, in Firefox
  und unter Android als Download (ersetzen Sie die ursprüngliche Datei damit).
- **Speichern unter** (`Strg+Umschalt+S`) fragt nach dem Dateinamen und dem **Format** (ZIP, TAR, TAR.GZ, GZ). So wird ein Archiv
  umgewandelt, etwa ein `.tar.gz` in ein `.zip`. Eine GZ-Datei enthält genau eine Datei.
- **Kompression** in der Statusleiste legt die Kompression neuer und geänderter Dateien fest: Speichern, Schnell, Normal, Maximal.
  Unveränderte Dateien eines geöffneten ZIP-Archivs werden unverändert übernommen, daher ist das Speichern schnell.

## Verschlüsselte ZIP-Archive

Verschlüsselte Dateien sind mit 🔒 markiert (der Tooltip nennt das Verfahren). Vorschau, Entpacken oder Öffnen einer solchen
Datei fragt nach dem Passwort; es bleibt gemerkt, bis ein anderes Archiv geöffnet wird. Beide gebräuchlichen Verfahren werden
unterstützt: **AES** (WinZip AES, 128/192/256 Bit, verwendet von 7-Zip, WinZip und anderen) und **ZipCrypto** (das alte Verfahren,
das Windows ohne Zusatzprogramm öffnen kann).

- Nach Eingabe des Passworts eines Archivs werden hinzugefügte oder geänderte Dateien beim Speichern ebenso verschlüsselt
  (🔒 in der Statusleiste). Unveränderte Dateien bleiben, wie sie sind.
- **Speichern unter** bietet für ZIP-Archive die **Verschlüsselung** an: keine, AES-256 (empfohlen) oder ZipCrypto (schwach; nur für
  den Windows-Explorer), mit zweimal eingegebenem Passwort. Alle noch nicht verschlüsselten Dateien werden dann verschlüsselt;
  bereits verschlüsselte behalten ihr Passwort. „keine“ speichert neue und geänderte Dateien unverschlüsselt.
- In ZIP-Archiven werden nur die Inhalte verschlüsselt, nicht die Dateinamen und die Dateiliste.
- Mit AES verschlüsselte Dateien, die mit Version 1.0.0 oder früher der Suite gespeichert wurden, konnte nur die Suite selbst
  lesen (andere Programme wie 7-Zip meldeten nach den ersten Kilobytes einen Datenfehler). Die Suite öffnet sie weiterhin;
  nach Eingabe des Passworts verschlüsselt das Speichern des Archivs diese Dateien wieder korrekt. Von anderen Programmen
  verschlüsselte Archive waren nicht betroffen.

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
| `Strg+A` | Alles im Ordner auswählen |
| `F2` | Umbenennen |
| `Entf` | Löschen |

### Navigation

| Tasten | Funktion |
|---|---|
| `Eingabe` | Ordner öffnen / Datei-Vorschau |
| `Rücktaste` / `Alt+↑` | Übergeordneter Ordner |
| `Esc` | Vorschau schließen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Werkzeugleiste lässt sich seitlich verschieben. Die Liste zeigt Name und Größe; Tippen auf einen Ordner öffnet ihn, Tippen auf
eine Datei zeigt die Vorschau, die Kontrollkästchen wählen aus.
