/*
 * Rulers, guides, grid and snapping of the image editor. Positions are image pixels; guides lie on pixel boundaries.
 *
 *   snapPoint(p, ctx)  -> { x, y, snappedX, snappedY }   (ctx: see snapTargets)
 *   snapRect(r, ctx)   -> { dx, dy } that moves the rectangle's nearest edge onto a target
 *   rulerSteps(zoom)   -> { major, minor } tick distances in image pixels
 *   drawRuler(canvas, options)
 */

/** Snap targets per axis: guides, image edges and the nearest grid lines (each only if enabled). */
function snapTargets(axis, value, { guides = [], width, height, prefs }) {
  const out = [];
  if (prefs.snapGuides) for (const g of guides) if (g.axis === (axis === 'x' ? 'v' : 'h')) out.push(g.pos);
  if (prefs.snapEdges) out.push(0, axis === 'x' ? width : height);
  if (prefs.snapGrid && prefs.gridSize > 0) {
    const n = Math.round(value / prefs.gridSize) * prefs.gridSize;
    out.push(n);
  }
  return out;
}

function nearest(value, targets, threshold) {
  let best = null;
  for (const t of targets) if (Math.abs(t - value) <= threshold && (best === null || Math.abs(t - value) < Math.abs(best - value))) best = t;
  return best;
}

/** Snap a point (image pixels). ctx: { guides, width, height, prefs: { snapGuides, snapEdges, snapGrid, gridSize, snapDistance }, zoom }. */
export function snapPoint(p, ctx) {
  const threshold = (ctx.prefs.snapDistance || 8) / (ctx.zoom || 1);
  const x = nearest(p.x, snapTargets('x', p.x, ctx), threshold);
  const y = nearest(p.y, snapTargets('y', p.y, ctx), threshold);
  return { x: x === null ? p.x : x, y: y === null ? p.y : y, snappedX: x !== null, snappedY: y !== null };
}

/** Offset that snaps the closest edge of a rectangle { x, y, w, h } onto a target (per axis, 0 if none is close). */
export function snapRect(r, ctx) {
  const threshold = (ctx.prefs.snapDistance || 8) / (ctx.zoom || 1);
  const axis = (a, start, size) => {
    let best = null;
    for (const edge of [start, start + size]) {
      const t = nearest(edge, snapTargets(a, edge, ctx), threshold);
      if (t !== null && (best === null || Math.abs(t - edge) < Math.abs(best))) best = t - edge;
    }
    return best || 0;
  };
  return { dx: axis('x', r.x, r.w), dy: axis('y', r.y, r.h) };
}

/** Tick distances (image pixels) so that major ticks are at least ~60 screen pixels apart. */
export function rulerSteps(zoom) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  const major = steps.find((s) => s * zoom >= 60) || steps[steps.length - 1];
  const minor = major % 5 === 0 && major * zoom / 5 >= 5 ? major / 5 : major % 2 === 0 && major * zoom / 2 >= 5 ? major / 2 : major;
  return { major, minor };
}

/**
 * Draw a ruler. options: { horizontal, offset (screen position of image pixel 0), zoom, cursor (image coordinate or
 * null), guides (positions along this ruler), size (image extent), colors: { bg, fg, tick, mark, image } }.
 */
export function drawRuler(canvas, { horizontal, offset, zoom, cursor = null, guides = [], size, colors }) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  const length = horizontal ? w : h, thickness = horizontal ? h : w;
  // the image extent
  ctx.fillStyle = colors.image;
  const a = Math.max(0, offset), b = Math.min(length, offset + size * zoom);
  if (b > a) { if (horizontal) ctx.fillRect(a, 0, b - a, h); else ctx.fillRect(0, a, w, b - a); }
  const { major, minor } = rulerSteps(zoom);
  const first = Math.floor(-offset / zoom / minor) * minor;
  ctx.strokeStyle = colors.tick;
  ctx.fillStyle = colors.fg;
  ctx.lineWidth = 1;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let v = first; offset + v * zoom <= length; v += minor) {
    const s = Math.round(offset + v * zoom) + 0.5;
    const isMajor = Math.abs(v % major) < 1e-9;
    const len = isMajor ? thickness : thickness * 0.3;
    if (horizontal) { ctx.moveTo(s, thickness); ctx.lineTo(s, thickness - len); } else { ctx.moveTo(thickness, s); ctx.lineTo(thickness - len, s); }
    if (isMajor) {
      const label = String(Math.round(v));
      if (horizontal) ctx.fillText(label, s + 2, 1);
      else { ctx.save(); ctx.translate(1, s + 2); ctx.rotate(Math.PI / 2); ctx.textBaseline = 'bottom'; ctx.fillText(label, 0, 0); ctx.restore(); }
    }
  }
  ctx.stroke();
  // guides and cursor position
  const mark = (v, color) => {
    const s = Math.round(offset + v * zoom) + 0.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (horizontal) { ctx.moveTo(s, 0); ctx.lineTo(s, thickness); } else { ctx.moveTo(0, s); ctx.lineTo(thickness, s); }
    ctx.stroke();
  };
  for (const g of guides) mark(g, colors.guide);
  if (cursor !== null) mark(cursor, colors.mark);
  ctx.strokeStyle = colors.tick;
  ctx.beginPath();
  if (horizontal) { ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); } else { ctx.moveTo(w - 0.5, 0); ctx.lineTo(w - 0.5, h); }
  ctx.stroke();
}
