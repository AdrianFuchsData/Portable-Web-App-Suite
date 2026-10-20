/*
 * Audio project files (.audioproj): a ZIP with project.json (sample rate, tracks with their settings, clips with position,
 * name, beat grid and cues) and the audio of every clip as a 32-bit float WAV (lossless; clips that share their audio,
 * e.g. duplicates, share the file).
 *
 *   project.json: { "format": "suite-audio-project", "version": 1, "rate": 44100,
 *                   "tracks": [{ "name", "gain", "pan", "mute", "solo",
 *                                "clips": [{ "name", "offset" (samples), "audio": "audio/1.wav", "beats"?, "cues"?, "gain"? (dB), "fadeIn"?, "fadeOut"? (samples) }] }],
 *                   "labels"?: [{ "start", "end", "text" }] (seconds) }
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as dsp from '@app/dsp.js';

export const EXTENSION = '.audioproj';
export const FORMAT = 'suite-audio-project';

/** True for a project file (by name or content). */
export function isProject(name, bytes) {
  if (new RegExp(`\\${EXTENSION}$`, 'i').test(name || '')) return true;
  if (!bytes || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  try { return !!unzipSync(bytes, { filter: (f) => f.name === 'project.json' })['project.json']; } catch (e) { return false; }
}

/** Encode { rate, tracks: [{ name, gain, pan, mute, solo, clips: [{ name, offset, audio, beats, cues }] }] }. */
export function encode({ rate, tracks, labels = [] }) {
  const files = {};
  const paths = new Map(); // audio object -> path
  const json = {
    format: FORMAT, version: 1, rate,
    tracks: tracks.map((tr) => ({
      name: tr.name, gain: tr.gain, pan: tr.pan, mute: !!tr.mute, solo: !!tr.solo, ...(tr.view ? { view: tr.view } : {}),
      ...(tr.envelope && tr.envelope.length ? { envelope: tr.envelope.map((p) => ({ t: p.t, db: p.db })) } : {}),
      clips: tr.clips.map((c) => {
        if (!paths.has(c.audio)) {
          const path = `audio/${paths.size + 1}.wav`;
          paths.set(c.audio, path);
          files[path] = [dsp.encodeWav(c.audio, 32), { level: 0 }];
        }
        const out = { name: c.name || '', offset: c.offset, audio: paths.get(c.audio) };
        if (c.beats) out.beats = { bpm: c.beats.bpm, phase: c.beats.phase };
        if (c.cues && c.cues.length) out.cues = [...c.cues];
        if (c.gain) out.gain = c.gain;
        if (c.fadeIn) out.fadeIn = c.fadeIn;
        if (c.fadeOut) out.fadeOut = c.fadeOut;
        return out;
      }),
    })),
  };
  if (labels.length) json.labels = labels.map((l) => ({ start: l.start, end: l.end, text: l.text || '' }));
  files['project.json'] = [strToU8(JSON.stringify(json, null, 1)), { level: 6 }];
  return zipSync(files);
}

/** Decode a project file; audio is { rate, channels } as read from the WAV files. */
export function decode(bytes) {
  const files = unzipSync(bytes);
  if (!files['project.json']) throw new Error('project.json is missing');
  const json = JSON.parse(strFromU8(files['project.json']));
  if (json.format !== FORMAT) throw new Error('not an audio project');
  const audio = new Map();
  const load = (path) => {
    if (!audio.has(path)) {
      if (!files[path]) throw new Error(`${path} is missing`);
      const a = dsp.decodeWav(files[path]);
      if (!a) throw new Error(`${path} is not a WAV file`);
      audio.set(path, { rate: a.rate, channels: a.channels });
    }
    return audio.get(path);
  };
  return {
    rate: json.rate,
    tracks: (json.tracks || []).map((tr) => ({
      name: tr.name, gain: +tr.gain || 0, pan: +tr.pan || 0, mute: !!tr.mute, solo: !!tr.solo, view: tr.view === 'spectrum' ? 'spectrum' : undefined,
      envelope: Array.isArray(tr.envelope) ? tr.envelope.filter((p) => Number.isFinite(+p.t) && Number.isFinite(+p.db)).map((p) => ({ t: +p.t, db: +p.db })).sort((a, b) => a.t - b.t) : undefined,
      clips: (tr.clips || []).map((c) => ({ name: c.name || '', offset: Math.max(0, Math.round(+c.offset || 0)), audio: load(c.audio), beats: c.beats || undefined, cues: c.cues || undefined,
        gain: +c.gain || 0, fadeIn: Math.max(0, Math.round(+c.fadeIn || 0)), fadeOut: Math.max(0, Math.round(+c.fadeOut || 0)) })),
    })),
    labels: (json.labels || []).filter((l) => Number.isFinite(+l.start)).map((l) => ({ start: +l.start, end: Math.max(+l.start, +l.end || +l.start), text: String(l.text || '') })),
  };
}
