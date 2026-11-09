/*
 * Video editor: media bin, multi-track timeline (video/overlay tracks with images and titles, audio tracks), clips with
 * move/trim/split/ripple delete and snapping, preview on a canvas (media elements per clip), clip properties (volume, fades,
 * position, scale, opacity, titles), project files (JSON, media are relinked by name), export with WebCodecs (export.js).
 */
import * as tl from 'app/timeline';
import * as ex from 'app/export';
import { parseSubtitles, toSrt } from 'app/subtitles';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'videoeditor';
const MEDIA_TYPES = [{ description: 'Media', accept: { 'video/*': ['.webm', '.mp4', '.mov', '.mkv', '.m4v', '.ogv'], 'audio/*': ['.mp3', '.wav', '.ogg', '.opus', '.m4a', '.aac', '.flac'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'] } }];
const PROJECT_TYPES = [{ description: 'Video project', accept: { 'application/json': ['.json'], 'application/zip': ['.zip'] } }];
const ZIP_TYPES = [{ description: 'Video project with media (ZIP)', accept: { 'application/zip': ['.zip'] } }];
const isZipName = (name) => /\.zip$/i.test(name || '');
const mimeOf = (s) => ({ image: 'image/', audio: 'audio/', video: 'video/' }[s.kind] || '') + ((s.name.split('.').pop() || '').toLowerCase().replace('jpg', 'jpeg').replace('mov', 'quicktime'));
const SIZES = [[1920, 1080], [1280, 720], [854, 480], [1080, 1920], [720, 1280], [1080, 1080], [720, 720]];

Suite.i18n.register({
  en: {
    'app.title': 'Video editor',
    've.newProject': 'New', 've.openProject': 'Open project', 've.saveProject': 'Save project', 've.import': 'Import media', 've.export': 'Export', 've.undo': 'Undo', 've.redo': 'Redo',
    've.split': 'Split at playhead', 've.delete': 'Delete', 've.ripple': 'Delete and close gap', 've.title': 'Title', 've.snapshot': 'Save frame as PNG', 've.media': 'Media',
    've.properties': 'Properties', 've.timeline': 'Timeline', 've.mediaEmpty': 'Import or drop videos, audio files and images.', 've.add': 'Add to timeline', 've.removeMedia': 'Remove from project',
    've.missing': 'missing', 've.locate': 'Locate…', 've.noExport': 'This file cannot be decoded for the export in this browser.', 've.project': 'Project', 've.resolution': 'Resolution',
    've.fps': 'Frame rate', 've.background': 'Background', 've.start': 'Start (s)', 've.duration': 'Duration (s)', 've.in': 'Source in (s)', 've.volume': 'Volume (%)',
    've.cuesImported': '{0} subtitles imported (track “Subtitles”).', 've.noCues': '“{0}” contains no subtitles.', 've.noSubtitles': 'There are no titles to export.',
    've.exportSubtitles': 'Export the subtitles (titles) as an SRT file',
    've.picture': 'Picture: colours, effects, green screen, rotation, crop, motion', 've.freeze': 'Freeze frame', 've.editAudio': 'Edit in audio editor', 've.editAudioHint': 'Open the sound of this clip in the audio editor; saving there brings it back', 've.edited': 'edited', 've.editedBack': 'The edited sound is back in the timeline.', 've.saveZip': 'Save with media', 've.saveZipHint': 'The project and all its media files in one ZIP – to move it to another computer', 've.zipMissing': '{0} media files are missing and were left out.', 've.keyAdd': 'Keyframe at the playhead', 've.keyRemove': 'Remove the keyframe at the playhead', 've.keysHint': 'Animated: the fields show the values at the playhead; typing a value sets a keyframe there.', 've.keysClear': 'Remove all keyframes', 've.normalize': 'Normalise', 've.normalizeHint': 'Volume so that the loudest moment reaches −1 dBFS', 've.normalized': 'Volume set to {0} %.',
    've.xfade': 'Cross-fade / transition to the next clip', 've.xfadeLength': 'Length (s)', 've.xfadeType': 'Picture transition', 've.xfadeNext': 'With the next clip', 've.xfadeTrack': 'Between all clips of the track',
    've.xfadeNoHandle': 'The clip has no more footage after its end: shorten it first (a cross-fade needs material from both clips).', 've.xfadeShort': 'Only {0} s were possible (the source ends).', 've.xfadeNone': 'There are no neighbouring clips with spare footage on this track.', 've.xfadeDone': '{0} transitions.', 've.freezeHint': 'Hold the frame at the playhead for two seconds (F)', 've.noVideoHere': 'There is no video clip at the playhead.', 've.noFrame': 'The frame could not be read.',
    've.marker': 'Marker', 've.markerText': 'Name', 've.exportWhat': 'Export', 've.whatVideo': 'Video with sound', 've.whatAudio': 'Only the sound', 've.whatGif': 'Animated GIF (no sound)', 've.gifWidth': 'Width (px)', 've.gifFps': 'Frames per second', 've.gifDither': 'Dithering (smoother, larger)', 've.gifHint': 'GIFs have 256 colours and get large quickly: keep them short and small (at most 600 frames).', 've.exportFrom': 'From (s)', 've.exportTo': 'To (s)', 've.rangeFromMarkers': 'Between markers:', 've.noAudio': 'There is nothing to hear in this range.', 've.effects': 'Effects', 've.blur': 'Blur (px)', 've.grayscale': 'Grayscale (%)', 've.sepia': 'Sepia (%)', 've.hue': 'Hue (°)', 've.invert': 'Invert colours',
    've.chromaKey': 'Green screen (chroma key): a colour becomes transparent, the track below shows through', 've.keyOn': 'Key out a colour', 've.keyColor': 'Colour', 've.keyTolerance': 'Tolerance (%)', 've.keySoftness': 'Soft edge (%)', 've.keySpill': 'Remove colour cast (%)', 've.brightness': 'Brightness (%)', 've.contrast': 'Contrast (%)', 've.saturation': 'Saturation (%)', 've.rotation': 'Rotation (°)',
    've.crop.left': 'Crop left (%)', 've.crop.right': 'Crop right (%)', 've.crop.top': 'Crop top (%)', 've.crop.bottom': 'Crop bottom (%)',
    've.kenBurns': 'Motion (Ken Burns): size and offset at the end of the clip; the picture moves there from its values at the start.',
    've.endScale': 'Size at the end (%)', 've.endX': 'X offset at the end', 've.endY': 'Y offset at the end', 've.resetPicture': 'Reset picture',
    've.transitionIn': 'Fade in as', 've.transitionOut': 'Fade out as', 've.tr.fade': 'dissolve (opacity)', 've.tr.wipe-left': 'wipe to the left', 've.tr.wipe-right': 'wipe to the right',
    've.tr.wipe-up': 'wipe upwards', 've.tr.wipe-down': 'wipe downwards', 've.tr.slide-left': 'slide to the left', 've.tr.slide-right': 'slide to the right',
    've.tr.slide-up': 'slide upwards', 've.tr.slide-down': 'slide downwards', 've.tr.zoom': 'zoom', 've.tr.circle': 'circle',
    've.speed': 'Speed (%)', 've.reverse': 'Reverse', 've.fadeIn': 'Fade in (s)', 've.fadeOut': 'Fade out (s)', 've.x': 'X offset (px)', 've.y': 'Y offset (px)', 've.scale': 'Scale (%)', 've.opacity': 'Opacity (%)',
    've.text': 'Text', 've.size': 'Font size', 've.color': 'Colour', 've.textBg': 'Text background', 've.position': 'Position', 've.top': 'top', 've.middle': 'middle', 've.bottom': 'bottom',
    've.play': 'Play', 've.pause': 'Pause', 've.toStart': 'To start', 've.toEnd': 'To end', 've.prevFrame': 'Previous frame', 've.nextFrame': 'Next frame', 've.zoomIn': 'Zoom in', 've.zoomOut': 'Zoom out',
    've.mute': 'Mute', 've.hide': 'Hide', 've.format': 'Format', 've.quality': 'Quality', 've.low': 'low', 've.medium': 'medium', 've.high': 'high', 've.best': 'very high',
    've.fileName': 'File name', 've.cancel': 'Cancel', 've.ok': 'OK', 've.exporting': 'Exporting… {0} %', 've.exported': 'The video was exported.', 've.noWebCodecs': 'Exporting needs WebCodecs, which this browser does not offer (e.g. Firefox for Android). Use Chrome, Edge or Firefox on a desktop computer.',
    've.noFormats': 'This browser cannot encode videos of this size.', 've.empty': 'The timeline is empty.', 've.discard': 'Discard the unsaved changes?', 've.untitled': 'Video project',
    've.badProject': 'This is not a video project file.', 've.relinked': '{0} file(s) found again.', 've.missingFiles': '{0} media file(s) are missing: use “Locate…” in the media list.',
    've.cannotOpen': '“{0}” cannot be opened: {1}', 've.dropHere': 'Drop media here', 've.addTrack': 'Track', 've.videoTrack': 'Video track', 've.audioTrack': 'Audio track',
    've.deleteTrack': 'Delete track', 've.addTitle': 'Add a title at the playhead', 've.custom': 'custom',
  },
  de: {
    'app.title': 'Video-Editor',
    've.newProject': 'Neu', 've.openProject': 'Projekt öffnen', 've.saveProject': 'Projekt speichern', 've.import': 'Medien importieren', 've.export': 'Exportieren', 've.undo': 'Rückgängig', 've.redo': 'Wiederholen',
    've.split': 'An der Abspielposition teilen', 've.delete': 'Löschen', 've.ripple': 'Löschen und Lücke schließen', 've.title': 'Titel', 've.snapshot': 'Bild als PNG speichern', 've.media': 'Medien',
    've.properties': 'Eigenschaften', 've.timeline': 'Zeitleiste', 've.mediaEmpty': 'Importieren oder ziehen Sie Videos, Audiodateien und Bilder hierher.', 've.add': 'Zur Zeitleiste hinzufügen', 've.removeMedia': 'Aus dem Projekt entfernen',
    've.missing': 'fehlt', 've.locate': 'Suchen…', 've.noExport': 'Diese Datei kann in diesem Browser für den Export nicht dekodiert werden.', 've.project': 'Projekt', 've.resolution': 'Auflösung',
    've.fps': 'Bildrate', 've.background': 'Hintergrund', 've.start': 'Beginn (s)', 've.duration': 'Dauer (s)', 've.in': 'Quelle ab (s)', 've.volume': 'Lautstärke (%)',
    've.cuesImported': '{0} Untertitel importiert (Spur „Subtitles“).', 've.noCues': '„{0}“ enthält keine Untertitel.', 've.noSubtitles': 'Es gibt keine Titel zum Exportieren.',
    've.exportSubtitles': 'Die Untertitel (Titel) als SRT-Datei exportieren',
    've.picture': 'Bild: Farben, Effekte, Greenscreen, Drehung, Zuschnitt, Bewegung', 've.freeze': 'Standbild', 've.editAudio': 'Im Audio-Editor bearbeiten', 've.editAudioHint': 'Den Ton dieses Clips im Audio-Editor öffnen; Speichern dort bringt ihn zurück', 've.edited': 'bearbeitet', 've.editedBack': 'Der bearbeitete Ton ist zurück in der Zeitleiste.', 've.saveZip': 'Mit Medien speichern', 've.saveZipHint': 'Das Projekt und alle Mediendateien in einem ZIP – um es auf einen anderen Computer mitzunehmen', 've.zipMissing': '{0} Mediendateien fehlen und wurden ausgelassen.', 've.keyAdd': 'Schlüsselbild an der Abspielposition', 've.keyRemove': 'Das Schlüsselbild an der Abspielposition entfernen', 've.keysHint': 'Animiert: Die Felder zeigen die Werte an der Abspielposition; ein eingegebener Wert setzt dort ein Schlüsselbild.', 've.keysClear': 'Alle Schlüsselbilder entfernen', 've.normalize': 'Normalisieren', 've.normalizeHint': 'Lautstärke so, dass die lauteste Stelle −1 dBFS erreicht', 've.normalized': 'Lautstärke auf {0} % gesetzt.',
    've.xfade': 'Überblendung / Übergang zum nächsten Clip', 've.xfadeLength': 'Länge (s)', 've.xfadeType': 'Bildübergang', 've.xfadeNext': 'Mit dem nächsten Clip', 've.xfadeTrack': 'Zwischen allen Clips der Spur',
    've.xfadeNoHandle': 'Der Clip hat nach seinem Ende kein weiteres Material: Kürzen Sie ihn zuerst (eine Überblendung braucht Material beider Clips).', 've.xfadeShort': 'Nur {0} s waren möglich (die Quelle endet).', 've.xfadeNone': 'Auf dieser Spur gibt es keine Nachbarclips mit überschüssigem Material.', 've.xfadeDone': '{0} Übergänge.', 've.freezeHint': 'Das Bild an der Abspielposition zwei Sekunden halten (F)', 've.noVideoHere': 'An der Abspielposition liegt kein Videoclip.', 've.noFrame': 'Das Bild konnte nicht gelesen werden.',
    've.marker': 'Marke', 've.markerText': 'Name', 've.exportWhat': 'Exportieren', 've.whatVideo': 'Video mit Ton', 've.whatAudio': 'Nur den Ton', 've.whatGif': 'Animiertes GIF (ohne Ton)', 've.gifWidth': 'Breite (px)', 've.gifFps': 'Bilder pro Sekunde', 've.gifDither': 'Rastern (weicher, größer)', 've.gifHint': 'GIFs haben 256 Farben und werden schnell groß: Halten Sie sie kurz und klein (höchstens 600 Bilder).', 've.exportFrom': 'Von (s)', 've.exportTo': 'Bis (s)', 've.rangeFromMarkers': 'Zwischen Marken:', 've.noAudio': 'In diesem Bereich ist nichts zu hören.', 've.effects': 'Effekte', 've.blur': 'Unschärfe (px)', 've.grayscale': 'Graustufen (%)', 've.sepia': 'Sepia (%)', 've.hue': 'Farbton (°)', 've.invert': 'Farben umkehren',
    've.chromaKey': 'Greenscreen (Chroma-Key): Eine Farbe wird durchsichtig, die Spur darunter scheint durch', 've.keyOn': 'Eine Farbe ausstanzen', 've.keyColor': 'Farbe', 've.keyTolerance': 'Toleranz (%)', 've.keySoftness': 'Weicher Rand (%)', 've.keySpill': 'Farbstich entfernen (%)', 've.brightness': 'Helligkeit (%)', 've.contrast': 'Kontrast (%)', 've.saturation': 'Sättigung (%)', 've.rotation': 'Drehung (°)',
    've.crop.left': 'Links abschneiden (%)', 've.crop.right': 'Rechts abschneiden (%)', 've.crop.top': 'Oben abschneiden (%)', 've.crop.bottom': 'Unten abschneiden (%)',
    've.kenBurns': 'Bewegung (Ken Burns): Größe und Versatz am Ende des Clips; das Bild bewegt sich von seinen Werten am Anfang dorthin.',
    've.endScale': 'Größe am Ende (%)', 've.endX': 'X-Versatz am Ende', 've.endY': 'Y-Versatz am Ende', 've.resetPicture': 'Bild zurücksetzen',
    've.transitionIn': 'Einblenden als', 've.transitionOut': 'Ausblenden als', 've.tr.fade': 'Überblendung (Deckkraft)', 've.tr.wipe-left': 'Wischen nach links', 've.tr.wipe-right': 'Wischen nach rechts',
    've.tr.wipe-up': 'Wischen nach oben', 've.tr.wipe-down': 'Wischen nach unten', 've.tr.slide-left': 'Schieben nach links', 've.tr.slide-right': 'Schieben nach rechts',
    've.tr.slide-up': 'Schieben nach oben', 've.tr.slide-down': 'Schieben nach unten', 've.tr.zoom': 'Zoom', 've.tr.circle': 'Kreis',
    've.speed': 'Geschwindigkeit (%)', 've.reverse': 'Rückwärts', 've.fadeIn': 'Einblenden (s)', 've.fadeOut': 'Ausblenden (s)', 've.x': 'X-Versatz (px)', 've.y': 'Y-Versatz (px)', 've.scale': 'Größe (%)', 've.opacity': 'Deckkraft (%)',
    've.text': 'Text', 've.size': 'Schriftgröße', 've.color': 'Farbe', 've.textBg': 'Texthintergrund', 've.position': 'Position', 've.top': 'oben', 've.middle': 'Mitte', 've.bottom': 'unten',
    've.play': 'Abspielen', 've.pause': 'Pause', 've.toStart': 'Zum Anfang', 've.toEnd': 'Zum Ende', 've.prevFrame': 'Vorheriges Bild', 've.nextFrame': 'Nächstes Bild', 've.zoomIn': 'Vergrößern', 've.zoomOut': 'Verkleinern',
    've.mute': 'Stumm', 've.hide': 'Ausblenden', 've.format': 'Format', 've.quality': 'Qualität', 've.low': 'niedrig', 've.medium': 'mittel', 've.high': 'hoch', 've.best': 'sehr hoch',
    've.fileName': 'Dateiname', 've.cancel': 'Abbrechen', 've.ok': 'OK', 've.exporting': 'Exportiere… {0} %', 've.exported': 'Das Video wurde exportiert.', 've.noWebCodecs': 'Der Export braucht WebCodecs, das dieser Browser nicht bietet (z. B. Firefox für Android). Verwenden Sie Chrome, Edge oder Firefox auf einem Desktop-Computer.',
    've.noFormats': 'Dieser Browser kann Videos dieser Größe nicht kodieren.', 've.empty': 'Die Zeitleiste ist leer.', 've.discard': 'Die ungespeicherten Änderungen verwerfen?', 've.untitled': 'Videoprojekt',
    've.badProject': 'Das ist keine Videoprojekt-Datei.', 've.relinked': '{0} Datei(en) wiedergefunden.', 've.missingFiles': '{0} Mediendatei(en) fehlen: Verwenden Sie „Suchen…“ in der Medienliste.',
    've.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}', 've.dropHere': 'Medien hier ablegen', 've.addTrack': 'Spur', 've.videoTrack': 'Videospur', 've.audioTrack': 'Audiospur',
    've.deleteTrack': 'Spur löschen', 've.addTitle': 'Titel an der Abspielposition einfügen', 've.custom': 'benutzerdefiniert',
  },
});

const state = {
  project: tl.newProject(), sources: new Map(), images: new Map(),
  sel: null, time: 0, playing: null, pps: 40, history: [], future: [], drag: null,
  name: '', handle: null, dirty: false, dialog: null, exporting: null, panel: 'media', rev: 0,
};
state.name = `${t('ve.untitled')}.json`;

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); requestCompose(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const fmt = (s) => { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; };
const frame = () => 1 / state.project.fps;
const setDirty = (v = true) => { state.dirty = v; Suite.shell.setDirty(v); };
const selected = () => state.project.clips.find((c) => c.id === state.sel) || null;
const sourceDuration = (c) => { const s = state.sources.get(c.source); return c.kind === 'image' || c.kind === 'text' || !s ? Infinity : s.duration; };

function commit(project) {
  state.history.push(state.project);
  if (state.history.length > 100) state.history.shift();
  state.future = [];
  state.project = project;
  state.rev++;
  setDirty();
  render();
}
function undo() { if (!state.history.length) return; state.future.push(state.project); state.project = state.history.pop(); state.rev++; setDirty(); render(); }
function redo() { if (!state.future.length) return; state.history.push(state.project); state.project = state.future.pop(); state.rev++; setDirty(); render(); }

// ---- media ---------------------------------------------------------------------------------------------------------------

function kindOf(file) {
  if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(file.name)) return 'image';
  if (/^audio\//.test(file.type) || /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i.test(file.name)) return 'audio';
  return 'video';
}

async function loadSource(s, file) {
  s.file = file;
  s.size = file.size;
  s.missing = false;
  if (s.url) URL.revokeObjectURL(s.url);
  s.url = URL.createObjectURL(file);
  if (s.kind === 'image') {
    const bmp = await createImageBitmap(file);
    state.images.set(s.id, bmp);
    Object.assign(s, { width: bmp.width, height: bmp.height, duration: Infinity, hasVideo: true, hasAudio: false, canDecode: true });
    const c = document.createElement('canvas');
    const k = Math.min(160 / bmp.width, 90 / bmp.height, 1);
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    s.thumb = c.toDataURL('image/jpeg', 0.7);
    return;
  }
  try {
    Object.assign(s, await ex.probe(s));
  } catch (e) {
    // a format Mediabunny cannot read: the preview may still play it, the export cannot
    console.warn(e);
    const el = document.createElement(s.kind === 'audio' ? 'audio' : 'video');
    el.src = s.url;
    await new Promise((resolve, reject) => { el.onloadedmetadata = resolve; el.onerror = () => reject(new Error(el.error ? el.error.message || `code ${el.error.code}` : 'unsupported')); });
    Object.assign(s, { duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0, hasVideo: !!el.videoWidth, hasAudio: true, canDecode: false, thumb: '' });
  }
  if (s.kind === 'video' && !s.hasVideo) s.kind = 'audio';
  if (s.hasAudio) loadPeaks(s, file); // in the background: the waveform appears when it is ready
}

const PEAK_RATE = 50; // peaks per second of the source
const MAX_PEAK_FILE = 400 * 1024 * 1024;

/** Peak levels of a source's audio for the waveforms in the timeline (s.peaks: Float32Array, PEAK_RATE per second). */
async function loadPeaks(s, file) {
  if (file.size > MAX_PEAK_FILE || typeof OfflineAudioContext === 'undefined') return;
  try {
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
    const step = buffer.sampleRate / PEAK_RATE;
    const peaks = new Float32Array(Math.ceil(buffer.length / step));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < peaks.length; i++) {
        let m = peaks[i];
        for (let j = Math.floor(i * step), e = Math.min(d.length, Math.floor((i + 1) * step)); j < e; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
        peaks[i] = m;
      }
    }
    if (s.file === file) { s.peaks = peaks; render(); }
  } catch (e) { console.warn('no waveform', s.name, e); }
}

/** Draw the waveform of a clip into its canvas (only when something changed). */
function drawWave(el, c, s) {
  if (!el || !s || !s.peaks) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(tl.length(c) * state.pps * dpr)), h = Math.max(1, Math.round(el.clientHeight * dpr));
  const key = `${c.in}|${c.out}|${tl.speedOf(c)}|${!!c.reverse}|${c.volume}|${state.pps}|${w}|${h}|${s.peaks.length}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.width = Math.min(w, 32000); el.height = h;
  const g = el.getContext('2d');
  g.clearRect(0, 0, el.width, h);
  g.fillStyle = 'rgba(255,255,255,.75)';
  const mid = h / 2, k = el.width / w;
  for (let x = 0; x < el.width; x++) {
    const a = tl.sourceTime(c, c.start + (x / k) / (state.pps * dpr)), b = tl.sourceTime(c, c.start + ((x + 1) / k) / (state.pps * dpr));
    const t0 = Math.min(a, b), t1 = Math.max(a, b);
    let m = 0;
    for (let i = Math.floor(t0 * PEAK_RATE), e = Math.max(i + 1, Math.ceil(t1 * PEAK_RATE)); i < e && i < s.peaks.length; i++) if (s.peaks[i] > m) m = s.peaks[i];
    const amp = Math.min(1, m * c.volume) * mid * 0.95;
    if (amp > 0.3) g.fillRect(x, mid - amp, 1, amp * 2);
  }
}

const SUBTITLE_TRACK = 'Subtitles';

/** Subtitle cues as titles on a track "Subtitles" at the top (bottom of the picture, white on a dark band). */
async function importSubtitles(file) {
  const cues = parseSubtitles(await file.text());
  if (!cues.length) { Suite.shell.toast(t('ve.noCues', file.name), 'warning'); return; }
  let p = state.project;
  let track = p.tracks.find((tr) => tr.kind === 'video' && tr.name === SUBTITLE_TRACK);
  if (!track) {
    track = { id: tl.newId('t'), kind: 'video', name: SUBTITLE_TRACK, mute: false, hidden: false };
    p = { ...p, tracks: [track, ...p.tracks] };
  }
  const size = Math.round(p.height * 0.055);
  for (const cue of cues) {
    const clip = tl.makeClip('text', { track: track.id, start: cue.start });
    clip.out = cue.end - cue.start;
    clip.text = { content: cue.text, size, color: '#ffffff', background: 'rgba(0,0,0,0.6)', valign: 'bottom' };
    p = tl.addClip(p, clip);
  }
  commit(p);
  Suite.shell.toast(t('ve.cuesImported', cues.length));
}

/** The titles of the subtitle track (or all titles) as an SRT file. */
function exportSubtitles() {
  const p = state.project;
  const track = p.tracks.find((tr) => tr.kind === 'video' && tr.name === SUBTITLE_TRACK);
  const texts = p.clips.filter((c) => c.kind === 'text' && (!track || c.track === track.id)).sort((a, b) => a.start - b.start);
  if (!texts.length) { Suite.shell.toast(t('ve.noSubtitles'), 'warning'); return; }
  const srt = toSrt(texts.map((c) => ({ start: c.start, end: tl.end(c), text: c.text.content })));
  Suite.files.download(new TextEncoder().encode(srt), `${state.name.replace(/\.json$/i, '')}.srt`, 'application/x-subrip');
}

async function importFiles(files) {
  let relinked = 0;
  const subtitles = files.filter((f) => /\.(srt|vtt)$/i.test(f.name));
  for (const f of subtitles) await importSubtitles(f);
  files = files.filter((f) => !subtitles.includes(f));
  for (const file of files) {
    const missing = [...state.sources.values()].find((s) => s.missing && s.name === file.name);
    const s = missing || { id: tl.newId('s'), name: file.name, kind: kindOf(file) };
    try {
      await loadSource(s, file);
      if (missing) relinked++; else state.sources.set(s.id, s);
    } catch (e) { Suite.shell.toast(t('ve.cannotOpen', file.name, e.message || e.name), 'error'); }
    render();
  }
  if (relinked) Suite.shell.toast(t('ve.relinked', relinked));
  if (files.length) setDirty();
}

function pickFiles(multiple = true) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = 'video/*,audio/*,image/*,.mkv,.mov,.srt,.vtt';
    input.style.display = 'none';
    input.onchange = () => { const files = [...input.files]; input.remove(); resolve(files); };
    document.body.appendChild(input);
    input.click();
  });
}

async function locate(s) {
  const [file] = await pickFiles(false);
  if (!file) return;
  try { await loadSource(s, file); state.rev++; Suite.shell.toast(t('ve.relinked', 1)); } catch (e) { Suite.shell.toast(t('ve.cannotOpen', file.name, e.message), 'error'); }
  render();
}

/** Default track for a source kind (V1 for video and images, A1 for audio). */
function defaultTrack(kind) {
  const want = tl.trackKindFor(kind);
  const tracks = state.project.tracks.filter((tr) => tr.kind === want);
  return (want === 'video' ? tracks[tracks.length - 1] : tracks[0]) || null;
}

function clipFromSource(s, track, start) {
  const tr = tl.trackOf(state.project, track);
  const kind = tr.kind === 'audio' ? 'audio' : s.kind === 'image' ? 'image' : 'video';
  if (kind === 'audio' && !s.hasAudio) return null;
  if (kind === 'video' && s.kind === 'audio') return null;
  return tl.makeClip(kind, { source: s.id, track, start, sourceDuration: s.duration });
}

function addSource(s, track = null, start = null) {
  const tr = track ? tl.trackOf(state.project, track) : defaultTrack(s.kind);
  if (!tr) return;
  const clip = clipFromSource(s, tr.id, start ?? tl.trackEnd(state.project, tr.id));
  if (!clip) return;
  commit(tl.addClip(state.project, clip));
  state.sel = clip.id;
}

function addTitle() {
  const tr = state.project.tracks.find((x) => x.kind === 'video');
  const clip = tl.makeClip('text', { track: tr.id, start: state.time });
  clip.text.content = t('ve.title');
  commit(tl.addClip(state.project, clip));
  state.sel = clip.id;
  state.panel = 'props';
}

function removeSource(s) {
  stop();
  commit({ ...state.project, clips: state.project.clips.filter((c) => c.source !== s.id) });
  state.sources.delete(s.id);
  render();
}

// ---- editing ------------------------------------------------------------------------------------------------------------------

// ---- cross-fades, transitions between neighbours, normalising -------------------------------------------------------------------

state.xfadeLength = 1;
state.xfadeType = 'fade';
/** The clip that directly follows c on its track (or null). */
const nextOf = (c) => tl.clipsOn(state.project, c.track).find((x) => Math.abs(x.start - tl.end(c)) < 0.02 && x.id !== c.id) || null;
const srcDuration = (c) => sourceDuration(c);

function crossfadeNext(c) {
  const b = nextOf(c);
  if (!b) return;
  const r = tl.crossfade(state.project, c.id, b.id, state.xfadeLength, state.xfadeType, srcDuration);
  if (!r.overlap) { Suite.shell.toast(t('ve.xfadeNoHandle'), 'warning'); return; }
  commit(r.p);
  if (r.overlap < state.xfadeLength - 0.01) Suite.shell.toast(t('ve.xfadeShort', r.overlap.toFixed(2)), 'warning');
}

function transitionsTrack(track) {
  const r = tl.transitionsOnTrack(state.project, track, state.xfadeLength, state.xfadeType, srcDuration);
  if (!r.count) { Suite.shell.toast(t('ve.xfadeNone'), 'warning'); return; }
  commit(r.p);
  Suite.shell.toast(t('ve.xfadeDone', r.count));
}

/**
 * "Edit in audio editor": the clip's sound goes to the audio editor; saving there brings it back as a new audio file – an audio
 * clip then plays it, a video clip is muted and the edited sound is put on an audio track at the same place.
 */
function editInAudioEditor(c) {
  const s = state.sources.get(c.source);
  if (!s || s.missing) return;
  const stem = `${s.name.replace(/\.[^.]+$/, '')}${c.kind === 'video' ? ' (sound)' : ''}`;
  Suite.bridge.openIn('audioeditor', {
    name: `${stem}.wav`,
    source: `${state.name}: ${s.name}`,
    data: async () => { const wav = await ex.sourceWav(s, c.in, c.out); if (!wav) throw new Error(t('ve.noAudio')); return wav; },
    save: async (bytes) => {
      const file = new File([bytes], `${stem} ${t('ve.edited')}.wav`, { type: 'audio/wav' });
      const edited = { id: tl.newId('s'), name: file.name, kind: 'audio' };
      await loadSource(edited, file);
      state.sources.set(edited.id, edited);
      const current = state.project.clips.find((x) => x.id === c.id);
      if (!current) { render(); return; }
      const len = Number.isFinite(edited.duration) ? edited.duration : current.out - current.in;
      const sound = { source: edited.id, in: 0, out: len, fadeIn: current.fadeIn, fadeOut: current.fadeOut, speed: current.speed, reverse: current.reverse };
      if (current.kind === 'audio') commit(tl.updateClip(state.project, current.id, sound));
      else {
        let p = tl.updateClip(state.project, current.id, { volume: 0 });
        let track = p.tracks.find((tr) => tr.kind === 'audio' && !p.clips.some((x) => x.track === tr.id && tl.end(x) > current.start && x.start < tl.end(current)));
        if (!track) { track = { id: tl.newId('t'), kind: 'audio', name: `A${p.tracks.filter((tr) => tr.kind === 'audio').length + 1}`, mute: false, hidden: false }; p = { ...p, tracks: [...p.tracks, track] }; }
        const clip = { ...tl.makeClip('audio', { source: edited.id, track: track.id, start: current.start, sourceDuration: len }), ...sound, volume: current.volume || 1 };
        commit(tl.addClip(p, clip));
      }
      setDirty();
      Suite.shell.toast(t('ve.editedBack'));
    },
  }).catch(fail);
}

/** Set the volume so that the clip's loudest sample reaches −1 dBFS. */
async function normalizeClip(c) {
  const s = state.sources.get(c.source);
  if (!s || s.missing) return;
  const peak = await ex.peakOf(s, c.in, c.out);
  if (!peak) { Suite.shell.toast(t('ve.noAudio'), 'warning'); return; }
  const volume = Math.min(4, Math.round((10 ** (-1 / 20) / peak) * 1000) / 1000);
  commit(tl.updateClip(state.project, c.id, { volume }));
  Suite.shell.toast(t('ve.normalized', Math.round(volume * 100)));
}

// ---- freeze frame and markers ------------------------------------------------------------------------------------------------

const FREEZE_SECONDS = 2;
/** Hold the frame at the playhead of the selected video clip (or the one under the playhead) for two seconds. */
async function freezeFrame() {
  const p = state.project, at = state.time;
  const sel = selected();
  const c = sel && sel.kind === 'video' && at >= sel.start && at < tl.end(sel) ? sel : p.clips.find((x) => x.kind === 'video' && at >= x.start && at < tl.end(x));
  if (!c) { Suite.shell.toast(t('ve.noVideoHere'), 'warning'); return; }
  const src = state.sources.get(c.source);
  try {
    const canvas = src && !src.missing ? await ex.frameAt(src, Math.max(c.in, Math.min(c.out - 1e-3, tl.sourceTime(c, at)))) : null;
    if (!canvas) { Suite.shell.toast(t('ve.noFrame'), 'warning'); return; }
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `${src.name.replace(/\.[^.]+$/, '')} ${fmt(at).replace(/:/g, '-')}.png`, { type: 'image/png' });
    const s = { id: tl.newId('s'), name: file.name, kind: 'image' };
    await loadSource(s, file);
    state.sources.set(s.id, s);
    commit(tl.freezeFrame(state.project, c.id, at, FREEZE_SECONDS, s.id));
    setDirty();
  } catch (e) { fail(e); }
}

function addMarker() { commit(tl.addMarker(state.project, state.time, '')); }
function jumpMarker(direction) { const m = tl.markerNear(state.project, state.time, direction); if (m) seek(m.t); }

function MarkerDialog() {
  const d = state.dialog;
  if (!d || d.kind !== 'marker') return null;
  const m = (state.project.markers || []).find((x) => x.id === d.id);
  if (!m) return null;
  return html`<dialog open data-testid="marker-dialog"><article>
    <header><strong>${t('ve.marker')} · ${fmt(m.t)}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; commit(tl.updateMarker(state.project, m.id, { text: e.target.elements.text.value })); }}>
      <label>${t('ve.markerText')}<input name="text" data-testid="marker-text" defaultValue=${m.text} autofocus /></label>
      <footer><button type="button" class="secondary outline" data-testid="marker-delete" onClick=${() => { state.dialog = null; commit(tl.removeMarker(state.project, m.id)); }}>${t('ve.delete')}</button>
        <button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ve.cancel')}</button><button type="submit" data-testid="marker-ok">OK</button></footer>
    </form></article></dialog>`;
}

function split() {
  const p = state.project;
  const at = state.time;
  const sel = selected();
  const clips = sel && at > sel.start && at < tl.end(sel) ? [sel] : p.clips.filter((c) => at > c.start && at < tl.end(c));
  if (!clips.length) return;
  let q = p, last = null;
  for (const c of clips) [q, last] = tl.splitClip(q, c.id, at);
  commit(q);
  if (last) state.sel = last;
}

function deleteSelected(ripple = false) {
  const c = selected();
  if (!c) return;
  commit(ripple ? tl.rippleDelete(state.project, c.id) : tl.removeClip(state.project, c.id));
  state.sel = null;
}

function updateSelected(changes) {
  const c = selected();
  if (!c) return;
  commit(tl.updateClip(state.project, c.id, changes));
}

function addTrack(kind) {
  const p = state.project;
  const n = p.tracks.filter((tr) => tr.kind === kind).length + 1;
  const track = { id: tl.newId('t'), kind, name: `${kind === 'video' ? 'V' : 'A'}${n}`, mute: false, hidden: false };
  const tracks = kind === 'video' ? [track, ...p.tracks] : [...p.tracks, track];
  commit({ ...p, tracks });
}

function deleteTrack(tr) {
  const p = state.project;
  if (p.tracks.filter((x) => x.kind === tr.kind).length < 2) return;
  commit({ ...p, tracks: p.tracks.filter((x) => x.id !== tr.id), clips: p.clips.filter((c) => c.track !== tr.id) });
}

function setTrack(tr, changes) { commit({ ...state.project, tracks: state.project.tracks.map((x) => (x.id === tr.id ? { ...x, ...changes } : x)) }); }

// ---- preview -------------------------------------------------------------------------------------------------------------------

const elements = new Map(); // clip id -> media element
let previewCanvas = null;

function mediaElement(c) {
  let el = elements.get(c.id);
  const s = state.sources.get(c.source);
  if (!s || !s.url) return null;
  if (el && el.dataset.src === s.url) return el;
  if (el) { el.pause(); el.removeAttribute('src'); }
  el = document.createElement(c.kind === 'audio' ? 'audio' : 'video');
  el.dataset.src = s.url;
  el.src = s.url;
  el.preload = 'auto';
  el.playsInline = true;
  el.muted = true;
  el.addEventListener('seeked', requestCompose);
  el.addEventListener('loadeddata', requestCompose);
  elements.set(c.id, el);
  return el;
}

function syncMedia(time, playing) {
  const p = state.project;
  const live = new Set();
  for (const c of p.clips) {
    if (c.kind !== 'video' && c.kind !== 'audio') continue;
    const tr = tl.trackOf(p, c.track);
    const active = time >= c.start && time < tl.end(c) && !(tr.kind === 'video' && tr.hidden && (tr.mute || c.volume === 0));
    const el = active || elements.has(c.id) ? mediaElement(c) : null;
    if (!el) continue;
    live.add(c.id);
    if (!active) { if (!el.paused) el.pause(); continue; }
    const expected = tl.sourceTime(c, time);
    const vol = tr.mute ? 0 : Math.min(1, c.volume * tl.audioFade(c, time));
    el.volume = Math.max(0, vol);
    // media elements cannot play backwards: a reversed clip is previewed by seeking frame by frame, without sound
    el.muted = vol <= 0 || !playing || !!c.reverse;
    if (el.playbackRate !== tl.speedOf(c)) { el.preservesPitch = false; el.playbackRate = tl.speedOf(c); }
    if (playing && c.reverse) {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - expected) > frame() / 2) el.currentTime = expected;
    } else if (playing) {
      if (el.paused) { el.currentTime = expected; el.play().catch(() => {}); } else if (Math.abs(el.currentTime - expected) > 0.3) el.currentTime = expected;
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - expected) > frame() / 2 && !el.seeking) el.currentTime = expected;
    }
  }
  for (const [id, el] of elements) if (!live.has(id) && !state.project.clips.some((c) => c.id === id)) { el.pause(); el.removeAttribute('src'); elements.delete(id); }
}

/** Draw the frame at a time on a 2D context (the preview). */
function compose(g, time) {
  const p = state.project;
  g.globalAlpha = 1;
  g.fillStyle = p.background || '#000';
  g.fillRect(0, 0, p.width, p.height);
  for (const tr of p.tracks.filter((x) => x.kind === 'video' && !x.hidden).reverse()) {
    const c = tl.clipAt(p, tr.id, time);
    if (!c) continue;
    if (c.kind === 'text') tl.drawClip(g, c, null, 0, 0, p, time);
    else if (c.kind === 'image') { const b = state.images.get(c.source); if (b) tl.drawClip(g, c, b, b.width, b.height, p, time); } else if (c.kind === 'video') {
      const el = mediaElement(c);
      if (el && el.readyState >= 2 && el.videoWidth) tl.drawClip(g, c, el, el.videoWidth, el.videoHeight, p, time);
    }
  }
}

let composeQueued = false;
function requestCompose() {
  if (composeQueued) return;
  composeQueued = true;
  requestAnimationFrame(() => {
    composeQueued = false;
    if (!previewCanvas) return;
    const p = state.project;
    if (previewCanvas.width !== p.width || previewCanvas.height !== p.height) { previewCanvas.width = p.width; previewCanvas.height = p.height; }
    if (!state.playing) syncMedia(state.time, false);
    compose(previewCanvas.getContext('2d'), state.time);
  });
}

function play() {
  if (state.playing) return;
  const total = tl.duration(state.project);
  if (!total) return;
  if (state.time >= total - frame()) state.time = 0;
  state.playing = { t0: state.time, p0: performance.now() };
  const loop = () => {
    if (!state.playing) return;
    const now = state.playing.t0 + (performance.now() - state.playing.p0) / 1000;
    if (now >= tl.duration(state.project)) { state.time = tl.duration(state.project); stop(); return; }
    state.time = now;
    syncMedia(now, true);
    if (previewCanvas) compose(previewCanvas.getContext('2d'), now);
    updatePlayhead();
    requestAnimationFrame(loop);
  };
  render();
  requestAnimationFrame(loop);
}

function stop() {
  if (!state.playing) return;
  state.playing = null;
  for (const el of elements.values()) el.pause();
  render();
}

function seek(time) {
  state.time = Math.max(0, Math.min(time, Math.max(tl.duration(state.project), 0)));
  if (state.playing) state.playing = { t0: state.time, p0: performance.now() };
  updatePlayhead();
  requestCompose();
  render();
}

function updatePlayhead() {
  const ph = document.querySelector('[data-testid=playhead]');
  if (ph) ph.style.left = `${state.time * state.pps}px`;
  const clock = document.querySelector('[data-testid=clock]');
  if (clock) clock.textContent = `${fmt(state.time)} / ${fmt(tl.duration(state.project))}`;
  const sc = document.querySelector('[data-testid=timeline-scroll]');
  if (state.playing && sc) { const x = state.time * state.pps; if (x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 40; }
}

function snapshotPng() {
  if (!previewCanvas) return;
  compose(previewCanvas.getContext('2d'), state.time);
  previewCanvas.toBlob(async (blob) => {
    const name = `${state.name.replace(/\.json$/i, '')}-${fmt(state.time).replace(/[:.]/g, '-')}.png`;
    Suite.files.download(new Uint8Array(await blob.arrayBuffer()), name, 'image/png');
  }, 'image/png');
}

// ---- project files ----------------------------------------------------------------------------------------------------------------

function projectJson() {
  return {
    app: 'videoeditor', version: 1, project: state.project,
    sources: [...state.sources.values()].map((s) => ({ id: s.id, name: s.name, size: s.size || 0, kind: s.kind, duration: Number.isFinite(s.duration) ? s.duration : null, width: s.width || 0, height: s.height || 0, hasAudio: !!s.hasAudio, hasVideo: !!s.hasVideo })),
  };
}

/**
 * The project with its media files as one ZIP: project.json and media/<source id>/<file name> (stored without compression – the
 * media are compressed already). Missing media are left out (with a message).
 */
async function projectZip() {
  const { zipSync, strToU8 } = await import('fflate');
  const files = { 'project.json': [strToU8(`${JSON.stringify(projectJson(), null, 1)}\n`), { level: 6 }] };
  let missing = 0;
  for (const s of state.sources.values()) {
    if (!s.file) { missing++; continue; }
    files[`media/${s.id}/${s.name.replace(/[\\/]/g, '_')}`] = [new Uint8Array(await s.file.arrayBuffer()), { level: 0 }];
  }
  if (missing) Suite.shell.toast(t('ve.zipMissing', missing), 'warning');
  return zipSync(files);
}

async function saveProject(as = false, zip = isZipName(state.name)) {
  try {
    const name = zip ? (isZipName(state.name) ? state.name : `${state.name.replace(/\.json$/i, '')}.zip`) : state.name.replace(/\.zip$/i, '.json');
    const bytes = zip ? await projectZip() : new TextEncoder().encode(`${JSON.stringify(projectJson(), null, 1)}\n`);
    const type = zip ? 'application/zip' : 'application/json';
    const sameFile = !as && state.handle && name === state.name;
    const result = !sameFile ? await Suite.files.saveAs(bytes, { suggestedName: name, types: zip ? ZIP_TYPES : PROJECT_TYPES, type })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    Object.assign(state, { name: result.name || state.name, handle: result.handle || state.handle });
    setDirty(false);
    render();
  } catch (e) { fail(e); }
}

function resetProject(project = tl.newProject()) {
  stop();
  for (const el of elements.values()) { el.pause(); el.removeAttribute('src'); }
  elements.clear();
  for (const s of state.sources.values()) if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(state, { project, sources: new Map(), images: new Map(), sel: null, time: 0, history: [], future: [], rev: state.rev + 1 });
}

async function loadProject({ file, handle }) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let media = null;
    let text;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      // a project with its media (ZIP)
      const { unzipSync, strFromU8 } = await import('fflate');
      const files = unzipSync(bytes);
      if (!files['project.json']) throw new Error(t('ve.badProject'));
      text = strFromU8(files['project.json']);
      media = files;
    } else text = new TextDecoder().decode(bytes);
    const data = JSON.parse(text);
    if (data.app !== 'videoeditor' || !data.project || !Array.isArray(data.project.clips)) throw new Error(t('ve.badProject'));
    resetProject(data.project);
    for (const s of data.sources || []) state.sources.set(s.id, { ...s, duration: s.duration ?? Infinity, missing: true, file: null, url: null });
    if (media) {
      for (const s of state.sources.values()) {
        const entry = Object.keys(media).find((k) => k.startsWith(`media/${s.id}/`));
        if (!entry) continue;
        try { await loadSource(s, new File([media[entry]], s.name, { type: mimeOf(s) })); } catch (e) { console.warn(e); }
      }
    }
    Object.assign(state, { name: file.name, handle });
    setDirty(false);
    const missing = [...state.sources.values()].filter((s) => s.missing).length;
    if (missing) Suite.shell.toast(t('ve.missingFiles', missing), 'warning');
    render();
  } catch (e) { Suite.shell.toast(t('ve.cannotOpen', file.name, e.message), 'error'); }
}

// recovery copies of unsaved work (shared/js/autosave.js): the project and, up to 48 MB, its media files
Suite.autosave.register({
  app: APP,
  save: () => {
    if (!state.dirty) return null;
    const files = [...state.sources.values()].filter((s) => s.file);
    const size = files.reduce((n, s) => n + s.file.size, 0);
    return { name: state.name, handle: state.handle, json: JSON.parse(JSON.stringify(projectJson())), files: size <= 48 * 1024 * 1024 ? files.map((s) => ({ id: s.id, file: s.file })) : [] };
  },
  restore: async (snap) => {
    resetProject(snap.json.project);
    for (const s of snap.json.sources || []) state.sources.set(s.id, { ...s, duration: s.duration ?? Infinity, missing: true, file: null, url: null });
    for (const { id, file } of snap.files) { const s = state.sources.get(id); if (s) { try { await loadSource(s, file); s.missing = false; } catch (e) { console.warn(e); } } }
    Object.assign(state, { name: snap.name, handle: snap.handle || null });
    const missing = [...state.sources.values()].filter((s) => s.missing).length;
    if (missing) Suite.shell.toast(t('ve.missingFiles', missing), 'warning');
    setDirty(true);
    render();
  },
});

async function openProject() {
  if (state.dirty && !(await Suite.shell.confirm(t('ve.discard')))) return;
  const picked = await Suite.files.open({ types: PROJECT_TYPES }).catch(fail);
  if (picked) await loadProject(picked[0]);
}

async function newProject() {
  if (state.dirty && !(await Suite.shell.confirm(t('ve.discard')))) return;
  resetProject();
  state.name = `${t('ve.untitled')}.json`;
  state.handle = null;
  setDirty(false);
  render();
}

// ---- export ---------------------------------------------------------------------------------------------------------------------

async function openExport() {
  if (!tl.duration(state.project)) { Suite.shell.toast(t('ve.empty'), 'warning'); return; }
  if (!ex.webCodecs()) { Suite.shell.toast(t('ve.noWebCodecs'), 'error'); return; }
  stop();
  const formats = await ex.availableFormats(state.project.width, state.project.height);
  if (!formats.length) { Suite.shell.toast(t('ve.noFormats'), 'error'); return; }
  const audioFormats = await ex.availableAudioFormats();
  state.dialog = { kind: 'export', formats, format: formats[0], audioFormats, audioFormat: 'wav', what: 'video', gifWidth: 480, gifFps: 10, gifDither: false, quality: 'high', stem: state.name.replace(/\.json$/i, ''), from: 0, to: tl.duration(state.project) };
  render();
}

async function runExport(d) {
  const controller = new AbortController();
  state.exporting = { progress: 0, controller };
  render();
  try {
    const range = { from: Math.max(0, d.from || 0), to: Math.max(d.from || 0, d.to ?? tl.duration(state.project)) };
    if (d.what === 'gif') {
      const bytes = await ex.renderGif(state.project, { width: d.gifWidth, fps: d.gifFps, dither: d.gifDither, sources: state.sources, images: state.images, signal: controller.signal, ...range,
        onProgress: (f) => { state.exporting.progress = f; render(); } });
      state.exporting = null;
      render();
      const result = await Suite.files.saveAs(bytes, { suggestedName: `${d.stem}.gif`, types: [{ description: 'GIF', accept: { 'image/gif': ['.gif'] } }], type: 'image/gif' });
      if (result) Suite.shell.toast(t('ve.exported'));
      return;
    }
    if (d.what === 'audio') {
      const bytes = await ex.renderAudio(state.project, { format: d.audioFormat, sources: state.sources, signal: controller.signal, ...range });
      state.exporting = null;
      render();
      if (!bytes) { Suite.shell.toast(t('ve.noAudio'), 'warning'); return; }
      const f = ex.AUDIO_FORMATS[d.audioFormat];
      const result = await Suite.files.saveAs(bytes, { suggestedName: `${d.stem}.${f.ext}`, types: [{ description: f.label, accept: { [f.mime]: [`.${f.ext}`] } }], type: f.mime });
      if (result) Suite.shell.toast(t('ve.exported'));
      return;
    }
    const bytes = await ex.render(state.project, {
      format: d.format, quality: d.quality, sources: state.sources, images: state.images, signal: controller.signal, ...range,
      onProgress: (f) => { state.exporting.progress = f; render(); },
    });
    const f = ex.FORMATS[d.format];
    state.exporting = null;
    render();
    const result = await Suite.files.saveAs(bytes, { suggestedName: `${d.stem}.${f.ext}`, types: [{ description: f.label, accept: { [f.mime]: [`.${f.ext}`] } }], type: f.mime });
    if (result) Suite.shell.toast(t('ve.exported'));
  } catch (e) {
    state.exporting = null;
    if (e.name !== 'AbortError') fail(e);
    render();
  }
}

// ---- timeline interaction ------------------------------------------------------------------------------------------------------------

function trackAtPoint(x, y, kind) {
  const lane = document.elementFromPoint(x, y)?.closest('[data-testid=lane]');
  const tr = lane && tl.trackOf(state.project, lane.dataset.track);
  return tr && tr.kind === kind ? tr : null;
}

function clipDown(e, c, mode) {
  if (e.button > 0) return;
  e.stopPropagation();
  e.preventDefault();
  state.sel = c.id;
  state.panel = 'props';
  const x0 = e.clientX;
  const tr0 = tl.trackOf(state.project, c.track);
  const threshold = 8 / state.pps;
  let moved = false;
  const onMove = (ev) => {
    const dt = (ev.clientX - x0) / state.pps;
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    moved = true;
    if (mode === 'move') {
      let start = Math.max(0, c.start + dt);
      const a = tl.snap(state.project, start, threshold, { except: c.id, extra: [state.time] });
      const b = tl.snap(state.project, start + tl.length(c), threshold, { except: c.id, extra: [state.time] }) - tl.length(c);
      start = Math.abs(a - start) <= Math.abs(b - start) ? a : b;
      const tr = trackAtPoint(ev.clientX, ev.clientY, tr0.kind) || tr0;
      state.drag = { id: c.id, mode, start: Math.max(0, start), track: tr.id };
    } else {
      const edgeT = tl.snap(state.project, (mode === 'left' ? c.start : tl.end(c)) + dt, threshold, { except: c.id, extra: [state.time] });
      state.drag = { id: c.id, mode, t: edgeT };
    }
    render();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const d = state.drag;
    state.drag = null;
    if (moved && d) {
      if (d.mode === 'move') commit(tl.moveClip(state.project, c.id, d.start, d.track));
      else commit(tl.trimClip(state.project, c.id, d.mode, d.t, sourceDuration(c)));
    }
    render();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  render();
}

/** The clip as shown while it is dragged. */
function displayed(c) {
  const d = state.drag;
  if (!d || d.id !== c.id) return c;
  if (d.mode === 'move') return { ...c, start: d.start, track: d.track };
  const q = tl.trimClip({ ...state.project, clips: [c] }, c.id, d.mode, d.t, sourceDuration(c));
  return q.clips[0];
}

function scrub(e) {
  const el = e.currentTarget;
  const at = (ev) => { const r = el.getBoundingClientRect(); seek((ev.clientX - r.left) / state.pps); };
  at(e);
  el.setPointerCapture(e.pointerId);
  const move = (ev) => at(ev);
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

function zoom(factor) {
  const sc = document.querySelector('[data-testid=timeline-scroll]');
  const center = sc ? (sc.scrollLeft + sc.clientWidth / 2) / state.pps : state.time;
  state.pps = Math.min(400, Math.max(2, state.pps * factor));
  render();
  requestAnimationFrame(() => { if (sc) sc.scrollLeft = center * state.pps - sc.clientWidth / 2; });
}

// ---- UI --------------------------------------------------------------------------------------------------------------------------------

function Toolbar() {
  const sel = selected();
  return html`<nav class="ve-toolbar" role="toolbar">
    <button class="secondary outline" data-testid="new-project" onClick=${newProject}>${t('ve.newProject')}</button>
    <button class="secondary" data-testid="open-project" onClick=${openProject}>${t('ve.openProject')}</button>
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save-project" onClick=${() => saveProject()}>${t('ve.saveProject')}</button>
    <button class="secondary outline" data-testid="save-project-zip" title=${t('ve.saveZipHint')} onClick=${() => saveProject(true, true)}>${t('ve.saveZip')}</button>
    <button class="secondary outline" data-testid="import" onClick=${async () => importFiles(await pickFiles())}>${t('ve.import')}</button>
    <button data-testid="export" onClick=${openExport}>${t('ve.export')}</button>
    <span class="ve-sep"></span>
    <button class="secondary outline" title=${t('ve.undo')} data-testid="undo" disabled=${!state.history.length} onClick=${undo}>↶</button>
    <button class="secondary outline" title=${t('ve.redo')} data-testid="redo" disabled=${!state.future.length} onClick=${redo}>↷</button>
    <button class="secondary outline" title=${t('ve.split')} data-testid="split" onClick=${split}>✂</button>
    <button class="secondary outline" title=${t('ve.delete')} data-testid="delete" disabled=${!sel} onClick=${() => deleteSelected(false)}>🗑</button>
    <button class="secondary outline" title=${t('ve.ripple')} data-testid="ripple" disabled=${!sel} onClick=${() => deleteSelected(true)}>⇤🗑</button>
    <button class="secondary outline" title=${t('ve.addTitle')} data-testid="add-title" onClick=${addTitle}>T ${t('ve.title')}</button>
    <button class="secondary outline" title=${t('ve.exportSubtitles')} data-testid="export-srt" disabled=${!state.project.clips.some((c) => c.kind === 'text')} onClick=${exportSubtitles}>CC</button>
    <button class="secondary outline" title=${t('ve.snapshot')} data-testid="snapshot" onClick=${snapshotPng}>📷</button>
  </nav>`;
}

function MediaBin() {
  const list = [...state.sources.values()];
  return html`<section class=${`ve-bin ${state.panel === 'media' ? 'show' : ''}`} data-testid="media-bin">
    <header class="ve-panel-head"><strong>${t('ve.media')}</strong></header>
    ${list.length ? null : html`<p class="ve-hint">${t('ve.mediaEmpty')}</p>`}
    <ul class="ve-media">${list.map((s) => html`<li data-testid="media" class=${s.missing ? 'missing' : ''} draggable=${!s.missing}
        onDragStart=${(e) => { e.dataTransfer.setData('application/x-ve-source', s.id); e.dataTransfer.effectAllowed = 'copy'; }}
        onDblClick=${() => !s.missing && addSource(s)}>
      <div class="ve-thumb" style=${s.thumb ? `background-image:url(${s.thumb})` : ''}>${s.thumb ? '' : s.kind === 'audio' ? '♪' : s.kind === 'image' ? '🖼' : '🎞'}</div>
      <div class="ve-media-info"><span class="ve-media-name" title=${s.name}>${s.name}</span>
        <small>${s.missing ? html`<b>${t('ve.missing')}</b>` : `${Number.isFinite(s.duration) ? fmt(s.duration) : ''}${s.width ? ` · ${s.width}×${s.height}` : ''}`}
          ${!s.missing && s.canDecode === false ? html` <span title=${t('ve.noExport')}>⚠</span>` : null}</small></div>
      <div class="ve-media-actions">
        ${s.missing ? html`<button class="secondary outline" data-testid="locate" onClick=${() => locate(s)}>${t('ve.locate')}</button>`
          : html`<button class="secondary outline" title=${t('ve.add')} data-testid="add-media" onClick=${() => addSource(s)}>＋</button>`}
        <button class="secondary outline" title=${t('ve.removeMedia')} data-testid="remove-media" onClick=${() => removeSource(s)}>×</button>
      </div></li>`)}</ul>
  </section>`;
}

function Preview() {
  const total = tl.duration(state.project);
  return html`<section class="ve-preview" data-testid="preview">
    <div class="ve-canvas-wrap"><canvas data-testid="preview-canvas" ref=${(el) => { if (el && previewCanvas !== el) { previewCanvas = el; requestCompose(); } }}
      style=${`aspect-ratio:${state.project.width}/${state.project.height}`}></canvas></div>
    <div class="ve-transport">
      <button class="secondary outline" title=${t('ve.toStart')} data-testid="to-start" onClick=${() => seek(0)}>⏮</button>
      <button class="secondary outline" title=${t('ve.prevFrame')} data-testid="prev-frame" onClick=${() => seek(state.time - frame())}>◀</button>
      ${state.playing ? html`<button title=${t('ve.pause')} data-testid="pause" onClick=${stop}>⏸</button>`
        : html`<button title=${t('ve.play')} data-testid="play" disabled=${!total} onClick=${play}>▶</button>`}
      <button class="secondary outline" title=${t('ve.nextFrame')} data-testid="next-frame" onClick=${() => seek(state.time + frame())}>▶|</button>
      <button class="secondary outline" title=${t('ve.toEnd')} data-testid="to-end" onClick=${() => seek(total)}>⏭</button>
      <span class="ve-clock" data-testid="clock">${fmt(state.time)} / ${fmt(total)}</span>
    </div>
  </section>`;
}

function NumberField({ label, value, testid, step = 0.01, min, max, onCommit, rekey = '' }) {
  return html`<label>${label}<input type="number" data-testid=${testid} key=${`${testid}-${state.sel}-${state.rev}-${rekey}`} defaultValue=${Math.round(value * 1000) / 1000} step="any" min=${min} max=${max}
    onChange=${(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onCommit(v); }} data-step=${step} /></label>`;
}

const KEY_DEFAULTS = { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 };

/**
 * A property that can be animated: the field shows its value at the playhead; with keyframes, typing sets a key there. ◆ adds a
 * key at the playhead (or removes the one there).
 */
function KeyField({ c, prop, label, testid, factor = 1, min, max, clamp = (v) => v }) {
  const local = Math.max(0, Math.min(tl.length(c), state.time - c.start));
  const keyed = !!(c.keys && c.keys[prop] && c.keys[prop].length);
  const value = tl.valueAt(c, prop, state.time, KEY_DEFAULTS[prop]) * factor;
  const atKey = keyed && tl.keyNear(c, prop, local, 0.5 / state.project.fps);
  const set = (v) => { const val = clamp(v / factor); if (keyed) commit(tl.setKey(state.project, c.id, prop, local, val)); else updateSelected({ [prop]: val }); };
  const toggle = () => commit(atKey ? tl.removeKey(state.project, c.id, prop, local, 0.5 / state.project.fps) : tl.setKey(state.project, c.id, prop, local, tl.valueAt(c, prop, state.time, KEY_DEFAULTS[prop])));
  return html`<div class="ve-keyfield">
    <${NumberField} label=${label} testid=${testid} value=${value} min=${min} max=${max} rekey=${keyed ? Math.round(state.time * 1000) : ''} onCommit=${set} />
    <button type="button" class=${`ve-key ${atKey ? 'on' : keyed ? 'some' : ''}`} data-testid=${`key-${prop}`} aria-pressed=${String(!!atKey)}
      title=${t(atKey ? 've.keyRemove' : 've.keyAdd')} aria-label=${t(atKey ? 've.keyRemove' : 've.keyAdd')} onClick=${toggle}>◆</button></div>`;
}

function Properties() {
  const c = selected();
  const p = state.project;
  if (!c) {
    const current = `${p.width}x${p.height}`;
    return html`<section class=${`ve-props ${state.panel === 'props' ? 'show' : ''}`} data-testid="properties">
      <header class="ve-panel-head"><strong>${t('ve.project')}</strong></header>
      <label>${t('ve.resolution')}<select data-testid="project-size" onChange=${(e) => { const [w, h] = e.target.value.split('x').map(Number); commit({ ...p, width: w, height: h }); }}>
        ${SIZES.map(([w, h]) => html`<option value=${`${w}x${h}`} selected=${current === `${w}x${h}`}>${w} × ${h}</option>`)}
        ${SIZES.some(([w, h]) => current === `${w}x${h}`) ? null : html`<option value=${current} selected>${p.width} × ${p.height} (${t('ve.custom')})</option>`}</select></label>
      <label>${t('ve.fps')}<select data-testid="project-fps" onChange=${(e) => commit({ ...p, fps: Number(e.target.value) })}>
        ${[24, 25, 30, 50, 60].map((f) => html`<option value=${f} selected=${p.fps === f}>${f}</option>`)}</select></label>
      <label>${t('ve.background')}<input type="color" data-testid="project-bg" value=${p.background} onChange=${(e) => commit({ ...p, background: e.target.value })} /></label>
    </section>`;
  }
  const s = state.sources.get(c.source);
  const visual = c.kind !== 'audio';
  const audible = c.kind === 'audio' || (c.kind === 'video' && s && s.hasAudio);
  const maxLen = tl.maxLength(c, sourceDuration(c));
  const timed = c.kind === 'video' || c.kind === 'audio';
  return html`<section class=${`ve-props ${state.panel === 'props' ? 'show' : ''}`} data-testid="properties">
    <header class="ve-panel-head"><strong data-testid="clip-name">${c.kind === 'text' ? t('ve.title') : s ? s.name : ''}</strong>
      <button class="secondary outline" data-testid="deselect" onClick=${() => { state.sel = null; render(); }}>×</button></header>
    <div class="ve-grid">
      <${NumberField} label=${t('ve.start')} testid="clip-start" value=${c.start} min="0" onCommit=${(v) => commit(tl.moveClip(p, c.id, v, c.track))} />
      <${NumberField} label=${t('ve.duration')} testid="clip-duration" value=${tl.length(c)} min="0.04" onCommit=${(v) => commit(tl.trimClip(p, c.id, 'right', c.start + Math.min(v, maxLen), sourceDuration(c)))} />
      ${c.kind === 'video' || c.kind === 'audio' ? html`<${NumberField} label=${t('ve.in')} testid="clip-in" value=${c.in} min="0" onCommit=${(v) => { const len = tl.length(c); const inn = Math.max(0, Math.min(v, sourceDuration(c) - tl.MIN_LENGTH)); updateSelected({ in: inn, out: Math.min(sourceDuration(c), inn + len * tl.speedOf(c)) }); }} />` : null}
      ${timed ? html`<${NumberField} label=${t('ve.speed')} testid="clip-speed" value=${Math.round(tl.speedOf(c) * 100)} min=${tl.MIN_SPEED * 100} max=${tl.MAX_SPEED * 100} onCommit=${(v) => commit(tl.setSpeed(p, c.id, v / 100))} />
        <label><input type="checkbox" data-testid="clip-reverse" checked=${!!c.reverse} onChange=${(e) => updateSelected({ reverse: e.target.checked })} /> ${t('ve.reverse')}</label>` : null}
      <${NumberField} label=${t('ve.fadeIn')} testid="clip-fade-in" value=${c.fadeIn} min="0" onCommit=${(v) => updateSelected({ fadeIn: Math.max(0, v) })} />
      <${NumberField} label=${t('ve.fadeOut')} testid="clip-fade-out" value=${c.fadeOut} min="0" onCommit=${(v) => updateSelected({ fadeOut: Math.max(0, v) })} />
      ${c.kind !== 'audio' ? html`<label>${t('ve.transitionIn')}<select data-testid="clip-transition-in" onChange=${(e) => updateSelected({ transitionIn: e.target.value })}>
          ${tl.TRANSITIONS.map((x) => html`<option value=${x} selected=${(c.transitionIn || 'fade') === x}>${t(`ve.tr.${x}`)}</option>`)}</select></label>
        <label>${t('ve.transitionOut')}<select data-testid="clip-transition-out" onChange=${(e) => updateSelected({ transitionOut: e.target.value })}>
          ${tl.TRANSITIONS.map((x) => html`<option value=${x} selected=${(c.transitionOut || 'fade') === x}>${t(`ve.tr.${x}`)}</option>`)}</select></label>` : null}
      ${audible ? html`<label>${t('ve.volume')}<input type="range" min="0" max="400" step="5" data-testid="clip-volume" value=${Math.round(c.volume * 100)} onChange=${(e) => updateSelected({ volume: Number(e.target.value) / 100 })} /><small>${Math.round(c.volume * 100)} %</small></label>` : null}
      ${visual ? html`
        <${KeyField} c=${c} prop="x" label=${t('ve.x')} testid="clip-x" />
        <${KeyField} c=${c} prop="y" label=${t('ve.y')} testid="clip-y" />
        <${KeyField} c=${c} prop="scale" label=${t('ve.scale')} testid="clip-scale" factor=${100} min="1" clamp=${(v) => Math.max(0.01, v)} />
        <${KeyField} c=${c} prop="opacity" label=${t('ve.opacity')} testid="clip-opacity" factor=${100} min="0" max="100" clamp=${(v) => Math.max(0, Math.min(1, v))} />` : null}
    ${visual && c.keys && Object.values(c.keys).some((l) => l && l.length) ? html`<p class="ve-keys-hint"><small>${t('ve.keysHint')}</small>
      <button type="button" class="secondary outline" data-testid="keys-clear" onClick=${() => updateSelected({ keys: null, ...Object.fromEntries(Object.entries(c.keys).filter(([, l]) => l && l.length).map(([k, l]) => [k, l[0].v])) })}>${t('ve.keysClear')}</button></p>` : null}
    </div>
    ${visual && c.kind !== 'text' ? html`<details class="ve-picture" open=${!!state.pictureOpen} onToggle=${(e) => { state.pictureOpen = e.target.open; }}>
      <summary data-testid="picture-section">${t('ve.picture')}</summary>
      <div class="ve-grid">
        <${NumberField} label=${t('ve.brightness')} testid="clip-brightness" value=${c.brightness ?? 100} min="0" onCommit=${(v) => updateSelected({ brightness: Math.max(0, v) })} />
        <${NumberField} label=${t('ve.contrast')} testid="clip-contrast" value=${c.contrast ?? 100} min="0" onCommit=${(v) => updateSelected({ contrast: Math.max(0, v) })} />
        <${NumberField} label=${t('ve.saturation')} testid="clip-saturation" value=${c.saturation ?? 100} min="0" onCommit=${(v) => updateSelected({ saturation: Math.max(0, v) })} />
        <${KeyField} c=${c} prop="rotation" label=${t('ve.rotation')} testid="clip-rotation" />
        ${['left', 'right', 'top', 'bottom'].map((side) => html`<${NumberField} label=${t(`ve.crop.${side}`)} testid=${`clip-crop-${side}`} value=${((c.crop || {})[side] || 0) * 100} min="0" max="90"
          onCommit=${(v) => updateSelected({ crop: { ...(c.crop || {}), [side]: Math.max(0, Math.min(0.9, v / 100)) } })} />`)}
      </div>
      <small>${t('ve.effects')}</small>
      <div class="ve-grid">
        <${NumberField} label=${t('ve.blur')} testid="clip-blur" value=${c.blur || 0} min="0" max="50" onCommit=${(v) => updateSelected({ blur: Math.max(0, Math.min(50, v)) })} />
        <${NumberField} label=${t('ve.grayscale')} testid="clip-grayscale" value=${c.grayscale || 0} min="0" max="100" onCommit=${(v) => updateSelected({ grayscale: Math.max(0, Math.min(100, v)) })} />
        <${NumberField} label=${t('ve.sepia')} testid="clip-sepia" value=${c.sepia || 0} min="0" max="100" onCommit=${(v) => updateSelected({ sepia: Math.max(0, Math.min(100, v)) })} />
        <${NumberField} label=${t('ve.hue')} testid="clip-hue" value=${c.hue || 0} min="-180" max="180" onCommit=${(v) => updateSelected({ hue: v })} />
        <label><input type="checkbox" data-testid="clip-invert" checked=${!!c.invert} onChange=${(e) => updateSelected({ invert: e.target.checked })} /> ${t('ve.invert')}</label>
      </div>
      <small>${t('ve.chromaKey')}</small>
      <div class="ve-grid">
        <label><input type="checkbox" data-testid="clip-key" checked=${!!(c.key && c.key.on)} onChange=${(e) => updateSelected({ key: { color: '#00ff00', tolerance: 30, softness: 10, spill: 50, ...(c.key || {}), on: e.target.checked } })} /> ${t('ve.keyOn')}</label>
        ${c.key && c.key.on ? html`
          <label>${t('ve.keyColor')}<input type="color" data-testid="clip-key-color" value=${c.key.color} onChange=${(e) => updateSelected({ key: { ...c.key, color: e.target.value } })} /></label>
          <${NumberField} label=${t('ve.keyTolerance')} testid="clip-key-tolerance" value=${c.key.tolerance} min="0" max="100" onCommit=${(v) => updateSelected({ key: { ...c.key, tolerance: Math.max(0, Math.min(100, v)) } })} />
          <${NumberField} label=${t('ve.keySoftness')} testid="clip-key-softness" value=${c.key.softness} min="0" max="100" onCommit=${(v) => updateSelected({ key: { ...c.key, softness: Math.max(0, Math.min(100, v)) } })} />
          <${NumberField} label=${t('ve.keySpill')} testid="clip-key-spill" value=${c.key.spill} min="0" max="100" onCommit=${(v) => updateSelected({ key: { ...c.key, spill: Math.max(0, Math.min(100, v)) } })} />` : null}
      </div>
      <small>${t('ve.kenBurns')}</small>
      <div class="ve-grid">
        <${NumberField} label=${t('ve.endScale')} testid="clip-end-scale" value=${(c.endScale ?? c.scale) * 100} min="1" onCommit=${(v) => updateSelected({ endScale: Math.max(0.01, v / 100) })} />
        <${NumberField} label=${t('ve.endX')} testid="clip-end-x" value=${c.endX ?? c.x} onCommit=${(v) => updateSelected({ endX: v })} />
        <${NumberField} label=${t('ve.endY')} testid="clip-end-y" value=${c.endY ?? c.y} onCommit=${(v) => updateSelected({ endY: v })} />
      </div>
      <button class="secondary outline" data-testid="picture-reset" onClick=${() => updateSelected({ brightness: 100, contrast: 100, saturation: 100, rotation: 0, crop: null, endScale: null, endX: null, endY: null, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: false, key: null })}>${t('ve.resetPicture')}</button>
    </details>` : null}
    <details class="ve-picture" open=${!!state.xfadeOpen} onToggle=${(e) => { state.xfadeOpen = e.target.open; }}>
      <summary data-testid="xfade-section">${t('ve.xfade')}</summary>
      <div class="ve-grid">
        <${NumberField} label=${t('ve.xfadeLength')} testid="xfade-length" value=${state.xfadeLength} min="0.05" onCommit=${(v) => { state.xfadeLength = Math.max(0.05, v); }} />
        ${visual ? html`<label>${t('ve.xfadeType')}<select data-testid="xfade-type" onChange=${(e) => { state.xfadeType = e.target.value; }}>
          ${tl.TRANSITIONS.map((x) => html`<option value=${x} selected=${state.xfadeType === x}>${t(`ve.tr.${x}`)}</option>`)}</select></label>` : null}
      </div>
      <div class="ve-buttons">
        <button class="secondary outline" data-testid="xfade-next" disabled=${!nextOf(c)} onClick=${() => crossfadeNext(c)}>${t('ve.xfadeNext')}</button>
        <button class="secondary outline" data-testid="xfade-track" onClick=${() => transitionsTrack(c.track)}>${t('ve.xfadeTrack')}</button>
      </div>
    </details>
    ${c.kind === 'text' ? html`
      <label>${t('ve.text')}<textarea rows="2" data-testid="title-text" key=${`tt${c.id}${state.rev}`} onChange=${(e) => updateSelected({ text: { ...c.text, content: e.target.value } })}>${c.text.content}</textarea></label>
      <div class="ve-grid">
        <${NumberField} label=${t('ve.size')} testid="title-size" value=${c.text.size} min="4" onCommit=${(v) => updateSelected({ text: { ...c.text, size: Math.max(4, v) } })} />
        <label>${t('ve.color')}<input type="color" data-testid="title-color" value=${c.text.color} onChange=${(e) => updateSelected({ text: { ...c.text, color: e.target.value } })} /></label>
        <label>${t('ve.position')}<select data-testid="title-valign" onChange=${(e) => updateSelected({ text: { ...c.text, valign: e.target.value } })}>
          ${['top', 'middle', 'bottom'].map((v) => html`<option value=${v} selected=${c.text.valign === v}>${t(`ve.${v}`)}</option>`)}</select></label>
        <label><input type="checkbox" data-testid="title-bg-on" checked=${!!c.text.background} onChange=${(e) => updateSelected({ text: { ...c.text, background: e.target.checked ? 'rgba(0,0,0,0.6)' : '' } })} /> ${t('ve.textBg')}</label>
      </div>` : null}
    <div class="ve-buttons">
      <button class="secondary outline" data-testid="clip-split" onClick=${split}>✂ ${t('ve.split')}</button>
      ${audible ? html`<button class="secondary outline" data-testid="clip-edit-audio" title=${t('ve.editAudioHint')} onClick=${() => editInAudioEditor(c)}>🎚 ${t('ve.editAudio')}</button>` : null}
      ${audible ? html`<button class="secondary outline" data-testid="clip-normalize" title=${t('ve.normalizeHint')} onClick=${() => normalizeClip(c).catch(fail)}>${t('ve.normalize')}</button>` : null}
      ${c.kind === 'video' ? html`<button class="secondary outline" data-testid="clip-freeze" title=${t('ve.freezeHint')} onClick=${() => freezeFrame()}>❄ ${t('ve.freeze')}</button>` : null}
      <button class="secondary outline" data-testid="clip-delete" onClick=${() => deleteSelected(false)}>${t('ve.delete')}</button>
      <button class="secondary outline" data-testid="clip-ripple" onClick=${() => deleteSelected(true)}>${t('ve.ripple')}</button>
    </div>
  </section>`;
}

function Ruler({ width }) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s * state.pps >= 60) || 600;
  const marks = [];
  for (let s = 0; s * state.pps < width; s += step) marks.push(s);
  return html`<div class="ve-ruler" data-testid="ruler" onPointerDown=${scrub}>
    ${marks.map((s) => html`<span style=${`left:${s * state.pps}px`}>${fmt(s).replace(/\.00$/, '')}</span>`)}
    ${(state.project.markers || []).map((m) => html`<button type="button" class="ve-marker" data-testid="marker" title=${m.text || fmt(m.t)} style=${`left:${m.t * state.pps}px`}
      onPointerDown=${(e) => { e.stopPropagation(); seek(m.t); }} onDblClick=${(e) => { e.stopPropagation(); state.dialog = { kind: 'marker', id: m.id }; render(); }}>${m.text ? html`<span>${m.text}</span>` : null}</button>`)}</div>`;
}

function Timeline() {
  const p = state.project;
  const width = Math.max((tl.duration(p) + 30) * state.pps, 600);
  return html`<section class="ve-timeline" data-testid="timeline">
    <div class="ve-tl-heads">
      <div class="ve-tl-corner">
        <button class="secondary outline" title=${t('ve.zoomOut')} data-testid="zoom-out" onClick=${() => zoom(0.5)}>−</button>
        <button class="secondary outline" title=${t('ve.zoomIn')} data-testid="zoom-in" onClick=${() => zoom(2)}>+</button>
      </div>
      ${p.tracks.map((tr) => html`<div class=${`ve-tl-head ${tr.kind}`} data-testid="track-head">
        <span>${tr.name}</span>
        ${tr.kind === 'video' ? html`<button class=${`secondary ${tr.hidden ? '' : 'outline'}`} title=${t('ve.hide')} data-testid="track-hide" aria-pressed=${tr.hidden} onClick=${() => setTrack(tr, { hidden: !tr.hidden })}>${tr.hidden ? '◌' : '👁'}</button>` : null}
        <button class=${`secondary ${tr.mute ? '' : 'outline'}`} title=${t('ve.mute')} data-testid="track-mute" aria-pressed=${tr.mute} onClick=${() => setTrack(tr, { mute: !tr.mute })}>${tr.mute ? '🔇' : '🔊'}</button>
        <button class="secondary outline ve-wide" title=${t('ve.deleteTrack')} data-testid="track-delete" disabled=${p.tracks.filter((x) => x.kind === tr.kind).length < 2} onClick=${() => deleteTrack(tr)}>×</button>
      </div>`)}
      <div class="ve-tl-add">
        <button class="secondary outline" title=${t('ve.videoTrack')} data-testid="add-video-track" onClick=${() => addTrack('video')}>+V</button>
        <button class="secondary outline" title=${t('ve.audioTrack')} data-testid="add-audio-track" onClick=${() => addTrack('audio')}>+A</button>
      </div>
    </div>
    <div class="ve-tl-scroll" data-testid="timeline-scroll" tabindex="0" role="region" aria-label=${t('ve.timeline')}>
      <div class="ve-tl-inner" style=${`width:${width}px`}>
        <${Ruler} width=${width} />
        ${p.tracks.map((tr) => html`<div class=${`ve-lane ${tr.kind}`} data-testid="lane" data-track=${tr.id}
            onPointerDown=${(e) => { if (e.target === e.currentTarget) { state.sel = null; const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / state.pps); } }}
            onDragOver=${(e) => { if (e.dataTransfer.types.includes('application/x-ve-source')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop=${(e) => {
              const id = e.dataTransfer.getData('application/x-ve-source');
              const s = state.sources.get(id);
              if (!s) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              addSource(s, tr.id, tl.snap(state.project, Math.max(0, (e.clientX - r.left) / state.pps), 8 / state.pps, { extra: [state.time] }));
            }}>
          ${p.clips.map(displayed).filter((c) => c.track === tr.id).map((c) => {
            const s = state.sources.get(c.source);
            return html`<div class=${`ve-clip ${c.kind} ${state.sel === c.id ? 'selected' : ''} ${s && s.missing ? 'missing' : ''}`} data-testid="clip" data-clip=${c.id} key=${c.id}
                style=${`left:${c.start * state.pps}px;width:${Math.max(2, tl.length(c) * state.pps)}px;${s && s.thumb && c.kind !== 'audio' ? `background-image:url(${s.thumb})` : ''}`}
                onPointerDown=${(e) => clipDown(e, c, 'move')}>
              <span class="ve-handle left" data-testid="trim-left" onPointerDown=${(e) => clipDown(e, c, 'left')}></span>
              ${s && s.peaks && (c.kind === 'audio' || c.kind === 'video') ? html`<canvas class=${`ve-wave ${c.kind}`} data-testid="waveform" ref=${(el) => drawWave(el, c, s)}></canvas>` : null}
              <span class="ve-clip-label">${c.kind === 'text' ? `T ${c.text.content}` : s ? `${c.reverse ? '◀ ' : ''}${tl.speedOf(c) !== 1 ? `${Math.round(tl.speedOf(c) * 100)} % ` : ''}${s.name}` : ''}</span>
              ${c.fadeIn > 0 ? html`<span class="ve-fade in" style=${`width:${c.fadeIn * state.pps}px`}></span>` : null}
              ${c.keys ? [...new Set(Object.values(c.keys).flatMap((l) => (l || []).map((k) => k.t)))].map((kt) => html`<span class="ve-keymark" data-testid="keymark" style=${`left:${kt * state.pps}px`}>◆</span>`) : null}
              ${c.fadeOut > 0 ? html`<span class="ve-fade out" style=${`width:${c.fadeOut * state.pps}px`}></span>` : null}
              <span class="ve-handle right" data-testid="trim-right" onPointerDown=${(e) => clipDown(e, c, 'right')}></span>
            </div>`;
          })}
        </div>`)}
        <div class="ve-playhead" data-testid="playhead" style=${`left:${state.time * state.pps}px`}></div>
      </div>
    </div>
  </section>`;
}

function ExportDialog() {
  const d = state.dialog;
  if (!d || d.kind !== 'export') return null;
  return html`<dialog open data-testid="export-dialog"><article>
    <header><strong>${t('ve.export')}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); state.dialog = null; render(); runExport(d); }}>
      <label>${t('ve.fileName')}<input data-testid="export-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('ve.exportWhat')}<select data-testid="export-what" onChange=${(e) => { d.what = e.target.value; render(); }}>
        <option value="video" selected=${d.what === 'video'}>${t('ve.whatVideo')}</option><option value="audio" selected=${d.what === 'audio'}>${t('ve.whatAudio')}</option>
        <option value="gif" selected=${d.what === 'gif'}>${t('ve.whatGif')}</option></select></label>
      ${d.what === 'gif' ? html`<div class="ve-grid">
        <label>${t('ve.gifWidth')}<input type="number" min="16" max="1920" step="1" data-testid="export-gif-width" value=${d.gifWidth} onChange=${(e) => { d.gifWidth = Math.max(16, Math.min(1920, Math.round(Number(e.target.value) || 480))); }} /></label>
        <label>${t('ve.gifFps')}<select data-testid="export-gif-fps" onChange=${(e) => { d.gifFps = Number(e.target.value); }}>${[5, 8, 10, 12, 15, 20, 25].map((f) => html`<option value=${f} selected=${d.gifFps === f}>${f}</option>`)}</select></label>
        <label><input type="checkbox" checked=${d.gifDither} data-testid="export-gif-dither" onChange=${(e) => { d.gifDither = e.target.checked; }} /> ${t('ve.gifDither')}</label></div>
        <small>${t('ve.gifHint')}</small>` : d.what === 'audio' ? html`<label>${t('ve.format')}<select data-testid="export-audio-format" onChange=${(e) => { d.audioFormat = e.target.value; }}>
        ${d.audioFormats.map((k) => html`<option value=${k} selected=${d.audioFormat === k}>${ex.AUDIO_FORMATS[k].label}</option>`)}</select></label>` : html`
      <label>${t('ve.format')}<select data-testid="export-format" onChange=${(e) => { d.format = e.target.value; }}>
        ${d.formats.map((k) => html`<option value=${k} selected=${d.format === k}>${ex.FORMATS[k].label}</option>`)}</select></label>
      <label>${t('ve.quality')}<select data-testid="export-quality" onChange=${(e) => { d.quality = e.target.value; }}>
        ${Object.keys(ex.QUALITIES).map((q) => html`<option value=${q} selected=${d.quality === q}>${t(`ve.${q}`)}</option>`)}</select></label>`}
      <div class="ve-grid">
        <label>${t('ve.exportFrom')}<input type="number" step="any" min="0" data-testid="export-from" value=${Math.round(d.from * 100) / 100} onChange=${(e) => { d.from = Math.max(0, Number(e.target.value) || 0); }} /></label>
        <label>${t('ve.exportTo')}<input type="number" step="any" min="0" data-testid="export-to" value=${Math.round(d.to * 100) / 100} onChange=${(e) => { d.to = Math.max(0, Number(e.target.value) || 0); }} /></label>
      </div>
      ${(state.project.markers || []).length >= 2 ? html`<small>${t('ve.rangeFromMarkers')} ${(state.project.markers || []).map((m, i, all) => (i < all.length - 1 ? html`<a href="#" data-testid="export-marker-range" onClick=${(e) => { e.preventDefault(); d.from = m.t; d.to = all[i + 1].t; render(); }}>${m.text || fmt(m.t)} – ${all[i + 1].text || fmt(all[i + 1].t)}</a> ` : null))}</small>` : null}
      <small>${state.project.width} × ${state.project.height}, ${state.project.fps} fps, ${fmt(tl.duration(state.project))}</small>
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ve.cancel')}</button><button type="submit" data-testid="export-ok">${t('ve.export')}</button></footer>
    </form>
  </article></dialog>`;
}

function Progress() {
  const x = state.exporting;
  if (!x) return null;
  return html`<dialog open data-testid="export-progress"><article>
    <p>${t('ve.exporting', Math.round(x.progress * 100))}</p>
    <progress value=${x.progress} max="1"></progress>
    <footer><button class="secondary" data-testid="export-cancel" onClick=${() => x.controller.abort()}>${t('ve.cancel')}</button></footer>
  </article></dialog>`;
}

function Main() {
  return html`<div class="ve-layout">
    <div class="ve-name-bar"><span data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span>
      <span class="ve-tabs">
        <button class=${`secondary ${state.panel === 'media' ? '' : 'outline'}`} data-testid="tab-media" onClick=${() => { state.panel = 'media'; render(); }}>${t('ve.media')}</button>
        <button class=${`secondary ${state.panel === 'props' ? '' : 'outline'}`} data-testid="tab-props" onClick=${() => { state.panel = 'props'; render(); }}>${t('ve.properties')}</button>
      </span></div>
    <div class="ve-top"><${MediaBin} /><${Preview} /><${Properties} /></div>
    <${Timeline} /><${ExportDialog} /><${MarkerDialog} /><${Progress} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

Suite.files.dropZone(document.body, (picked) => {
  const project = picked.find((x) => /\.json$/i.test(x.file.name));
  if (project) { (state.dirty ? Suite.shell.confirm(t('ve.discard')) : Promise.resolve(true)).then((ok) => ok && loadProject(project)); return; }
  importFiles(picked.map((x) => x.file));
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openProject(); return; }
  if (state.dialog || state.exporting || e.target.closest('input, textarea, select, [contenteditable]')) return;
  const keys = {
    ' ': () => (state.playing ? stop() : play()), s: split, f: freezeFrame, m: addMarker, ',': () => jumpMarker(-1), '.': () => jumpMarker(1), Delete: () => deleteSelected(e.shiftKey), Backspace: () => deleteSelected(e.shiftKey),
    ArrowLeft: () => seek(state.time - (e.shiftKey ? 1 : frame())), ArrowRight: () => seek(state.time + (e.shiftKey ? 1 : frame())),
    Home: () => seek(0), End: () => seek(tl.duration(state.project)), '+': () => zoom(2), '-': () => zoom(0.5),
  };
  const modKeys = { z: () => (e.shiftKey ? redo() : undo()), y: redo };
  const fn = mod ? modKeys[e.key.toLowerCase()] : keys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});

Suite.bridge.receive((picked) => (/\.(json|zip)$/i.test(picked.file.name) ? loadProject(picked) : importFiles([picked.file])), { app: 'videoeditor' }); // files opened from other apps ("Open with…")

// the open file(s) for "Create an archive from the open files" (about dialog)
// (the project only: its media files are not part of it)
Suite.openFiles.register(() => (state.dirty || state.name ? [{ name: state.name || 'project.json', bytes: new TextEncoder().encode(`${JSON.stringify(projectJson(), null, 1)}\n`), dirty: state.dirty }] : []));

// for tests
window.VE = { state, tl, ex, seek, play, stop, commit, compose: (g, time) => compose(g, time) };
document.body.dataset.ready = 'true';
