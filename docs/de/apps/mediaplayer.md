# Medienplayer

Der Medienplayer (`mediaplayer.html`) spielt Audio- und Videodateien sowie Stream-URLs ab, mit Wiedergabelisten, Zufallswiedergabe
und Wiederholen, Wiedergabegeschwindigkeit, Untertiteln, Vollbild und Bild-in-Bild.

## Unterstützte Formate

Der Player verwendet die Codecs des Browsers. In der Regel unterstützt:

| Browser | Audio | Video |
|---|---|---|
| Chrome, Edge (Desktop, Android) | MP3, AAC/M4A, WAV, FLAC, Ogg Vorbis, Opus | MP4 (H.264, AV1), WebM (VP8, VP9, AV1); MKV funktioniert oft |
| Firefox | MP3, AAC/M4A, WAV, FLAC, Ogg Vorbis, Opus | MP4 (H.264, AV1; abhängig vom System), WebM, Ogg Theora |

Formate wie AVI, WMV/WMA oder MPEG-2 werden meist nicht unterstützt; der Player zeigt dann eine Meldung und überspringt die Datei.
Titel, Interpret, Album und Cover werden aus ID3 (MP3), FLAC/Ogg-Kommentaren, MP4-Tags und WAV-INFO-Blöcken gelesen.

## Öffnen

- **Dateien öffnen** (`Strg+O`) fügt Audio- und Videodateien, Wiedergabelisten und Untertitel hinzu; **Ordner öffnen** fügt alle
  Mediendateien eines Ordners hinzu (auch aus Unterordnern). Sie können Dateien und Ordner auch auf das Fenster ziehen.
- **URL öffnen** (`Strg+L`) fügt einen Stream oder eine Datei auf einem Webserver hinzu (`http://`, `https://`). Der Browser spielt
  sie direkt ab; der Server muss erreichbar sein.
- Die erste hinzugefügte Datei wird abgespielt, wenn gerade nichts läuft.

## Wiedergabeliste

- Ein Doppelklick (am Smartphone: Tippen) auf einen Titel spielt ihn ab. ↑ und ↓ verschieben einen Titel, × entfernt ihn; Titel
  lassen sich auch an eine neue Position ziehen.
- **Filtern** zeigt nur Titel, deren Titel, Interpret oder Album den Text enthält. **Leeren** leert die Wiedergabeliste.
- **▦** wechselt zur **Albenansicht**: eine Kachel je Album mit Cover (aus den Tags), Titel ohne Album am Ende; ein Klick spielt
  das Album. **☰** führt zur Liste zurück.
- **Wiedergabelisten** (M3U, M3U8, PLS, XSPF): Öffnen Sie die Wiedergabeliste **zusammen mit den Mediendateien**, auf die sie
  verweist (alle markieren oder den Ordner öffnen). Die Einträge werden über den Dateinamen zugeordnet. Einträge ohne Datei sind
  durchgestrichen; wird die Datei später hinzugefügt, nimmt sie ihren Platz in der Liste ein. URLs in einer Wiedergabeliste werden
  direkt abgespielt.
- **Wiedergabeliste speichern** speichert die Liste als M3U8 (lokale Dateien mit ihrem Namen oder ursprünglichen Pfad, Streams mit URL).

> **Hinweis:** Aus Sicherheitsgründen erhält der Player keinen Zugriff auf Dateien, die Sie nicht ausgewählt haben. Daher kann eine
> Wiedergabeliste allein ihre Dateien nicht laden.

## Wiedergabe

| Bedienelement | Taste | Funktion |
|---|---|---|
| ▶ / ⏸ | `Leertaste`, `K` | Wiedergabe / Pause (auch ein Klick auf das Bild) |
| ⏹ | `S` | Stopp |
| ⏮ / ⏭ | `P` / `N` | vorheriger / nächster Titel (⏮ springt zuerst an den Anfang des Titels) |
| Zeitleiste | `←` / `→` (`Umschalt`: 1 Minute) | 5 Sekunden springen |
| 🔊 und Regler | `M`, `↑` / `↓` | stumm, Lautstärke |
| Geschwindigkeit | `[` / `]`, `=` | 0,25× bis 4× (Tonhöhe bleibt), normale Geschwindigkeit |
| 🔀 | | Zufallswiedergabe: jeder Titel wird einmal in zufälliger Reihenfolge gespielt |
| 🔁 / 🔂 | | Wiederholen: aus, alle, einen |
| Untertitel | `V` | Untertitel wählen oder ausschalten |
| ⧉ | | Bild-in-Bild (Chrome, Edge) |
| ⛶ | `F`, Doppelklick | Vollbild |
| A–B | `L` | Teil wiederholen: der erste Klick setzt A, der zweite B (der Teil dazwischen wiederholt sich), der dritte beendet es |
| ⏴ / ⏵ (Videos) | `,` / `.` | ein Bild zurück / vor (hält an) |
| 📷 (Videos) | | speichert das aktuelle Bild als PNG |
| 🎚 | | Equalizer (siehe unten) |

Lange Dateien (ab zwei Minuten) werden dort fortgesetzt, wo Sie zuletzt aufgehört haben (die letzten 200 Dateien merkt sich dieser
Browser).

**Equalizer**: 🎚 öffnet zehn Bänder von 31 Hz bis 16 kHz (±12 dB) mit Voreinstellungen (neutral, Bässe, Höhen, Sprache, Loudness)
und **Lautstärke angleichen**, das laute und leise Stellen ausgleicht. Er wirkt bei lokalen Dateien; Stream-URLs werden unverändert
abgespielt (der Browser erlaubt nicht, ihren Ton zu bearbeiten).

Lautstärke, Stummschaltung, Geschwindigkeit, Zufallswiedergabe, Wiederholen und die Anzeige der Wiedergabeliste werden in diesem
Browser gespeichert. Medientasten der Tastatur und die Wiedergabe-Benachrichtigung unter Android funktionieren ebenfalls.

## Untertitel

Fügen Sie eine SRT- oder WebVTT-Datei hinzu. Eine Untertiteldatei mit dem Namen eines Videos (`film.srt` zu `film.mp4`) gehört zu
diesem Video; sonst wird sie dem laufenden Titel zugeordnet. Mehrere Untertiteldateien sind möglich; die Liste in der Steuerleiste
wählt eine aus.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Dateien öffnen |
| `Strg+L` | Stream-URL öffnen |

### Wiedergabe

| Tasten | Funktion |
|---|---|
| `Leertaste` / `K` | Abspielen / Pause |
| `S` | Stopp |
| `←` / `→` | 5 s zurück / vor (mit Umschalt: 60 s) |
| `↑` / `↓` | Lautstärke |
| `M` | Stumm |
| `[` / `]` | Langsamer / schneller |
| `=` | Normale Geschwindigkeit |
| `N` / `P` | Nächster / vorheriger Eintrag |
| `F` | Vollbild |
| `V` | Nächste Untertitelspur |
| `L` | A–B-Wiederholung (A setzen, B setzen, aus) |
| `,` / `.` | Ein Bild zurück / vor (Videos) |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Das Bild steht über der Steuerung und der Wiedergabeliste. Tippen auf einen Titel spielt ihn ab; die Schaltflächen ↑, ↓ und × sind
immer sichtbar.
