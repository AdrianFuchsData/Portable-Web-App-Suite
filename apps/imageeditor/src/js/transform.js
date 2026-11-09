/**
 * Free transform (Ctrl+T): the selected pixels – or the whole content of the active layer – float in a box that can be moved,
 * scaled (corners and edges; Shift keeps the proportions), rotated (the handle above the box or outside it; Shift in 15° steps)
 * and flipped. Enter (or Apply, or choosing another tool) applies, Escape cancels. The selection follows the transformed pixels.
 */
import { canvas, copyCanvas, selectionPath, alphaSelection } from '@app/doc.js';

const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

/** The bounds of the non-transparent pixels of a canvas, or null when it is empty. */
export function contentBounds(c) {
  const { width: w, height: h } = c;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!d[(y * w + x) * 4 + 3]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function transformTool() {
  let st = null; // { layer, base, float, sw, sh, sel, t: { cx, cy, w, h, angle, fx, fy } }
  let drag = null;

  const local = (p, t) => { const dx = p.x - t.cx, dy = p.y - t.cy, c = Math.cos(-t.angle), s = Math.sin(-t.angle); return { x: dx * c - dy * s, y: dx * s + dy * c }; };
  const world = (q, t) => { const c = Math.cos(t.angle), s = Math.sin(t.angle); return { x: t.cx + q.x * c - q.y * s, y: t.cy + q.x * s + q.y * c }; };

  /** The floating pixels drawn with the transform into ctx. */
  const drawFloat = (ctx, t) => {
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.angle);
    ctx.scale((t.w / st.sw) * (t.fx ? -1 : 1), (t.h / st.sh) * (t.fy ? -1 : 1));
    ctx.drawImage(st.float, -st.sw / 2, -st.sh / 2);
    ctx.restore();
  };

  const show = (ed) => {
    const ctx = ed.preview.canvas.getContext('2d');
    ctx.clearRect(0, 0, ed.doc.width, ed.doc.height);
    ctx.drawImage(st.base, 0, 0);
    drawFloat(ctx, st.t);
    ed.render();
  };

  const tool = {
    id: 'transform',
    /** Lift the pixels when the tool is chosen. */
    activate(ed) {
      const doc = ed.doc;
      const layer = doc.layer;
      const sel = doc.selection;
      const base = copyCanvas(layer.canvas);
      let float, box;
      if (sel) {
        const m = doc.maskCanvas(sel);
        const b = doc.selectionBounds();
        if (b.w < 1 || b.h < 1) return false;
        const lifted = copyCanvas(layer.canvas);
        const lctx = lifted.getContext('2d');
        lctx.globalCompositeOperation = 'destination-in';
        lctx.drawImage(m, 0, 0);
        const bctx = base.getContext('2d');
        bctx.globalCompositeOperation = 'destination-out';
        bctx.drawImage(m, 0, 0);
        box = b;
        float = canvas(b.w, b.h);
        float.getContext('2d').drawImage(lifted, -b.x, -b.y);
      } else {
        box = contentBounds(layer.canvas);
        if (!box) return false;
        float = canvas(box.w, box.h);
        float.getContext('2d').drawImage(layer.canvas, -box.x, -box.y);
        base.getContext('2d').clearRect(0, 0, base.width, base.height);
      }
      st = { layer, base, float, sw: box.w, sh: box.h, sel: !!sel, t: { cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: box.w, h: box.h, angle: 0, fx: false, fy: false } };
      ed.transform = st.t;
      ed.preview = { layer, canvas: canvas(doc.width, doc.height) };
      show(ed);
      return true;
    },
    get active() { return !!st; },
    down(p, e, ed) {
      if (!st) { if (!tool.activate(ed)) return; }
      const t = st.t, z = ed.view.zoom, q = local(p, t), r = 7 / z;
      const rot = { x: 0, y: -t.h / 2 - 24 / z };
      if (Math.hypot(q.x - rot.x, q.y - rot.y) <= r * 1.4) { drag = { kind: 'rotate', start: { ...t }, a0: Math.atan2(p.y - t.cy, p.x - t.cx) }; return; }
      const h = HANDLES.find(([sx, sy]) => Math.abs(q.x - (sx * t.w) / 2) <= r && Math.abs(q.y - (sy * t.h) / 2) <= r);
      if (h) { drag = { kind: 'scale', h, start: { ...t } }; return; }
      if (Math.abs(q.x) <= t.w / 2 && Math.abs(q.y) <= t.h / 2) { drag = { kind: 'move', start: { ...t }, p0: p }; return; }
      drag = { kind: 'rotate', start: { ...t }, a0: Math.atan2(p.y - t.cy, p.x - t.cx) };
    },
    move(p, e, ed) {
      if (!st || !drag) return;
      const s = drag.start, t = st.t;
      if (drag.kind === 'move') { t.cx = s.cx + (p.x - drag.p0.x); t.cy = s.cy + (p.y - drag.p0.y); } else if (drag.kind === 'rotate') {
        let a = s.angle + Math.atan2(p.y - s.cy, p.x - s.cx) - drag.a0;
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        t.angle = a;
      } else {
        const [sx, sy] = drag.h;
        const q = local(p, s);
        const fixed = { x: (-sx * s.w) / 2, y: (-sy * s.h) / 2 };
        let w = sx ? Math.max(1, Math.abs(q.x - fixed.x)) : s.w, h = sy ? Math.max(1, Math.abs(q.y - fixed.y)) : s.h;
        if (e.shiftKey && sx && sy) { const k = Math.max(w / s.w, h / s.h); w = s.w * k; h = s.h * k; }
        const moved = { x: sx ? fixed.x + sx * w : 0, y: sy ? fixed.y + sy * h : 0 };
        const centre = world({ x: sx ? (fixed.x + moved.x) / 2 : 0, y: sy ? (fixed.y + moved.y) / 2 : 0 }, s);
        Object.assign(t, { w, h, cx: centre.x, cy: centre.y });
      }
      show(ed);
      ed.refresh();
    },
    up() { drag = null; },
    /** Change the transform from the tool options (x, y: top-left of the unrotated box; angle in degrees). */
    set(ed, values) {
      if (!st) return;
      const t = st.t;
      if (values.w !== undefined) t.w = Math.max(1, values.w);
      if (values.h !== undefined) t.h = Math.max(1, values.h);
      if (values.x !== undefined) t.cx = values.x + t.w / 2;
      if (values.y !== undefined) t.cy = values.y + t.h / 2;
      if (values.angle !== undefined) t.angle = (values.angle * Math.PI) / 180;
      if (values.flipX) t.fx = !t.fx;
      if (values.flipY) t.fy = !t.fy;
      show(ed);
    },
    apply(ed) {
      if (!st) return;
      const doc = ed.doc, out = ed.preview.canvas, layer = st.layer, t = st.t, hadSel = st.sel;
      // the selection follows: the transformed shape of the lifted pixels
      let selection = null;
      if (hadSel) {
        const m = canvas(doc.width, doc.height);
        drawFloat(m.getContext('2d'), t);
        const d = m.getContext('2d').getImageData(0, 0, doc.width, doc.height).data;
        const mask = new Uint8Array(doc.width * doc.height);
        for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3];
        selection = alphaSelection(mask, doc.width, doc.height);
      }
      st = null; drag = null; ed.transform = null; ed.preview = null;
      const active = doc.layers.indexOf(layer);
      if (active >= 0 && doc.layer !== layer) doc.active = active;
      doc.record('layer');
      layer.canvas = out;
      if (hadSel) doc.selection = selection;
      doc.dirty = true;
      ed.changed();
    },
    onKey(e, ed) {
      if (!st) return false;
      if (e.key === 'Enter') { tool.apply(ed); return true; }
      if (e.key === 'Escape') { tool.cancel(ed); ed.refresh(); return true; }
      return false;
    },
    /** Choosing another tool applies the transform. */
    leave(ed) { if (st) tool.apply(ed); },
    cancel(ed) { st = null; drag = null; if (ed) { ed.transform = null; ed.preview = null; } },
    overlay(ctx, zoom) {
      if (!st) return;
      const t = st.t, corner = (sx, sy) => world({ x: (sx * t.w) / 2, y: (sy * t.h) / 2 }, t);
      ctx.save();
      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = '#1e88e5';
      ctx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => { const c = corner(sx, sy); if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); });
      ctx.closePath();
      const top = corner(0, -1), rot = world({ x: 0, y: -t.h / 2 - 24 / zoom }, t);
      ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      const r = 4 / zoom;
      for (const [sx, sy] of HANDLES) { const c = corner(sx, sy); ctx.fillRect(c.x - r, c.y - r, 2 * r, 2 * r); ctx.strokeRect(c.x - r, c.y - r, 2 * r, 2 * r); }
      ctx.beginPath(); ctx.arc(rot.x, rot.y, r * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
  };
  return tool;
}
