/*
 * Charts for the spreadsheet and the presentation editor: one model, one renderer (Canvas 2D, so the bundled fonts are used), a
 * dialog to edit type, titles and data, and readers for the charts of Office files (the values cached in chart XML).
 *
 * A chart is stored as an ordinary PNG picture that carries its model in a tEXt chunk "suite-chart" (base64 of UTF-8 JSON) – like
 * the diagrams (diagram-embed.js): XLSX and PPTX keep it unchanged, other programs show the picture, the suite edits it again.
 *
 *   model = { type: 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter', title, categories: [text],
 *             series: [{ name, values: [number | null], color }], legend: 'right' | 'bottom' | 'none', stacked, labels,
 *             source: { sheet, range } | null (spreadsheet: the cells the data came from) }
 *   Suite.charts.draw(ctx, model, width, height)      // onto a canvas context (CSS pixels)
 *   Suite.charts.toPng(model, width, height) -> data URL (2× pixels, with the model)    Suite.charts.modelOf(src) -> model | null
 *   Suite.charts.isChart(src); Suite.charts.fromRows(rows) -> model (first row / column as names when they are text)
 *   Suite.charts.fromChartXml(xml) -> model | null    // c:chartSpace of DOCX/XLSX/PPTX (DrawingML charts)
 *   Suite.charts.edit({ model, onSave(model), refresh() -> model | null })   // the chart dialog (refresh: "Update from cells")
 *   Suite.charts.sample() -> a small example model for a new chart
 */
(function (Suite) {
  'use strict';

  const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300'];
  const FONT = '"Carlito", Calibri, "Liberation Sans", Arial, sans-serif';
  const TYPES = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'];
  const KEY = 'suite-chart';

  Suite.i18n.register({
    en: {
      'ch.chart': 'Chart', 'ch.insert': 'Insert chart', 'ch.edit': 'Edit chart', 'ch.type': 'Type', 'ch.title': 'Title', 'ch.legend': 'Legend',
      'ch.right': 'Right', 'ch.bottom': 'Bottom', 'ch.none': 'None', 'ch.stacked': 'Stacked', 'ch.labels': 'Values on the chart', 'ch.data': 'Data',
      'ch.addRow': '+ Row', 'ch.removeRow': '− Row', 'ch.addSeries': '+ Series', 'ch.removeSeries': '− Series', 'ch.refresh': 'Update from cells',
      'ch.ok': 'OK', 'ch.cancel': 'Cancel', 'ch.series': 'Series {0}', 'ch.category': 'Category', 'ch.color': 'Colour of “{0}”',
      'ch.t.column': 'Column', 'ch.t.bar': 'Bar', 'ch.t.line': 'Line', 'ch.t.area': 'Area', 'ch.t.pie': 'Pie', 'ch.t.doughnut': 'Doughnut', 'ch.t.scatter': 'Scatter (XY)',
      'ch.noData': 'Select cells with numbers (names in the first row or column) first.', 'ch.sourceGone': 'The cells of the chart are no longer there.',
    },
    de: {
      'ch.chart': 'Diagramm', 'ch.insert': 'Diagramm einfügen', 'ch.edit': 'Diagramm bearbeiten', 'ch.type': 'Art', 'ch.title': 'Titel', 'ch.legend': 'Legende',
      'ch.right': 'Rechts', 'ch.bottom': 'Unten', 'ch.none': 'Keine', 'ch.stacked': 'Gestapelt', 'ch.labels': 'Werte im Diagramm', 'ch.data': 'Daten',
      'ch.addRow': '+ Zeile', 'ch.removeRow': '− Zeile', 'ch.addSeries': '+ Reihe', 'ch.removeSeries': '− Reihe', 'ch.refresh': 'Aus den Zellen aktualisieren',
      'ch.ok': 'OK', 'ch.cancel': 'Abbrechen', 'ch.series': 'Reihe {0}', 'ch.category': 'Kategorie', 'ch.color': 'Farbe von „{0}“',
      'ch.t.column': 'Säulen', 'ch.t.bar': 'Balken', 'ch.t.line': 'Linien', 'ch.t.area': 'Flächen', 'ch.t.pie': 'Kreis', 'ch.t.doughnut': 'Ring', 'ch.t.scatter': 'Punkte (XY)',
      'ch.noData': 'Markieren Sie zuerst Zellen mit Zahlen (Namen in der ersten Zeile oder Spalte).', 'ch.sourceGone': 'Die Zellen des Diagramms gibt es nicht mehr.',
    },
  });

  // the bundled font of the charts, loaded early: a canvas draws with a font only once it is loaded
  try { document.fonts.load(`12px ${FONT}`); document.fonts.load(`bold 12px ${FONT}`); } catch (e) { /* no FontFaceSet */ }

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null);
  const colorOf = (model, i) => (model.series[i] && model.series[i].color) || PALETTE[i % PALETTE.length];
  const format = (v) => new Intl.NumberFormat(Suite.i18n.language === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 }).format(v);

  /** A model with all fields and sane values. */
  function normalize(m) {
    const series = (m.series || []).map((s, i) => ({ name: String(s.name ?? Suite.t('ch.series', i + 1)), values: (s.values || []).map(num), ...(s.color ? { color: s.color } : {}) }));
    const n = Math.max((m.categories || []).length, ...series.map((s) => s.values.length), 0);
    return {
      type: TYPES.includes(m.type) ? m.type : 'column', title: String(m.title || ''),
      categories: Array.from({ length: n }, (_, i) => String((m.categories || [])[i] ?? i + 1)),
      series: series.map((s) => ({ ...s, values: Array.from({ length: n }, (_, i) => s.values[i] ?? null) })),
      legend: ['right', 'bottom', 'none'].includes(m.legend) ? m.legend : 'right', stacked: !!m.stacked, labels: !!m.labels, source: m.source || null,
    };
  }

  function sample() {
    return normalize({
      type: 'column', title: '', categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [{ name: Suite.t('ch.series', 1), values: [4.3, 2.5, 3.5, 4.5] }, { name: Suite.t('ch.series', 2), values: [2.4, 4.4, 1.8, 2.8] }],
    });
  }

  /** Rows of cell values -> model: text in the first row names the series (columns), text in the first column the categories. */
  function fromRows(rows) {
    rows = (rows || []).filter((r) => r && r.some((v) => v !== null && v !== undefined && v !== ''));
    if (!rows.length) return null;
    const width = Math.max(...rows.map((r) => r.length));
    const isText = (v) => typeof v === 'string' && v.trim() !== '' && num(v) === null;
    const header = rows[0].slice(1).some(isText) || (rows.length > 1 && rows[0].every((v, i) => i === 0 || isText(v) || v === null || v === ''));
    const body = header ? rows.slice(1) : rows;
    const names = body.some((r) => isText(r[0])) || (header && (rows[0][0] === null || rows[0][0] === '' || isText(rows[0][0])) && width > 1);
    const first = names ? 1 : 0;
    const series = [];
    for (let c = first; c < width; c++) {
      const values = body.map((r) => num(r[c]));
      if (values.every((v) => v === null)) continue;
      series.push({ name: header ? String(rows[0][c] ?? Suite.t('ch.series', c)) : Suite.t('ch.series', series.length + 1), values });
    }
    if (!series.length) return null;
    return normalize({ type: 'column', categories: body.map((r, i) => (names ? String(r[0] ?? '') : String(i + 1))), series, legend: series.length > 1 ? 'right' : 'none' });
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  function niceScale(min, max, count = 5) {
    if (min === max) { if (min === 0) max = 1; else if (min > 0) min = 0; else max = 0; }
    const step0 = (max - min) / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    return { min: Math.floor(min / step + 1e-9) * step, max: Math.ceil(max / step - 1e-9) * step, step };
  }
  const fit = (ctx, text, width) => {
    if (ctx.measureText(text).width <= width) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
    return `${s}…`;
  };

  function draw(ctx, model, w, h) {
    const m = normalize(model);
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    let top = 10;
    if (m.title) {
      ctx.font = `bold ${Math.round(Math.max(12, Math.min(18, w / 28)))}px ${FONT}`;
      ctx.fillStyle = '#404040';
      ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, m.title, w - 20), w / 2, top + 10);
      top += 28;
    }
    const pie = m.type === 'pie' || m.type === 'doughnut';
    const items = pie ? m.categories.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] })) : m.series.map((s, i) => ({ name: s.name, color: colorOf(m, i) }));
    ctx.font = `12px ${FONT}`;
    let right = w - 10, bottom = h - 10;
    if (m.legend === 'right' && items.length) {
      const lw = Math.min(w * 0.35, Math.max(...items.map((it) => ctx.measureText(it.name).width)) + 28);
      const lh = 18, y0 = top + Math.max(0, (bottom - top - items.length * lh) / 2);
      items.forEach((it, i) => {
        const y = y0 + i * lh + lh / 2;
        if (y > bottom) return;
        ctx.fillStyle = it.color;
        ctx.fillRect(w - lw - 4, y - 5, 10, 10);
        ctx.fillStyle = '#595959';
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, it.name, lw - 18), w - lw + 12, y);
      });
      right = w - lw - 14;
    } else if (m.legend === 'bottom' && items.length) {
      const widths = items.map((it) => Math.min(160, ctx.measureText(it.name).width) + 26);
      const rows = [];
      let row = [], used = 0;
      items.forEach((it, i) => { if (row.length && used + widths[i] > w - 20) { rows.push(row); row = []; used = 0; } row.push(i); used += widths[i]; });
      if (row.length) rows.push(row);
      bottom = h - 8 - rows.length * 18;
      rows.forEach((r, k) => {
        let x = (w - r.reduce((n, i) => n + widths[i], 0)) / 2;
        const y = bottom + 10 + k * 18;
        for (const i of r) {
          ctx.fillStyle = items[i].color;
          ctx.fillRect(x, y - 5, 10, 10);
          ctx.fillStyle = '#595959';
          ctx.textAlign = 'left';
          ctx.fillText(fit(ctx, items[i].name, widths[i] - 26), x + 14, y);
          x += widths[i];
        }
      });
      bottom -= 6;
    }
    const plot = { x: 10, y: top, w: Math.max(10, right - 10), h: Math.max(10, bottom - top) };
    if (pie) drawPie(ctx, m, plot); else drawAxes(ctx, m, plot);
    ctx.restore();
  }

  function drawPie(ctx, m, p) {
    const values = (m.series[0] ? m.series[0].values : []).map((v) => Math.max(0, v || 0));
    const total = values.reduce((a, b) => a + b, 0);
    const r = Math.max(5, Math.min(p.w, p.h) / 2 - 6), cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (!total) return;
    let a = -Math.PI / 2;
    values.forEach((v, i) => {
      const b = a + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, b);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (v / total > 0.04) {
        const mid = (a + b) / 2, rr = m.type === 'doughnut' ? r * 0.78 : r * 0.62;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText(m.labels ? format(v) : `${Math.round((v / total) * 100)} %`, cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr);
      }
      a = b;
    });
    if (m.type === 'doughnut') {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  }

  function drawAxes(ctx, m, p) {
    const horizontal = m.type === 'bar', scatter = m.type === 'scatter';
    const stacked = m.stacked && m.type !== 'scatter';
    const n = m.categories.length;
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      let pos = 0, neg = 0;
      for (const s of m.series) {
        const v = s.values[i];
        if (v === null) continue;
        if (stacked) { if (v >= 0) pos += v; else neg += v; } else { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      if (stacked) { lo = Math.min(lo, neg); hi = Math.max(hi, pos); }
    }
    if (scatter || m.type === 'line') { // (lines and points need not start at zero)
      const all = m.series.flatMap((s) => s.values).filter((v) => v !== null);
      if (all.length && !stacked) { lo = Math.min(...all); hi = Math.max(...all); if (lo > 0 && lo < hi * 0.5) lo = 0; }
    }
    const scale = niceScale(lo, hi);
    ctx.font = `11px ${FONT}`;
    const ticks = [];
    for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) ticks.push(Math.abs(v) < scale.step / 1e6 ? 0 : v);
    const labelW = Math.max(...ticks.map((v) => ctx.measureText(format(v)).width)) + 8;
    // the category axis: labels below (columns, lines) or to the left (bars)
    const xs = scatter ? m.categories.map((c, i) => num(c) ?? i + 1) : null;
    const xScale = scatter ? niceScale(Math.min(...xs), Math.max(...xs)) : null;
    const catW = horizontal ? Math.min(p.w * 0.3, Math.max(...m.categories.map((c) => ctx.measureText(c).width)) + 8) : 0;
    const area = horizontal ? { x: p.x + catW, y: p.y, w: p.w - catW, h: p.h - 18 } : { x: p.x + labelW, y: p.y + 4, w: p.w - labelW, h: p.h - 22 };
    const val = (v) => (horizontal ? area.x + ((v - scale.min) / (scale.max - scale.min)) * area.w : area.y + area.h - ((v - scale.min) / (scale.max - scale.min)) * area.h);
    // grid and value labels
    ctx.lineWidth = 1;
    ctx.fillStyle = '#595959';
    for (const v of ticks) {
      const q = Math.round(val(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? '#A6A6A6' : '#E0E0E0';
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(q, area.y); ctx.lineTo(q, area.y + area.h); } else { ctx.moveTo(area.x, q); ctx.lineTo(area.x + area.w, q); }
      ctx.stroke();
      ctx.textAlign = horizontal ? 'center' : 'right';
      if (horizontal) ctx.fillText(format(v), q, area.y + area.h + 10); else ctx.fillText(format(v), area.x - 5, q);
    }
    const band = (horizontal ? area.h : area.w) / Math.max(1, n);
    const center = (i) => (horizontal ? area.y + band * (n - i - 0.5) : area.x + band * (i + 0.5)); // (bars: the first category at the bottom, as in Office)
    const xPos = (i) => (scatter ? area.x + ((xs[i] - xScale.min) / (xScale.max - xScale.min || 1)) * area.w : center(i));
    // category labels
    ctx.fillStyle = '#595959';
    if (scatter) {
      ctx.textAlign = 'center';
      for (let v = xScale.min; v <= xScale.max + xScale.step / 2; v += xScale.step) ctx.fillText(format(v), area.x + ((v - xScale.min) / (xScale.max - xScale.min || 1)) * area.w, area.y + area.h + 10);
    } else {
      const every = horizontal ? Math.max(1, Math.ceil(12 / band)) : Math.max(1, Math.ceil((Math.max(...m.categories.map((c) => ctx.measureText(c).width), 10) + 6) / band));
      m.categories.forEach((c, i) => {
        if (i % every) return;
        if (horizontal) { ctx.textAlign = 'right'; ctx.fillText(fit(ctx, c, catW - 6), area.x - 5, center(i)); } else { ctx.textAlign = 'center'; ctx.fillText(fit(ctx, c, band * every - 4), center(i), area.y + area.h + 10); }
      });
    }
    const zero = val(Math.max(scale.min, Math.min(0, scale.max)));
    const label = (v, x, y) => { if (!m.labels || v === null) return; ctx.fillStyle = '#404040'; ctx.textAlign = 'center'; ctx.font = `11px ${FONT}`; ctx.fillText(format(v), x, y); };
    if (m.type === 'column' || m.type === 'bar') {
      const S = m.series.length, group = band * 0.7, thick = stacked ? group : group / Math.max(1, S);
      for (let i = 0; i < n; i++) {
        let pos = 0, neg = 0;
        m.series.forEach((s, k) => {
          const v = s.values[i];
          if (v === null) return;
          let from = 0, to = v;
          if (stacked) { if (v >= 0) { from = pos; to = pos + v; pos = to; } else { from = neg; to = neg + v; neg = to; } }
          const a = val(from), b = val(to), off = center(i) - group / 2 + (stacked ? 0 : k * thick);
          ctx.fillStyle = colorOf(m, k);
          if (horizontal) ctx.fillRect(Math.min(a, b), off, Math.abs(b - a), thick - 1); else ctx.fillRect(off, Math.min(a, b), thick - 1, Math.abs(b - a));
          if (stacked && m.labels && Math.abs(b - a) > 14) { // (in the middle of its part of the stack)
            ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = `11px ${FONT}`;
            ctx.fillText(format(v), horizontal ? (a + b) / 2 : off + thick / 2, horizontal ? off + thick / 2 : (a + b) / 2);
          } else if (!stacked) { if (horizontal) label(v, Math.max(a, b) + 14, off + thick / 2); else label(v, off + thick / 2, Math.min(a, b) - 8); }
        });
      }
      return;
    }
    // lines, areas, points
    const base = new Array(n).fill(0);
    m.series.forEach((s, k) => {
      const pts = s.values.map((v, i) => {
        if (v === null) return null;
        const y = stacked ? base[i] + v : v;
        const from = stacked ? base[i] : 0;
        if (stacked) base[i] = y;
        return { x: xPos(i), y: val(y), from: val(from), v };
      });
      ctx.strokeStyle = colorOf(m, k);
      ctx.fillStyle = colorOf(m, k);
      if (m.type === 'area') {
        const runs = [];
        let run = [];
        for (const pt of pts) { if (pt) run.push(pt); else if (run.length) { runs.push(run); run = []; } }
        if (run.length) runs.push(run);
        for (const r of runs) {
          ctx.beginPath();
          r.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
          for (let i = r.length - 1; i >= 0; i--) ctx.lineTo(r[i].x, stacked ? r[i].from : zero);
          ctx.closePath();
          ctx.globalAlpha = 0.75;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (m.type !== 'scatter') {
        ctx.lineWidth = 2.25;
        ctx.beginPath();
        let open = false;
        for (const pt of pts) { if (!pt) { open = false; continue; } if (open) ctx.lineTo(pt.x, pt.y); else { ctx.moveTo(pt.x, pt.y); open = true; } }
        ctx.stroke();
      }
      if (m.type === 'line' || m.type === 'scatter') for (const pt of pts) if (pt) { ctx.beginPath(); ctx.arc(pt.x, pt.y, m.type === 'scatter' ? 4 : 3, 0, Math.PI * 2); ctx.fillStyle = colorOf(m, k); ctx.fill(); }
      for (const pt of pts) if (pt) label(pt.v, pt.x, pt.y - 10);
    });
  }

  // ---- PNG with the model ---------------------------------------------------------------------------------------------
  const latin1 = new TextDecoder('latin1');
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function toBytes(src) {
    if (src instanceof Uint8Array) return src;
    const m = /^data:image\/png;base64,(.*)$/s.exec(String(src || ''));
    return m ? unb64(m[1]) : new Uint8Array(0);
  }

  /** The chart as a PNG data URL (2× the size for sharp output), with the model in a tEXt chunk. */
  function toPng(model, width = 480, height = 288) {
    const m = normalize(model);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * 2);
    canvas.height = Math.round(height * 2);
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    draw(ctx, m, width, height);
    const png = toBytes(canvas.toDataURL('image/png'));
    const text = new TextEncoder().encode(`${KEY}\0${b64(new TextEncoder().encode(JSON.stringify(m)))}`);
    const chunk = new Uint8Array(12 + text.length);
    const v = new DataView(chunk.buffer);
    v.setUint32(0, text.length);
    chunk.set(new TextEncoder().encode('tEXt'), 4);
    chunk.set(text, 8);
    v.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
    const iend = png.length - 12; // (IEND is the last chunk)
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, iend));
    out.set(chunk, iend);
    out.set(png.subarray(iend), iend + chunk.length);
    return `data:image/png;base64,${b64(out)}`;
  }

  const seen = new Map(); // src -> model | null (panels ask on every render)
  function modelOf(src) {
    if (typeof src === 'string' && seen.has(src)) return seen.get(src) && structuredClone(seen.get(src));
    const found = readModel(src);
    if (typeof src === 'string') { seen.set(src, found); if (seen.size > 30) seen.delete(seen.keys().next().value); }
    return found && structuredClone(found);
  }
  function readModel(src) {
    const b = toBytes(src);
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let p = 8; p + 12 <= b.length;) {
      const len = v.getUint32(p);
      const type = latin1.decode(b.subarray(p + 4, p + 8));
      if (type === 'tEXt' && latin1.decode(b.subarray(p + 8, p + 8 + KEY.length + 1)) === `${KEY}\0`) {
        try { return normalize(JSON.parse(new TextDecoder().decode(unb64(latin1.decode(b.subarray(p + 9 + KEY.length, p + 8 + len)))))); } catch (e) { return null; }
      }
      if (type === 'IEND') break;
      p += 12 + len;
    }
    return null;
  }
  const isChart = (src) => !!modelOf(src);

  // ---- charts of Office files (DrawingML: the values cached in the chart part) ------------------------------------------
  const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart', A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  /** resolve(formula) -> [values] reads a reference without cached values (XLSX: the workbook's cells; openpyxl writes no caches). */
  function fromChartXml(xml, { resolve = null } = {}) {
    const doc = typeof xml === 'string' ? new DOMParser().parseFromString(xml, 'application/xml') : xml;
    const c = (el, name) => (el ? [...el.children].find((x) => x.namespaceURI === C_NS && x.localName === name) || null : null);
    const all = (el, name) => (el ? [...el.getElementsByTagNameNS(C_NS, name)] : []);
    const val = (el) => (el ? el.getAttribute('val') : null);
    const chart = doc.getElementsByTagNameNS(C_NS, 'chart')[0];
    const plot = c(chart, 'plotArea');
    if (!plot) return null;
    const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'scatterChart', 'ofPieChart'];
    const node = [...plot.children].find((x) => kinds.includes(x.localName));
    if (!node) return null;
    const kind = node.localName.replace('3D', '');
    const type = kind === 'barChart' ? (val(c(node, 'barDir')) === 'bar' ? 'bar' : 'column') : { lineChart: 'line', areaChart: 'area', pieChart: 'pie', ofPieChart: 'pie', doughnutChart: 'doughnut', scatterChart: 'scatter' }[kind];
    const cache = (ref) => {
      const pts = all(ref, 'pt');
      const f = all(ref, 'f')[0];
      if (!pts.length && f && resolve) { try { return (resolve(f.textContent) || []).map((v) => (v === null || v === undefined ? null : String(v))); } catch (e) { return []; } }
      const count = Number(val(all(ref, 'ptCount')[0])) || (pts.length ? Math.max(...pts.map((p) => Number(p.getAttribute('idx')))) + 1 : 0);
      const out = new Array(count).fill(null);
      for (const p of pts) out[Number(p.getAttribute('idx'))] = (p.getElementsByTagNameNS(C_NS, 'v')[0] || {}).textContent ?? null;
      return out;
    };
    let categories = [];
    const series = [...node.children].filter((x) => x.localName === 'ser' && x.namespaceURI === C_NS).map((ser, i) => {
      const cat = c(ser, kind === 'scatterChart' ? 'xVal' : 'cat'), vals = c(ser, kind === 'scatterChart' ? 'yVal' : 'val');
      const cats = cache(cat);
      if (cats.length > categories.length) categories = cats;
      const tx = c(ser, 'tx');
      let name = tx ? (tx.getElementsByTagNameNS(C_NS, 'v')[0] || tx.getElementsByTagNameNS(A_NS, 't')[0] || {}).textContent : null;
      if (!name && tx && resolve && all(tx, 'f')[0]) { try { name = String((resolve(all(tx, 'f')[0].textContent) || [])[0] ?? ''); } catch (e) { /* none */ } }
      const fill = c(ser, 'spPr') && c(ser, 'spPr').getElementsByTagNameNS(A_NS, 'srgbClr')[0];
      return { name: name || Suite.t('ch.series', i + 1), values: cache(vals).map((v) => num(v)), ...(fill ? { color: `#${fill.getAttribute('val')}` } : {}) };
    });
    if (!series.length) return null;
    const title = c(chart, 'title');
    const deleted = val(c(chart, 'autoTitleDeleted')) === '1';
    const legend = c(chart, 'legend');
    const pos = legend ? val(c(legend, 'legendPos')) || 'r' : null;
    const grouping = val(c(node, 'grouping'));
    return normalize({
      type, categories: categories.map((v, i) => v ?? String(i + 1)), series,
      title: title ? [...title.getElementsByTagNameNS(A_NS, 't')].map((t) => t.textContent).join('') || (!deleted && series.length === 1 ? series[0].name : '') : '',
      legend: !legend ? 'none' : pos === 'b' || pos === 't' ? 'bottom' : 'right', stacked: grouping === 'stacked' || grouping === 'percentStacked',
    });
  }

  // ---- the dialog -----------------------------------------------------------------------------------------------------
  let host = null;
  function edit({ model, onSave, refresh = null }) {
    if (!host) { host = document.createElement('div'); host.className = 'pico suite-chart-host'; /* (Pico's dialog styles apply inside .pico) */ document.body.append(host); }
    const { html } = Suite.shell;
    const { render } = htmPreact;
    let m = normalize(model);
    const close = () => render(null, host);
    const paint = () => {
      const canvas = host.querySelector('[data-testid=chart-preview]');
      if (!canvas) return;
      const w = canvas.clientWidth || 360, h = canvas.clientHeight || 220;
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      draw(ctx, m, w, h);
    };
    const update = (fn) => { m = normalize(fn(structuredClone(m)) || m); show(); };
    const field = (key) => (e) => update((x) => { x[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; return x; });
    function Dialog() {
      const axes = !['pie', 'doughnut', 'scatter'].includes(m.type);
      return html`<dialog open class="pico suite-chart" data-testid="chart-dialog"><article>
        <header><strong>${Suite.t('ch.chart')}</strong></header>
        <div class="suite-chart-options">
          <label>${Suite.t('ch.type')}<select data-testid="chart-type" onChange=${field('type')}>${TYPES.map((x) => html`<option value=${x} selected=${m.type === x}>${Suite.t(`ch.t.${x}`)}</option>`)}</select></label>
          <label>${Suite.t('ch.title')}<input data-testid="chart-title" value=${m.title} onInput=${field('title')} /></label>
          <label>${Suite.t('ch.legend')}<select data-testid="chart-legend" onChange=${field('legend')}>${['right', 'bottom', 'none'].map((x) => html`<option value=${x} selected=${m.legend === x}>${Suite.t(`ch.${x}`)}</option>`)}</select></label>
        </div>
        <div class="suite-chart-checks">
          ${axes ? html`<label><input type="checkbox" data-testid="chart-stacked" checked=${m.stacked} onChange=${field('stacked')} />${Suite.t('ch.stacked')}</label>` : null}
          <label><input type="checkbox" data-testid="chart-labels" checked=${m.labels} onChange=${field('labels')} />${Suite.t('ch.labels')}</label>
        </div>
        <canvas class="suite-chart-preview" data-testid="chart-preview"></canvas>
        <details open><summary>${Suite.t('ch.data')}</summary>
          <div class="suite-chart-grid"><table><thead><tr><th>${Suite.t('ch.category')}</th>
            ${m.series.map((s, k) => html`<th><input type="color" title=${Suite.t('ch.color', s.name)} aria-label=${Suite.t('ch.color', s.name)} value=${colorOf(m, k)}
              onInput=${(e) => update((x) => { x.series[k].color = e.target.value; return x; })} /><input data-testid="chart-series-name" value=${s.name}
              onInput=${(e) => update((x) => { x.series[k].name = e.target.value; return x; })} /></th>`)}</tr></thead>
            <tbody>${m.categories.map((cat, r) => html`<tr><th><input data-testid="chart-category" value=${cat} onInput=${(e) => update((x) => { x.categories[r] = e.target.value; return x; })} /></th>
              ${m.series.map((s, k) => html`<td><input data-testid="chart-cell" inputmode="decimal" value=${s.values[r] ?? ''}
                onChange=${(e) => update((x) => { x.series[k].values[r] = num(e.target.value); return x; })} /></td>`)}</tr>`)}</tbody></table></div>
          <div role="group" class="suite-chart-rows">
            <button type="button" class="secondary outline" data-testid="chart-add-row" onClick=${() => update((x) => { x.categories.push(String(x.categories.length + 1)); x.series.forEach((s) => s.values.push(null)); return x; })}>${Suite.t('ch.addRow')}</button>
            <button type="button" class="secondary outline" data-testid="chart-remove-row" disabled=${m.categories.length < 2} onClick=${() => update((x) => { x.categories.pop(); x.series.forEach((s) => s.values.pop()); return x; })}>${Suite.t('ch.removeRow')}</button>
            <button type="button" class="secondary outline" data-testid="chart-add-series" onClick=${() => update((x) => { x.series.push({ name: Suite.t('ch.series', x.series.length + 1), values: x.categories.map(() => null) }); return x; })}>${Suite.t('ch.addSeries')}</button>
            <button type="button" class="secondary outline" data-testid="chart-remove-series" disabled=${m.series.length < 2} onClick=${() => update((x) => { x.series.pop(); return x; })}>${Suite.t('ch.removeSeries')}</button>
          </div>
        </details>
        <footer>
          ${refresh ? html`<button type="button" class="secondary outline" data-testid="chart-refresh" onClick=${() => {
            const fresh = refresh();
            if (!fresh) { Suite.shell.toast(Suite.t('ch.sourceGone'), 'warning'); return; }
            update((x) => ({ ...fresh, type: x.type, title: x.title, legend: x.legend, stacked: x.stacked, labels: x.labels, series: fresh.series.map((s, k) => ({ ...s, color: (x.series[k] || {}).color })) }));
          }}>${Suite.t('ch.refresh')}</button>` : null}
          <button type="button" class="secondary" data-testid="chart-cancel" onClick=${close}>${Suite.t('ch.cancel')}</button>
          <button type="button" data-testid="chart-ok" onClick=${() => { close(); onSave(normalize(m)); }}>${Suite.t('ch.ok')}</button>
        </footer>
      </article></dialog>`;
    }
    function show() { render(html`<${Dialog} />`, host); requestAnimationFrame(paint); }
    show();
    document.fonts.ready.then(() => requestAnimationFrame(paint));
  }

  Suite.charts = { FONT, TYPES, PALETTE, normalize, sample, fromRows, draw, toPng, modelOf, isChart, fromChartXml, edit };
})(window.Suite = window.Suite || {});
