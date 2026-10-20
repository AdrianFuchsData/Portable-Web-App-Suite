/*
 * Drawing barcode symbols (zxing-wasm: a bitmap, 0 = dark, 255 = light, without quiet zone) as SVG and on a canvas with
 * a module size, quiet zone, colours and – for linear codes – a bar height and the human-readable text below.
 */

/** Layout of a symbol: { width, height, sy (pixels per symbol row), textHeight, runs: [[x, y, w, h], ...] } in modules/pixels. */
export function layout(symbol, { scale = 4, margin = 4, linear = false, barHeight = 60, text = '' } = {}) {
  const { width, height, data } = symbol;
  const sx = scale;
  const sy = linear ? Math.max(1, barHeight / height) : scale;
  const textHeight = linear && text ? Math.round(Math.max(10, scale * 4)) : 0;
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
        runs.push([(margin + x) * sx, margin * sx + y * sy, (x2 - x) * sx, (y2 - y) * sy]);
        x = x2;
      } else x++;
    }
    y = y2;
  }
  return { width: (width + 2 * margin) * sx, height: Math.round(height * sy + 2 * margin * sx + textHeight), textHeight, textY: Math.round(height * sy + margin * sx + textHeight * 0.85), runs };
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => Math.round(v * 100) / 100;

export function toSvg(symbol, options = {}) {
  const { fg = '#000000', bg = '#ffffff', text = '' } = options;
  const l = layout(symbol, options);
  const d = l.runs.map(([x, y, w, h]) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`).join('');
  const label = l.textHeight ? `<text x="${n(l.width / 2)}" y="${l.textY}" font-family="monospace" font-size="${n(l.textHeight * 0.9)}" text-anchor="middle" fill="${xml(fg)}">${xml(text)}</text>` : '';
  const back = bg === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${xml(bg)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(l.width)}" height="${l.height}" viewBox="0 0 ${n(l.width)} ${l.height}" shape-rendering="crispEdges">${back}<path fill="${xml(fg)}" d="${d}"/>${label}</svg>`;
}

export function toCanvas(symbol, options = {}) {
  const { fg = '#000000', bg = '#ffffff', text = '' } = options;
  const l = layout(symbol, options);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(l.width);
  canvas.height = l.height;
  const g = canvas.getContext('2d');
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.fillStyle = fg;
  for (const [x, y, w, h] of l.runs) g.fillRect(x, y, w, h);
  if (l.textHeight) {
    g.font = `${l.textHeight * 0.9}px monospace`;
    g.textAlign = 'center';
    g.fillText(text, l.width / 2, l.textY);
  }
  return canvas;
}
