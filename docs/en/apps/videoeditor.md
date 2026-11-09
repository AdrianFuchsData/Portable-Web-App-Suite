# Video editor

The video editor (`videoeditor.html`) cuts videos like a simple kdenlive: media bin, timeline with several video and
audio tracks, titles, fades and export to WebM or MP4.

## Media

**Import media** (or dropping files onto the window) adds videos (WebM, MP4, MOV, MKV, …), audio files (MP3, WAV, OGG,
M4A, FLAC, …) and images (PNG, JPEG, WebP, GIF, SVG) to the media list. Which video formats work depends on the
browser; ⚠ marks files that can be previewed but not decoded for the export.

Add a file to the timeline with **＋** (appends it to V1, or A1 for audio), a double-click, or by dragging it onto a
track at the desired time. Videos can also be dragged onto an audio track to use only their sound.

## Timeline

- Video tracks are drawn on top of each other: V2 covers V1 (picture in picture, logos, titles). Audio tracks only play
  sound; videos on video tracks play their own sound too.
- Drag a clip to move it (also to another track of the same kind), drag its left or right edge to trim it. Clips snap to
  the edges of other clips and to the playhead. Moving a clip onto others overwrites the covered parts.
- Click a clip to select it. **✂** (`S`) splits the selected clip (or all clips) at the playhead, **🗑** (`Delete`) deletes
  it, **⇤🗑** (`Shift+Delete`) deletes it and moves the following clips of the track left.
- Click on the time ruler or an empty part of a track to move the playhead. **+**/**−** zoom.
- The track header has 👁 (hide a video track), 🔊 (mute) and × (delete the track); **+V** and **+A** add tracks.
- Audio clips show their waveform (scaled by the clip's volume), video clips with sound a smaller one at the bottom edge.
  This makes it easy to cut at pauses or align clips to a beat. (Files above 400 MB are shown without a waveform.)
- **Freeze frame** (`F`, or ❄ in the clip settings of a video): the frame at the playhead stands still for two seconds –
  the clip is split there, its rest moves two seconds later, and a picture of the frame (added to the media list) fills the gap;
  change its duration like any clip.
- **Markers** (`M`) mark points on the time ruler, e.g. the beats of the music or the start of a scene; `,` and `.` jump to the
  previous and next one, clips snap to them, a double-click names or deletes one. They are saved in the project.
- `Ctrl+Z`/`Ctrl+Y` undo and redo every change.

## Properties

Without a selected clip, the panel on the right shows the project: resolution (e.g. 1920 × 1080, 1280 × 720, vertical
1080 × 1920, square), frame rate and background colour.

For a clip: start, duration, source in point, fade in/out (picture and sound), volume (0–200 %), and for pictures X/Y offset,
scale and opacity. **T Title** adds a title at the playhead on the top track: text (several lines), font size, colour,
position (top, middle, bottom) and an optional dark background.

**Speed (%)** plays a video or audio clip slower (slow motion, down to 10 %) or faster (up to 1000 %); the clip gets longer or
shorter on the timeline, the part of the source stays the same, and the sound changes its pitch like a tape. **Reverse** plays
the clip backwards. The timeline shows the speed and ◀ for reversed clips. In the preview a reversed clip is silent and
may play less smoothly (the browser cannot play media backwards); the export has the reversed picture and sound.

**Subtitles**: importing an SRT or WebVTT file (with the media, or by dropping it) puts every subtitle as a title on a track
*Subtitles* at the top – at the bottom of the picture, white on a dark band; they can be edited, moved and trimmed like any title
and are burnt into the exported video. **CC** saves the titles of that track (or all titles) as an SRT file again.

**Keyframes** animate X, Y, size, opacity and rotation: move the playhead to a moment, set the value and click ◆ next to the
field – a keyframe. At another moment type another value: as soon as a property has a keyframe, typing sets a new keyframe at the
playhead. In between the value changes evenly; before the first and after the last keyframe it stays. The fields always show the
value at the playhead, ◆ is filled where a keyframe is (click it to remove that keyframe), and ◆ marks on the clip show where
keyframes lie. Keyframes replace the motion settings (Ken Burns) of the same property, also work for titles and stay right
when a clip is split. **Remove all keyframes** makes the clip static again.

**Picture** (for videos and images, folded below the clip settings): brightness, contrast and saturation (100 % = unchanged),
rotation in degrees, cropping each edge (in % of the picture), and **motion** (Ken Burns): the size and X/Y offset at the end of
the clip – the picture zooms and pans smoothly from its values at the start to these; for example *size at the end* 130 % for a
slow zoom into a photo. **Reset picture** restores everything.

**Effects** (in the same section): blur, grayscale, sepia, hue shift and inverted colours. **Green screen** (chroma key):
tick *Key out a colour* and choose the colour (green by default) – it becomes transparent, so the clip on the track below shows
through (e.g. a person filmed in front of a green cloth on V2 over a background on V1). *Tolerance* sets how similar a colour
must be to disappear, *soft edge* smooths the border, *remove colour cast* takes the green (or blue) glow off hair and edges.

**Transitions**: *Fade in as* and *Fade out as* choose how a picture appears or disappears during its fade: dissolve
(becomes transparent, the default), wipe or slide in one of four directions, zoom or circle. What lies below shows
through: a clip on V1 below gives a transition between two pictures (put the next clip on V2 so that it overlaps the
end of the first one and fade it in), with nothing below it is black.

**Cross-fade / transition to the next clip** does this for you: choose the length and the picture transition and click
*With the next clip* – the next clip moves to the track above (for sound: the next audio track) and fades in over the first
one, which is extended by the length into the footage after its end; the sound cross-fades. *Between all clips of the track*
does it for every pair of neighbours (alternating between two tracks). Nothing else moves on the timeline. A video clip
needs footage after its end for this (shorten it first if it ends where its file ends); pictures and titles always can.

**Edit in audio editor** (sound of a clip) opens the clip's sound in the audio editor (a new tab or window) for cleaning up,
cutting or effects. **Save** there brings it back as a new file in the media list: an audio clip then plays the edited sound;
for a video clip its own sound is muted and the edited sound is put on an audio track at the same place.

**Normalise** (sound of a clip) sets the clip's volume so that its loudest moment reaches −1 dBFS (up to 400 %).

## Preview

▶ (`Space`) plays from the playhead, ◀ ▶| (`←` `→`) step one frame (`Shift`: one second), ⏮ ⏭ (`Home`/`End`) jump to the
start or end. **📷** saves the current frame as PNG.

## Export

**Export** renders the timeline with the browser's video encoder (WebCodecs) into WebM (VP9 or VP8, Opus sound) or MP4
(H.264 and AAC in Chrome and Edge, otherwise VP9 and Opus), at the project resolution and frame rate, with the chosen
quality. A progress bar shows how far rendering is (long videos take a while); it can be cancelled.

*From* and *To* export only a part of the timeline (with markers, the dialog offers the ranges between them). *Only the sound*
exports the mixed audio as WAV, or as Opus (WebM) or AAC (M4A) where the browser can encode them. *Animated GIF* makes a
looping GIF without sound (width, frames per second, optional dithering) – for short clips: GIFs have 256 colours and grow
quickly (at most 600 frames).

Export needs WebCodecs: Chrome, Edge and Firefox on the desktop have it, **Firefox for Android does not** (editing works,
exporting does not).

## Projects

**Save project** (`Ctrl+S`) saves the timeline and settings as a JSON file. The media files are **not** included: keep them
together with the project. After **Open project**, the media are listed as "missing"; import them again (files with the same
names are linked automatically) or use **Locate…** for each.

**Save with media** writes the project and all its media files into one ZIP – to move a project to another computer or keep
it in one piece. **Open project** opens such a ZIP with everything linked; `Ctrl+S` then saves the ZIP again. (The ZIP holds
the media files as they are, so it is as large as they are together.)

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open a project |
| `Ctrl+S` | Save the project |
| `Ctrl+Shift+S` | Save the project as |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `S` | Split at the playhead |
| `F` | Freeze frame at the playhead |
| `M` | Marker at the playhead |
| `,` / `.` | Previous / next marker |
| `Delete` / `Backspace` | Delete the clip (with Shift: close the gap) |

### Playback

| Keys | Function |
|---|---|
| `Space` | Play / stop |
| `←` / `→` | One frame back / forward (with Shift: 1 s) |
| `Home` / `End` | To the start / end |

### View

| Keys | Function |
|---|---|
| `+` / `-` | Zoom the timeline |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The preview is on top, **Media** and **Properties** switch the panel below it, and the timeline is at the bottom. Tap a
clip to select it and drag it with the finger; use ＋ in the media list instead of drag and drop.

## Limits

Transitions are fades, wipes, slides, zooms and circles of a clip over what lies below it (no automatic transitions between
neighbouring clips on one track); the only movement over time is the motion from start to end (no general keyframes); the picture
can be changed in brightness, contrast, saturation, rotation and cropping (no blur or other effects). The editor keeps its data in
memory, so long 4K projects may exceed the memory of the browser.
