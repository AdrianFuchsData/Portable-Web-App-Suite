/*
 * Timeline model of the video editor (pure functions on plain objects, so that undo can keep snapshots).
 *
 * project: { width, height, fps, background, tracks: [{ id, kind: 'video'|'audio', name, mute, hidden }], clips: [clip], markers?: [{ id, t, text }] }
 * Video tracks are listed top to bottom (the first one is drawn on top).
 * clip: { id, track, kind: 'video'|'image'|'audio'|'text', source (id or null), start, in, out, volume, fadeIn, fadeOut,
 *         transitionIn, transitionOut (how a visual clip appears/disappears during its fades: see TRANSITIONS),
 *         brightness, contrast, saturation (%; 100 = unchanged), hue (°), grayscale, sepia (%), invert, blur (px) (picture effects),
 *         key: { on, color, tolerance, softness, spill } (chroma key), rotation (degrees), crop: { left, right, top, bottom } (fractions),
 *         endScale, endX, endY (Ken Burns: scale and offset at the end of the clip, interpolated from scale/x/y; null = same),
 *         speed (playback rate of video/audio clips, 1 = normal), reverse (play the source backwards),
 *         x, y, scale, opacity, text: { content, size, color, background, valign } }
 * Times are seconds; a clip covers [start, start + (out - in) / speed) on the timeline and [in, out) of its source.
 */

export const MIN_LENGTH = 0.04;
let counter = 0;
export const newId = (prefix = 'c') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newProject() {
  return {
    width: 1280, height: 720, fps: 30, background: '#000000',
    tracks: [
      { id: 'v2', kind: 'video', name: 'V2', mute: false, hidden: false },
      { id: 'v1', kind: 'video', name: 'V1', mute: false, hidden: false },
      { id: 'a1', kind: 'audio', name: 'A1', mute: false, hidden: false },
    ],
    clips: [],
  };
}

export const MIN_SPEED = 0.1, MAX_SPEED = 10;
export const speedOf = (c) => c.speed || 1;
export const length = (c) => (c.out - c.in) / speedOf(c);
/** Source time shown at timeline time t (forwards from `in`, or backwards from `out` for reversed clips). */
export const sourceTime = (c, t) => (c.reverse ? c.out - (t - c.start) * speedOf(c) : c.in + (t - c.start) * speedOf(c));
/** The part of a clip that covers timeline time [a, b) (same id); keyframes are moved along (with keys at the new edges). */
export function subClip(c, a, b) {
  const s = speedOf(c);
  const part = c.reverse ? { ...c, start: a, out: c.out - (a - c.start) * s, in: c.out - (b - c.start) * s } : { ...c, start: a, in: c.in + (a - c.start) * s, out: c.in + (b - c.start) * s };
  if (c.keys) {
    const shift = a - c.start, len = b - a;
    part.keys = {};
    for (const [prop, list] of Object.entries(c.keys)) {
      if (!list || !list.length) continue;
      const inside = list.filter((k) => k.t > shift + 1e-6 && k.t < shift + len - 1e-6).map((k) => ({ t: k.t - shift, v: k.v }));
      part.keys[prop] = [{ t: 0, v: keyAt(list, shift) }, ...inside, { t: len, v: keyAt(list, shift + len) }];
    }
  }
  return part;
}

// ---- keyframes: clip.keys = { x | y | scale | opacity | rotation: [{ t (s from the clip start), v }] }, linear in between ------

export const KEYED = ['x', 'y', 'scale', 'opacity', 'rotation'];

/** The value of a key list at local time t (constant before the first and after the last key). */
export function keyAt(list, t) {
  if (t <= list[0].t) return list[0].v;
  const last = list[list.length - 1];
  if (t >= last.t) return last.v;
  let i = 1;
  while (list[i].t < t) i++;
  const a = list[i - 1], b = list[i];
  return a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1e-9, b.t - a.t);
}

/** A property of a clip at timeline time t: from its keyframes if it has any, otherwise its value (or `fallback`). */
export function valueAt(c, prop, t, fallback) {
  const list = c.keys && c.keys[prop];
  if (list && list.length && t != null) return keyAt(list, Math.max(0, t - c.start));
  return c[prop] ?? fallback;
}

/** Set (or replace) a key of a property at local time `local` (seconds from the clip start). */
export function setKey(p, id, prop, local, value) {
  return { ...p, clips: p.clips.map((c) => {
    if (c.id !== id) return c;
    const list = ((c.keys && c.keys[prop]) || []).filter((k) => Math.abs(k.t - local) > 1e-3);
    list.push({ t: Math.round(local * 1000) / 1000, v: value });
    list.sort((x, y) => x.t - y.t);
    return { ...c, keys: { ...(c.keys || {}), [prop]: list } };
  }) };
}

/** Remove the key of a property at local time (within one frame); without keys left the property is static again (its value there). */
export function removeKey(p, id, prop, local, tolerance = 0.02) {
  return { ...p, clips: p.clips.map((c) => {
    if (c.id !== id || !c.keys || !c.keys[prop]) return c;
    const old = c.keys[prop];
    const list = old.filter((k) => Math.abs(k.t - local) > tolerance);
    const keys = { ...c.keys, [prop]: list };
    if (!list.length) { delete keys[prop]; return { ...c, keys, [prop]: keyAt(old, local) }; }
    return { ...c, keys };
  }) };
}

/** The key of a property at local time (within tolerance), or null. */
export const keyNear = (c, prop, local, tolerance = 0.02) => ((c.keys && c.keys[prop]) || []).find((k) => Math.abs(k.t - local) <= tolerance) || null;
/** The longest timeline length the clip can get by moving its right edge (limited by the source). */
export const maxLength = (c, sourceDuration = Infinity) => (c.reverse ? c.out : sourceDuration - c.in) / speedOf(c);
export const end = (c) => c.start + length(c);
export const duration = (p) => Math.max(0, ...p.clips.map(end));
export const clipsOn = (p, track) => p.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start);
export const clipAt = (p, track, t) => p.clips.find((c) => c.track === track && t >= c.start - 1e-9 && t < end(c) - 1e-9) || null;
export const trackOf = (p, id) => p.tracks.find((tr) => tr.id === id);
/** Which track kind a clip kind can be placed on. */
export const trackKindFor = (kind) => (kind === 'audio' ? 'audio' : 'video');

export function makeClip(kind, { source = null, track, start = 0, sourceDuration = 5 } = {}) {
  return {
    id: newId(), track, kind, source, start, in: 0, out: kind === 'image' || kind === 'text' ? 5 : sourceDuration,
    volume: 1, fadeIn: 0, fadeOut: 0, x: 0, y: 0, scale: 1, opacity: 1,
    text: kind === 'text' ? { content: 'Title', size: 72, color: '#ffffff', background: '', valign: 'middle' } : null,
  };
}

const clone = (p) => ({ ...p, tracks: p.tracks.map((tr) => ({ ...tr })), clips: p.clips.map((c) => ({ ...c, text: c.text ? { ...c.text } : null })) });

/**
 * Remove the time range [from, to) of a track (overwrite edit): clips inside are deleted, clips over the edges are trimmed,
 * a clip covering the whole range is split. `except` is not touched.
 */
export function clearRange(p, track, from, to, except = null) {
  const out = [];
  for (const c of p.clips) {
    if (c.track !== track || c.id === except || end(c) <= from + 1e-9 || c.start >= to - 1e-9) { out.push(c); continue; }
    if (c.start < from - 1e-9) out.push(subClip(c, c.start, from));
    if (end(c) > to + 1e-9) out.push({ ...subClip(c, to, end(c)), id: c.start < from - 1e-9 ? newId() : c.id });
  }
  return { ...p, clips: out };
}

/** Add a clip with an overwrite edit. */
export function addClip(p, clip) {
  const q = clearRange(p, clip.track, clip.start, end(clip));
  return { ...q, clips: [...q.clips, clip] };
}

/** Move a clip to another start/track (overwrite edit on the target). */
export function moveClip(p, id, start, track) {
  const c = p.clips.find((x) => x.id === id);
  const moved = { ...c, start: Math.max(0, start), track: track || c.track };
  const q = clearRange({ ...p, clips: p.clips.filter((x) => x.id !== id) }, moved.track, moved.start, end(moved));
  return { ...q, clips: [...q.clips, moved] };
}

/** Trim the left or right edge of a clip to timeline time t (limited by the source and the minimum length). */
export function trimClip(p, id, edge, t, sourceDuration = Infinity) {
  const c = p.clips.find((x) => x.id === id);
  let next;
  const s = speedOf(c);
  if (edge === 'left') {
    // how far the left edge may move left: to the start of the source (or its end when reversed) and to 0 on the timeline
    let d = t - c.start;
    d = Math.max(d, (c.reverse ? c.out - sourceDuration : -c.in) / s, -c.start);
    d = Math.min(d, length(c) - MIN_LENGTH);
    next = c.reverse ? { ...c, start: c.start + d, out: c.out - d * s } : { ...c, start: c.start + d, in: c.in + d * s };
  } else {
    const len = Math.min(maxLength(c, sourceDuration), Math.max(MIN_LENGTH, t - c.start));
    next = c.reverse ? { ...c, in: c.out - len * s } : { ...c, out: c.in + len * s };
  }
  const q = clearRange({ ...p, clips: p.clips.filter((x) => x.id !== id) }, next.track, next.start, end(next));
  return { ...q, clips: [...q.clips, next] };
}

/** Split a clip at timeline time t; returns [project, id of the right part]. */
export function splitClip(p, id, t) {
  const c = p.clips.find((x) => x.id === id);
  if (!c || t <= c.start + MIN_LENGTH / 2 || t >= end(c) - MIN_LENGTH / 2) return [p, null];
  const left = { ...subClip(c, c.start, t), fadeOut: 0 };
  const right = { ...subClip(c, t, end(c)), id: newId(), fadeIn: 0, text: c.text ? { ...c.text } : null };
  return [{ ...p, clips: p.clips.map((x) => (x.id === id ? left : x)).concat(right) }, right.id];
}

export function removeClip(p, id) { return { ...p, clips: p.clips.filter((c) => c.id !== id) }; }

/** Delete a clip and close the gap: later clips of the same track move left. */
export function rippleDelete(p, id) {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  const len = length(c);
  return { ...p, clips: p.clips.filter((x) => x.id !== id).map((x) => (x.track === c.track && x.start >= end(c) - 1e-9 ? { ...x, start: x.start - len } : x)) };
}

/** Change the speed of a clip: the source range stays, the length on the timeline changes (overwrite edit on the right). */
export function setSpeed(p, id, speed) {
  const c = p.clips.find((x) => x.id === id);
  const next = { ...c, speed: Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed)) };
  const q = clearRange({ ...p, clips: p.clips.filter((x) => x.id !== id) }, next.track, next.start, end(next));
  return { ...q, clips: [...q.clips, next] };
}

export function updateClip(p, id, changes) { return { ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...changes } : c)) }; }

/** Nearest snap point (clip edges, playhead, 0) within `threshold` seconds of t, or t. */
export function snap(p, t, threshold, { except = null, extra = [] } = {}) {
  let best = t, dist = threshold;
  const points = [0, ...extra, ...(p.markers || []).map((m) => m.t)];
  for (const c of p.clips) if (c.id !== except) points.push(c.start, end(c));
  for (const x of points) { const d = Math.abs(x - t); if (d < dist) { dist = d; best = x; } }
  return best;
}

// ---- freeze frame and markers --------------------------------------------------------------------------------------------------

/** Move every clip of a track that starts at or after `at` later by `d` seconds (ripple insert). */
export function insertGap(p, track, at, d) {
  return { ...p, clips: p.clips.map((c) => (c.track === track && c.start >= at - 1e-9 ? { ...c, start: c.start + d } : c)) };
}

const VISUAL_KEYS = ['x', 'y', 'scale', 'opacity', 'rotation', 'crop', 'brightness', 'contrast', 'saturation', 'hue', 'grayscale', 'sepia', 'invert', 'blur', 'key'];

/**
 * Freeze frame: the clip is split at `at`, the rest moves `d` seconds later, and an image clip of the frame (source
 * `imageSource`) with the clip's picture settings fills the gap.
 */
export function freezeFrame(p, id, at, d, imageSource) {
  const c = p.clips.find((x) => x.id === id);
  if (!c || at < c.start - 1e-9 || at > end(c) + 1e-9) return p;
  let q = p;
  if (at > c.start + 1e-6 && at < end(c) - 1e-6) [q] = splitClip(q, id, at);
  q = insertGap(q, c.track, at, d);
  const still = makeClip('image', { source: imageSource, track: c.track, start: at });
  still.out = d;
  for (const k of VISUAL_KEYS) if (c[k] !== undefined) still[k] = c[k];
  return { ...q, clips: [...q.clips, still] };
}

/** Markers: [{ id, t, text }] sorted by time. */
export function addMarker(p, t, text = '') {
  return { ...p, markers: [...(p.markers || []), { id: newId('m'), t: Math.max(0, t), text }].sort((a, b) => a.t - b.t) };
}
export function updateMarker(p, id, changes) { return { ...p, markers: (p.markers || []).map((m) => (m.id === id ? { ...m, ...changes } : m)).sort((a, b) => a.t - b.t) }; }
export function removeMarker(p, id) { return { ...p, markers: (p.markers || []).filter((m) => m.id !== id) }; }
/** The next marker after t (direction 1) or the previous one before t (−1), or null. */
export function markerNear(p, t, direction) {
  const list = (p.markers || []).filter((m) => (direction > 0 ? m.t > t + 1e-6 : m.t < t - 1e-6));
  return list.length ? (direction > 0 ? list[0] : list[list.length - 1]) : null;
}

// ---- cross-fades and transitions between neighbouring clips -----------------------------------------------------------------

/**
 * A track next to `track` of the same kind whose range [from, to) is free: the one above (video; for audio the one below), or a
 * new one. Returns { p, track }.
 */
function freeNeighbourTrack(p, track, from, to) {
  const tr = trackOf(p, track);
  const same = p.tracks.filter((x) => x.kind === tr.kind);
  const i = same.indexOf(tr);
  const candidates = tr.kind === 'video' ? same.slice(0, i).reverse() : same.slice(i + 1);
  const free = (id) => !p.clips.some((c) => c.track === id && end(c) > from + 1e-9 && c.start < to - 1e-9);
  const found = candidates.find((x) => free(x.id));
  if (found) return { p, track: found.id };
  const n = same.length + 1;
  const created = { id: newId('t'), kind: tr.kind, name: `${tr.kind === 'video' ? 'V' : 'A'}${n}`, mute: false, hidden: false };
  const at = tr.kind === 'video' ? p.tracks.indexOf(tr) : p.tracks.indexOf(tr) + 1;
  return { p: { ...p, tracks: [...p.tracks.slice(0, at), created, ...p.tracks.slice(at)] }, track: created.id };
}

/**
 * Cross-fade between clip `a` and the clip `b` that follows it on the same track: b moves to a neighbouring track and fades in
 * over a, which is extended by `d` seconds (as far as its source allows; images always). The picture dissolves (or uses the
 * transition `type`), the sound cross-fades. Returns the new project and the overlap used (0: not possible).
 */
export function crossfade(p, aId, bId, d, type = 'fade', sourceDuration = () => Infinity) {
  const a = p.clips.find((c) => c.id === aId), b = p.clips.find((c) => c.id === bId);
  if (!a || !b || a.track !== b.track || Math.abs(end(a) - b.start) > 0.02) return { p, overlap: 0 };
  const handle = a.kind === 'image' || a.kind === 'text' ? Infinity : maxLength(a, sourceDuration(a)) - length(a);
  const overlap = Math.min(d, handle, length(b) - MIN_LENGTH);
  if (!(overlap > 0.01)) return { p, overlap: 0 };
  const placed = freeNeighbourTrack(p, a.track, b.start, end(b));
  let q = placed.p;
  q = updateClip(q, b.id, { track: placed.track, fadeIn: overlap, transitionIn: type, audioFadeIn: overlap });
  const extended = a.reverse ? { in: a.in - overlap * speedOf(a) } : { out: a.out + overlap * speedOf(a) };
  q = updateClip(q, a.id, { ...extended, audioFadeOut: overlap });
  return { p: q, overlap };
}

/**
 * Transitions between all neighbouring clips of a track (A/B roll): every second clip moves to a neighbouring track; where the
 * upper clip comes first it is extended and fades out over the next one, otherwise the next one fades in. Returns { p, count }.
 */
export function transitionsOnTrack(p, track, d, type = 'fade', sourceDuration = () => Infinity) {
  const list = clipsOn(p, track);
  let q = p, count = 0;
  for (let i = 0; i + 1 < list.length; i++) {
    const a = q.clips.find((c) => c.id === list[i].id), b = q.clips.find((c) => c.id === list[i + 1].id);
    if (Math.abs(end(a) - b.start) > 0.02) continue;
    if (a.track === track) {
      const r = crossfade(q, a.id, b.id, d, type, sourceDuration);
      if (!r.overlap) continue;
      q = r.p;
      count++;
    } else {
      // a is on the other track above b: extend a over b and let it fade out
      const handle = a.kind === 'image' || a.kind === 'text' ? Infinity : maxLength(a, sourceDuration(a)) - length(a);
      const overlap = Math.min(d, handle, length(b) - MIN_LENGTH);
      if (!(overlap > 0.01) || q.clips.some((c) => c.track === a.track && c.id !== a.id && c.start < end(a) + overlap && end(c) > end(a))) continue;
      const extended = a.reverse ? { in: a.in - overlap * speedOf(a) } : { out: a.out + overlap * speedOf(a) };
      q = updateClip(q, a.id, { ...extended, fadeOut: overlap, transitionOut: type, audioFadeOut: overlap });
      q = updateClip(q, b.id, { audioFadeIn: overlap });
      count++;
    }
  }
  return { p: q, count };
}

/** End of the last clip of a track (where "add to timeline" appends). */
export const trackEnd = (p, track) => Math.max(0, ...p.clips.filter((c) => c.track === track).map(end));

/** How a visual clip appears during its fade-in (and disappears during its fade-out); 'fade' changes the opacity. */
export const TRANSITIONS = ['fade', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'circle'];

/** Progress of the fade-in and fade-out at time t: 1 = fully visible. */
export function fadeProgress(c, t) {
  const into = t - c.start, left = end(c) - t;
  return { pin: c.fadeIn > 0 && into < c.fadeIn ? Math.max(0, into / c.fadeIn) : 1, pout: c.fadeOut > 0 && left < c.fadeOut ? Math.max(0, left / c.fadeOut) : 1 };
}

/** Opacity factor of the fades at timeline time t (only fades of type 'fade' change the opacity). */
export function fadeFactor(c, t, { visual = false } = {}) {
  const { pin, pout } = fadeProgress(c, t);
  let f = 1;
  if (!visual || !c.transitionIn || c.transitionIn === 'fade') f *= pin;
  if (!visual || !c.transitionOut || c.transitionOut === 'fade') f *= pout;
  return f;
}

/** Volume factor of the sound fades at time t (fades and the sound-only fades of cross-fades). */
export function audioFade(c, t) {
  const fin = Math.max(c.fadeIn || 0, c.audioFadeIn || 0), fout = Math.max(c.fadeOut || 0, c.audioFadeOut || 0);
  const into = t - c.start, left = end(c) - t;
  return (fin > 0 && into < fin ? Math.max(0, into / fin) : 1) * (fout > 0 && left < fout ? Math.max(0, left / fout) : 1);
}

/** Clip or move the drawing for a wipe/slide/zoom/circle at progress p (exit: the mirrored movement). */
function applyTransition(g, type, p, w, h, exit) {
  if (!type || type === 'fade' || p >= 1) return;
  const q = 1 - p;
  const dir = (a, b) => (exit ? b : a);
  g.beginPath();
  switch (type) {
    case 'wipe-left': exit ? g.rect(0, 0, w * p, h) : g.rect(w * q, 0, w * p, h); g.clip(); break;
    case 'wipe-right': exit ? g.rect(w * q, 0, w * p, h) : g.rect(0, 0, w * p, h); g.clip(); break;
    case 'wipe-up': exit ? g.rect(0, 0, w, h * p) : g.rect(0, h * q, w, h * p); g.clip(); break;
    case 'wipe-down': exit ? g.rect(0, h * q, w, h * p) : g.rect(0, 0, w, h * p); g.clip(); break;
    case 'slide-left': g.translate(dir(w * q, -w * q), 0); break;
    case 'slide-right': g.translate(dir(-w * q, w * q), 0); break;
    case 'slide-up': g.translate(0, dir(h * q, -h * q)); break;
    case 'slide-down': g.translate(0, dir(-h * q, h * q)); break;
    case 'zoom': g.translate(w / 2, h / 2); g.scale(Math.max(0.001, p), Math.max(0.001, p)); g.translate(-w / 2, -h / 2); break;
    case 'circle': g.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * p, 0, Math.PI * 2); g.clip(); break;
    default: break;
  }
}

export const snapshot = clone;

// ---- drawing (shared by the preview and the export) ---------------------------------------------------------------------

/** Scale and offset of a clip at time t (Ken Burns: from scale/x/y at the start to endScale/endX/endY at the end). */
export function motion(c, t) {
  const p = t == null || length(c) <= 0 ? 0 : Math.max(0, Math.min(1, (t - c.start) / length(c)));
  const lerp = (a, b) => (b == null ? a : a + (b - a) * p);
  const keyed = (prop, a, b) => (c.keys && c.keys[prop] && c.keys[prop].length && t != null ? valueAt(c, prop, t) : lerp(a, b)); // (keyframes win over the Ken Burns motion)
  return { scale: keyed('scale', c.scale || 1, c.endScale), x: keyed('x', c.x || 0, c.endX), y: keyed('y', c.y || 0, c.endY) };
}

/** Rectangle of a source of size sw x sh fitted ("contain") into the frame and transformed by the clip (at time t). */
export function placement(c, sw, sh, w, h, t = null) {
  const m = motion(c, t);
  const fit = Math.min(w / sw, h / sh) * m.scale;
  const dw = sw * fit, dh = sh * fit;
  return { x: (w - dw) / 2 + m.x, y: (h - dh) / 2 + m.y, w: dw, h: dh };
}

/** CSS filter of the colour correction ('none' when unchanged). */
export function colorFilter(c) {
  const parts = [];
  if ((c.brightness ?? 100) !== 100) parts.push(`brightness(${c.brightness}%)`);
  if ((c.contrast ?? 100) !== 100) parts.push(`contrast(${c.contrast}%)`);
  if ((c.saturation ?? 100) !== 100) parts.push(`saturate(${c.saturation}%)`);
  // picture effects
  if (c.hue) parts.push(`hue-rotate(${c.hue}deg)`);
  if (c.grayscale) parts.push(`grayscale(${c.grayscale}%)`);
  if (c.sepia) parts.push(`sepia(${c.sepia}%)`);
  if (c.invert) parts.push('invert(100%)');
  if (c.blur) parts.push(`blur(${c.blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

const hexRgb = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '#00ff00') || [0, '00', 'ff', '00']; return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; };

/**
 * Chroma key on RGBA data in place: pixels whose colour (in the Cb/Cr plane, so brightness does not matter) is within
 * `tolerance` (0–100) of the key colour become transparent, with a soft edge of `softness`; `spill` (0–100) takes the key
 * colour's cast out of the remaining edges.
 */
export function chromaKey(data, { color = '#00ff00', tolerance = 30, softness = 10, spill = 50 } = {}) {
  const [kr, kg, kb] = hexRgb(color);
  const kcb = -0.168736 * kr - 0.331264 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.418688 * kg - 0.081312 * kb;
  const t0 = (tolerance / 100) * 180, t1 = t0 + Math.max(1, (softness / 100) * 180);
  const green = kg >= kr && kg >= kb, blue = kb > kr && kb > kg;
  const sp = spill / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b, cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const d = Math.hypot(cb - kcb, cr - kcr);
    if (d < t1) {
      const a = d <= t0 ? 0 : (d - t0) / (t1 - t0);
      data[i + 3] = Math.round(data[i + 3] * a * a * (3 - 2 * a));
    }
    if (sp && data[i + 3]) {
      // spill: limit the key channel to the other two
      if (green) { const lim = Math.max(r, b); if (g > lim) data[i + 1] = g - (g - lim) * sp; } else if (blue) { const lim = Math.max(r, g); if (b > lim) data[i + 2] = b - (b - lim) * sp; }
    }
  }
}

let keyCanvas = null;
function keyed(image, sx, sy, sw, sh, w, h, key) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (!keyCanvas || keyCanvas.width !== w || keyCanvas.height !== h) keyCanvas = new OffscreenCanvas(w, h);
  const g = keyCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h);
  g.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  chromaKey(img.data, key);
  g.putImageData(img, 0, 0);
  return keyCanvas;
}

/** Draw a visual clip (image is a canvas, video element or bitmap with its natural size; null for text clips). */
export function drawClip(g, c, image, sw, sh, project, t) {
  const alpha = Math.max(0, Math.min(1, valueAt(c, 'opacity', t, 1))) * fadeFactor(c, t, { visual: true });
  if (alpha <= 0) return;
  const { pin, pout } = fadeProgress(c, t);
  if ((pin <= 0 && c.transitionIn && c.transitionIn !== 'fade') || (pout <= 0 && c.transitionOut && c.transitionOut !== 'fade')) return;
  g.save();
  applyTransition(g, c.transitionIn, pin, project.width, project.height, false);
  applyTransition(g, c.transitionOut, pout, project.width, project.height, true);
  g.globalAlpha = alpha;
  if (c.kind === 'text') drawText(g, c, project, t);
  else if (image && sw && sh) {
    // crop: the visible part of the source, placed like a source of that size
    const k = c.crop || {};
    const cl = Math.max(0, Math.min(0.95, k.left || 0)), cr = Math.max(0, Math.min(0.95 - cl, k.right || 0));
    const ct = Math.max(0, Math.min(0.95, k.top || 0)), cb = Math.max(0, Math.min(0.95 - ct, k.bottom || 0));
    const vw = sw * (1 - cl - cr), vh = sh * (1 - ct - cb);
    const r = placement(c, vw, vh, project.width, project.height, t);
    const filter = colorFilter(c);
    if (filter !== 'none') g.filter = filter;
    const rotation = valueAt(c, 'rotation', t, 0);
    if (rotation) { g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate((rotation * Math.PI) / 180); g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    if (c.key && c.key.on) g.drawImage(keyed(image, sw * cl, sh * ct, vw, vh, r.w, r.h, c.key), r.x, r.y, r.w, r.h); // (green screen: keyed at the drawn size)
    else g.drawImage(image, sw * cl, sh * ct, vw, vh, r.x, r.y, r.w, r.h);
  }
  g.restore();
}

function drawText(g, c, project, t = null) {
  const tx = c.text || {};
  const m = motion(c, t);
  const size = (tx.size || 72) * (m.scale || 1);
  const lines = String(tx.content || '').split('\n');
  g.font = `600 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = size * 1.2;
  const total = lh * lines.length;
  const cy = tx.valign === 'top' ? total / 2 + project.height * 0.08 : tx.valign === 'bottom' ? project.height - total / 2 - project.height * 0.08 : project.height / 2;
  const cx = project.width / 2 + (m.x || 0);
  const y0 = cy - total / 2 + lh / 2 + (m.y || 0);
  if (tx.background) {
    const wmax = Math.max(...lines.map((l) => g.measureText(l).width));
    g.fillStyle = tx.background;
    g.fillRect(cx - wmax / 2 - size * 0.3, y0 - lh / 2 - size * 0.1, wmax + size * 0.6, total + size * 0.2);
  }
  g.fillStyle = tx.color || '#ffffff';
  lines.forEach((l, i) => g.fillText(l, cx, y0 + i * lh));
}
