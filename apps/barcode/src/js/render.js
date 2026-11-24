/*
 * Drawing barcode symbols (zxing-wasm: a bitmap, 0 = dark, 255 = light, without quiet zone) as SVG and on a canvas with
 * a module size, quiet zone, colours, a bar height for linear codes and text with the code: the encoded content (below linear
 * codes as usual; below 2D codes wrapped to the code's width) and a caption of its own above or below.
 *
 *   options: { scale, margin, linear, barHeight, text (the content to show, '' = none), caption, captionPos: 'below'|'above', fg, bg }
 */

const MAX_TEXT_LINES = 12;

/** Lines of a text wrapped to a number of characters (words kept together where possible), at most MAX_TEXT_LINES. */
export function wrap(text, chars) {
  const out = [];
  for (const para of String(text).replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if ((line + word).length <= chars) { line += word; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = word.trimStart();
      while (line.length > chars) { out.push(line.slice(0, chars)); line = line.slice(chars); }
    }
    out.push(line.trimEnd());
  }
  if (out.length > MAX_TEXT_LINES) { out.length = MAX_TEXT_LINES; out[MAX_TEXT_LINES - 1] = `${out[MAX_TEXT_LINES - 1].slice(0, Math.max(0, chars - 1))}…`; }
  return out;
}

/**
 * Layout of a symbol: { width, height, runs: [[x, y, w, h], ...], lines: [{ text, y (baseline), size, mono }] } in pixels.
 */
export function layout(symbol, { scale = 4, margin = 4, linear = false, barHeight = 60, text = '', caption = '', captionPos = 'below' } = {}) {
  const { width, height, data } = symbol;
  const sx = scale;
  const sy = linear ? Math.max(1, barHeight / height) : scale;
  const fullWidth = (width + 2 * margin) * sx;
  const codeHeight = height * sy;
  const size = Math.round(Math.max(10, linear ? scale * 4 : Math.min(scale * 3, fullWidth / 14)));
  const chars = (fontSize, mono) => Math.max(4, Math.floor((fullWidth - 2 * Math.max(4, sx)) / (fontSize * (mono ? 0.6 : 0.55))));
  const lineHeight = (fontSize) => Math.round(fontSize * 1.25);
  const content = text ? (linear ? [String(text)] : wrap(text, chars(size, true))) : [];
  const own = caption ? wrap(caption, chars(size, false)) : [];
  const above = captionPos === 'above' ? own : [];
  const below = captionPos === 'above' ? content : [...content, ...own];
  const pad = Math.round(size * 0.4);
  const topText = above.length ? above.length * lineHeight(size) + pad : 0;
  const top = margin * sx + topText; // y of the first symbol row
  const runs = [];
  // identical neighbouring rows become one rectangle per run (1D codes: one row group)
  let y = 0;
  while (y < height) {
    let y2 = y + 1;
    const same = (a, b) => { for (let x = 0; x < width; x++) if ((data[a * width + x] < 128) !== (data[b * width + x] < 128)) return false; return true; };
    while (y2 < height && same(y, y2)) y2++;
    for (let x = 0; x < width;) {
      if (data[y * width + x] < 128) {
        let x2 = x + 1;
        while (x2 < width && data[y * width + x2] < 128) x2++;
        runs.push([(margin + x) * sx, top + y * sy, (x2 - x) * sx, (y2 - y) * sy]);
        x = x2;
      } else x++;
    }
    y = y2;
  }
  const lines = [];
  let ty = margin * sx;
  for (const l of above) { ty += lineHeight(size); lines.push({ text: l, y: Math.round(ty - size * 0.25), size, mono: false }); }
  // below the code: linear codes keep their text close to the bars (inside the quiet zone, as before)
  ty = top + codeHeight + (linear ? 0 : pad);
  below.forEach((l, i) => { ty += lineHeight(size); lines.push({ text: l, y: Math.round(ty - size * 0.25), size, mono: i < content.length }); });
  const bottomText = below.length ? below.length * lineHeight(size) + (linear ? 0 : pad) : 0;
  const height2 = Math.round(top + codeHeight + bottomText + margin * sx);
  return { width: fullWidth, height: height2, runs, lines };
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => Math.round(v * 100) / 100;
const FONT = { mono: 'monospace', sans: 'Arial, Helvetica, sans-serif' };

export function toSvg(symbol, options = {}) {
  const { fg = '#000000', bg = '#ffffff' } = options;
  const l = layout(symbol, options);
  const d = l.runs.map(([x, y, w, h]) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`).join('');
  const text = l.lines.map((t) => `<text x="${n(l.width / 2)}" y="${t.y}" font-family="${t.mono ? FONT.mono : FONT.sans}" font-size="${n(t.size * 0.9)}" text-anchor="middle" xml:space="preserve" fill="${xml(fg)}">${xml(t.text)}</text>`).join('');
  const back = bg === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${xml(bg)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(l.width)}" height="${l.height}" viewBox="0 0 ${n(l.width)} ${l.height}" shape-rendering="crispEdges">${back}<path fill="${xml(fg)}" d="${d}"/>${text}</svg>`;
}

export function toCanvas(symbol, options = {}) {
  const { fg = '#000000', bg = '#ffffff' } = options;
  const l = layout(symbol, options);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(l.width);
  canvas.height = l.height;
  const g = canvas.getContext('2d');
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.fillStyle = fg;
  for (const [x, y, w, h] of l.runs) g.fillRect(x, y, w, h);
  g.textAlign = 'center';
  for (const t of l.lines) {
    g.font = `${t.size * 0.9}px ${t.mono ? FONT.mono : FONT.sans}`;
    g.fillText(t.text, l.width / 2, t.y);
  }
  return canvas;
}
