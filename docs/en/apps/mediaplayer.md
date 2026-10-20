# Media player

The media player (`mediaplayer.html`) plays audio and video files and stream URLs with playlists, shuffle and repeat,
playback speed, subtitles, fullscreen and picture-in-picture.

## Supported formats

The player uses the codecs of the browser. Usually supported:

| Browser | Audio | Video |
|---|---|---|
| Chrome, Edge (desktop, Android) | MP3, AAC/M4A, WAV, FLAC, Ogg Vorbis, Opus | MP4 (H.264, AV1), WebM (VP8, VP9, AV1); MKV often works |
| Firefox | MP3, AAC/M4A, WAV, FLAC, Ogg Vorbis, Opus | MP4 (H.264, AV1; depends on the system), WebM, Ogg Theora |

Formats such as AVI, WMV/WMA or MPEG-2 are usually not supported; the player then shows a message and skips the file.
Title, artist, album and cover are read from ID3 (MP3), FLAC/Ogg comments, MP4 tags and WAV INFO chunks.

## Opening

- **Open files** (`Ctrl+O`) adds audio and video files, playlists and subtitles; **Open folder** adds all media files of a folder
  (also in subfolders). You can also drop files and folders onto the window.
- **Open URL** (`Ctrl+L`) adds a stream or a file on a web server (`http://`, `https://`). It is played directly by the browser;
  the server must be reachable.
- The first added file starts playing if nothing is playing yet.

## Playlist

- Double-click (on phones: tap) an item to play it. ↑ and ↓ move an item, × removes it; you can also drag items to a new position.
- **Filter** shows only items whose title, artist or album contains the text. **Clear** empties the playlist.
- **Playlists** (M3U, M3U8, PLS, XSPF): open the playlist **together with the media files** it refers to (select them all, or open
  the folder). The entries are matched by file name. Entries without a file are crossed out; when you add the file later, it takes
  its place in the list. URLs in a playlist are played directly.
- **▦** switches to the **album view**: one tile per album with its cover (from the tags), titles without an album at the
  end; a click plays the album. **☰** returns to the list.
- **Save playlist** stores the list as M3U8 (local files by their name or original path, streams by URL).

> **Note:** For security reasons the browser does not give the player access to files that you did not select. That is why a
> playlist alone cannot load its files.

## Playback

| Control | Key | Function |
|---|---|---|
| ▶ / ⏸ | `Space`, `K` | play / pause (also a click on the picture) |
| ⏹ | `S` | stop |
| ⏮ / ⏭ | `P` / `N` | previous / next item (⏮ first goes back to the beginning of the item) |
| seek bar | `←` / `→` (`Shift`: 1 minute) | jump 5 seconds |
| 🔊 and slider | `M`, `↑` / `↓` | mute, volume |
| speed | `[` / `]`, `=` | 0.25× to 4× (pitch is kept), normal speed |
| 🔀 | | shuffle: every item is played once in random order |
| 🔁 / 🔂 | | repeat: off, all, one |
| subtitles | `V` | choose or switch off subtitles |
| ⧉ | | picture-in-picture (Chrome, Edge) |
| ⛶ | `F`, double-click | fullscreen |
| A–B | `L` | repeat a part: the first click sets A, the second B (then the part between them repeats), the third ends it |
| ⏴ / ⏵ (videos) | `,` / `.` | one frame back / forward (pauses) |
| 📷 (videos) | | saves the current picture as PNG |
| 🎚 | | equaliser (see below) |

Long files (two minutes or more) continue where you stopped last time (the last 200 files are remembered in this browser).

**Equaliser**: 🎚 opens ten bands from 31 Hz to 16 kHz (±12 dB) with presets (flat, bass boost, treble boost, voice,
loudness) and **Normalise loudness**, which evens out loud and quiet passages. It works for local files; stream URLs are
played unchanged (the browser does not allow processing their sound).

Volume, mute, speed, shuffle, repeat and whether the playlist is shown are remembered in this browser.
Media keys of the keyboard and the playback notification on Android work as well.

## Subtitles

Add an SRT or WebVTT file. A subtitle file named like a video (`movie.srt` for `movie.mp4`) belongs to that video; otherwise it is
added to the item that is playing. Several subtitle files can be added; the list in the control bar chooses one.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open files |
| `Ctrl+L` | Open a stream URL |

### Playback

| Keys | Function |
|---|---|
| `Space` / `K` | Play / pause |
| `S` | Stop |
| `←` / `→` | Back / forward 5 s (with Shift: 60 s) |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `[` / `]` | Slower / faster |
| `=` | Normal speed |
| `N` / `P` | Next / previous item |
| `F` | Fullscreen |
| `V` | Next subtitle track |
| `L` | A–B repeat (set A, set B, off) |
| `,` / `.` | One frame back / forward (videos) |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The picture is shown above the controls and the playlist. Tap an item to play it; the buttons ↑, ↓ and × are always visible.
