# Audio editor

The audio editor (`audioeditor.html`) edits sound files like Audacity: several tracks with movable clips, cutting and
pasting, effects, beat and cue detection for aligning music, recording from the microphone and export as WAV, MP3, FLAC,
Ogg Opus or M4A.

## Files

- **Open** (`Ctrl+O`) opens one or more audio files, each as a track (WAV, MP3, OGG/Opus, FLAC, M4A/AAC, WebM; which
  compressed formats work depends on the browser). Dropping files onto the window opens them as well; with tracks already
  open, dropped files are added. **Import** adds files as new tracks.
- All tracks share one sample rate: the rate of the first file (44 100 Hz for generated or recorded audio). Files with
  another rate are converted when imported.
- **Save** (`Ctrl+S`) writes the mix of all tracks as WAV. If you opened a single WAV file in Chrome/Edge on the desktop,
  it is overwritten directly with the same bit depth; otherwise the file is downloaded (replace the original with it).
- **Export** (`Ctrl+Shift+S`) chooses the file name, the format, the bit rate (compressed formats), the channels
  (automatic: stereo if a track is stereo or panned) and the range (everything or only the selection). Exporting does not
  change which file **Save** writes to.

| Format | Notes |
|---|---|
| WAV 16 bit, 24 bit, 32 bit float | lossless, every browser |
| FLAC | lossless and about half the size of WAV; every browser (built-in encoder) |
| MP3 | 128–320 kbit/s; every browser (built-in encoder); written at 48 kHz or below |
| Ogg Opus | 64–256 kbit/s, always 48 kHz; only if the browser has an Opus encoder (current Chrome, Edge, Firefox) |
| M4A (AAC) | 96–320 kbit/s; only if the browser has an AAC encoder (usually Chrome/Edge on Windows and macOS) |

**Audio projects** (`.audioproj`): choose *Audio project* in the export dialog to keep the tracks, clips with their
positions, beat grids, cues, names, volume, balance, mute and solo for further editing. **Open** reads projects again;
**Save** then writes the project. A project is a ZIP file with `project.json` and one lossless WAV file per clip
(32-bit float), so it is larger than a mixed-down WAV. To play the result elsewhere, export it as audio.

Formats the browser cannot write are shown greyed out. The MP3 and FLAC encoders are loaded the first time the export
dialog opens; encoding a long project takes a few seconds (the progress is shown in the transport bar).

## Selecting

- Drag over a track to select a time range; drag up or down to include further tracks. `Shift`+click extends the
  selection, `Ctrl`+click adds or removes a track, double-click selects a whole track, `Ctrl+A` everything.
- A click without dragging sets the cursor (where pasting, generating and playing start).
- **Start** and **End** in the transport bar show the selection and can be typed (`m:ss.mmm` or seconds).
- Click the track header to select a track. Edits apply to the selected tracks, or to all tracks if none is selected.
- With 🧲 (snapping) switched on, the cursor and selection edges snap to clip edges, beats, cues and the playhead when
  they come within a few pixels (hold `Shift` to place them freely).

## Clips

Each track contains clips: pieces of audio with their own position. An opened or recorded file is one clip; splitting,
pasting and generating create further clips. Gaps between clips are silence.

- **Move a clip**: drag its title bar (the strip at the top of the clip with its name) left or right, or up or down into
  another track. `Alt`+drag anywhere on the clip works as well. With 🧲 on, the clip snaps with its edges, beats and cues
  to the edges, beats and cues of the other clips and to the playhead; an orange line shows where it snapped.
- A click on the title bar picks the clip (blue frame) and selects its range; double-click on a clip does the same.
- **⫶** (`Ctrl+I`) splits the clips at the cursor (and at the end of the selection, if there is one).
- **Clip ▾** → *Duplicate clip* puts a copy right after it, *Remove clip* deletes it without moving the other clips,
  *Move to…* places it at an exact start time.
- Deleting, cutting and inserting work like Audacity: deleting a range moves the clips after it to the left, pasting or
  generating moves them to the right.

### Clip volume, fades and cross-fades

These settings do not change the audio itself; they are applied when playing and saving, and can be changed any time:

- **Fades**: drag the round handle at the top left corner of a clip to the right to fade it in, the one at the top right
  corner to the left to fade it out. The fade is drawn as a curve, and the waveform shows the result.
- **Clip ▾ → Clip volume…** raises or lowers one clip (in dB; shown in its title bar). *Remove fades* resets both fades.
- **Cross-fade**: drag a clip so that it overlaps the end of the previous one, then choose **Clip ▾ → Cross-fade overlapping
  clips**: the first clip fades out and the second fades in over the overlap. The fades use equal-power curves, so the
  loudness does not dip in the middle.

## Beats and cues

For aligning two pieces of music, the editor can find the beats and important points (cues) of a clip. Both belong to
the clip and move with it.

- **Clip ▾ → Detect beats** finds the tempo (BPM) and lays a constant beat grid over the picked clip, or over all
  clips of the selected tracks if none is picked. The tempo is shown in the title bar; beats are thin lines with a tick
  in the title bar. Works best for music with a steady tempo; for very slow or fast music the detected tempo may be half
  or double the real one – correct it in the beat grid.
- **Beat grid…** shows and changes the tempo and the position of one beat by numbers; **Put a beat at the cursor** shifts
  the grid so that a beat lies exactly at the cursor.
- **Match tempo…** makes the picked clip faster or slower until it has the target tempo (default: the tempo of another
  clip with beats). The pitch stays the same; beats and cues are adjusted.
- **Detect cues…** marks the first sound and the strongest onsets (drum hits, entries), at least *minimum distance*
  apart; a higher *sensitivity* finds more cues. **Add cue at cursor** (`M`) sets one by hand. Cues are orange lines with a
  triangle.
- **Remove beats and cues** deletes the markers of the picked clip (or of the selected tracks).

**Aligning two songs**: open both, *Detect beats*, *Match tempo…* on the second clip, then drag it by its title bar until
its beats snap onto the beats of the first one – for example so that its first cue lies on a beat of the first song.
Use *Fade out*/*Fade in* on the overlapping range for a smooth transition.

## Labels

The label strip below the time ruler holds labels for the whole project (sections, chapters, notes):

- **Tracks ▾ → Add label** (`Ctrl+B`) labels the selection, or the cursor position when nothing is selected. A
  double-click on an empty spot of the strip adds a label there.
- A click on a label selects its range (or puts the cursor on it); a double-click renames it. An empty name removes the
  label.
- **Export labels…** saves the labels as a text file in Audacity's format (start, end and text separated by tabs, times in
  seconds); **Import labels…** reads such a file (for example from Audacity).
- Labels snap like cues, can be undone and are saved in the project file.

## Editing

| Button | Key | Function |
|---|---|---|
| ↶ ↷ | `Ctrl+Z`, `Ctrl+Y` | undo, redo |
| ✂ ⧉ 📋 | `Ctrl+X`, `Ctrl+C`, `Ctrl+V` | cut, copy, paste (replaces the selection; several copied tracks paste into several tracks) |
| ⌫ | `Delete` | deletes the selection (the rest moves up) |
| ⊐⊏ | | trims to the selection |
| ∅ | | replaces the selection with silence |

**Effects** work on the selection, or on the whole track without a selection: amplify (dB), normalize (peak level),
fade in, fade out, reverse, invert, echo (delay and decay), change speed (changes the length and the pitch), change tempo
(changes the length but keeps the pitch), low-pass and high-pass filter, and:

- **Equaliser**: bass (below 120 Hz), middle (around 1 kHz) and treble (above 6 kHz) up or down in dB.
- **Compressor**: above the threshold the level rises only 1/ratio as much (attack and release smooth it, make-up gain
  raises the result) – evens out speech or vocals. **Limiter**: keeps the peaks below a ceiling.
- **Reverb**: room size (reverb time) and amount.
- **Change pitch**: up or down by semitones; the length stays the same.
- **Noise reduction**: lowers steady background noise (hiss, hum, fans) by the given amount. The noise is measured in the
  quietest parts of the selection, so select some of the pauses together with the speech or music; a higher noise threshold
  removes more but may affect quiet sounds.

Effects that change the length or reverse work
on the selection as one piece (the clips inside become one clip); without a selection they apply to every clip. **Generate** inserts a tone (sine, square, sawtooth, triangle), noise or silence at the cursor; without
tracks it creates a new track.

## Tracks

The header of each track has its name (click to rename), **M** (mute), **S** (solo: only solo tracks are heard), ⧉
(duplicate), 2→1 / 1→2 (make mono or stereo), × (delete), and sliders for volume (dB) and balance (double-click resets).
Volume, balance, mute and solo apply to playing and to saving. **Tracks ▾** creates an empty track, mixes all tracks down
to one, or selects everything.

**≋** shows the track as a spectrogram instead of a waveform: time from left to right, frequency from bottom (30 Hz) to
top on a logarithmic scale, loudness as colour from dark blue (quiet) over red to light yellow (loud). It helps to find
hum, noise, whistles or clicks. The setting is saved in the project file.

**⤴** switches the track to volume automation: a line over the waveform shows the volume over time (top +6 dB, bottom
−40 dB). A click on the lane adds a point, dragging moves it, a double-click removes it. Between the points the volume changes
smoothly; before the first and after the last point it stays at their level. Click ⤴ again to edit the waveform as usual.
The automation applies to playing, saving and export and is kept in the project file.

## Playing and recording

▶ (or `Space`) plays the selection, or from the cursor to the end; ⏸ pauses, ⏹ stops, ⏮ ⏭ jump to the start or end. 🔁
repeats the selection. A click on the time ruler moves the playhead.

● starts recording from the microphone (the browser asks for permission); the other tracks are played at the same time.
● again stops; the recording becomes a new track with a clip that starts at the cursor.

## View

`Ctrl`+mouse wheel or **+**/**−** zoom, ⤢ shows everything. `Shift`+mouse wheel (or the scroll bar below the tracks) scrolls.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Export |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Delete the selection |
| `Ctrl+I` | Split at the cursor |
| `M` | Add a cue at the cursor |
| `Ctrl+B` | Add a label (selection or cursor) |
| `Alt+Drag` | Move a clip (anywhere on it) |
| `Shift+Drag` | Move or select without snapping |

### Playback

| Keys | Function |
|---|---|
| `Space` | Play / pause |
| `Home` / `End` | To the start / end |

### View

| Keys | Function |
|---|---|
| `+` / `-` | Zoom in / out |
| `Ctrl+Wheel` | Zoom |
| `Shift+Wheel` | Scroll |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

Tap or drag on a track to set the cursor or select; drag a clip by its (slightly taller) title bar to move it. The
track headers are narrower but keep all buttons and sliders; the toolbar scrolls horizontally.
