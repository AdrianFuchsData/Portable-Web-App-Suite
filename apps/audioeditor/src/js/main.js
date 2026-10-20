/*
 * Audio editor: tracks with clips (clips.js) that can be dragged in time and between tracks, one sample rate, waveforms
 * on canvases (zoom, scroll), selection over time and tracks, cut/copy/paste/delete/trim/silence/split with undo
 * (ripple editing like Audacity), effects and generators (dsp.js), beat grids and cue points with snapping (beats.js),
 * tempo changes that keep the pitch, playback with mute/solo/gain/pan through the Web Audio API, recording from the
 * microphone, WAV import (own decoder) and other formats via decodeAudioData, export as WAV (16/24 bit PCM, 32 bit
 * float) or – loaded on demand – MP3, FLAC, Ogg Opus and M4A AAC (encode.js).
 */
import * as dsp from '@app/dsp.js';
import * as clips from '@app/clips.js';
import * as beats from '@app/beats.js';
import * as project from '@app/project.js';
import * as labelText from '@app/labels.js';
import * as fx2 from '@app/effects.js';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'audioeditor';
const PROJECT_TYPES = [{ description: 'Audio project', accept: { 'application/zip': [project.EXTENSION] } }];
const OPEN_TYPES = [...PROJECT_TYPES, { description: 'Audio', accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.oga', '.opus', '.flac', '.m4a', '.aac', '.webm', '.mp4'] } }];
const narrow = () => matchMedia('(max-width: 760px)').matches;
const HEADER = () => (narrow() ? 112 : 168);
const CLIP_HEAD = () => (narrow() ? 20 : 16); // height of the clip title bar (drag handle) in CSS pixels
const SNAP_PX = 8;
const PREFS = 'suite.audioeditor.view';

Suite.i18n.register({
  en: {
    'app.title': 'Audio editor',
    'ae.open': 'Open', 'ae.import': 'Import', 'ae.save': 'Save', 'ae.export': 'Export', 'ae.undo': 'Undo', 'ae.redo': 'Redo', 'ae.cut': 'Cut', 'ae.copy': 'Copy',
    'ae.paste': 'Paste', 'ae.delete': 'Delete', 'ae.trim': 'Trim to selection', 'ae.silence': 'Silence', 'ae.effects': 'Effects', 'ae.generate': 'Generate',
    'ae.record': 'Record', 'ae.stopRecord': 'Stop recording', 'ae.play': 'Play', 'ae.pause': 'Pause', 'ae.stop': 'Stop', 'ae.start': 'To start', 'ae.end': 'To end',
    'ae.loop': 'Loop', 'ae.zoomIn': 'Zoom in', 'ae.zoomOut': 'Zoom out', 'ae.fit': 'Fit', 'ae.selStart': 'Start', 'ae.selEnd': 'End', 'ae.selLength': 'Length',
    'ae.position': 'Position', 'ae.empty': 'Open or drop audio files (WAV, MP3, OGG, FLAC, M4A …), generate a tone or record from the microphone.',
    'ae.amplify': 'Amplify…', 'ae.normalize': 'Normalize…', 'ae.fadeIn': 'Fade in', 'ae.fadeOut': 'Fade out', 'ae.reverse': 'Reverse', 'ae.invert': 'Invert',
    'ae.echo': 'Echo…', 'ae.speed': 'Change speed (and pitch)…', 'ae.tempo': 'Change tempo (keep pitch)…', 'ae.lowpass': 'Low-pass filter…', 'ae.highpass': 'High-pass filter…', 'ae.tone': 'Tone…', 'ae.noise': 'Noise…',
    'ae.silenceGen': 'Silence…', 'ae.gainDb': 'Gain (dB)', 'ae.peakDb': 'Peak level (dBFS)', 'ae.delayS': 'Delay (s)', 'ae.decay': 'Decay (0–1)', 'ae.factor': 'Speed factor',
    'ae.cutoff': 'Cut-off frequency (Hz)', 'ae.durationS': 'Duration (s)', 'ae.frequency': 'Frequency (Hz)', 'ae.amplitude': 'Amplitude (0–1)', 'ae.waveform': 'Waveform',
    'ae.sine': 'Sine', 'ae.square': 'Square', 'ae.sawtooth': 'Sawtooth', 'ae.triangle': 'Triangle', 'ae.ok': 'OK', 'ae.cancel': 'Cancel', 'ae.fileName': 'File name',
    'ae.format': 'Format', 'ae.wav16': 'WAV 16 bit', 'ae.wav24': 'WAV 24 bit', 'ae.wav32': 'WAV 32 bit float', 'ae.channels': 'Channels', 'ae.auto': 'automatic',
    'ae.mp3': 'MP3', 'ae.ogg': 'Ogg Opus', 'ae.m4a': 'M4A (AAC)', 'ae.flac': 'FLAC (lossless)', 'ae.bitrate': 'Bit rate (kbit/s)', 'ae.unsupported': '{0} (not supported by this browser)',
    'ae.encoding': 'Encoding … {0} %', 'ae.project': 'Audio project (keeps tracks and clips)', 'ae.projectHint': 'An audio project keeps tracks, clips, beat grids and settings for further editing; to listen to it elsewhere, export it as audio.',
    'ae.mono': 'mono', 'ae.stereo': 'stereo', 'ae.range': 'Range', 'ae.all': 'everything', 'ae.selection': 'selection', 'ae.untitled': 'Audio',
    'ae.discard': 'Discard the unsaved changes?', 'ae.cannotOpen': '“{0}” cannot be opened: {1}', 'ae.track': 'Track {0}', 'ae.mute': 'Mute', 'ae.solo': 'Solo',
    'ae.envelope': 'Volume automation: click in the track adds a point, drag moves it, double-click removes it',
    'ae.equalizer': 'Equaliser…', 'ae.compressor': 'Compressor…', 'ae.limiter': 'Limiter…', 'ae.reverb': 'Reverb…', 'ae.pitch': 'Change pitch…', 'ae.noiseReduction': 'Noise reduction…',
    'ae.bassDb': 'Bass (dB)', 'ae.middleDb': 'Middle (dB)', 'ae.trebleDb': 'Treble (dB)', 'ae.thresholdDb': 'Threshold (dB)', 'ae.ratio': 'Ratio (:1)', 'ae.attackMs': 'Attack (ms)',
    'ae.releaseMs': 'Release (ms)', 'ae.makeupDb': 'Make-up gain (dB)', 'ae.ceilingDb': 'Ceiling (dB)', 'ae.roomS': 'Room size (reverb time, s)', 'ae.wetPct': 'Reverb amount (%)',
    'ae.semitones': 'Semitones', 'ae.reductionDb': 'Reduction (dB)', 'ae.gateSensitivity': 'Noise threshold (× noise level − 1)',
    'ae.clipGain': 'Clip volume…', 'ae.crossfade': 'Cross-fade overlapping clips', 'ae.removeFades': 'Remove fades', 'ae.noOverlap': 'No overlapping clips in the selected tracks.',
    'ae.crossfaded': '{0} cross-fade(s)', 'ae.fadeHint': 'Drag the round handles at the top corners of a clip to fade it in or out',
    'ae.spectrum': 'Spectrogram (instead of the waveform)', 'ae.addLabel': 'Add label (Ctrl+B)', 'ae.labelText': 'Label (empty: remove)', 'ae.exportLabels': 'Export labels…', 'ae.importLabels': 'Import labels…',
    'ae.labelsImported': '{0} label(s) imported.', 'ae.noLabels': 'There are no labels.', 'ae.label': 'Label',
    'ae.deleteTrack': 'Delete track', 'ae.gain': 'Volume', 'ae.pan': 'Balance', 'ae.newTrack': 'New track', 'ae.duplicateTrack': 'Duplicate track', 'ae.tracks': 'Tracks',
    'ae.makeMono': 'Make mono', 'ae.makeStereo': 'Make stereo', 'ae.noMic': 'The microphone cannot be used: {0}', 'ae.recording': 'Recording', 'ae.selectAll': 'Select all',
    'ae.mixdown': 'Mix down to one track',
    'ae.clip': 'Clip', 'ae.split': 'Split at cursor', 'ae.moveTo': 'Move to…', 'ae.removeClip': 'Remove clip', 'ae.duplicateClip': 'Duplicate clip',
    'ae.detectBeats': 'Detect beats', 'ae.detectCues': 'Detect cues…', 'ae.beatGrid': 'Beat grid…', 'ae.beatAtCursor': 'Put a beat at the cursor',
    'ae.matchTempo': 'Match tempo…', 'ae.addCue': 'Add cue at cursor', 'ae.clearMarkers': 'Remove beats and cues', 'ae.snap': 'Snap to clips, beats and cues (hold Shift to move freely)',
    'ae.startS': 'Start (s)', 'ae.bpm': 'Tempo (BPM)', 'ae.beatAt': 'A beat at (s)', 'ae.targetBpm': 'Target tempo (BPM)', 'ae.sensitivity': 'Sensitivity (0–1)',
    'ae.minGap': 'Minimum distance (s)', 'ae.noClip': 'Select a clip first (click its title bar).', 'ae.noBeats': 'No tempo found in “{0}”.',
    'ae.beatsFound': '{0}: {1} BPM', 'ae.cuesFound': '{0} cues', 'ae.noTempo': 'Detect the beats of the clip first.', 'ae.dragHint': 'Drag clips by their title bar',
  },
  de: {
    'app.title': 'Audio-Editor',
    'ae.open': 'Öffnen', 'ae.import': 'Importieren', 'ae.save': 'Speichern', 'ae.export': 'Exportieren', 'ae.undo': 'Rückgängig', 'ae.redo': 'Wiederholen', 'ae.cut': 'Ausschneiden',
    'ae.copy': 'Kopieren', 'ae.paste': 'Einfügen', 'ae.delete': 'Löschen', 'ae.trim': 'Auf Auswahl zuschneiden', 'ae.silence': 'Stille', 'ae.effects': 'Effekte', 'ae.generate': 'Erzeugen',
    'ae.record': 'Aufnehmen', 'ae.stopRecord': 'Aufnahme beenden', 'ae.play': 'Abspielen', 'ae.pause': 'Pause', 'ae.stop': 'Stopp', 'ae.start': 'Zum Anfang', 'ae.end': 'Zum Ende',
    'ae.loop': 'Wiederholen', 'ae.zoomIn': 'Vergrößern', 'ae.zoomOut': 'Verkleinern', 'ae.fit': 'Einpassen', 'ae.selStart': 'Anfang', 'ae.selEnd': 'Ende', 'ae.selLength': 'Länge',
    'ae.position': 'Position', 'ae.empty': 'Öffnen oder ziehen Sie Audiodateien hierher (WAV, MP3, OGG, FLAC, M4A …), erzeugen Sie einen Ton oder nehmen Sie mit dem Mikrofon auf.',
    'ae.amplify': 'Verstärken…', 'ae.normalize': 'Normalisieren…', 'ae.fadeIn': 'Einblenden', 'ae.fadeOut': 'Ausblenden', 'ae.reverse': 'Umkehren', 'ae.invert': 'Invertieren',
    'ae.echo': 'Echo…', 'ae.speed': 'Geschwindigkeit (und Tonhöhe) ändern…', 'ae.tempo': 'Tempo ändern (Tonhöhe beibehalten)…', 'ae.lowpass': 'Tiefpass…', 'ae.highpass': 'Hochpass…', 'ae.tone': 'Ton…', 'ae.noise': 'Rauschen…',
    'ae.silenceGen': 'Stille…', 'ae.gainDb': 'Verstärkung (dB)', 'ae.peakDb': 'Spitzenpegel (dBFS)', 'ae.delayS': 'Verzögerung (s)', 'ae.decay': 'Abklingen (0–1)', 'ae.factor': 'Faktor',
    'ae.cutoff': 'Grenzfrequenz (Hz)', 'ae.durationS': 'Dauer (s)', 'ae.frequency': 'Frequenz (Hz)', 'ae.amplitude': 'Amplitude (0–1)', 'ae.waveform': 'Wellenform',
    'ae.sine': 'Sinus', 'ae.square': 'Rechteck', 'ae.sawtooth': 'Sägezahn', 'ae.triangle': 'Dreieck', 'ae.ok': 'OK', 'ae.cancel': 'Abbrechen', 'ae.fileName': 'Dateiname',
    'ae.format': 'Format', 'ae.wav16': 'WAV 16 Bit', 'ae.wav24': 'WAV 24 Bit', 'ae.wav32': 'WAV 32 Bit Gleitkomma', 'ae.channels': 'Kanäle', 'ae.auto': 'automatisch',
    'ae.mp3': 'MP3', 'ae.ogg': 'Ogg Opus', 'ae.m4a': 'M4A (AAC)', 'ae.flac': 'FLAC (verlustfrei)', 'ae.bitrate': 'Bitrate (kbit/s)', 'ae.unsupported': '{0} (von diesem Browser nicht unterstützt)',
    'ae.encoding': 'Kodiere … {0} %', 'ae.project': 'Audio-Projekt (behält Spuren und Clips)', 'ae.projectHint': 'Ein Audio-Projekt behält Spuren, Clips, Beat-Raster und Einstellungen zum Weiterbearbeiten; zum Anhören anderswo exportieren Sie es als Audio.',
    'ae.mono': 'Mono', 'ae.stereo': 'Stereo', 'ae.range': 'Bereich', 'ae.all': 'alles', 'ae.selection': 'Auswahl', 'ae.untitled': 'Audio',
    'ae.discard': 'Die ungespeicherten Änderungen verwerfen?', 'ae.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}', 'ae.track': 'Spur {0}', 'ae.mute': 'Stumm', 'ae.solo': 'Solo',
    'ae.envelope': 'Lautstärkeverlauf: Klick in die Spur fügt einen Punkt hinzu, Ziehen verschiebt ihn, Doppelklick entfernt ihn',
    'ae.equalizer': 'Equalizer…', 'ae.compressor': 'Kompressor…', 'ae.limiter': 'Limiter…', 'ae.reverb': 'Hall…', 'ae.pitch': 'Tonhöhe ändern…', 'ae.noiseReduction': 'Rauschminderung…',
    'ae.bassDb': 'Bass (dB)', 'ae.middleDb': 'Mitten (dB)', 'ae.trebleDb': 'Höhen (dB)', 'ae.thresholdDb': 'Schwelle (dB)', 'ae.ratio': 'Verhältnis (:1)', 'ae.attackMs': 'Ansprechzeit (ms)',
    'ae.releaseMs': 'Abklingzeit (ms)', 'ae.makeupDb': 'Aufholverstärkung (dB)', 'ae.ceilingDb': 'Obergrenze (dB)', 'ae.roomS': 'Raumgröße (Nachhallzeit, s)', 'ae.wetPct': 'Hallanteil (%)',
    'ae.semitones': 'Halbtöne', 'ae.reductionDb': 'Minderung (dB)', 'ae.gateSensitivity': 'Rauschschwelle (× Rauschpegel − 1)',
    'ae.clipGain': 'Clip-Lautstärke…', 'ae.crossfade': 'Überlappende Clips überblenden', 'ae.removeFades': 'Blenden entfernen', 'ae.noOverlap': 'Keine überlappenden Clips in den gewählten Spuren.',
    'ae.crossfaded': '{0} Überblendung(en)', 'ae.fadeHint': 'Ziehen Sie die runden Griffe an den oberen Ecken eines Clips, um ihn ein- oder auszublenden',
    'ae.spectrum': 'Spektrogramm (statt der Wellenform)', 'ae.addLabel': 'Beschriftung hinzufügen (Strg+B)', 'ae.labelText': 'Beschriftung (leer: entfernen)', 'ae.exportLabels': 'Beschriftungen exportieren…', 'ae.importLabels': 'Beschriftungen importieren…',
    'ae.labelsImported': '{0} Beschriftung(en) importiert.', 'ae.noLabels': 'Es gibt keine Beschriftungen.', 'ae.label': 'Beschriftung',
    'ae.deleteTrack': 'Spur löschen', 'ae.gain': 'Lautstärke', 'ae.pan': 'Balance', 'ae.newTrack': 'Neue Spur', 'ae.duplicateTrack': 'Spur duplizieren', 'ae.tracks': 'Spuren',
    'ae.makeMono': 'In Mono umwandeln', 'ae.makeStereo': 'In Stereo umwandeln', 'ae.noMic': 'Das Mikrofon kann nicht verwendet werden: {0}', 'ae.recording': 'Aufnahme', 'ae.selectAll': 'Alles auswählen',
    'ae.mixdown': 'Zu einer Spur abmischen',
    'ae.clip': 'Clip', 'ae.split': 'Am Cursor teilen', 'ae.moveTo': 'Verschieben nach…', 'ae.removeClip': 'Clip entfernen', 'ae.duplicateClip': 'Clip duplizieren',
    'ae.detectBeats': 'Beats erkennen', 'ae.detectCues': 'Cues erkennen…', 'ae.beatGrid': 'Beat-Raster…', 'ae.beatAtCursor': 'Beat auf den Cursor legen',
    'ae.matchTempo': 'Tempo angleichen…', 'ae.addCue': 'Cue am Cursor setzen', 'ae.clearMarkers': 'Beats und Cues entfernen', 'ae.snap': 'An Clips, Beats und Cues einrasten (Umschalt gedrückt halten: frei verschieben)',
    'ae.startS': 'Anfang (s)', 'ae.bpm': 'Tempo (BPM)', 'ae.beatAt': 'Ein Beat bei (s)', 'ae.targetBpm': 'Zieltempo (BPM)', 'ae.sensitivity': 'Empfindlichkeit (0–1)',
    'ae.minGap': 'Mindestabstand (s)', 'ae.noClip': 'Wählen Sie zuerst einen Clip aus (Klick auf seine Titelleiste).', 'ae.noBeats': 'In „{0}“ wurde kein Tempo gefunden.',
    'ae.beatsFound': '{0}: {1} BPM', 'ae.cuesFound': '{0} Cues', 'ae.noTempo': 'Erkennen Sie zuerst die Beats des Clips.', 'ae.dragHint': 'Clips an der Titelleiste ziehen',
  },
});

function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } }
function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify({ snap: state.snap })); } catch (e) { /* not available */ } }

const state = {
  rate: 44100, tracks: [], sel: { start: 0, end: 0 }, selTracks: new Set(), clip: null,
  labels: [], // [{ id, start, end, text }] in seconds (the label track above the audio tracks)
  view: { start: 0, pps: 100 }, playhead: 0, playing: null, loop: false, recording: null, snap: loadPrefs().snap !== false, snapLine: null,
  history: [], future: [], clipboard: null,
  name: '', handle: null, bits: 16, dirty: false, dialog: null, menu: null, busy: false, progress: null,
};
state.name = `${t('ae.untitled')}.wav`;
let nextId = 1;
let nextVersion = 1;

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); draw(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const projectLength = () => Math.max(0, ...state.tracks.map((tr) => clips.trackEnd(tr.clips)));
const projectDuration = () => projectLength() / state.rate;
const toSample = (s) => Math.max(0, Math.round(s * state.rate));
const pause0 = () => new Promise((r) => setTimeout(r, 30)); // lets the busy indicator appear before long computations

export function fmtTime(s) {
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, '0')}`;
}

export function parseTime(text) {
  const m = /^\s*(?:(\d+):)?(\d+(?:[.,]\d*)?)\s*$/.exec(text || '');
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(',', '.'));
}

function setDirty(v = true) { state.dirty = v; Suite.shell.setDirty(v); }

// ---- tracks, clips and history -----------------------------------------------------------------------------------------------

function makeTrack(trackClips, name) {
  return { id: nextId++, name: name || t('ae.track', nextId - 1), clips: trackClips, gain: 0, pan: 0, mute: false, solo: false, version: nextVersion++ };
}
const trackOf = (id) => state.tracks.find((tr) => tr.id === id);
const channelsOf = (tr) => clips.channelsOf(tr.clips);
const trackAudio = (tr, from, to, channels) => clips.flatten(tr.clips, state.rate, from, to, channels);

function snapshot() { return { tracks: state.tracks.map((tr) => ({ ...tr, cache: null })), sel: { ...state.sel }, selTracks: new Set(state.selTracks), clip: state.clip, labels: state.labels.map((l) => ({ ...l })) }; }
function restore(s) { state.tracks = s.tracks.map((tr) => ({ ...tr, version: nextVersion++, cache: null })); state.sel = { ...s.sel }; state.selTracks = new Set(s.selTracks); state.clip = s.clip; state.labels = (s.labels || []).map((l) => ({ ...l })); }

function remember(s = snapshot()) {
  state.history.push(s);
  if (state.history.length > 50) state.history.shift();
  state.future = [];
}
function undo() { if (!state.history.length) return; stop(); state.future.push(snapshot()); restore(state.history.pop()); setDirty(); render(); }
function redo() { if (!state.future.length) return; stop(); state.history.push(snapshot()); restore(state.future.pop()); setDirty(); render(); }

function setClips(tr, list) { tr.clips = list; tr.version = nextVersion++; tr.cache = null; }

/** Tracks an edit applies to: the selected tracks, otherwise all. */
const targets = () => { const sel = state.tracks.filter((tr) => state.selTracks.has(tr.id)); return sel.length ? sel : state.tracks; };
const range = () => { const a = Math.min(state.sel.start, state.sel.end), b = Math.max(state.sel.start, state.sel.end); return [toSample(a), toSample(b)]; };
const hasRange = () => { const [a, b] = range(); return b > a; };

/** The clip the user picked (title bar), if it still exists: { tr, clip }. */
function activeClip() {
  const c = state.clip && trackOf(state.clip.track);
  const clip = c && c.clips.find((x) => x.id === state.clip.id);
  if (clip) return { tr: c, clip };
  // otherwise the clip under the cursor in the first selected track
  for (const tr of targets()) { const x = clips.clipAt(tr.clips, toSample(state.sel.start)); if (x) return { tr, clip: x }; }
  return null;
}

/** Clips that clip operations (beats, cues) apply to: the picked clip, otherwise the clips of the target tracks in the selection. */
function clipTargets() {
  if (state.clip) { const a = activeClip(); if (a) return [a]; }
  const [a, b] = range();
  return targets().flatMap((tr) => tr.clips.filter((c) => !hasRange() || (clips.clipEnd(c) > a && c.offset < b)).map((clip) => ({ tr, clip })));
}

function replaceClip(tr, clip, changes) { setClips(tr, tr.clips.map((c) => (c.id === clip.id ? { ...c, ...changes } : c))); }

async function edit(fn) {
  if (!state.tracks.length) return;
  stop();
  remember();
  state.busy = true;
  render();
  try {
    for (const tr of targets()) { const out = await fn(tr); if (out) setClips(tr, out); }
    setDirty();
  } catch (e) { restore(state.history.pop()); fail(e); } finally { state.busy = false; render(); }
}

// ---- editing ---------------------------------------------------------------------------------------------------------------------

function copy() {
  if (!hasRange()) return false;
  const [a, b] = range();
  state.clipboard = targets().map((tr) => ({ clips: clips.sliceRange(tr.clips, a, b), length: b - a }));
  return true;
}

function cut() { if (copy()) deleteRange(); }

function deleteRange() {
  if (!hasRange()) return;
  const [a, b] = range();
  edit((tr) => clips.removeRange(tr.clips, a, b)).then(() => { state.sel = { start: a / state.rate, end: a / state.rate }; render(); });
}

function paste() {
  const clip = state.clipboard;
  if (!clip || !clip.length) return;
  stop();
  remember();
  const [a, b] = range();
  const tracks = state.tracks.length ? targets() : [];
  clip.forEach((part, i) => {
    if (i < tracks.length || (clip.length === 1 && tracks.length)) return;
    const tr = makeTrack([]);
    state.tracks.push(tr);
    tracks.push(tr);
  });
  tracks.forEach((tr, i) => {
    const part = clip.length === 1 ? clip[0] : clip[i];
    if (part) setClips(tr, clips.replaceRange(tr.clips, a, b, part.clips, part.length));
  });
  const len = Math.max(...clip.map((c) => c.length));
  state.sel = { start: a / state.rate, end: (a + len) / state.rate };
  state.selTracks = new Set(tracks.map((tr) => tr.id));
  state.clip = null;
  setDirty();
  render();
}

function trim() {
  if (!hasRange()) return;
  const [a, b] = range();
  edit((tr) => clips.sliceRange(tr.clips, a, b)).then(() => { state.sel = { start: 0, end: (b - a) / state.rate }; state.view.start = 0; render(); });
}

/** Split the clips of the target tracks at the cursor (and at the end of the selection). */
function split() {
  const [a, b] = range();
  edit((tr) => { let list = clips.splitAt(tr.clips, a); if (b > a) list = clips.splitAt(list, b); return list; });
}

function selectAll() {
  state.sel = { start: 0, end: projectDuration() };
  state.selTracks = new Set(state.tracks.map((tr) => tr.id));
  state.clip = null;
  render();
}

/** Select the range of a clip (and pick it for the clip menu). */
function pickClip(tr, clip) {
  state.clip = { track: tr.id, id: clip.id };
  state.sel = { start: clip.offset / state.rate, end: clips.clipEnd(clip) / state.rate };
  state.selTracks = new Set([tr.id]);
  if (!state.playing) state.playhead = state.sel.start;
}

// ---- effects -------------------------------------------------------------------------------------------------------------

/** Markers of a clip after its audio got `factor` times faster (speed or tempo) or was reversed. */
function scaledMarkers(clip, factor, reversed = false, n = clips.clipLength(clip)) {
  const out = {};
  if (clip.cues) out.cues = clip.cues.map((x) => (reversed ? n - x : Math.round(x / factor))).sort((a, b) => a - b);
  if (clip.beats) out.beats = reversed ? { ...clip.beats, phase: n - clip.beats.phase } : { bpm: Math.round(clip.beats.bpm * factor * 100) / 100, phase: clip.beats.phase / factor };
  return out;
}

/*
 * kind 'map': fn(audio, from, to, values, span) on the part of every clip in the range, same length;
 * kind 'merge': fn(audio, values) on the range as one piece (the length may change); without a selection on every clip.
 */
const EFFECTS = {
  amplify: { kind: 'map', fields: [{ key: 'db', label: 'ae.gainDb', value: 3, step: 0.5 }], fn: (a, f, to, v) => dsp.amplify(a, f, to, v.db) },
  normalize: { kind: 'normalize', fields: [{ key: 'db', label: 'ae.peakDb', value: -1, step: 0.5, max: 0 }] },
  fadeIn: { kind: 'map', fn: (a, f, to, v, span) => dsp.fade(a, f, to, 'in', ...span) },
  fadeOut: { kind: 'map', fn: (a, f, to, v, span) => dsp.fade(a, f, to, 'out', ...span) },
  reverse: { kind: 'merge', fn: (a) => dsp.reverse(a, 0, dsp.length(a)), reversed: true },
  invert: { kind: 'map', fn: (a, f, to) => dsp.invert(a, f, to) },
  echo: { kind: 'map', fields: [{ key: 'delay', label: 'ae.delayS', value: 0.3, step: 0.05, min: 0.01 }, { key: 'decay', label: 'ae.decay', value: 0.5, step: 0.05, min: 0, max: 0.95 }], fn: (a, f, to, v) => dsp.echo(a, f, to, v.delay, v.decay) },
  speed: { kind: 'merge', fields: [{ key: 'factor', label: 'ae.factor', value: 1.25, step: 0.05, min: 0.1, max: 10 }], fn: (a, v) => dsp.changeSpeed(a, 0, dsp.length(a), v.factor) },
  tempo: { kind: 'merge', fields: [{ key: 'factor', label: 'ae.factor', value: 1.05, step: 0.01, min: 0.25, max: 4 }], fn: (a, v) => beats.timeStretch(a, v.factor) },
  lowpass: { kind: 'map', fields: [{ key: 'hz', label: 'ae.cutoff', value: 1000, step: 10, min: 10 }], fn: (a, f, to, v) => dsp.filter(a, f, to, 'lowpass', v.hz) },
  highpass: { kind: 'map', fields: [{ key: 'hz', label: 'ae.cutoff', value: 200, step: 10, min: 10 }], fn: (a, f, to, v) => dsp.filter(a, f, to, 'highpass', v.hz) },
  equalizer: { kind: 'map', fields: [{ key: 'bass', label: 'ae.bassDb', value: 0, step: 0.5, min: -24, max: 24 }, { key: 'middle', label: 'ae.middleDb', value: 0, step: 0.5, min: -24, max: 24 }, { key: 'treble', label: 'ae.trebleDb', value: 0, step: 0.5, min: -24, max: 24 }], fn: (a, f, to, v) => fx2.equalize(a, f, to, v) },
  compressor: { kind: 'map', fields: [{ key: 'threshold', label: 'ae.thresholdDb', value: -18, step: 1, max: 0 }, { key: 'ratio', label: 'ae.ratio', value: 4, step: 0.5, min: 1, max: 50 }, { key: 'attack', label: 'ae.attackMs', value: 10, step: 1, min: 0.1 }, { key: 'release', label: 'ae.releaseMs', value: 150, step: 10, min: 1 }, { key: 'makeup', label: 'ae.makeupDb', value: 0, step: 0.5 }], fn: (a, f, to, v) => fx2.compress(a, f, to, v) },
  limiter: { kind: 'map', fields: [{ key: 'threshold', label: 'ae.ceilingDb', value: -1, step: 0.5, max: 0 }], fn: (a, f, to, v) => fx2.compress(a, f, to, { threshold: v.threshold, ratio: 50, attack: 0.5, release: 60 }) },
  reverb: { kind: 'map', fields: [{ key: 'size', label: 'ae.roomS', value: 1.5, step: 0.1, min: 0.1, max: 8 }, { key: 'wet', label: 'ae.wetPct', value: 30, step: 5, min: 0, max: 100 }], fn: (a, f, to, v) => fx2.reverb(a, f, to, { size: v.size, wet: v.wet / 100 }) },
  pitch: { kind: 'merge', fields: [{ key: 'semitones', label: 'ae.semitones', value: 2, step: 1, min: -24, max: 24 }], fn: (a, v) => fx2.pitchShift(a, v.semitones) },
  noiseReduction: { kind: 'map', fields: [{ key: 'reduction', label: 'ae.reductionDb', value: 12, step: 1, min: 1, max: 60 }, { key: 'sensitivity', label: 'ae.gateSensitivity', value: 1.5, step: 0.1, min: 0, max: 10 }], fn: (a, f, to, v) => fx2.reduceNoise(a, f, to, v) },
};

async function mapClips(list, a, b, fn) {
  const out = [];
  for (const c of list) {
    const s = c.offset, e = clips.clipEnd(c);
    if (e <= a || s >= b) { out.push(c); continue; }
    const from = Math.max(a, s) - s, to = Math.min(b, e) - s;
    out.push({ ...c, audio: await fn(c.audio, from, to, c) });
  }
  return out;
}

function applyEffect(name, values = {}) {
  const fx = EFFECTS[name];
  const sel = hasRange();
  let newLength = null;
  edit(async (tr) => {
    const [a, b] = sel ? range() : [0, clips.trackEnd(tr.clips)];
    if (fx.kind === 'map') return mapClips(tr.clips, a, b, (audio, from, to, c) => fx.fn(audio, from, to, values, [a - c.offset, b - c.offset]));
    if (fx.kind === 'normalize') {
      let peak = 0;
      for (const c of tr.clips) { const s = Math.max(a, c.offset) - c.offset, e = Math.min(b, clips.clipEnd(c)) - c.offset; if (e > s) peak = Math.max(peak, dsp.peak(c.audio, s, e)); }
      if (!peak) return null;
      const db = dsp.gainToDb(dsp.dbToGain(values.db) / peak);
      return mapClips(tr.clips, a, b, (audio, from, to) => dsp.amplify(audio, from, to, db));
    }
    if (sel) { const r = await clips.mergeRange(tr.clips, a, b, state.rate, (audio) => fx.fn(audio, values)); newLength ??= r.length; return r.clips; }
    const out = [];
    for (const c of tr.clips) {
      const audio = await fx.fn(c.audio, values);
      out.push({ ...c, audio, ...scaledMarkers(c, values.factor || 1, fx.reversed, dsp.length(audio)) });
    }
    return out;
  }).then(() => {
    if (newLength != null) state.sel.end = state.sel.start + newLength / state.rate;
    render();
  });
}

function effect(name) {
  state.menu = null;
  const fx = EFFECTS[name];
  if (!fx.fields) { applyEffect(name); return; }
  state.dialog = { title: t(`ae.${name}`).replace('…', ''), fields: fx.fields.map((f) => ({ ...f })), run: (v) => applyEffect(name, v) };
  render();
}

const GENERATORS = {
  tone: { fields: [{ key: 'wave', label: 'ae.waveform', value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'] }, { key: 'frequency', label: 'ae.frequency', value: 440, step: 1, min: 1 }, { key: 'amplitude', label: 'ae.amplitude', value: 0.8, step: 0.05, min: 0, max: 1 }, { key: 'seconds', label: 'ae.durationS', value: 1, step: 0.1, min: 0.01 }] },
  noise: { fields: [{ key: 'amplitude', label: 'ae.amplitude', value: 0.5, step: 0.05, min: 0, max: 1 }, { key: 'seconds', label: 'ae.durationS', value: 1, step: 0.1, min: 0.01 }] },
  silenceGen: { fields: [{ key: 'seconds', label: 'ae.durationS', value: 1, step: 0.1, min: 0.01 }] },
};

/** Insert generated audio at the cursor (replacing the selection) of the target tracks; a new track if there is none. */
function generate(name, v) {
  stop();
  remember();
  const make = (channels) => (name === 'silenceGen' ? dsp.silence(state.rate, channels, v.seconds * state.rate)
    : dsp.tone(state.rate, channels, v.seconds, { wave: name === 'noise' ? 'noise' : v.wave, frequency: v.frequency, amplitude: v.amplitude }));
  const label = t(`ae.${name}`).replace('…', '');
  if (!state.tracks.length) {
    const tr = makeTrack([clips.makeClip(make(1), 0, { name: label })]);
    state.tracks.push(tr); state.selTracks = new Set([tr.id]); state.sel = { start: 0, end: v.seconds };
  } else {
    const [a, b] = range();
    for (const tr of targets()) { const audio = make(channelsOf(tr)); setClips(tr, clips.replaceRange(tr.clips, a, b, [clips.makeClip(audio, 0, { name: label })], dsp.length(audio))); }
    state.sel = { start: a / state.rate, end: a / state.rate + v.seconds };
  }
  setDirty();
  render();
}

function generator(name) {
  state.menu = null;
  state.dialog = { title: t(`ae.${name}`).replace('…', ''), fields: GENERATORS[name].fields.map((f) => ({ ...f })), run: (v) => generate(name, v) };
  render();
}

function trackAction(kind, tr) {
  state.menu = null;
  stop();
  remember();
  const i = state.tracks.indexOf(tr);
  const mapAudio = (fn) => setClips(tr, tr.clips.map((c) => ({ ...c, audio: fn(c.audio) })));
  if (kind === 'delete') { state.tracks.splice(i, 1); state.selTracks.delete(tr.id); }
  if (kind === 'duplicate') state.tracks.splice(i + 1, 0, { ...makeTrack(tr.clips.map((c) => ({ ...c, id: clips.newId() })), `${tr.name} 2`), gain: tr.gain, pan: tr.pan });
  if (kind === 'mono') mapAudio((a) => ({ rate: a.rate, channels: [dsp.mono(a)] }));
  if (kind === 'stereo') mapAudio((a) => dsp.matchChannels(a, 2));
  if (kind === 'new') state.tracks.push(makeTrack([]));
  if (kind === 'mixdown') {
    const channels = state.tracks.some((x) => channelsOf(x) > 1) ? 2 : 1;
    const n = projectLength();
    const mixed = dsp.mix(state.tracks.map((x) => ({ ...x, audio: withEnvelope(x, trackAudio(x, 0, n), 0) })), state.rate, channels, 0, n);
    state.tracks = [makeTrack([clips.makeClip(mixed, 0)], t('ae.mixdown').split(' ')[0])];
    state.selTracks = new Set();
    state.clip = null;
  }
  setDirty();
  render();
}

// ---- clips, beats and cues ------------------------------------------------------------------------------------------------------

function needClip() { const a = activeClip(); if (!a) Suite.shell.toast(t('ae.noClip'), 'error'); return a; }

function clipAction(kind) {
  state.menu = null;
  const needsClip = !['split', 'detectBeats', 'detectCues', 'addCue', 'clearMarkers', 'crossfade'].includes(kind);
  const a = needsClip ? needClip() : null;
  if (needsClip && !a) { render(); return; }
  if (kind === 'split') split();
  if (kind === 'removeClip') { stop(); remember(); setClips(a.tr, a.tr.clips.filter((c) => c.id !== a.clip.id)); state.clip = null; setDirty(); render(); }
  if (kind === 'duplicateClip') {
    stop(); remember();
    const copyClip = { ...a.clip, id: clips.newId(), offset: clips.clipEnd(a.clip) };
    setClips(a.tr, [...a.tr.clips, copyClip]);
    pickClip(a.tr, copyClip);
    setDirty(); render();
  }
  if (kind === 'moveTo') {
    state.dialog = {
      title: t('ae.moveTo').replace('…', ''), fields: [{ key: 'start', label: 'ae.startS', value: Number((a.clip.offset / state.rate).toFixed(4)), step: 0.001, min: 0 }],
      run: (v) => { stop(); remember(); setClips(a.tr, clips.moveClip(a.tr.clips, a.clip.id, v.start * state.rate)); pickClip(a.tr, a.tr.clips.find((c) => c.id === a.clip.id)); setDirty(); render(); },
    };
  }
  if (kind === 'clipGain') {
    state.dialog = {
      title: t('ae.clipGain').replace('…', ''), fields: [{ key: 'db', label: 'ae.gainDb', value: a.clip.gain || 0, step: 0.5, min: -60, max: 24 }],
      run: (v) => { stop(); remember(); replaceClip(a.tr, a.clip, { gain: v.db || 0 }); pickClip(a.tr, a.tr.clips.find((c) => c.id === a.clip.id)); setDirty(); render(); },
    };
  }
  if (kind === 'removeFades') { stop(); remember(); replaceClip(a.tr, a.clip, { fadeIn: 0, fadeOut: 0 }); setDirty(); render(); }
  if (kind === 'crossfade') crossfade();
  if (kind === 'detectBeats') detectBeats();
  if (kind === 'detectCues') {
    state.dialog = {
      title: t('ae.detectCues').replace('…', ''),
      fields: [{ key: 'sensitivity', label: 'ae.sensitivity', value: 0.5, step: 0.05, min: 0, max: 1 }, { key: 'minGap', label: 'ae.minGap', value: 2, step: 0.1, min: 0.05 }],
      run: (v) => detectCues(v),
    };
  }
  if (kind === 'beatGrid') {
    const b = a.clip.beats || { bpm: 120, phase: 0 };
    const first = clips.beatPositions({ ...a.clip, beats: b }, state.rate)[0] || 0;
    state.dialog = {
      title: t('ae.beatGrid').replace('…', ''),
      fields: [{ key: 'bpm', label: 'ae.bpm', value: b.bpm, step: 0.01, min: 20, max: 400 }, { key: 'beat', label: 'ae.beatAt', value: Number(((a.clip.offset + first) / state.rate).toFixed(4)), step: 0.001 }],
      run: (v) => { remember(); replaceClip(a.tr, a.clip, { beats: { bpm: v.bpm, phase: v.beat * state.rate - a.clip.offset } }); setDirty(); render(); },
    };
  }
  if (kind === 'beatAtCursor') {
    if (!a.clip.beats) { Suite.shell.toast(t('ae.noTempo'), 'error'); return; }
    remember(); replaceClip(a.tr, a.clip, { beats: { ...a.clip.beats, phase: toSample(state.sel.start) - a.clip.offset } }); setDirty(); render();
  }
  if (kind === 'matchTempo') {
    if (!a.clip.beats) { Suite.shell.toast(t('ae.noTempo'), 'error'); return; }
    const other = state.tracks.flatMap((tr) => tr.clips).find((c) => c.beats && c.id !== a.clip.id);
    state.dialog = {
      title: t('ae.matchTempo').replace('…', ''), fields: [{ key: 'bpm', label: 'ae.targetBpm', value: other ? other.beats.bpm : a.clip.beats.bpm, step: 0.01, min: 20, max: 400 }],
      run: (v) => matchTempo(a, v.bpm),
    };
  }
  if (kind === 'addCue') addCue();
  if (kind === 'clearMarkers') {
    const list = clipTargets();
    if (!list.length) return;
    remember();
    for (const { tr, clip } of list) replaceClip(tr, tr.clips.find((c) => c.id === clip.id), { beats: undefined, cues: undefined });
    setDirty();
  }
  render();
}

async function withBusy(fn) {
  stop();
  state.busy = true;
  render();
  await pause0();
  try { await fn(); } catch (e) { fail(e); } finally { state.busy = false; render(); }
}

/** Fade overlapping clips of the selected tracks into each other (the fades span the overlap). */
function crossfade() {
  stop();
  const before = snapshot();
  let n = 0;
  for (const tr of targets()) {
    let list = clips.sorted(tr.clips);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      const overlap = clips.clipEnd(a) - b.offset;
      if (overlap <= 0 || b.offset <= a.offset) continue;
      list[i] = clips.withFades(a, a.fadeIn || 0, overlap);
      list[i + 1] = clips.withFades(b, overlap, b.fadeOut || 0);
      n++;
    }
    if (n) setClips(tr, list);
  }
  if (!n) { Suite.shell.toast(t('ae.noOverlap'), 'warning'); render(); return; }
  remember(before);
  setDirty();
  Suite.shell.toast(t('ae.crossfaded', n));
  render();
}

/** Fade handles of a clip in lane coordinates (CSS pixels): the top corners of the clip body, moved inwards by the fades. */
function fadeHandles(clip) {
  const x = (sample) => (sample / state.rate - state.view.start) * state.view.pps;
  return { in: { x: x(clip.offset + (clip.fadeIn || 0)), y: CLIP_HEAD() + 5 }, out: { x: x(clips.clipEnd(clip) - (clip.fadeOut || 0)), y: CLIP_HEAD() + 5 } };
}

function fadeHandleAt(e, tr) {
  const r = e.currentTarget.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const reach = e.pointerType === 'touch' ? 16 : 8;
  for (const c of clips.sorted(tr.clips).reverse()) {
    const h = fadeHandles(c);
    for (const which of ['in', 'out']) if (Math.abs(px - h[which].x) <= reach && Math.abs(py - h[which].y) <= reach) return { clip: c, which };
  }
  return null;
}

/** Drag a fade handle: the fade length follows the pointer (in samples, limited to the clip). */
function fadeDown(e, tr, hit) {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  stop();
  const before = snapshot();
  let moved = false;
  const id = hit.clip.id;
  const move = (ev) => {
    const c = tr.clips.find((x) => x.id === id);
    const at = toSample(timeAt(ev, el));
    const next = hit.which === 'in' ? clips.withFades(c, at - c.offset, c.fadeOut || 0) : clips.withFades(c, c.fadeIn || 0, clips.clipEnd(c) - at);
    setClips(tr, tr.clips.map((x) => (x.id === id ? next : x)));
    moved = true;
    draw();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (moved) { remember(before); setDirty(); }
    render();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function detectBeats() {
  const list = clipTargets();
  if (!list.length) return;
  withBusy(async () => {
    const before = snapshot();
    const found = [];
    for (const { tr, clip } of list) {
      const grid = beats.detectBeats(dsp.mono(clip.audio), state.rate);
      if (!grid) { Suite.shell.toast(t('ae.noBeats', clip.name || tr.name), 'error'); continue; }
      replaceClip(tr, clip, { beats: grid });
      found.push(t('ae.beatsFound', clip.name || tr.name, grid.bpm));
      await pause0();
    }
    if (found.length) { remember(before); setDirty(); Suite.shell.toast(found.join(' · ')); }
  });
}

function detectCues(v) {
  const list = clipTargets();
  if (!list.length) return;
  withBusy(async () => {
    remember();
    let n = 0;
    for (const { tr, clip } of list) {
      const cues = beats.detectCues(dsp.mono(clip.audio), state.rate, v);
      n += cues.length;
      replaceClip(tr, clip, { cues });
    }
    setDirty();
    Suite.shell.toast(t('ae.cuesFound', n));
  });
}

function matchTempo({ tr, clip }, bpm) {
  const factor = bpm / clip.beats.bpm;
  withBusy(async () => {
    remember();
    const audio = beats.timeStretch(clip.audio, factor);
    const markers = scaledMarkers(clip, factor, false);
    markers.beats.bpm = bpm;
    replaceClip(tr, clip, { audio, ...markers });
    pickClip(tr, tr.clips.find((c) => c.id === clip.id));
    setDirty();
  });
}

function addCue() {
  const at = toSample(state.sel.start);
  for (const tr of targets()) {
    const clip = clips.clipAt(tr.clips, at);
    if (!clip) continue;
    remember();
    replaceClip(tr, clip, { cues: [...(clip.cues || []), at - clip.offset].sort((x, y) => x - y) });
    setDirty();
    render();
    return;
  }
  Suite.shell.toast(t('ae.noClip'), 'error');
}

// ---- labels ------------------------------------------------------------------------------------------------------------------------

function labelDialog(label, onText) {
  state.dialog = { title: t('ae.label'), fields: [{ key: 'text', label: 'ae.labelText', value: label ? label.text : '', text: true }], run: (v) => onText(v.text.trim()) };
  render();
  requestAnimationFrame(() => { const el = document.querySelector('[data-testid=param-text]'); if (el) { el.focus(); el.select(); } });
}

/** A label at the selection (a region) or at the cursor (a point). */
function addLabel() {
  const [a, b] = range().map((x) => x / state.rate);
  labelDialog(null, (text) => {
    remember();
    state.labels.push({ id: nextId++, start: a, end: b, text });
    state.labels.sort((x, y) => x.start - y.start);
    setDirty();
    render();
  });
}

function editLabel(label) {
  labelDialog(label, (text) => {
    remember();
    if (text) state.labels = state.labels.map((l) => (l.id === label.id ? { ...l, text } : l));
    else state.labels = state.labels.filter((l) => l.id !== label.id);
    setDirty();
    render();
  });
}

function exportLabels() {
  state.menu = null;
  if (!state.labels.length) { Suite.shell.toast(t('ae.noLabels'), 'warning'); render(); return; }
  Suite.files.download(new TextEncoder().encode(labelText.toText(state.labels)), `${state.name.replace(/\.[^.]+$/, '')} labels.txt`, 'text/plain');
  render();
}

async function importLabels() {
  state.menu = null;
  render();
  const picked = await Suite.files.open({ types: [{ description: 'Labels', accept: { 'text/plain': ['.txt'] } }] }).catch(fail);
  if (!picked || !picked.length) return;
  const list = labelText.parse(await picked[0].file.text());
  remember();
  for (const l of list) state.labels.push({ id: nextId++, ...l });
  state.labels.sort((x, y) => x.start - y.start);
  setDirty();
  Suite.shell.toast(t('ae.labelsImported', list.length));
  render();
}

/** Label rectangles on the label strip (CSS pixels): [{ label, x, x2, w }]. */
function labelBoxes(g = null) {
  const out = [];
  let lastEnd = -Infinity, row = 0;
  for (const l of state.labels) {
    const x = (l.start - state.view.start) * state.view.pps;
    const x2 = (l.end - state.view.start) * state.view.pps;
    const w = (g ? g.measureText(l.text || '·').width : (l.text || '·').length * 7) + 12;
    row = x < lastEnd ? (row + 1) % 2 : 0; // overlapping labels alternate between two rows
    lastEnd = Math.max(x + w, x2);
    out.push({ label: l, x, x2, w, row });
  }
  return out;
}

function drawLabels(col = colors()) {
  const c = document.querySelector('[data-testid=labels]');
  if (!c) return;
  const dpr = sizeCanvas(c);
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.scale(dpr, dpr);
  g.font = '12px system-ui, sans-serif';
  const h = c.height / dpr / 2;
  for (const b of labelBoxes(g)) {
    const y = b.row * h;
    if (b.x2 > b.x) { g.fillStyle = col.sel; g.fillRect(b.x, y + h - 4, b.x2 - b.x, 4); }
    g.fillStyle = col.cue;
    g.fillRect(Math.round(b.x), 0, 1.5, c.height / dpr);
    g.fillStyle = col.head;
    g.fillRect(b.x + 2, y + 1, b.w, h - 6);
    g.fillStyle = col.color;
    g.fillText(b.label.text || '·', b.x + 8, y + h - 9);
  }
}

function labelAt(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const h = r.height / 2;
  const g = e.currentTarget.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = '12px system-ui, sans-serif';
  return (labelBoxes(g).reverse().find((b) => x >= b.x && x <= b.x + 2 + b.w && y >= b.row * h && y < (b.row + 1) * h) || {}).label || null;
}

function labelsDown(e) {
  const l = labelAt(e);
  if (!l) { rulerDown(e); return; }
  state.sel = { start: l.start, end: l.end };
  if (state.playing) play(l.start); else { state.playhead = l.start; render(); }
}

function labelsDblClick(e) {
  const l = labelAt(e);
  if (l) editLabel(l); else { const tm = timeAt(e, e.currentTarget); state.sel = { start: tm, end: tm }; addLabel(); }
}

// ---- snapping ----------------------------------------------------------------------------------------------------------------------

/** Positions (samples) of a clip that snap: its edges, beats and cues (relative to the clip start). */
function clipPoints(clip) {
  return [0, clips.clipLength(clip), ...clips.beatPositions(clip, state.rate), ...(clip.cues || [])];
}

/** Sorted snap targets (samples): edges, beats and cues of all clips except `exclude`, the playhead, the start. */
function snapTargets(exclude = null, withSelection = true) {
  const out = [0, toSample(state.playhead)];
  if (withSelection) out.push(...range());
  for (const l of state.labels) out.push(toSample(l.start), toSample(l.end));
  for (const tr of state.tracks) for (const c of tr.clips) if (c.id !== exclude) for (const p of clipPoints(c)) out.push(c.offset + p);
  return Float64Array.from(out).sort();
}

function nearest(sortedTargets, x) {
  let lo = 0, hi = sortedTargets.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedTargets[mid] < x) lo = mid + 1; else hi = mid; }
  const a = sortedTargets[lo], b = lo > 0 ? sortedTargets[lo - 1] : a;
  return Math.abs(a - x) < Math.abs(b - x) ? a : b;
}

/** Offset of a dragged clip after snapping one of its points to a target (or the offset unchanged). */
function snapClip(clip, offset, targetsList) {
  const limit = (SNAP_PX / state.view.pps) * state.rate;
  let best = null;
  for (const p of clipPoints(clip)) {
    const n = nearest(targetsList, offset + p);
    if (n == null) continue;
    const d = n - (offset + p);
    if (Math.abs(d) <= limit && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: n };
  }
  state.snapLine = best ? best.at / state.rate : null;
  return best ? Math.max(0, offset + best.d) : offset;
}

/** A time (seconds) snapped to the nearest target, for selections. */
function snapTime(sec, targetsList) {
  const n = nearest(targetsList, sec * state.rate);
  const hit = n != null && Math.abs(n / state.rate - sec) * state.view.pps <= SNAP_PX;
  state.snapLine = hit ? n / state.rate : null;
  return hit ? n / state.rate : sec;
}

// ---- files -------------------------------------------------------------------------------------------------------------------

async function decodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let audio = dsp.decodeWav(bytes);
  let bits = audio ? (audio.float ? 32 : audio.bits === 24 ? 24 : 16) : 16;
  if (!audio) {
    const ctx = new OfflineAudioContext(1, 1, state.tracks.length ? state.rate : 44100);
    const b = await ctx.decodeAudioData(bytes.buffer.slice(0));
    audio = { rate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice()) };
    bits = 16;
  }
  return { audio: { rate: audio.rate, channels: audio.channels }, bits };
}

/** Add files as tracks (the first file of an empty project sets the sample rate). */
async function addFiles(picked, replaceProject = false) {
  stop();
  state.busy = true;
  render();
  const before = snapshot();
  let added = 0;
  try {
    if (replaceProject) { state.tracks = []; state.history = []; state.future = []; state.selTracks = new Set(); state.sel = { start: 0, end: 0 }; state.view.start = 0; state.clip = null; }
    for (const { file, handle } of picked) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (project.isProject(file.name, bytes)) {
          await addProject(project.decode(bytes));
          if (replaceProject && added === 0) {
            Object.assign(state, { name: file.name, handle: picked.length === 1 ? handle : null });
            if (handle) Suite.files.remember(APP, handle);
          }
          added++;
          continue;
        }
        const { audio, bits } = await decodeFile(file);
        if (!state.tracks.length) state.rate = audio.rate;
        const resampled = await dsp.resample(audio, state.rate);
        const name = file.name.replace(/\.[^.]+$/, '');
        state.tracks.push(makeTrack([clips.makeClip(resampled, 0, { name })], name));
        if (replaceProject && added === 0) {
          const wav = /\.wav$/i.test(file.name);
          Object.assign(state, { name: wav ? file.name : `${name}.wav`, handle: wav && picked.length === 1 ? handle : null, bits });
          if (handle) Suite.files.remember(APP, handle);
        }
        added++;
      } catch (e) { console.warn(e); Suite.shell.toast(t('ae.cannotOpen', file.name, e.message || e.name), 'error'); }
    }
    if (!added) { restore(before); return; }
    if (!replaceProject) state.history.push(before);
    setDirty(!replaceProject);
    if (replaceProject) fitView();
  } finally { state.busy = false; render(); }
}

/** Add the tracks of a project (resampled to the project rate; an empty project takes the rate of the file). */
async function addProject(p) {
  if (!state.tracks.length) state.rate = p.rate;
  for (const tr of p.tracks) {
    const list = [];
    for (const c of tr.clips) {
      const audio = await dsp.resample(c.audio, state.rate);
      const f = state.rate / c.audio.rate;
      list.push(clips.makeClip(audio, c.offset * f, { name: c.name, beats: c.beats ? { bpm: c.beats.bpm, phase: c.beats.phase * f } : undefined, cues: c.cues ? c.cues.map((x) => Math.round(x * f)) : undefined,
        gain: c.gain || 0, fadeIn: Math.round((c.fadeIn || 0) * f), fadeOut: Math.round((c.fadeOut || 0) * f) }));
    }
    state.tracks.push({ ...makeTrack(list, tr.name), gain: tr.gain, pan: tr.pan, mute: tr.mute, solo: tr.solo, view: tr.view, envelope: tr.envelope });
  }
  for (const l of p.labels || []) state.labels.push({ id: nextId++, start: l.start, end: l.end, text: l.text });
}

const isProjectName = (name) => name.toLowerCase().endsWith(project.EXTENSION);

/** Save the project file (tracks, clips, settings). */
async function saveProject({ as = false, name = state.name } = {}) {
  if (!state.tracks.length) return;
  try {
    const bytes = project.encode({ rate: state.rate, tracks: state.tracks, labels: state.labels });
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types: PROJECT_TYPES, type: 'application/zip' })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: 'application/zip' });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    Object.assign(state, { name: result.name || name, handle: result.handle || (as ? null : state.handle) });
    if (result.handle) Suite.files.remember(APP, result.handle);
    setDirty(false);
    render();
  } catch (e) { fail(e); }
}

// recovery copies of unsaved work (shared/js/autosave.js): the arrangement as a project file (at most 64 MB)
Suite.autosave.register({
  app: APP,
  save: () => (state.dirty && state.tracks.length ? { name: state.name, handle: isProjectName(state.name) ? state.handle : null, project: project.encode({ rate: state.rate, tracks: state.tracks, labels: state.labels }) } : null),
  restore: async (s) => {
    stop();
    Object.assign(state, { tracks: [], labels: [], history: [], future: [], selTracks: new Set(), sel: { start: 0, end: 0 }, clip: null });
    await addProject(project.decode(s.project));
    Object.assign(state, { name: s.name, handle: s.handle || null });
    fitView();
    setDirty(true);
    render();
  },
});

async function confirmDiscard() { return !state.dirty || Suite.shell.confirm(t('ae.discard')); }

async function open() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true }).catch(fail);
  if (picked) await addFiles(picked, true);
}

async function importFiles() {
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true }).catch(fail);
  if (picked) await addFiles(picked, false);
}

function mixFor({ channels = 'auto', selection = false } = {}) {
  // automatic: stereo if a track is stereo or panned
  const n = channels === 'mono' ? 1 : channels === 'stereo' ? 2 : state.tracks.some((tr) => channelsOf(tr) > 1 || tr.pan) ? 2 : 1;
  const [a, b] = selection && hasRange() ? range() : [0, projectLength()];
  return dsp.mix(state.tracks.map((tr) => ({ ...tr, audio: withEnvelope(tr, trackAudio(tr, a, b), a) })), state.rate, n, 0, b - a);
}

const WAV_TYPES = [{ description: 'WAV', accept: { 'audio/wav': ['.wav'] } }];

async function save({ as = false, name = state.name, bits = state.bits, channels = 'auto', selection = false } = {}) {
  if (!state.tracks.length) return;
  if (!as && isProjectName(state.name)) { saveProject(); return; }
  try {
    const bytes = dsp.encodeWav(mixFor({ channels, selection }), bits);
    const result = as || !state.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types: WAV_TYPES, type: 'audio/wav' })
      : await Suite.files.save({ name, handle: state.handle }, bytes, { type: 'audio/wav' });
    if (!result) return;
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
    if (!selection) { Object.assign(state, { name: result.name || name, handle: result.handle || (as ? null : state.handle), bits }); setDirty(false); }
    render();
  } catch (e) { fail(e); }
}

/** Export in a compressed format (encode.js, loaded on demand); does not change the project file. */
async function exportCompressed({ format, stem, channels, selection, bitrate }) {
  if (!state.tracks.length) return;
  stop();
  state.busy = true;
  state.progress = 0;
  render();
  try {
    const enc = await import('@app/encode.js');
    const f = enc.FORMATS[format];
    const mixed = await dsp.resample(mixFor({ channels, selection }), enc.rateFor(format, state.rate));
    const bytes = await enc.encode(mixed, format, { bitrate, onProgress: (p) => { state.progress = p; render(); } });
    const result = await Suite.files.saveAs(bytes, { suggestedName: `${stem}.${f.ext}`, types: [{ description: t(`ae.${format}`), accept: { [f.mime]: [`.${f.ext}`] } }], type: f.mime });
    if (result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }
  } catch (e) { fail(e); } finally { state.busy = false; state.progress = null; render(); }
}

const COMPRESSED = ['mp3', 'ogg', 'm4a', 'flac'];

function openExport() {
  const d = { kind: 'export', stem: state.name.replace(/\.[^.]+$/, ''), format: isProjectName(state.name) ? 'project' : `wav${state.bits}`, channels: 'auto', selection: false, bitrate: null, available: null };
  state.dialog = d;
  render();
  const n = state.tracks.some((tr) => channelsOf(tr) > 1 || tr.pan) ? 2 : 1;
  import('@app/encode.js').then((enc) => enc.available(n, state.rate)).then((list) => { d.available = list; render(); }).catch((e) => { console.warn(e); d.available = []; render(); });
}

function runExport(d) {
  state.dialog = null;
  render();
  if (d.format === 'project') saveProject({ as: true, name: `${d.stem}${project.EXTENSION}` });
  else if (d.format.startsWith('wav')) save({ as: true, name: `${d.stem}.wav`, bits: Number(d.format.slice(3)), channels: d.channels, selection: d.selection });
  else exportCompressed(d);
}

// ---- playback and recording -------------------------------------------------------------------------------------------------------

let audioCtx = null;
const context = () => { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; };
const buffers = new WeakMap(); // audio -> { ctx, b }

function clipBuffer(ctx, audio) {
  const cached = buffers.get(audio);
  if (cached && cached.ctx === ctx) return cached.b;
  const b = ctx.createBuffer(audio.channels.length, Math.max(1, dsp.length(audio)), state.rate);
  audio.channels.forEach((c, i) => b.copyToChannel(c, i));
  buffers.set(audio, { ctx, b });
  return b;
}

function applyLevels() {
  if (!state.playing) return;
  const solo = state.tracks.some((tr) => tr.solo);
  for (const { tr, gain, panner } of state.playing.nodes) {
    const live = trackOf(tr.id) || tr;
    gain.gain.value = live.mute || (solo && !live.solo) ? 0 : dsp.dbToGain(live.gain);
    if (panner) panner.pan.value = live.pan;
  }
}

function play(from = null) {
  if (!state.tracks.length) return;
  stop(false);
  const ctx = context();
  ctx.resume();
  const [a, b] = range();
  const sel = b > a;
  let start = from ?? (sel ? a / state.rate : state.playhead);
  const end = sel && from == null ? b / state.rate : projectDuration();
  if (start >= end - 0.001) start = sel ? a / state.rate : 0;
  const nodes = [];
  const sources = [];
  const at = ctx.currentTime + 0.05;
  for (const tr of state.tracks) {
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { gain.connect(panner); panner.connect(ctx.destination); } else gain.connect(ctx.destination);
    let input = gain;
    if (tr.envelope && tr.envelope.length) {
      // volume automation as a value curve over the played range
      const env = ctx.createGain();
      const steps = Math.max(2, Math.min(8000, Math.ceil((end - start) * 100)));
      const curve = new Float32Array(steps);
      for (let i = 0; i < steps; i++) curve[i] = envelopeGain(tr, start + ((end - start) * i) / (steps - 1));
      env.gain.setValueCurveAtTime(curve, at, Math.max(0.001, end - start));
      env.connect(gain);
      input = env;
    }
    for (const c of tr.clips) {
      const cs = c.offset / state.rate, ce = clips.clipEnd(c) / state.rate;
      if (ce <= start || cs >= end) continue;
      const src = ctx.createBufferSource();
      src.buffer = clipBuffer(ctx, c.audio);
      const begin = Math.max(start, cs);
      const stopAt = Math.min(end, ce);
      if (clips.hasEnvelope(c)) {
        // the clip's gain and fades as a value curve from the start of playback to its end
        const env = ctx.createGain();
        const steps = Math.max(2, Math.min(4000, Math.ceil((stopAt - begin) * 200)));
        const curve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) curve[i] = clips.envelopeAt(c, Math.round((begin + ((stopAt - begin) * i) / (steps - 1)) * state.rate - c.offset));
        env.gain.setValueCurveAtTime(curve, at + begin - start, Math.max(0.001, stopAt - begin));
        src.connect(env);
        env.connect(input);
      } else src.connect(input);
      src.start(at + begin - start, begin - cs, stopAt - begin);
      sources.push(src);
    }
    nodes.push({ tr, gain, panner });
  }
  state.playing = { ctx, nodes, sources, at, from: start, to: end, sel };
  applyLevels();
  tick();
  render();
}

function stop(keepPosition = true) {
  const p = state.playing;
  if (!p) return;
  for (const src of p.sources) { try { src.stop(); } catch (e) { /* not started */ } src.disconnect(); }
  for (const n of p.nodes) n.gain.disconnect();
  state.playing = null;
  if (!keepPosition) return;
  render();
}

function pause() { if (state.playing) { state.playhead = currentTime(); stop(); } }
const currentTime = () => (state.playing ? Math.max(state.playing.from, state.playing.from + state.playing.ctx.currentTime - state.playing.at) : state.playhead);

function tick() {
  const p = state.playing;
  if (!p) return;
  const now = currentTime();
  if (now >= p.to) {
    if (state.loop && p.sel) { play(); return; }
    state.playhead = p.sel ? p.from : Math.min(p.to, projectDuration());
    stop();
    return;
  }
  state.playhead = now;
  // keep the playhead visible
  const lane = laneWidth();
  if (lane && (now < state.view.start || now > state.view.start + lane / state.view.pps)) state.view.start = Math.max(0, now - lane / state.view.pps * 0.1);
  drawOverlays();
  updateClock();
  requestAnimationFrame(tick);
}

async function record() {
  if (state.recording) { state.recording.recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { Suite.shell.toast(t('ae.noMic', e.message || e.name), 'error'); return; }
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  const offset = state.sel.start;
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach((x) => x.stop());
    clearInterval(state.recording.timer);
    state.recording = null;
    stop();
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const ctx = new OfflineAudioContext(1, 1, state.rate);
      const b = await ctx.decodeAudioData(await blob.arrayBuffer());
      const audio = { rate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i).slice()) };
      remember();
      const name = `${t('ae.recording')} ${nextId}`;
      const clip = clips.makeClip(await dsp.resample(audio, state.rate), toSample(offset), { name });
      const tr = makeTrack([clip], name);
      state.tracks.push(tr);
      state.selTracks = new Set([tr.id]);
      state.sel = { start: offset, end: clips.clipEnd(clip) / state.rate };
      setDirty();
    } catch (e) { fail(e); }
    render();
  };
  recorder.start(250);
  state.recording = { recorder, started: Date.now(), timer: setInterval(() => render(), 500) };
  if (state.tracks.length) play(offset); // overdub: hear the other tracks while recording
  render();
}

// ---- drawing ---------------------------------------------------------------------------------------------------------------------------

const lanes = () => [...document.querySelectorAll('[data-testid=lane]')];
const laneWidth = () => { const l = document.querySelector('[data-testid=lane]') || document.querySelector('[data-testid=ruler]'); return l ? l.clientWidth : 0; };
const colors = () => {
  const s = getComputedStyle(document.body);
  const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return {
    wave: v('--ae-wave', '#2b7bd6'), bg: v('--ae-lane', '#fff'), empty: v('--ae-empty', '#eef1f5'), head: v('--ae-clip-head', '#d5e3f5'), cue: v('--ae-cue', '#ef6c00'),
    sel: v('--ae-sel', 'rgba(43,123,214,.25)'), text: v('--pico-muted-color', '#888'), line: v('--pico-muted-border-color', '#ccc'), color: v('--pico-color', '#222'),
  };
};

function sizeCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return dpr;
}

const peakCache = new WeakMap(); // audio -> peaks
function peaksOf(audio) { let p = peakCache.get(audio); if (!p) { p = dsp.peaks(audio); peakCache.set(audio, p); } return p; }

/** Draw the waveform of one clip into [top, top + h) of the lane canvas g (device pixels). */
function drawClipWave(g, clip, x0, x1, top, h, dpr, col) {
  const chs = clip.audio.channels;
  const pk = peaksOf(clip.audio);
  const pxs = state.view.pps * dpr; // device pixels per second
  const chH = h / chs.length;
  g.fillStyle = col.wave;
  g.strokeStyle = col.wave;
  const shaped = clips.hasEnvelope(clip);
  chs.forEach((c, ci) => {
    const mid = top + chH * ci + chH / 2, amp = chH / 2 * 0.95;
    g.globalAlpha = 0.35;
    g.fillRect(x0, mid, x1 - x0, 1);
    g.globalAlpha = 1;
    const sampleAt = (x) => (state.view.start + x / pxs) * state.rate - clip.offset;
    if (state.rate / pxs < 1) {
      g.beginPath();
      const first = Math.max(0, Math.floor(sampleAt(x0)));
      for (let i = first; i < c.length; i++) {
        const x = ((clip.offset + i) / state.rate - state.view.start) * pxs;
        if (x > x1) break;
        const y = mid - c[i] * amp * (shaped ? clips.envelopeAt(clip, i) : 1);
        if (i === first) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineWidth = dpr;
      g.stroke();
      return;
    }
    for (let x = Math.floor(x0); x < x1; x++) {
      const s0 = Math.max(0, Math.floor(sampleAt(x)));
      const s1 = Math.min(c.length, Math.floor(sampleAt(x + 1)));
      if (s0 >= c.length) break;
      let lo = 1, hi = -1;
      if (s1 - s0 >= dsp.PEAK_BIN * 2) {
        for (let b = Math.floor(s0 / dsp.PEAK_BIN); b < Math.ceil(s1 / dsp.PEAK_BIN); b++) { if (pk[ci].min[b] < lo) lo = pk[ci].min[b]; if (pk[ci].max[b] > hi) hi = pk[ci].max[b]; }
      } else {
        for (let i = s0; i < Math.max(s1, s0 + 1); i++) { const v = c[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      if (hi < lo) continue;
      if (shaped) { const f = clips.envelopeAt(clip, Math.round((s0 + s1) / 2)); hi *= f; lo *= f; }
      g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
  });
}

// spectrogram view: levels per audio object (mono mix), colours from dark blue over red to yellow
const spectrumCache = new WeakMap();
function spectrumOf(audio) {
  let s = spectrumCache.get(audio);
  if (!s) { s = beats.spectrogram(dsp.mono(audio)); spectrumCache.set(audio, s); }
  return s;
}
const SPECTRUM_LUT = (() => {
  const stops = [[0, [10, 10, 30]], [0.35, [60, 20, 110]], [0.6, [200, 40, 70]], [0.8, [250, 140, 30]], [1, [255, 250, 190]]];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const k = stops.findIndex((s) => s[0] >= v);
    const [p0, c0] = stops[Math.max(0, k - 1)], [p1, c1] = stops[k];
    const f = p1 > p0 ? (v - p0) / (p1 - p0) : 0;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
  }
  return lut;
})();

/** The spectrogram of a clip between x0 and x1 (device pixels); frequencies on a logarithmic scale from 30 Hz. */
function drawClipSpectrum(g, clip, x0, x1, top, h, dpr) {
  const w = Math.max(0, Math.floor(x1) - Math.ceil(x0));
  const height = Math.floor(h);
  if (!w || height <= 0) return;
  const s = spectrumOf(clip.audio);
  const pxs = state.view.pps * dpr;
  const img = g.createImageData(w, height);
  const nyquist = clip.audio.rate / 2, lo = Math.log(30), hi = Math.log(nyquist);
  const binOfRow = new Int32Array(height);
  for (let y = 0; y < height; y++) binOfRow[y] = Math.min(s.bins - 1, Math.round(Math.exp(hi - (y / (height - 1 || 1)) * (hi - lo)) / nyquist * s.bins));
  for (let x = 0; x < w; x++) {
    const sample = (state.view.start + (Math.ceil(x0) + x) / pxs) * state.rate - clip.offset;
    const frame = Math.min(s.frames - 1, Math.max(0, Math.round(sample * (clip.audio.rate / state.rate) / s.hop)));
    const base = frame * s.bins;
    for (let y = 0; y < height; y++) {
      const v = s.data[base + binOfRow[y]];
      const o = (y * w + x) * 4;
      img.data[o] = SPECTRUM_LUT[v * 3]; img.data[o + 1] = SPECTRUM_LUT[v * 3 + 1]; img.data[o + 2] = SPECTRUM_LUT[v * 3 + 2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, Math.ceil(x0), Math.round(top));
}

function waveform(tr, w, h, dpr, col) {
  const active = state.clip && state.clip.track === tr.id ? state.clip.id : 0;
  const key = `${state.view.start}|${state.view.pps}|${w}|${h}|${tr.version}|${col.wave}|${col.bg}|${active}|${tr.view || ''}`;
  if (tr.cache && tr.cache.key === key) return tr.cache.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = col.empty;
  g.fillRect(0, 0, w, h);
  const head = CLIP_HEAD() * dpr;
  const pxs = state.view.pps * dpr;
  const xOf = (sample) => (sample / state.rate - state.view.start) * pxs;
  g.font = `${11 * dpr}px system-ui, sans-serif`;
  g.textBaseline = 'middle';
  for (const clip of clips.sorted(tr.clips)) {
    const cx0 = xOf(clip.offset), cx1 = xOf(clips.clipEnd(clip));
    if (cx1 < 0 || cx0 > w) continue;
    const x0 = Math.max(0, cx0), x1 = Math.min(w, cx1);
    g.fillStyle = col.bg;
    g.fillRect(x0, 0, x1 - x0, h);
    g.fillStyle = col.head;
    g.fillRect(x0, 0, x1 - x0, head);
    if (tr.view === 'spectrum') drawClipSpectrum(g, clip, x0, x1, head, h - head, dpr); else drawClipWave(g, clip, x0, x1, head, h - head, dpr, col);
    // fades: the curves and the handles at the top corners
    const n = clips.clipLength(clip);
    g.strokeStyle = col.color;
    g.lineWidth = dpr;
    for (const [len, fromStart] of [[clip.fadeIn || 0, true], [clip.fadeOut || 0, false]]) {
      if (len <= 0) continue;
      g.beginPath();
      for (let k = 0; k <= 32; k++) {
        const local = fromStart ? (len * k) / 32 : n - len + (len * k) / 32;
        const x = xOf(clip.offset + local), y = head + (h - head) * (1 - clips.envelopeAt({ ...clip, gain: 0 }, local));
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
    }
    for (const local of [clip.fadeIn || 0, n - (clip.fadeOut || 0)]) {
      const x = xOf(clip.offset + local);
      if (x < x0 - 6 * dpr || x > x1 + 6 * dpr) continue;
      g.beginPath(); g.arc(x, head + 5 * dpr, 4 * dpr, 0, Math.PI * 2);
      g.fillStyle = col.bg; g.fill(); g.strokeStyle = col.wave; g.stroke();
    }
    // beat grid and cues
    const beatPos = clips.beatPositions(clip, state.rate);
    if (beatPos.length > 1 && (beatPos[1] - beatPos[0]) / state.rate * pxs >= 5 * dpr) {
      g.fillStyle = col.color;
      beatPos.forEach((b) => { const x = xOf(clip.offset + b); if (x >= x0 && x <= x1) { g.globalAlpha = 0.18; g.fillRect(Math.round(x), head, dpr, h - head); g.globalAlpha = 0.6; g.fillRect(Math.round(x), head - 4 * dpr, dpr, 4 * dpr); } });
      g.globalAlpha = 1;
    }
    g.fillStyle = col.cue;
    for (const c of clip.cues || []) {
      const x = xOf(clip.offset + c);
      if (x < x0 || x > x1) continue;
      g.fillRect(Math.round(x), head, dpr, h - head);
      g.beginPath(); g.moveTo(x, head); g.lineTo(x + 5 * dpr, head - 5 * dpr); g.lineTo(x - 5 * dpr, head - 5 * dpr); g.fill();
    }
    // title
    const label = [clip.name, clip.beats ? `${clip.beats.bpm} BPM` : '', clip.gain ? `${clip.gain > 0 ? '+' : ''}${clip.gain} dB` : ''].filter(Boolean).join(' · ');
    if (label && x1 - x0 > 30 * dpr) {
      g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, head); g.clip();
      g.fillStyle = col.color; g.fillText(label, Math.max(x0, cx0) + 4 * dpr, head / 2);
      g.restore();
    }
    // edges, the picked clip with a frame
    g.fillStyle = col.line;
    g.fillRect(Math.round(cx0), 0, dpr, h);
    g.fillRect(Math.round(cx1) - dpr, 0, dpr, h);
    if (clip.id === active) { g.strokeStyle = col.wave; g.lineWidth = 2 * dpr; g.strokeRect(cx0 + dpr, dpr, cx1 - cx0 - 2 * dpr, h - 2 * dpr); }
  }
  tr.cache = { key, canvas };
  return canvas;
}

function draw() {
  const col = colors();
  for (const lane of lanes()) {
    const tr = trackOf(Number(lane.dataset.track));
    if (!tr) continue;
    const dpr = sizeCanvas(lane);
    waveform(tr, lane.width, lane.height, dpr, col);
  }
  drawOverlays();
  updateClock();
}

// ---- volume automation: per track [{ t (s), db }], linear in dB between the points, constant before the first and after the last

const ENV_TOP = 6, ENV_BOTTOM = -40; // dB at the top and bottom of the lane

function envelopeDb(tr, sec) {
  const p = tr.envelope;
  if (!p || !p.length) return 0;
  if (sec <= p[0].t) return p[0].db;
  if (sec >= p[p.length - 1].t) return p[p.length - 1].db;
  let i = 1;
  while (p[i].t < sec) i++;
  const a = p[i - 1], b = p[i];
  return a.db + ((b.db - a.db) * (sec - a.t)) / Math.max(1e-9, b.t - a.t);
}
const envelopeGain = (tr, sec) => (envelopeDb(tr, sec) <= ENV_BOTTOM ? 0 : dsp.dbToGain(envelopeDb(tr, sec)));

/** Audio of a track from sample `from` with its volume automation applied. */
function withEnvelope(tr, audio, from) {
  if (!tr.envelope || !tr.envelope.length) return audio;
  const n = dsp.length(audio);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i += 64) { const v = envelopeGain(tr, (from + i) / state.rate); g.fill(v, i, Math.min(n, i + 64)); }
  return { ...audio, channels: audio.channels.map((c) => c.map((v, i) => v * g[i])) };
}

const envY = (db, h) => ((ENV_TOP - Math.max(ENV_BOTTOM, Math.min(ENV_TOP, db))) / (ENV_TOP - ENV_BOTTOM)) * h;
const envDb = (y, h) => Math.round((ENV_TOP - (y / h) * (ENV_TOP - ENV_BOTTOM)) * 2) / 2;

function drawEnvelope(g, tr, w, h, dpr, col) {
  const editing = state.envelopeTrack === tr.id;
  if (!editing && !(tr.envelope && tr.envelope.length)) return;
  const x = (s) => (s - state.view.start) * state.view.pps * dpr;
  g.save();
  g.strokeStyle = '#ef6c00';
  g.lineWidth = 2 * dpr;
  g.beginPath();
  for (let px = 0; px <= w; px += 4 * dpr) { const s = state.view.start + px / dpr / state.view.pps; const y = envY(envelopeDb(tr, s), h); if (px) g.lineTo(px, y); else g.moveTo(px, y); }
  g.stroke();
  if (editing) {
    for (const p of tr.envelope || []) { g.beginPath(); g.arc(x(p.t), envY(p.db, h), 5 * dpr, 0, Math.PI * 2); g.fillStyle = col.bg; g.fill(); g.stroke(); }
    g.fillStyle = '#ef6c00';
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.fillText(`+${ENV_TOP} dB`, 4 * dpr, 12 * dpr);
    g.fillText(`${ENV_BOTTOM} dB`, 4 * dpr, h - 4 * dpr);
  }
  g.restore();
}

/** Edit the envelope: click adds a point (or picks one), drag moves it, double-click removes it. */
function envelopeDown(e, tr) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const pts = (tr.envelope || []).slice();
  const reach = e.pointerType === 'touch' ? 16 : 8;
  let i = pts.findIndex((p) => Math.abs((p.t - state.view.start) * state.view.pps - px) <= reach && Math.abs(envY(p.db, r.height) - py) <= reach);
  const before = snapshot();
  if (i < 0) {
    pts.push({ t: Math.max(0, timeAt(e, el)), db: envDb(py, r.height) });
    pts.sort((a, b) => a.t - b.t);
    i = pts.findIndex((p) => p.t === Math.max(0, timeAt(e, el)));
  }
  tr.envelope = pts;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const q = tr.envelope.slice();
    const lo = i > 0 ? q[i - 1].t + 0.001 : 0, hi = i < q.length - 1 ? q[i + 1].t - 0.001 : Infinity;
    q[i] = { t: Math.max(lo, Math.min(hi, timeAt(ev, el))), db: envDb(Math.max(0, Math.min(r.height, ev.clientY - r.top)), r.height) };
    tr.envelope = q;
    drawOverlays();
  };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); remember(before); setDirty(); render(); };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  drawOverlays();
}

function drawOverlays() {
  const col = colors();
  for (const lane of lanes()) {
    const tr = trackOf(Number(lane.dataset.track));
    if (!tr || !tr.cache) continue;
    const dpr = window.devicePixelRatio || 1;
    const g = lane.getContext('2d');
    g.drawImage(tr.cache.canvas, 0, 0);
    const x = (s) => (s - state.view.start) * state.view.pps * dpr;
    const a = Math.min(state.sel.start, state.sel.end), b = Math.max(state.sel.start, state.sel.end);
    const selected = state.selTracks.size === 0 || state.selTracks.has(tr.id);
    if (selected && b > a) { g.fillStyle = col.sel; g.fillRect(x(a), 0, x(b) - x(a), lane.height); }
    if (selected) { g.fillStyle = col.text; g.fillRect(Math.round(x(state.sel.start)), 0, dpr, lane.height); }
    if (state.snapLine != null) { g.fillStyle = col.cue; g.fillRect(Math.round(x(state.snapLine)), 0, 2 * dpr, lane.height); }
    drawEnvelope(g, tr, lane.width, lane.height, dpr, col);
    g.fillStyle = '#e53935';
    g.fillRect(Math.round(x(state.playhead)), 0, Math.max(1, dpr * 1.5), lane.height);
  }
  drawRuler(col);
  drawLabels(col);
}

function drawRuler(col = colors()) {
  const c = document.querySelector('[data-testid=ruler]');
  if (!c) return;
  const dpr = sizeCanvas(c);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const pps = state.view.pps;
  const steps = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s * pps >= 70) || 600;
  g.fillStyle = col.text;
  g.font = `${11 * dpr}px system-ui, sans-serif`;
  const first = Math.floor(state.view.start / step) * step;
  for (let s = first; (s - state.view.start) * pps < c.clientWidth; s += step) {
    const x = (s - state.view.start) * pps * dpr;
    g.fillRect(Math.round(x), c.height * 0.55, dpr, c.height * 0.45);
    const label = step < 1 ? fmtTime(s).replace(/0+$/, '').replace(/\.$/, '') : fmtTime(s).replace(/\.000$/, '');
    g.fillText(label, x + 3 * dpr, c.height * 0.5);
  }
  const a = Math.min(state.sel.start, state.sel.end), b = Math.max(state.sel.start, state.sel.end);
  if (b > a) { g.fillStyle = col.sel; g.fillRect((a - state.view.start) * pps * dpr, 0, (b - a) * pps * dpr, c.height); }
  g.fillStyle = '#e53935';
  g.fillRect(Math.round((state.playhead - state.view.start) * pps * dpr), 0, Math.max(1, dpr * 1.5), c.height);
}

function updateClock() {
  const el = document.querySelector('[data-testid=clock]');
  if (el) el.textContent = fmtTime(currentTime());
  const sb = document.querySelector('[data-testid=hscroll]');
  if (sb && !sb.dragging) {
    const target = state.view.start * state.view.pps;
    if (Math.abs(sb.scrollLeft - target) > 1) { sb.ignore = true; sb.scrollLeft = target; }
  }
}

function fitView() {
  const w = laneWidth() || Math.max(200, window.innerWidth - HEADER() - 20);
  const d = projectDuration();
  state.view = { start: 0, pps: d > 0 ? Math.max(0.5, w / d * 0.98) : 100 };
}

function zoom(factor, around = null) {
  const w = laneWidth();
  const center = around ?? (state.playing ? currentTime() : state.sel.start >= state.view.start && state.sel.start <= state.view.start + w / state.view.pps ? state.sel.start : state.view.start + w / state.view.pps / 2);
  const pps = Math.min(state.rate * 4, Math.max(0.2, state.view.pps * factor));
  const rel = (center - state.view.start) * state.view.pps;
  state.view = { pps, start: Math.max(0, center - rel / pps) };
  render();
}

// ---- pointer interaction ------------------------------------------------------------------------------------------------------------------

function timeAt(e, el) { const r = el.getBoundingClientRect(); return Math.max(0, state.view.start + (e.clientX - r.left) / state.view.pps); }
const laneIndexAt = (y) => lanes().findIndex((l) => { const r = l.getBoundingClientRect(); return y >= r.top && y < r.bottom; });

function laneDown(e, tr) {
  if (e.button > 0) return;
  e.preventDefault();
  const el = e.currentTarget;
  const t0 = timeAt(e, el);
  if (state.envelopeTrack === tr.id) { envelopeDown(e, tr); return; }
  const handle = fadeHandleAt(e, tr);
  if (handle) { fadeDown(e, tr, handle); return; }
  const clip = clips.clipAt(tr.clips, toSample(t0));
  if (clip && (e.clientY - el.getBoundingClientRect().top < CLIP_HEAD() || e.altKey)) { clipDown(e, tr, clip); return; }
  el.setPointerCapture(e.pointerId);
  const ids = state.tracks.map((x) => x.id);
  const anchorIndex = ids.indexOf(tr.id);
  const targetsList = state.snap ? snapTargets(null, false) : null;
  const snapped = (ev, sec) => (targetsList && !ev.shiftKey ? snapTime(sec, targetsList) : sec);
  state.clip = null;
  if (e.shiftKey) state.sel.end = t0; else { const s = snapped(e, t0); state.sel = { start: s, end: s }; }
  if (e.ctrlKey || e.metaKey) { if (state.selTracks.has(tr.id)) state.selTracks.delete(tr.id); else state.selTracks.add(tr.id); } else if (!e.shiftKey) state.selTracks = new Set([tr.id]);
  if (!state.playing) state.playhead = Math.min(state.sel.start, state.sel.end);
  const move = (ev) => {
    state.sel.end = snapped(ev, timeAt(ev, el));
    const under = laneIndexAt(ev.clientY);
    if (under >= 0 && !(e.ctrlKey || e.metaKey)) state.selTracks = new Set(ids.slice(Math.min(anchorIndex, under), Math.max(anchorIndex, under) + 1));
    // scroll while dragging beyond the edges
    const r = el.getBoundingClientRect();
    if (ev.clientX > r.right) state.view.start += 20 / state.view.pps; else if (ev.clientX < r.left) state.view.start = Math.max(0, state.view.start - 20 / state.view.pps);
    drawOverlays();
    Suite.shell.refresh();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    state.snapLine = null;
    if (state.sel.end < state.sel.start) state.sel = { start: state.sel.end, end: state.sel.start };
    if (!state.playing) state.playhead = state.sel.start;
    render();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  render();
}

/** Drag a clip by its title bar: in time and to other tracks, snapping its edges, beats and cues to the others. */
function clipDown(e, tr, clip) {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  stop();
  const before = snapshot();
  const targetsList = snapTargets(clip.id, false);
  let current = tr, moved = false;
  pickClip(tr, clip);
  const move = (ev) => {
    const dx = ev.clientX - e.clientX;
    const under = laneIndexAt(ev.clientY);
    const target = under >= 0 ? state.tracks[under] : current;
    if (!moved && Math.abs(dx) < 4 && target === tr) return;
    moved = true;
    let offset = clip.offset + Math.round((dx / state.view.pps) * state.rate);
    offset = state.snap && !ev.shiftKey ? snapClip(clip, Math.max(0, offset), targetsList) : Math.max(0, offset);
    if (state.snap && ev.shiftKey) state.snapLine = null;
    const live = { ...clip, offset };
    if (target !== current) setClips(current, current.clips.filter((c) => c.id !== clip.id));
    setClips(target, [...target.clips.filter((c) => c.id !== clip.id), live]);
    current = target;
    pickClip(target, live);
    draw();
    Suite.shell.refresh();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    state.snapLine = null;
    if (moved) { remember(before); setDirty(); }
    render();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  render();
}

/** Remove the envelope point under the pointer (double-click in automation mode). */
function envelopeRemove(e, tr) {
  const r = e.currentTarget.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const i = (tr.envelope || []).findIndex((p) => Math.abs((p.t - state.view.start) * state.view.pps - px) <= 10 && Math.abs(envY(p.db, r.height) - py) <= 10);
  if (i < 0) return;
  const before = snapshot();
  // the first click of the double-click may have added a point at the same place: remove that one too
  tr.envelope = tr.envelope.filter((p, j) => j !== i && !(Math.abs((p.t - state.view.start) * state.view.pps - px) <= 2 && Math.abs(envY(p.db, r.height) - py) <= 2));
  remember(before);
  setDirty();
  render();
}

function laneDblClick(e, tr) {
  if (state.envelopeTrack === tr.id) { envelopeRemove(e, tr); return; }
  const clip = clips.clipAt(tr.clips, toSample(timeAt(e, e.currentTarget)));
  if (clip) pickClip(tr, clip); else { state.sel = { start: 0, end: clips.trackEnd(tr.clips) / state.rate }; state.selTracks = new Set([tr.id]); }
  render();
}

function wheel(e) {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.25 : 0.8, timeAt(e, e.currentTarget)); return; }
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
  if (!d) return;
  e.preventDefault();
  state.view.start = Math.max(0, state.view.start + d / state.view.pps);
  render();
}

function rulerDown(e) {
  const tm = timeAt(e, e.currentTarget);
  state.sel = { start: tm, end: tm };
  if (state.playing) play(tm); else { state.playhead = tm; render(); }
}

// ---- UI ------------------------------------------------------------------------------------------------------------------------------------

const CLIP_MENU = ['split', 'duplicateClip', 'removeClip', 'moveTo', '-', 'clipGain', 'crossfade', 'removeFades', '-', 'detectBeats', 'beatGrid', 'beatAtCursor', 'matchTempo', '-', 'detectCues', 'addCue', 'clearMarkers'];

function Menu() {
  const m = state.menu;
  if (!m) return null;
  const items = m.kind === 'effects' ? Object.keys(EFFECTS).map((k) => [k, () => effect(k)])
    : m.kind === 'generate' ? Object.keys(GENERATORS).map((k) => [k, () => generator(k)])
      : m.kind === 'clip' ? CLIP_MENU.map((k) => [k, () => clipAction(k)])
        : [['newTrack', () => trackAction('new')], ['mixdown', () => trackAction('mixdown')], ['selectAll', () => { state.menu = null; selectAll(); }],
          ['-'], ['addLabel', () => { state.menu = null; addLabel(); }], ['importLabels', importLabels], ['exportLabels', exportLabels]];
  return html`<ul class="ae-menu" data-testid="menu" style=${`left:${m.x}px;top:${m.y}px`} onPointerDown=${(e) => e.stopPropagation()}>
    ${items.map(([k, fn]) => (k === '-' ? html`<li><hr /></li>` : html`<li><button class="secondary outline" data-testid=${`menu-${k}`} disabled=${state.busy} onClick=${fn}>${t(`ae.${k}`)}</button></li>`))}</ul>`;
}

function openMenu(e, kind) {
  e.stopPropagation();
  if (state.menu && state.menu.kind === kind) { state.menu = null; render(); return; }
  const r = e.currentTarget.getBoundingClientRect();
  state.menu = { kind, x: Math.max(4, Math.min(r.left, window.innerWidth - 250)), y: r.bottom + 2 };
  render();
}
document.addEventListener('pointerdown', () => { if (state.menu) { state.menu = null; render(); } });

function Toolbar() {
  const any = state.tracks.length > 0;
  const sel = hasRange();
  return html`<nav class="ae-toolbar" role="toolbar">
    <button class="secondary" data-testid="open" onClick=${open} aria-busy=${state.busy}>${t('ae.open')}</button>
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => addFiles([p], true)} />
    <button class="secondary outline" data-testid="import" onClick=${importFiles}>${t('ae.import')}</button>
    <button class=${state.dirty ? '' : 'secondary outline'} data-testid="save" disabled=${!any} onClick=${() => save()}>${t('ae.save')}</button>
    <button class="secondary outline" data-testid="export" disabled=${!any || state.busy} onClick=${openExport}>${t('ae.export')}</button>
    <span class="ae-sep"></span>
    <button class="secondary outline" title=${t('ae.undo')} data-testid="undo" disabled=${!state.history.length} onClick=${undo}>↶</button>
    <button class="secondary outline" title=${t('ae.redo')} data-testid="redo" disabled=${!state.future.length} onClick=${redo}>↷</button>
    <button class="secondary outline" title=${t('ae.cut')} data-testid="cut" disabled=${!sel} onClick=${cut}>✂</button>
    <button class="secondary outline" title=${t('ae.copy')} data-testid="copy" disabled=${!sel} onClick=${copy}>⧉</button>
    <button class="secondary outline" title=${t('ae.paste')} data-testid="paste" disabled=${!state.clipboard} onClick=${paste}>📋</button>
    <button class="secondary outline" title=${t('ae.delete')} data-testid="delete" disabled=${!sel} onClick=${deleteRange}>⌫</button>
    <button class="secondary outline" title=${t('ae.trim')} data-testid="trim" disabled=${!sel} onClick=${trim}>⊐⊏</button>
    <button class="secondary outline" title=${t('ae.silence')} data-testid="silence" disabled=${!sel} onClick=${() => edit((tr) => mapClips(tr.clips, ...range(), (a, f, to) => dsp.silenceRange(a, f, to)))}>∅</button>
    <button class="secondary outline" title=${t('ae.split')} data-testid="split" disabled=${!any} onClick=${split}>⫶</button>
    <button class="secondary outline" data-testid="clip-menu" disabled=${!any} onClick=${(e) => openMenu(e, 'clip')}>${t('ae.clip')} ▾</button>
    <button class="secondary outline" data-testid="effects" disabled=${!any} onClick=${(e) => openMenu(e, 'effects')}>${t('ae.effects')} ▾</button>
    <button class="secondary outline" data-testid="generate" onClick=${(e) => openMenu(e, 'generate')}>${t('ae.generate')} ▾</button>
    <button class="secondary outline" data-testid="tracks-menu" onClick=${(e) => openMenu(e, 'tracks')}>${t('ae.tracks')} ▾</button>
  </nav>`;
}

function Transport() {
  const [a, b] = range();
  const rec = state.recording;
  // the inputs show the selection unless the user is typing in them
  const show = (samples) => (el) => { if (el && document.activeElement !== el) el.value = fmtTime(samples / state.rate); };
  const setSel = (k) => (e) => { const v = parseTime(e.target.value); if (v != null) { state.sel[k] = Math.max(0, v); if (k === 'start' && state.sel.end < v) state.sel.end = v; if (!state.playing) state.playhead = state.sel.start; render(); } };
  return html`<div class="ae-transport" data-testid="transport">
    <button class="secondary outline" title=${t('ae.start')} data-testid="to-start" onClick=${() => { state.playhead = 0; state.sel = { start: 0, end: 0 }; state.view.start = 0; if (state.playing) play(0); else render(); }}>⏮</button>
    ${state.playing ? html`<button title=${t('ae.pause')} data-testid="pause" onClick=${pause}>⏸</button>`
      : html`<button title=${t('ae.play')} data-testid="play" disabled=${!state.tracks.length} onClick=${() => play()}>▶</button>`}
    <button class="secondary outline" title=${t('ae.stop')} data-testid="stop" onClick=${() => { stop(); if (state.recording) state.recording.recorder.stop(); }}>⏹</button>
    <button class="secondary outline" title=${t('ae.end')} data-testid="to-end" onClick=${() => { state.playhead = projectDuration(); state.sel = { start: state.playhead, end: state.playhead }; render(); }}>⏭</button>
    <button class=${`secondary ${state.loop ? '' : 'outline'}`} title=${t('ae.loop')} data-testid="loop" aria-pressed=${state.loop} onClick=${() => { state.loop = !state.loop; render(); }}>🔁</button>
    <button class=${`ae-rec ${rec ? '' : 'outline'}`} title=${rec ? t('ae.stopRecord') : t('ae.record')} data-testid="record" onClick=${record}>● ${rec ? `${Math.floor((Date.now() - rec.started) / 1000)} s` : ''}</button>
    <button class=${`secondary ${state.snap ? '' : 'outline'}`} title=${t('ae.snap')} data-testid="snap" aria-pressed=${state.snap} onClick=${() => { state.snap = !state.snap; savePrefs(); render(); }}>🧲</button>
    <span class="ae-clock" data-testid="clock">${fmtTime(currentTime())}</span>
    <label>${t('ae.selStart')}<input data-testid="sel-start" ref=${show(a)} onChange=${setSel('start')} /></label>
    <label>${t('ae.selEnd')}<input data-testid="sel-end" ref=${show(b)} onChange=${setSel('end')} /></label>
    <span class="ae-len" data-testid="sel-length">${fmtTime((b - a) / state.rate)}</span>
    <span class="ae-sep"></span>
    <button class="secondary outline" title=${t('ae.zoomOut')} data-testid="zoom-out" onClick=${() => zoom(0.5)}>−</button>
    <button class="secondary outline" title=${t('ae.zoomIn')} data-testid="zoom-in" onClick=${() => zoom(2)}>+</button>
    <button class="secondary outline" title=${t('ae.fit')} data-testid="zoom-fit" onClick=${() => { fitView(); render(); }}>⤢</button>
    <small class="ae-rate">${state.rate} Hz</small>
    ${state.progress != null ? html`<small data-testid="progress">${t('ae.encoding', Math.round(state.progress * 100))}</small>` : null}
  </div>`;
}

function TrackHeader({ tr }) {
  const sel = state.selTracks.has(tr.id);
  const set = (k, v) => { tr[k] = v; applyLevels(); setDirty(); render(); };
  const stereo = channelsOf(tr) > 1;
  return html`<div class=${`ae-head ${sel ? 'selected' : ''}`} data-testid="track-head"
      onClick=${(e) => { if (e.target.closest('input, button')) return; if (e.ctrlKey || e.metaKey) { if (sel) state.selTracks.delete(tr.id); else state.selTracks.add(tr.id); } else state.selTracks = new Set([tr.id]); render(); }}>
    <div class="ae-head-row">
      <input class="ae-name" data-testid="track-name" defaultValue=${tr.name} key=${`n${tr.id}`} onChange=${(e) => { tr.name = e.target.value; render(); }} />
      <button class=${`secondary ${state.envelopeTrack === tr.id ? '' : 'outline'}`} title=${t('ae.envelope')} data-testid="track-envelope" aria-pressed=${state.envelopeTrack === tr.id}
        onClick=${() => { state.envelopeTrack = state.envelopeTrack === tr.id ? null : tr.id; draw(); render(); }}>⤴</button>
      <button class="secondary outline" title=${t('ae.deleteTrack')} data-testid="track-delete" onClick=${() => trackAction('delete', tr)}>×</button>
    </div>
    <div class="ae-head-row">
      <button class=${`secondary ${tr.mute ? '' : 'outline'}`} title=${t('ae.mute')} data-testid="track-mute" aria-pressed=${tr.mute} onClick=${() => set('mute', !tr.mute)}>M</button>
      <button class=${`secondary ${tr.solo ? '' : 'outline'}`} title=${t('ae.solo')} data-testid="track-solo" aria-pressed=${tr.solo} onClick=${() => set('solo', !tr.solo)}>S</button>
      <button class="secondary outline" title=${t('ae.duplicateTrack')} data-testid="track-duplicate" onClick=${() => trackAction('duplicate', tr)}>⧉</button>
      <button class="secondary outline" title=${stereo ? t('ae.makeMono') : t('ae.makeStereo')} data-testid="track-channels" onClick=${() => trackAction(stereo ? 'mono' : 'stereo', tr)}>${stereo ? '2→1' : '1→2'}</button>
      <button class=${`secondary ${tr.view === 'spectrum' ? '' : 'outline'}`} title=${t('ae.spectrum')} data-testid="track-view" aria-pressed=${tr.view === 'spectrum'}
        onClick=${() => { tr.view = tr.view === 'spectrum' ? undefined : 'spectrum'; tr.cache = null; render(); }}>≋</button>
    </div>
    <label class="ae-slider" title=${`${t('ae.gain')}: ${tr.gain.toFixed(1)} dB`}>🔊<input type="range" min="-36" max="12" step="0.5" value=${tr.gain} data-testid="track-gain" onInput=${(e) => set('gain', Number(e.target.value))} onDblClick=${() => set('gain', 0)} /></label>
    <label class="ae-slider" title=${`${t('ae.pan')}: ${tr.pan.toFixed(2)}`}>⇆<input type="range" min="-1" max="1" step="0.05" value=${tr.pan} data-testid="track-pan" onInput=${(e) => set('pan', Number(e.target.value))} onDblClick=${() => set('pan', 0)} /></label>
  </div>`;
}

function Tracks() {
  if (!state.tracks.length) return html`<div class="ae-empty" data-testid="empty"><p>${state.busy ? html`<span aria-busy="true"></span>` : t('ae.empty')}</p></div>`;
  const total = Math.max(projectDuration() * state.view.pps + 200, laneWidth() + 1);
  return html`<div class="ae-tracks">
    <div class="ae-row ae-ruler-row"><div class="ae-head ae-corner"><small class="ae-hint">${t('ae.dragHint')}</small></div><canvas class="ae-ruler" data-testid="ruler" onPointerDown=${rulerDown} onWheel=${wheel}></canvas></div>
    <div class="ae-row ae-labels-row"><div class="ae-head ae-corner"><small class="ae-hint">${t('ae.label')}</small></div><canvas class="ae-labels" data-testid="labels" title=${t('ae.addLabel')} onPointerDown=${labelsDown} onDblClick=${labelsDblClick} onWheel=${wheel}></canvas></div>
    <div class="ae-rows">${state.tracks.map((tr) => html`<div class="ae-row" key=${tr.id} data-testid="track">
      <${TrackHeader} tr=${tr} />
      <canvas class="ae-lane" data-testid="lane" data-track=${tr.id} onPointerDown=${(e) => laneDown(e, tr)} onDblClick=${(e) => laneDblClick(e, tr)} onWheel=${wheel}></canvas>
    </div>`)}</div>
    <div class="ae-row"><div class="ae-head ae-corner"></div>
      <div class="ae-hscroll" data-testid="hscroll" onScroll=${(e) => { const el = e.currentTarget; if (el.ignore) { el.ignore = false; return; } state.view.start = el.scrollLeft / state.view.pps; draw(); }}>
        <div style=${`width:${total}px;height:1px`}></div></div></div>
  </div>`;
}

function ParamDialog() {
  const d = state.dialog;
  if (!d || d.kind === 'export') return null;
  return html`<dialog open data-testid="param-dialog"><article>
    <header><strong>${d.title}</strong></header>
    <form onSubmit=${(e) => {
      e.preventDefault();
      const v = {};
      for (const f of d.fields) { const el = e.target.elements[f.key]; v[f.key] = f.options || f.text ? el.value : Number(el.value); }
      state.dialog = null;
      render();
      d.run(v);
    }}>
      ${d.fields.map((f) => html`<label>${t(f.label)}${f.text ? html`<input name=${f.key} data-testid=${`param-${f.key}`} defaultValue=${f.value} />` : f.options
        ? html`<select name=${f.key} data-testid=${`param-${f.key}`}>${f.options.map((o) => html`<option value=${o} selected=${o === f.value}>${t(`ae.${o}`)}</option>`)}</select>`
        : html`<input type="number" name=${f.key} data-testid=${`param-${f.key}`} defaultValue=${f.value} step="any" min=${f.min} max=${f.max} required />`}</label>`)}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ae.cancel')}</button><button type="submit" data-testid="param-ok">${t('ae.ok')}</button></footer>
    </form>
  </article></dialog>`;
}

function ExportDialog() {
  const d = state.dialog;
  if (!d || d.kind !== 'export') return null;
  const lossy = ['mp3', 'ogg', 'm4a'].includes(d.format);
  const bitrates = { mp3: [128, 192, 256, 320], ogg: [64, 96, 128, 160, 192, 256], m4a: [96, 128, 192, 256, 320] }[d.format] || [];
  const defaultRate = { mp3: 192, ogg: 128, m4a: 192 }[d.format];
  return html`<dialog open data-testid="export-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); runExport(d); }}>
      <label>${t('ae.fileName')}<input data-testid="export-name" defaultValue=${d.stem} onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('ae.format')}<select data-testid="export-format" onChange=${(e) => { d.format = e.target.value; d.bitrate = null; render(); }}>
        ${[16, 24, 32].map((b) => html`<option value=${`wav${b}`} selected=${d.format === `wav${b}`}>${t(`ae.wav${b}`)}</option>`)}
        ${COMPRESSED.map((f) => {
          const ok = d.available && d.available.includes(f);
          return html`<option value=${f} disabled=${!ok} selected=${d.format === f}>${d.available && !ok ? t('ae.unsupported', t(`ae.${f}`)) : t(`ae.${f}`)}</option>`;
        })}
        <option value="project" selected=${d.format === 'project'}>${t('ae.project')}</option></select></label>
      ${d.format === 'project' ? html`<small data-testid="project-hint">${t('ae.projectHint')}</small>` : null}
      ${lossy ? html`<label>${t('ae.bitrate')}<select data-testid="export-bitrate" onChange=${(e) => { d.bitrate = Number(e.target.value); }}>
        ${bitrates.map((r) => html`<option value=${r} selected=${(d.bitrate || defaultRate) === r}>${r}</option>`)}</select></label>` : null}
      ${d.format === 'project' ? null : html`<label>${t('ae.channels')}<select data-testid="export-channels" onChange=${(e) => { d.channels = e.target.value; }}>
        ${['auto', 'mono', 'stereo'].map((c) => html`<option value=${c} selected=${d.channels === c}>${t(`ae.${c}`)}</option>`)}</select></label>
      <label>${t('ae.range')}<select data-testid="export-range" disabled=${!hasRange()} onChange=${(e) => { d.selection = e.target.value === 'selection'; }}>
        <option value="all">${t('ae.all')}</option><option value="selection">${t('ae.selection')}</option></select></label>`}
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('ae.cancel')}</button><button type="submit" data-testid="export-ok">${t('ae.export')}</button></footer>
    </form>
  </article></dialog>`;
}

function Main() {
  return html`<div class="ae-layout">
    <div class="ae-name-bar"><span data-testid="file-name">${state.name}${state.dirty ? ' •' : ''}</span></div>
    <${Transport} /><${Tracks} /><${Menu} /><${ParamDialog} /><${ExportDialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, (picked) => addFiles(picked, !state.tracks.length));
new ResizeObserver(() => draw()).observe(document.body);
new MutationObserver(() => { for (const tr of state.tracks) tr.cache = null; draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) openExport(); else save(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (state.dialog || e.target.closest('input, textarea, select, [contenteditable]')) return;
  const keys = {
    ' ': () => (state.playing ? pause() : play()),
    Home: () => { state.playhead = 0; state.sel = { start: 0, end: 0 }; state.view.start = 0; render(); },
    End: () => { state.playhead = projectDuration(); state.sel = { start: state.playhead, end: state.playhead }; render(); },
    Delete: deleteRange, Backspace: deleteRange, '+': () => zoom(2), '-': () => zoom(0.5), m: addCue,
  };
  const modKeys = { a: selectAll, x: cut, c: copy, v: paste, z: () => (e.shiftKey ? redo() : undo()), y: redo, i: split, b: addLabel };
  const fn = mod ? modKeys[e.key.toLowerCase()] : keys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});

Suite.bridge.receive((picked) => addFiles([picked], true), { app: 'audioeditor' }); // files opened from other apps ("Open with…")

// for tests
window.AE = { fx: fx2, state, dsp, clips, beats, labelText, play, stop, fmtTime, parseTime, trackAudio, get time() { return currentTime(); } };
document.body.dataset.ready = 'true';
