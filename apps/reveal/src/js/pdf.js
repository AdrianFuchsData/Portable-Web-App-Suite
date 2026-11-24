/*
 * PDF export of the web slides without the print dialog: reveal.js lays the deck out in its print view (one .pdf-page per slide
 * – and per fragment step if wanted) in a hidden iframe; every page is drawn into a canvas through an SVG <foreignObject> (the
 * deck's CSS, fonts and pictures are inline, so the picture is complete) and the pictures become the pages of a PDF (pdf-lib).
 * Pictures from other web addresses cannot be drawn this way and stay empty.
 *
 *   await exportPdf(html, { scale, onProgress }) -> Uint8Array      html: renderPage(…, { config: { view: 'print' } })
 */

const XHTML = 'http://www.w3.org/1999/xhtml';

/** CSS for a <div> instead of <html> and <body>: html.x → .suite-html.x, body → .suite-body. */
function retarget(css) {
  return css
    .replace(/(^|[\s,{}>+~(])html(?=[\s.,{:#[>+~)])/g, '$1.suite-html')
    .replace(/(^|[\s,{}>+~(])body(?=[\s.,{:#[>+~)])/g, '$1.suite-body')
    .replace(/:root(?=[\s.,{:#[>+~)])/g, '.suite-html');
}

function waitForReady(frame, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('the slides did not load')); }, timeout);
    function on(e) {
      if (e.source !== frame.contentWindow || e.data !== 'suite-print-ready') return;
      clearTimeout(timer);
      window.removeEventListener('message', on);
      resolve();
    }
    window.addEventListener('message', on);
  });
}

const loadImage = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('a slide could not be drawn')); img.src = url; });

export async function exportPdf(html, { scale = 2, onProgress = () => {}, timeout = 60000 } = {}) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-30000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
  const ready = waitForReady(frame, timeout);
  frame.srcdoc = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `<script nonce="${(/nonce-([\w-]+)/.exec(html) || [])[1] || ''}">Reveal.on('ready', function () { setTimeout(function () { parent.postMessage('suite-print-ready', '*'); }, 400); });</script></body>`);
  document.body.append(frame);
  try {
    await ready;
    const doc = frame.contentDocument;
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    // (the print pages may be built a moment after "ready", e.g. in Firefox)
    for (let n = 0; n < 100 && !doc.querySelector('.pdf-page'); n++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 200));
    const pages = [...doc.querySelectorAll('.pdf-page')];
    if (!pages.length) throw new Error('no slides');
    const css = [...doc.querySelectorAll('style')].map((s) => retarget(s.textContent)).join('\n');
    const htmlClass = `suite-html ${doc.documentElement.className}`;
    const body = doc.body;
    const bodyClass = `suite-body ${body.className}`;
    const reveal = doc.querySelector('.reveal');
    const slides = doc.querySelector('.reveal .slides');
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const serializer = new XMLSerializer();
    for (let i = 0; i < pages.length; i++) {
      onProgress(i, pages.length);
      const page = pages[i];
      const w = Math.round(page.offsetWidth), h = Math.round(page.offsetHeight);
      // the page alone, inside copies of its ancestors (for the selectors of reveal.js and the theme)
      const root = doc.createElementNS(XHTML, 'div');
      root.setAttribute('class', htmlClass);
      root.setAttribute('style', `width:${w}px;height:${h}px;overflow:hidden;margin:0;position:relative`);
      const style = doc.createElementNS(XHTML, 'style');
      style.textContent = `${css}\n.suite-body, .suite-html { width: ${w}px; height: ${h}px; margin: 0; overflow: hidden; }\n.pdf-page { margin: 0 !important; }`;
      root.append(style);
      const b = doc.createElementNS(XHTML, 'div');
      b.setAttribute('class', bodyClass);
      if (body.getAttribute('style')) b.setAttribute('style', body.getAttribute('style'));
      const r = reveal.cloneNode(false);
      const sl = slides.cloneNode(false);
      sl.append(page.cloneNode(true));
      r.append(sl);
      b.append(r);
      root.append(b);
      for (const s of root.querySelectorAll('script')) s.remove();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${serializer.serializeToString(root)}</foreignObject></svg>`;
      // (a data: URL: a blob: URL of a file:// page taints the canvas in Chromium)
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      try {
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = w * scale; canvas.height = h * scale;
        const g = canvas.getContext('2d');
        g.scale(scale, scale);
        g.drawImage(img, 0, 0, w, h);
        const png = new Uint8Array(await (await new Promise((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('a slide could not be drawn'))), 'image/png'))).arrayBuffer());
        const image = await pdf.embedPng(png);
        const p = pdf.addPage([w * 0.75, h * 0.75]);
        p.drawImage(image, { x: 0, y: 0, width: w * 0.75, height: h * 0.75 });
      } finally { /* (nothing to release) */ }
    }
    onProgress(pages.length, pages.length);
    pdf.setTitle(doc.title || 'Slides');
    pdf.setCreator('Portable Web App Suite – web slides');
    return await pdf.save();
  } finally { frame.remove(); }
}
