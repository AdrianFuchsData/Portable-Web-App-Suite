/*
 * Timeline model of the video editor (pure functions on plain objects, so that undo can keep snapshots).
 *
 * project: { width, height, fps, background, tracks: [{ id, kind: 'video'|'audio', name, mute, hidden }], clips: [clip] }
 * Video tracks are listed top to bottom (the first one is drawn on top).
 * clip: { id, track, kind: 'video'|'image'|'audio'|'text', source (id or null), start, in, out, volume, fadeIn, fadeOut,
 *         transitionIn, transitionOut (how a visual clip appears/disappears during its fades: see TRANSITIONS),
 *         brightness, contrast, saturation (%; 100 = unchanged), rotation (degrees), crop: { left, right, top, bottom } (fractions),
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
/** The part of a clip that covers timeline time [a, b) (same id). */
export function subClip(c, a, b) {
  const s = speedOf(c);
  return c.reverse ? { ...c, start: a, out: c.out - (a - c.start) * s, in: c.out - (b - c.start) * s } : { ...c, start: a, in: c.in + (a - c.start) * s, out: c.in + (b - c.start) * s };
}
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
  const points = [0, ...extra];
  for (const c of p.clips) if (c.id !== except) points.push(c.start, end(c));
  for (const x of points) { const d = Math.abs(x - t); if (d < dist) { dist = d; best = x; } }
  return best;
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
  return { scale: lerp(c.scale || 1, c.endScale), x: lerp(c.x || 0, c.endX), y: lerp(c.y || 0, c.endY) };
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
  return parts.length ? parts.join(' ') : 'none';
}

/** Draw a visual clip (image is a canvas, video element or bitmap with its natural size; null for text clips). */
export function drawClip(g, c, image, sw, sh, project, t) {
  const alpha = (c.opacity ?? 1) * fadeFactor(c, t, { visual: true });
  if (alpha <= 0) return;
  const { pin, pout } = fadeProgress(c, t);
  if ((pin <= 0 && c.transitionIn && c.transitionIn !== 'fade') || (pout <= 0 && c.transitionOut && c.transitionOut !== 'fade')) return;
  g.save();
  applyTransition(g, c.transitionIn, pin, project.width, project.height, false);
  applyTransition(g, c.transitionOut, pout, project.width, project.height, true);
  g.globalAlpha = alpha;
  if (c.kind === 'text') drawText(g, c, project);
  else if (image && sw && sh) {
    // crop: the visible part of the source, placed like a source of that size
    const k = c.crop || {};
    const cl = Math.max(0, Math.min(0.95, k.left || 0)), cr = Math.max(0, Math.min(0.95 - cl, k.right || 0));
    const ct = Math.max(0, Math.min(0.95, k.top || 0)), cb = Math.max(0, Math.min(0.95 - ct, k.bottom || 0));
    const vw = sw * (1 - cl - cr), vh = sh * (1 - ct - cb);
    const r = placement(c, vw, vh, project.width, project.height, t);
    const filter = colorFilter(c);
    if (filter !== 'none') g.filter = filter;
    if (c.rotation) { g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate((c.rotation * Math.PI) / 180); g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    g.drawImage(image, sw * cl, sh * ct, vw, vh, r.x, r.y, r.w, r.h);
  }
  g.restore();
}

function drawText(g, c, project) {
  const tx = c.text || {};
  const size = (tx.size || 72) * (c.scale || 1);
  const lines = String(tx.content || '').split('\n');
  g.font = `600 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = size * 1.2;
  const total = lh * lines.length;
  const cy = tx.valign === 'top' ? total / 2 + project.height * 0.08 : tx.valign === 'bottom' ? project.height - total / 2 - project.height * 0.08 : project.height / 2;
  const cx = project.width / 2 + (c.x || 0);
  const y0 = cy - total / 2 + lh / 2 + (c.y || 0);
  if (tx.background) {
    const wmax = Math.max(...lines.map((l) => g.measureText(l).width));
    g.fillStyle = tx.background;
    g.fillRect(cx - wmax / 2 - size * 0.3, y0 - lh / 2 - size * 0.1, wmax + size * 0.6, total + size * 0.2);
  }
  g.fillStyle = tx.color || '#ffffff';
  lines.forEach((l, i) => g.fillText(l, cx, y0 + i * lh));
}
