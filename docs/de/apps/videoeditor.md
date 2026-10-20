# Video-Editor

Der Video-Editor (`videoeditor.html`) schneidet Videos wie ein einfaches kdenlive: Medienliste, Zeitleiste mit mehreren
Video- und Audiospuren, Titel, Blenden und Export als WebM oder MP4.

## Medien

**Medien importieren** (oder Ziehen von Dateien auf das Fenster) fügt Videos (WebM, MP4, MOV, MKV, …), Audiodateien (MP3,
WAV, OGG, M4A, FLAC, …) und Bilder (PNG, JPEG, WebP, GIF, SVG) zur Medienliste hinzu. Welche Videoformate gehen, hängt vom
Browser ab; ⚠ markiert Dateien, die in der Vorschau laufen, aber für den Export nicht dekodiert werden können.

Eine Datei kommt mit **＋** in die Zeitleiste (ans Ende von V1, Audio an A1), per Doppelklick oder durch Ziehen auf eine
Spur an die gewünschte Zeit. Videos können auch auf eine Audiospur gezogen werden, um nur ihren Ton zu verwenden.

## Zeitleiste

- Videospuren liegen übereinander: V2 verdeckt V1 (Bild im Bild, Logos, Titel). Audiospuren geben nur Ton wieder; Videos auf
  Videospuren spielen auch ihren eigenen Ton.
- Ziehen verschiebt einen Clip (auch auf eine andere Spur derselben Art), Ziehen am linken oder rechten Rand kürzt ihn. Clips
  rasten an den Rändern anderer Clips und an der Abspielposition ein. Wird ein Clip auf andere geschoben, überschreibt er die
  verdeckten Teile.
- Ein Klick wählt einen Clip. **✂** (`S`) teilt den gewählten Clip (oder alle Clips) an der Abspielposition, **🗑** (`Entf`)
  löscht ihn, **⇤🗑** (`Umschalt+Entf`) löscht ihn und schiebt die folgenden Clips der Spur nach links.
- Ein Klick auf das Zeitlineal oder eine leere Stelle einer Spur setzt die Abspielposition. **+**/**−** zoomen.
- Der Spurkopf hat 👁 (Videospur ausblenden), 🔊 (stumm) und × (Spur löschen); **+V** und **+A** fügen Spuren hinzu.
- Audioclips zeigen ihre Wellenform (mit der Lautstärke des Clips skaliert), Videoclips mit Ton eine kleinere am unteren Rand.
  So schneidet man leicht in Pausen oder richtet Clips an einem Takt aus. (Dateien über 400 MB erscheinen ohne Wellenform.)
- `Strg+Z`/`Strg+Y` machen jede Änderung rückgängig bzw. wiederholen sie.

## Eigenschaften

Ohne gewählten Clip zeigt der Bereich rechts das Projekt: Auflösung (z. B. 1920 × 1080, 1280 × 720, hochkant 1080 × 1920,
quadratisch), Bildrate und Hintergrundfarbe.

Für einen Clip: Beginn, Dauer, Startpunkt in der Quelle, Ein-/Ausblenden (Bild und Ton), Lautstärke (0–200 %) und für Bilder
X/Y-Versatz, Größe und Deckkraft. **T Titel** fügt an der Abspielposition auf der obersten Spur einen Titel ein: Text (mehrere
Zeilen), Schriftgröße, Farbe, Position (oben, Mitte, unten) und ein optionaler dunkler Hintergrund.

**Geschwindigkeit (%)** spielt einen Video- oder Audioclip langsamer (Zeitlupe, bis 10 %) oder schneller (bis 1000 %); der Clip wird
auf der Zeitleiste länger oder kürzer, der Ausschnitt der Quelle bleibt gleich, und der Ton ändert wie bei einem Band seine Tonhöhe.
**Rückwärts** spielt den Clip rückwärts ab. Die Zeitleiste zeigt die Geschwindigkeit und ◀ bei rückwärts laufenden Clips. In der
Vorschau ist ein rückwärts laufender Clip stumm und läuft eventuell weniger flüssig (der Browser kann Medien nicht rückwärts
abspielen); der Export enthält Bild und Ton rückwärts.

**Untertitel**: Beim Import einer SRT- oder WebVTT-Datei (mit den Medien oder durch Ablegen) wird jeder Untertitel ein Titel auf einer Spur
*Subtitles* ganz oben – am unteren Bildrand, weiß auf dunklem Band; sie lassen sich wie jeder Titel bearbeiten, verschieben und kürzen und werden
in das exportierte Video eingebrannt. **CC** speichert die Titel dieser Spur (oder alle Titel) wieder als SRT-Datei.

**Bild** (für Videos und Bilder, unter den Clip-Einstellungen aufklappbar): Helligkeit, Kontrast und Sättigung (100 % = unverändert),
Drehung in Grad, Abschneiden jedes Rands (in % des Bildes) und **Bewegung** (Ken Burns): Größe und X/Y-Versatz am Ende des Clips – das
Bild zoomt und schwenkt gleichmäßig von seinen Werten am Anfang dorthin, etwa *Größe am Ende* 130 % für ein langsames Hineinzoomen in ein
Foto. **Bild zurücksetzen** stellt alles zurück.

**Übergänge**: *Einblenden als* und *Ausblenden als* legen fest, wie ein Bild während seiner Blende erscheint bzw. verschwindet:
Überblendung (wird durchsichtig, Standard), Wischen oder Schieben in eine von vier Richtungen, Zoom oder Kreis. Was darunter liegt, scheint
durch: Ein Clip auf V1 darunter ergibt einen Übergang zwischen zwei Bildern (legen Sie den nächsten Clip so auf V2, dass er das Ende des
ersten überlappt, und blenden Sie ihn ein); ohne etwas darunter ist es schwarz.

## Vorschau

▶ (`Leertaste`) spielt ab der Abspielposition, ◀ ▶| (`←` `→`) gehen ein Bild weiter (`Umschalt`: eine Sekunde), ⏮ ⏭
(`Pos1`/`Ende`) springen an den Anfang bzw. das Ende. **📷** speichert das aktuelle Bild als PNG.

## Export

**Exportieren** berechnet die Zeitleiste mit dem Video-Encoder des Browsers (WebCodecs) als WebM (VP9 oder VP8, Ton Opus)
oder MP4 (H.264 und AAC in Chrome und Edge, sonst VP9 und Opus), in der Auflösung und Bildrate des Projekts und der gewählten
Qualität. Ein Fortschrittsbalken zeigt den Stand (lange Videos dauern eine Weile); der Export kann abgebrochen werden.

Der Export braucht WebCodecs: Chrome, Edge und Firefox am Desktop haben es, **Firefox für Android nicht** (Schneiden geht,
Exportieren nicht).

## Projekte

**Projekt speichern** (`Strg+S`) speichert Zeitleiste und Einstellungen als JSON-Datei. Die Mediendateien sind **nicht**
enthalten: Bewahren Sie sie zusammen mit dem Projekt auf. Nach **Projekt öffnen** stehen die Medien als „fehlt“ in der Liste;
importieren Sie sie erneut (Dateien mit gleichem Namen werden automatisch verknüpft) oder verwenden Sie **Suchen…** für jede.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Projekt öffnen |
| `Strg+S` | Projekt speichern |
| `Strg+Umschalt+S` | Projekt speichern unter |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `S` | An der Abspielposition teilen |
| `Entf` / `Rücktaste` | Clip löschen (mit Umschalt: Lücke schließen) |

### Wiedergabe

| Tasten | Funktion |
|---|---|
| `Leertaste` | Abspielen / Stopp |
| `←` / `→` | Ein Bild zurück / vor (mit Umschalt: 1 s) |
| `Pos1` / `Ende` | Zum Anfang / Ende |

### Ansicht

| Tasten | Funktion |
|---|---|
| `+` / `-` | Zeitleiste zoomen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Vorschau steht oben, **Medien** und **Eigenschaften** wechseln den Bereich darunter, die Zeitleiste ist unten. Tippen
wählt einen Clip, Ziehen mit dem Finger verschiebt ihn; verwenden Sie ＋ in der Medienliste statt Ziehen und Ablegen.

## Grenzen

Keine Übergänge zwischen Clips außer Blenden, keine Keyframes, keine Bildeffekte (Farbe, Unschärfe, …), keine
Geschwindigkeitsänderung. Lange 4K-Projekte können den Speicher des Browsers übersteigen.
