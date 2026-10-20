/*
 * Clips of a track: [{ id, offset (sample position in the project), audio, name, beats?, cues?, gain? (dB), fadeIn?, fadeOut? (samples) }].
 * Gain and fades are applied when the clips are played or mixed (non-destructive); fades use equal-power curves, so two
 * clips that overlap by their fade lengths cross-fade without a dip in loudness. Clips are treated as
 * immutable (every function returns new arrays and new clip objects), so undo snapshots can share them. Clips may overlap;
 * overlapping parts are mixed. Range operations ripple like Audacity: deleting a range moves the later clips to the left,
 * inserting moves them to the right.
 *
 * Markers that belong to a clip move with it: beats is a constant-tempo grid { bpm, phase } (phase: sample position of a
 * beat inside the clip, may be fractional), cues is a sorted list of sample positions inside the clip.
 */
import * as dsp from '@app/dsp.js';

let nextId = 1;
export const newId = () => nextId++;

export function makeClip(audio, offset = 0, props = {}) {
  return { id: newId(), offset: Math.max(0, Math.round(offset)), audio, name: '', ...props };
}

export const clipLength = (c) => dsp.length(c.audio);

/** Gain factor of a clip at local sample k (gain and fades). */
export function envelopeAt(c, k) {
  let g = c.gain ? 10 ** (c.gain / 20) : 1;
  const n = clipLength(c);
  if (c.fadeIn > 0 && k < c.fadeIn) g *= Math.sin((Math.max(0, k) / c.fadeIn) * Math.PI / 2);
  if (c.fadeOut > 0 && k > n - c.fadeOut) g *= Math.sin((Math.max(0, n - k) / c.fadeOut) * Math.PI / 2);
  return g;
}

export const hasEnvelope = (c) => !!(c.gain || c.fadeIn > 0 || c.fadeOut > 0);

/** Fade lengths limited to the clip (and to each other). */
export function withFades(c, fadeIn, fadeOut) {
  const n = clipLength(c);
  const i = Math.max(0, Math.min(n, Math.round(fadeIn)));
  return { ...c, fadeIn: i, fadeOut: Math.max(0, Math.min(n - i, Math.round(fadeOut))) };
}
export const clipEnd = (c) => c.offset + clipLength(c);
export const trackEnd = (clips) => clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
export const channelsOf = (clips) => clips.reduce((m, c) => Math.max(m, c.audio.channels.length), 1);
export const sorted = (clips) => clips.slice().sort((a, b) => a.offset - b.offset || a.id - b.id);
export const clipAt = (clips, at) => sorted(clips).reverse().find((c) => at >= c.offset && at < clipEnd(c)) || null;

// ---- markers ---------------------------------------------------------------------------------------------------------------

export const beatPeriod = (beats, rate) => (rate * 60) / beats.bpm;

/** Beat positions inside a clip of n samples (local sample positions). */
export function beatPositions(clip, rate) {
  const b = clip.beats;
  if (!b || !(b.bpm > 0)) return [];
  const p = beatPeriod(b, rate), n = clipLength(clip);
  const out = [];
  for (let x = b.phase - Math.floor(b.phase / p) * p; x < n; x += p) out.push(x);
  return out;
}

/** Markers of a clip after the local range [from, to) was removed (and `inserted` samples put in its place). */
function markersAfterRemove(clip, from, to, inserted = 0) {
  const d = inserted - (to - from);
  const out = {};
  if (clip.cues) out.cues = clip.cues.filter((x) => x < from || x >= to).map((x) => (x >= to ? x + d : x));
  if (clip.beats) out.beats = d && from <= clip.beats.phase ? { ...clip.beats, phase: clip.beats.phase + d } : clip.beats;
  return out;
}

/** The part [from, to) of a clip (local positions) as a clip of its own at offset + from. */
function part(clip, from, to, id = newId()) {
  const c = { ...clip, id, offset: clip.offset + from, audio: dsp.slice(clip.audio, from, to) };
  // a part keeps the fade-in only if it starts where the clip starts, the fade-out only if it ends where the clip ends
  const n = clipLength(clip);
  c.fadeIn = from === 0 ? Math.min(clip.fadeIn || 0, to - from) : 0;
  c.fadeOut = to === n ? Math.min(clip.fadeOut || 0, to - from) : 0;
  if (clip.cues) c.cues = clip.cues.filter((x) => x >= from && x < to).map((x) => x - from);
  if (clip.beats) c.beats = { ...clip.beats, phase: clip.beats.phase - from };
  return c;
}

// ---- range operations (positions in samples) --------------------------------------------------------------------------

/** Split every clip that crosses `at` into two clips. */
export function splitAt(clips, at) {
  return clips.flatMap((c) => (at > c.offset && at < clipEnd(c) ? [part(c, 0, at - c.offset, c.id), part(c, at - c.offset, clipLength(c))] : [c]));
}

/** Remove [a, b) and move everything after it to the left. */
export function removeRange(clips, a, b) {
  if (b <= a) return clips;
  const n = b - a;
  const out = [];
  for (const c of clips) {
    const s = c.offset, e = clipEnd(c);
    if (e <= a) out.push(c);
    else if (s >= b) out.push({ ...c, offset: s - n });
    else {
      const from = Math.max(a, s) - s, to = Math.min(b, e) - s;
      if (to - from >= e - s) continue; // completely inside
      const cut = { ...c, offset: Math.min(s, a), audio: dsp.remove(c.audio, from, to), ...markersAfterRemove(c, from, to) };
      out.push(hasEnvelope(cut) ? withFades(cut, cut.fadeIn || 0, cut.fadeOut || 0) : cut);
    }
  }
  return out;
}

/** The clips inside [a, b), moved so that the range starts at 0 (for the clipboard and for trimming). */
export function sliceRange(clips, a, b) {
  const out = [];
  for (const c of clips) {
    const s = c.offset, e = clipEnd(c);
    if (e <= a || s >= b) continue;
    const p = part(c, Math.max(a, s) - s, Math.min(b, e) - s);
    p.offset -= a;
    out.push(p);
  }
  return out;
}

/** Make room: split at `at` and move the clips from `at` on to the right by n samples. */
export function insertGap(clips, at, n) {
  if (n <= 0) return clips;
  return splitAt(clips, at).map((c) => (c.offset >= at ? { ...c, offset: c.offset + n } : c));
}

/** Insert the clips `part` (positions relative to 0, `n` samples long) at `at`. */
export function insertClips(clips, at, part, n) {
  return [...insertGap(clips, at, n), ...part.map((c) => ({ ...c, id: newId(), offset: c.offset + at }))];
}

/** Replace [a, b) by `part` (n samples long). */
export function replaceRange(clips, a, b, part, n) { return insertClips(removeRange(clips, a, b), a, part, n); }

/**
 * Process [a, b) of every clip it touches without changing lengths: fn(audio, localFrom, localTo, clip) returns the new
 * audio of the clip (same length).
 */
export function mapRange(clips, a, b, fn) {
  return clips.map((c) => {
    const s = c.offset, e = clipEnd(c);
    if (e <= a || s >= b) return c;
    return { ...c, audio: fn(c.audio, Math.max(a, s) - s, Math.min(b, e) - s, c) };
  });
}

/** Mix the clips into one audio of [from, to) with `channels` channels (gaps are silence). */
export function flatten(clips, rate, from = 0, to = trackEnd(clips), channels = channelsOf(clips)) {
  const out = dsp.silence(rate, channels, Math.max(0, to - from));
  for (const c of clips) {
    const s = Math.max(from, c.offset), e = Math.min(to, clipEnd(c));
    if (e <= s) continue;
    const src = dsp.matchChannels(c.audio, channels);
    const o = s - c.offset;
    if (hasEnvelope(c)) {
      const env = new Float32Array(e - s);
      for (let k = 0; k < env.length; k++) env[k] = envelopeAt(c, o + k);
      src.channels.forEach((ch, i) => { const dst = out.channels[i]; for (let k = 0; k < e - s; k++) dst[s - from + k] += ch[o + k] * env[k]; });
    } else src.channels.forEach((ch, i) => { const dst = out.channels[i]; for (let k = 0; k < e - s; k++) dst[s - from + k] += ch[o + k]; });
  }
  return out;
}

/**
 * Process [a, b) as one piece that may change its length: the clips inside are mixed into one new clip
 * (fn(audio) returns the new audio), the clips after b move by the change of length. Returns the new clips and the new
 * length of the range.
 */
export async function mergeRange(clips, a, b, rate, fn) {
  if (b <= a) return { clips, length: 0 };
  const split = splitAt(splitAt(clips, a), b);
  const inside = split.filter((c) => c.offset >= a && clipEnd(c) <= b);
  if (!inside.length) return { clips, length: b - a };
  const result = await fn(flatten(inside, rate, a, b));
  const n = dsp.length(result);
  const rest = split.filter((c) => !inside.includes(c)).map((c) => (c.offset >= b ? { ...c, offset: c.offset + n - (b - a) } : c));
  return { clips: [...rest, makeClip(result, a, { name: inside[0].name })], length: n };
}

/** Move a clip to a new position (it keeps its id). */
export const moveClip = (clips, id, offset) => clips.map((c) => (c.id === id ? { ...c, offset: Math.max(0, Math.round(offset)) } : c));
