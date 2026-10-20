# Audio-Editor

Der Audio-Editor (`audioeditor.html`) bearbeitet Tondateien wie Audacity: mehrere Spuren mit verschiebbaren Clips,
Schneiden und Einfügen, Effekte, Beat- und Cue-Erkennung zum Ausrichten von Musik, Aufnahme mit dem Mikrofon und Export als
WAV, MP3, FLAC, Ogg Opus oder M4A.

## Dateien

- **Öffnen** (`Strg+O`) öffnet eine oder mehrere Audiodateien, jede als Spur (WAV, MP3, OGG/Opus, FLAC, M4A/AAC, WebM;
  welche komprimierten Formate gehen, hängt vom Browser ab). Auf das Fenster gezogene Dateien werden ebenfalls geöffnet; sind
  schon Spuren offen, werden sie hinzugefügt. **Importieren** fügt Dateien als neue Spuren hinzu.
- Alle Spuren haben eine gemeinsame Abtastrate: die der ersten Datei (44 100 Hz für erzeugte oder aufgenommene Töne). Dateien
  mit anderer Rate werden beim Import umgerechnet.
- **Speichern** (`Strg+S`) schreibt die Mischung aller Spuren als WAV. Wurde in Chrome/Edge am Desktop eine einzelne WAV-Datei
  geöffnet, wird sie direkt mit derselben Bittiefe überschrieben; sonst wird die Datei heruntergeladen (ersetzen Sie das
  Original damit).
- **Exportieren** (`Strg+Umschalt+S`) wählt Dateiname, Format, Bitrate (komprimierte Formate), Kanäle (automatisch: Stereo,
  wenn eine Spur stereo oder im Panorama verschoben ist) und Bereich (alles oder nur die Auswahl). Der Export ändert nicht,
  in welche Datei **Speichern** schreibt.

| Format | Hinweise |
|---|---|
| WAV 16 Bit, 24 Bit, 32 Bit Gleitkomma | verlustfrei, jeder Browser |
| FLAC | verlustfrei, etwa halb so groß wie WAV; jeder Browser (eingebauter Encoder) |
| MP3 | 128–320 kbit/s; jeder Browser (eingebauter Encoder); höchstens 48 kHz |
| Ogg Opus | 64–256 kbit/s, immer 48 kHz; nur wenn der Browser einen Opus-Encoder hat (aktuelle Chrome, Edge, Firefox) |
| M4A (AAC) | 96–320 kbit/s; nur wenn der Browser einen AAC-Encoder hat (meist Chrome/Edge unter Windows und macOS) |

**Audio-Projekte** (`.audioproj`): Wählen Sie im Export-Dialog *Audio-Projekt*, um Spuren, Clips mit ihren Positionen,
Beat-Raster, Cues, Namen, Lautstärke, Balance, Stumm und Solo zum Weiterbearbeiten zu behalten. **Öffnen** liest Projekte wieder
ein; **Speichern** schreibt dann das Projekt. Ein Projekt ist eine ZIP-Datei mit `project.json` und je einer verlustfreien
WAV-Datei pro Clip (32 Bit Gleitkomma) und daher größer als ein abgemischtes WAV. Zum Abspielen anderswo exportieren Sie es als
Audio.

Formate, die der Browser nicht schreiben kann, sind ausgegraut. Die MP3- und FLAC-Encoder werden beim ersten Öffnen des
Export-Dialogs geladen; das Kodieren eines langen Projekts dauert einige Sekunden (der Fortschritt steht in der
Transportleiste).

## Auswählen

- Ziehen über eine Spur wählt einen Zeitbereich; Ziehen nach oben oder unten nimmt weitere Spuren dazu. `Umschalt`+Klick
  erweitert die Auswahl, `Strg`+Klick nimmt eine Spur dazu oder heraus, Doppelklick wählt eine ganze Spur, `Strg+A` alles.
- Ein Klick ohne Ziehen setzt die Einfügemarke (dort beginnen Einfügen, Erzeugen und Abspielen).
- **Anfang** und **Ende** in der Transportleiste zeigen die Auswahl und können eingetippt werden (`m:ss.mmm` oder Sekunden).
- Ein Klick auf den Spurkopf wählt eine Spur. Bearbeitungen wirken auf die gewählten Spuren, ohne Auswahl auf alle.
- Ist 🧲 (Einrasten) eingeschaltet, rasten Einfügemarke und Auswahlgrenzen an Clip-Rändern, Beats, Cues und der
  Abspielposition ein, sobald sie ihnen auf wenige Pixel nahekommen (`Umschalt` gedrückt halten: frei setzen).

## Clips

Jede Spur enthält Clips: Audiostücke mit eigener Position. Eine geöffnete oder aufgenommene Datei ist ein Clip; Teilen,
Einfügen und Erzeugen legen weitere Clips an. Lücken zwischen Clips sind Stille.

- **Clip verschieben**: an seiner Titelleiste (dem Streifen oben im Clip mit seinem Namen) nach links oder rechts ziehen,
  oder nach oben oder unten in eine andere Spur. `Alt`+Ziehen irgendwo im Clip geht ebenfalls. Mit 🧲 rastet der Clip mit
  seinen Rändern, Beats und Cues an Rändern, Beats und Cues der anderen Clips und an der Abspielposition ein; eine orange
  Linie zeigt, wo.
- Ein Klick auf die Titelleiste wählt den Clip (blauer Rahmen) und seinen Bereich aus; ein Doppelklick auf einen Clip ebenso.
- **⫶** (`Strg+I`) teilt die Clips an der Einfügemarke (und am Ende der Auswahl, falls vorhanden).
- **Clip ▾** → *Clip duplizieren* legt eine Kopie direkt dahinter, *Clip entfernen* löscht ihn, ohne die anderen Clips zu
  verschieben, *Verschieben nach…* setzt eine genaue Anfangszeit.
- Löschen, Ausschneiden und Einfügen arbeiten wie in Audacity: Löschen eines Bereichs schiebt die Clips dahinter nach links,
  Einfügen oder Erzeugen schiebt sie nach rechts.

### Clip-Lautstärke, Blenden und Überblendungen

Diese Einstellungen ändern das Audio selbst nicht; sie wirken beim Abspielen und Speichern und lassen sich jederzeit ändern:

- **Blenden**: Ziehen Sie den runden Griff an der linken oberen Ecke eines Clips nach rechts, um ihn einzublenden, den an der
  rechten oberen Ecke nach links, um ihn auszublenden. Die Blende wird als Kurve gezeichnet, die Wellenform zeigt das Ergebnis.
- **Clip ▾ → Clip-Lautstärke…** macht einen Clip lauter oder leiser (in dB; in seiner Titelleiste angezeigt). *Blenden entfernen*
  setzt beide Blenden zurück.
- **Überblenden**: Ziehen Sie einen Clip so, dass er das Ende des vorigen überlappt, und wählen Sie **Clip ▾ → Überlappende Clips
  überblenden**: Der erste Clip wird über die Überlappung aus-, der zweite eingeblendet. Die Blenden folgen Kurven gleicher Leistung,
  die Lautstärke sackt in der Mitte also nicht ab.

## Beats und Cues

Zum Ausrichten zweier Musikstücke findet der Editor die Beats und markante Stellen (Cues) eines Clips. Beide gehören zum
Clip und wandern mit ihm.

- **Clip ▾ → Beats erkennen** ermittelt das Tempo (BPM) und legt ein gleichmäßiges Beat-Raster über den gewählten Clip, ohne
  gewählten Clip über alle Clips der gewählten Spuren. Das Tempo steht in der Titelleiste; Beats sind dünne Linien mit einem
  Strich in der Titelleiste. Am besten für Musik mit gleichmäßigem Tempo; bei sehr langsamer oder schneller Musik kann das
  halbe oder doppelte Tempo erkannt werden – korrigieren Sie es im Beat-Raster.
- **Beat-Raster…** zeigt und ändert Tempo und Lage eines Beats als Zahlen; **Beat auf den Cursor legen** verschiebt das
  Raster so, dass ein Beat genau an der Einfügemarke liegt.
- **Tempo angleichen…** macht den gewählten Clip schneller oder langsamer, bis er das Zieltempo hat (vorgeschlagen: das
  Tempo eines anderen Clips mit Beats). Die Tonhöhe bleibt gleich; Beats und Cues werden angepasst.
- **Cues erkennen…** markiert den ersten Ton und die stärksten Einsätze (Schläge, Einsätze von Instrumenten) mit einem
  *Mindestabstand*; höhere *Empfindlichkeit* findet mehr Cues. **Cue am Cursor setzen** (`M`) setzt einen von Hand. Cues sind
  orange Linien mit einem Dreieck.
- **Beats und Cues entfernen** löscht die Markierungen des gewählten Clips (bzw. der gewählten Spuren).

**Zwei Lieder ausrichten**: beide öffnen, *Beats erkennen*, *Tempo angleichen…* auf den zweiten Clip, dann ihn an der
Titelleiste ziehen, bis seine Beats auf denen des ersten einrasten – etwa so, dass sein erster Cue auf einem Beat des
ersten Lieds liegt. *Ausblenden*/*Einblenden* im überlappenden Bereich ergibt einen weichen Übergang.

## Beschriftungen

Die Beschriftungsleiste unter dem Zeitlineal enthält Beschriftungen für das ganze Projekt (Abschnitte, Kapitel, Notizen):

- **Spuren ▾ → Beschriftung hinzufügen** (`Strg+B`) beschriftet die Auswahl oder – ohne Auswahl – die Cursorposition. Ein
  Doppelklick auf eine freie Stelle der Leiste fügt dort eine Beschriftung hinzu.
- Ein Klick auf eine Beschriftung wählt ihren Bereich aus (bzw. setzt den Cursor darauf); ein Doppelklick benennt sie um.
  Ein leerer Name entfernt die Beschriftung.
- **Beschriftungen exportieren…** speichert die Beschriftungen als Textdatei im Audacity-Format (Beginn, Ende und Text durch
  Tabulatoren getrennt, Zeiten in Sekunden); **Beschriftungen importieren…** liest eine solche Datei (etwa aus Audacity).
- Beschriftungen rasten wie Cues ein, lassen sich rückgängig machen und werden in der Projektdatei gespeichert.

## Bearbeiten

| Schaltfläche | Taste | Funktion |
|---|---|---|
| ↶ ↷ | `Strg+Z`, `Strg+Y` | rückgängig, wiederholen |
| ✂ ⧉ 📋 | `Strg+X`, `Strg+C`, `Strg+V` | ausschneiden, kopieren, einfügen (ersetzt die Auswahl; mehrere kopierte Spuren werden in mehrere Spuren eingefügt) |
| ⌫ | `Entf` | löscht die Auswahl (der Rest rückt nach) |
| ⊐⊏ | | schneidet auf die Auswahl zu |
| ∅ | | ersetzt die Auswahl durch Stille |

**Effekte** wirken auf die Auswahl, ohne Auswahl auf die ganze Spur: Verstärken (dB), Normalisieren (Spitzenpegel),
Einblenden, Ausblenden, Umkehren, Invertieren, Echo (Verzögerung und Abklingen), Geschwindigkeit ändern (ändert Länge und
Tonhöhe), Tempo ändern (ändert die Länge, behält die Tonhöhe), Tiefpass und Hochpass sowie:

- **Equalizer**: Bass (unter 120 Hz), Mitten (um 1 kHz) und Höhen (über 6 kHz) in dB anheben oder absenken.
- **Kompressor**: Über der Schwelle steigt der Pegel nur um 1/Verhältnis (Ansprech- und Abklingzeit glätten, die Aufholverstärkung hebt das
  Ergebnis an) – gleicht Sprache oder Gesang aus. **Limiter**: hält die Spitzen unter einer Obergrenze.
- **Hall**: Raumgröße (Nachhallzeit) und Anteil.
- **Tonhöhe ändern**: um Halbtöne hinauf oder hinunter; die Länge bleibt gleich.
- **Rauschminderung**: senkt gleichmäßige Hintergrundgeräusche (Rauschen, Brummen, Lüfter) um den angegebenen Wert. Das Rauschen wird in den
  leisesten Teilen der Auswahl gemessen; wählen Sie also einige Pausen mit der Sprache oder Musik aus; eine höhere Rauschschwelle entfernt mehr,
  kann aber leise Klänge beeinträchtigen.

Effekte, die die Länge ändern oder
umkehren, bearbeiten die Auswahl als ein Stück (die Clips darin werden zu einem Clip); ohne Auswahl wirken sie auf jeden Clip. **Erzeugen** fügt an der Einfügemarke einen Ton (Sinus, Rechteck, Sägezahn, Dreieck),
Rauschen oder Stille ein; ohne Spuren entsteht eine neue Spur.

## Spuren

Der Kopf jeder Spur enthält ihren Namen (zum Umbenennen anklicken), **M** (stumm), **S** (solo: nur Solo-Spuren sind zu
hören), ⧉ (duplizieren), 2→1 / 1→2 (in Mono oder Stereo umwandeln), × (löschen) sowie Regler für Lautstärke (dB) und
Balance (Doppelklick setzt zurück). Lautstärke, Balance, Stumm und Solo wirken beim Abspielen und beim Speichern. **Spuren ▾**
legt eine leere Spur an, mischt alle Spuren zu einer ab oder wählt alles aus.

**≋** zeigt die Spur als Spektrogramm statt als Wellenform: die Zeit von links nach rechts, die Frequenz von unten (30 Hz) nach
oben auf logarithmischer Skala, die Lautstärke als Farbe von dunkelblau (leise) über rot bis hellgelb (laut). So findet man
Brummen, Rauschen, Pfeiftöne oder Knackser. Die Einstellung wird in der Projektdatei gespeichert.

**⤴** schaltet die Spur auf Lautstärkeautomation: eine Linie über der Wellenform zeigt die Lautstärke im zeitlichen Verlauf (oben
+6 dB, unten −40 dB). Ein Klick auf die Spur setzt einen Punkt, Ziehen verschiebt ihn, ein Doppelklick entfernt ihn. Zwischen den
Punkten ändert sich die Lautstärke gleichmäßig, vor dem ersten und nach dem letzten Punkt bleibt sie auf deren Wert. Ein erneuter
Klick auf ⤴ kehrt zur normalen Bearbeitung zurück. Die Automation wirkt beim Abspielen, Speichern und Exportieren und bleibt in der
Projektdatei erhalten.

## Abspielen und Aufnehmen

▶ (oder `Leertaste`) spielt die Auswahl oder ab der Einfügemarke bis zum Ende; ⏸ hält an, ⏹ stoppt, ⏮ ⏭ springen an den
Anfang bzw. das Ende. 🔁 wiederholt die Auswahl. Ein Klick auf das Zeitlineal setzt die Abspielposition.

● startet die Aufnahme mit dem Mikrofon (der Browser fragt nach der Erlaubnis); die anderen Spuren werden dabei abgespielt.
● beendet die Aufnahme; sie wird eine neue Spur mit einem Clip, der an der Einfügemarke beginnt.

## Ansicht

`Strg`+Mausrad oder **+**/**−** zoomen, ⤢ zeigt alles. `Umschalt`+Mausrad (oder die Bildlaufleiste unter den Spuren) blättert.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Exportieren |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+X` / `Strg+C` / `Strg+V` | Ausschneiden, kopieren, einfügen |
| `Strg+A` | Alles auswählen |
| `Entf` / `Rücktaste` | Auswahl löschen |
| `Strg+I` | Am Cursor teilen |
| `M` | Cue am Cursor setzen |
| `Strg+B` | Beschriftung hinzufügen (Auswahl oder Cursor) |
| `Alt+Ziehen` | Clip verschieben (irgendwo im Clip) |
| `Umschalt+Ziehen` | Ohne Einrasten verschieben oder auswählen |

### Wiedergabe

| Tasten | Funktion |
|---|---|
| `Leertaste` | Abspielen / Pause |
| `Pos1` / `Ende` | Zum Anfang / Ende |

### Ansicht

| Tasten | Funktion |
|---|---|
| `+` / `-` | Vergrößern / verkleinern |
| `Strg+Mausrad` | Zoomen |
| `Umschalt+Mausrad` | Blättern |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Tippen oder Ziehen auf einer Spur setzt die Einfügemarke bzw. wählt aus; ein Clip wird an seiner (etwas höheren)
Titelleiste verschoben. Die Spurköpfe sind schmaler, behalten aber alle Schaltflächen und Regler; die
Werkzeugleiste lässt sich waagrecht verschieben.
