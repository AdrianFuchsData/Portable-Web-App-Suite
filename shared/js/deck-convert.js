/*
 * Conversion between the two slide models of the suite:
 *   - the positioned deck of the presentation editor (pptx-import.js: slides with absolutely placed elements, pt font sizes)
 *   - the block deck of the web slides (apps/reveal/src/js/deck.js: stacks of slides with blocks that flow from top to bottom)
 *
 *   pptxToWebSlides(deck, { title }) -> plain web slides deck (normalize it with deck.js normalizeDeck)
 *   webSlidesToPptx(deck)           -> presentation deck (width 960 × 540 or 720)
 *
 * What maps: titles/headings, paragraphs with formatting, bullet and numbered lists, images, tables, code (monospace text), quotes,
 * speaker notes, background colours, transitions and entrance animations (reveal.js fragments). Free shapes without text, exact
 * positions and reveal.js-only features (auto-animate, backgrounds images/gradients, custom HTML) are approximated or left out.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let counter = 0;
const id = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---- PPTX -> web slides ------------------------------------------------------------------------------

/** Runs of a paragraph as inline HTML (bold, italic, underline, strike, colour). */
function runsHtml(runs, { keepColor = true } = {}) {
  return runs.map((r) => {
    let h = esc(r.text === '\n' ? '' : r.text);
    if (r.text === '\n') return '<br>';
    if (!h) return '';
    if (r.bold) h = `<strong>${h}</strong>`;
    if (r.italic) h = `<em>${h}</em>`;
    if (r.underline) h = `<u>${h}</u>`;
    if (r.strike) h = `<s>${h}</s>`;
    if (keepColor && r.color && !grey(r.color)) h = `<span style="color:${r.color}">${h}</span>`; // theme greys follow the web theme
    return h;
  }).join('');
}

/** Black, white and greys (theme text colours) are left to the theme of the web slides. */
function grey(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return true;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

const plain = (text) => (text ? text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') : '');
const block = (type, props) => ({ id: id('b'), type, fragment: '', fragmentIndex: null, animateId: '', align: '', size: 0, color: '', ...props });
const FRAGMENT = { appear: 'fade-in', fade: 'fade-in', fly: 'fade-up', zoom: 'grow' };
const TRANSITION_TO_REVEAL = { fade: 'fade', push: 'slide', wipe: 'slide', cover: 'convex', zoom: 'zoom' };
const ALIGN = { ctr: 'center', r: 'right', just: 'justify' };

/** One positioned slide -> blocks in reading order (top to bottom, then left to right). */
function slideBlocks(sl, first) {
  const order = new Map();
  let step = 0;
  for (const a of sl.animations || []) { if (a.start === 'click' || !order.size) step += 1; order.set(a.id, { index: step - 1, effect: a.effect }); }
  const elements = sl.elements.filter((e) => !e.locked && (e.type !== 'shape' || plain(e.text).trim()))
    .sort((a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x));
  const blocks = [];
  let titleDone = false;
  for (const el of elements) {
    const anim = order.get(el.id);
    const out = [];
    const ph = el.placeholder ? el.placeholder.type : '';
    if (el.type === 'image') out.push(block('image', { src: el.image.src, alt: el.name || '', width: Math.round(el.w), stretch: false }));
    else if (el.type === 'table') {
      out.push(block('table', { header: true, rows: el.table.rows.map((r) => r.cells.filter((c) => !c.hMerge && !c.vMerge).map((c) => plain(c.text))) }));
    } else if (el.text) {
      const paras = el.text.paragraphs.filter((p) => p.runs.some((r) => r.text.trim()));
      if (!paras.length) continue;
      const isTitle = !titleDone && (ph === 'title' || ph === 'ctrTitle');
      if (isTitle) {
        titleDone = true;
        out.push(block('heading', { level: first || ph === 'ctrTitle' ? 1 : 2, html: paras.map((p) => runsHtml(p.runs, { keepColor: false })).join('<br>'), fit: false }));
      } else if (paras.some((p) => p.bullet) || ph === 'body' || ph === 'obj') {
        // bullet paragraphs become a list; deeper levels are indented with a nested-looking prefix
        const ordered = paras.some((p) => p.bullet && p.bullet.auto);
        const listed = paras.filter((p) => p.bullet || ph === 'body' || ph === 'obj');
        const textParas = paras.filter((p) => !listed.includes(p));
        if (textParas.length) out.push(block('text', { html: textParas.map((p) => runsHtml(p.runs)).join('<br>') }));
        out.push(block('list', { ordered, items: listed.map((p) => `${'&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(p.level || 0)}${runsHtml(p.runs)}`), itemFragment: '' }));
      } else {
        const size = Math.max(...paras.flatMap((p) => p.runs.map((r) => r.size || 18)));
        out.push(block('text', { html: paras.map((p) => runsHtml(p.runs)).join('<br>'), align: ALIGN[paras[0].align] || '', size: size >= 28 ? 1.3 : size <= 14 ? 0.8 : 0 }));
      }
    }
    if (anim) for (const b of out) Object.assign(b, { fragment: FRAGMENT[anim.effect] || 'fade-in', fragmentIndex: anim.index });
    blocks.push(...out);
  }
  return blocks;
}

export function pptxToWebSlides(deck, { title = 'Presentation' } = {}) {
  const slides = deck.slides.map((sl, i) => {
    const tr = sl.transition;
    return {
      id: id('s'), kind: 'blocks', blocks: slideBlocks(sl, i === 0), markdown: '', html: '', notes: sl.notes || '',
      background: sl.background && !/^#FFFFFF$/i.test(sl.background) ? { color: sl.background } : {},
      transition: tr ? TRANSITION_TO_REVEAL[tr.type] || 'fade' : '', transitionSpeed: tr ? (tr.duration <= 0.6 ? 'fast' : tr.duration > 0.9 ? 'slow' : '') : '',
      autoAnimate: false, visibility: '', layout: '', autoSlide: tr && tr.advanceAfter ? Math.round(tr.advanceAfter * 1000) : 0, className: '', children: [],
    };
  });
  const dark = deck.slides.filter((s) => s.background && luminance(s.background) < 0.4).length > deck.slides.length / 2;
  return {
    version: 1, title, lang: 'en', theme: dark ? 'black' : 'white', highlightTheme: 'monokai', css: '',
    config: { transition: 'none', width: Math.round(deck.width), height: Math.round(deck.height) },
    slides,
  };
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return 1;
  return (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
}

// ---- web slides -> PPTX ------------------------------------------------------------------------------

const run = (text, size, props = {}) => ({ text, bold: false, italic: false, underline: false, strike: false, size, color: '#000000', font: 'Calibri', ...props });
const para = (runs, align = 'l', props = {}) => ({ align, level: 0, bullet: null, runs, ...props });
const textBox = (x, y, w, h, paragraphs, props = {}) => ({
  id: id('text'), type: 'text', name: 'Text', x, y, w, h, rot: 0, geometry: 'rect', fill: null, line: null,
  text: { anchor: 't', insets: [9.6, 4.8, 9.6, 4.8], paragraphs }, ...props,
});

/** Inline HTML -> runs (strong/b, em/i, u, s/del, colour spans, <br> as line breaks). */
function htmlRuns(html, size, base = {}) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const runs = [];
  const walk = (node, fmt) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { if (c.textContent) runs.push(run(c.textContent.replace(/\s+/g, ' '), size, { ...base, ...fmt })); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName;
      if (tag === 'BR') { runs.push(run('\n', size, { ...base, ...fmt })); continue; }
      const next = { ...fmt };
      if (tag === 'STRONG' || tag === 'B') next.bold = true;
      if (tag === 'EM' || tag === 'I') next.italic = true;
      if (tag === 'U') next.underline = true;
      if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') next.strike = true;
      if (tag === 'CODE') next.font = 'Consolas';
      const color = c.style && c.style.color && toHex(c.style.color);
      if (color) next.color = color;
      walk(c, next);
    }
  };
  walk(doc.body, {});
  return runs.length ? runs : [run('', size, base)];
}

function toHex(css) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (m) return `#${m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return /^#[0-9a-f]{6}$/i.test(css) ? css.toUpperCase() : null;
}

/** Runs split at line breaks into paragraphs. */
function splitLines(runs, align, props = {}) {
  const out = [[]];
  for (const r of runs) { if (r.text === '\n') out.push([]); else out[out.length - 1].push(r); }
  return out.map((rs) => para(rs.length ? rs : [run('', (runs[0] || {}).size || 18)], align, props));
}

/** HTML or Markdown slide content -> blocks (headings, paragraphs, lists, images, code, quotes, tables). */
function contentBlocks(slide) {
  if (slide.kind === 'blocks') return slide.blocks;
  let html = slide.html || '';
  if (slide.kind === 'markdown') html = markdownToHtml(slide.markdown || '');
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks = [];
  const visit = (node) => {
    for (const el of node.children) {
      const tag = el.tagName;
      const before = blocks.length;
      if (/^H[1-6]$/.test(tag)) blocks.push(block('heading', { level: Number(tag[1]), html: el.innerHTML }));
      else if (tag === 'P') {
        const img = el.querySelector('img');
        if (img && !el.textContent.trim()) blocks.push(block('image', { src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '', width: 0 }));
        else blocks.push(block('text', { html: el.innerHTML }));
      } else if (tag === 'UL' || tag === 'OL') blocks.push(block('list', { ordered: tag === 'OL', items: [...el.children].filter((li) => li.tagName === 'LI').map((li) => li.innerHTML) }));
      else if (tag === 'IMG') blocks.push(block('image', { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '', width: 0 }));
      else if (tag === 'PRE') blocks.push(block('code', { code: el.textContent.replace(/\n$/, ''), language: '' }));
      else if (tag === 'BLOCKQUOTE') blocks.push(block('quote', { html: el.innerHTML.replace(/<\/?p>/g, ''), cite: '' }));
      else if (tag === 'TABLE') blocks.push(block('table', { header: !!el.querySelector('th'), rows: [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())) }));
      else if (tag === 'ASIDE' && el.classList.contains('notes')) continue;
      else if (el.children.length) visit(el);
      else if (el.textContent.trim()) blocks.push(block('text', { html: el.innerHTML }));
      // reveal.js fragments: on the element or on parts of it (e.g. list items)
      if (blocks.length === before + 1 && (el.classList.contains('fragment') || el.querySelector('.fragment'))) {
        const f = el.classList.contains('fragment') ? el : el.querySelector('.fragment');
        const kind = [...f.classList].find((c) => c !== 'fragment') || 'fade-in';
        Object.assign(blocks[before], { fragment: kind, fragmentIndex: f.dataset.fragmentIndex !== undefined ? Number(f.dataset.fragmentIndex) : null });
      }
    }
  };
  visit(doc.body);
  return blocks;
}

/** A small Markdown subset (headings, lists, images, code fences, quotes, paragraphs, bold/italic/code). */
function markdownToHtml(md) {
  const inline = (s) => esc(s).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) { const code = []; for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]); out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      for (; i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))}</li>`);
      i--;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('');
}

const REVEAL_TO_TRANSITION = { fade: 'fade', slide: 'push', convex: 'push', concave: 'push', zoom: 'zoom' };
const FRAGMENT_TO_EFFECT = (f) => (/^grow|zoom/.test(f) ? 'zoom' : /fade-(up|down|left|right)/.test(f) ? 'fly' : 'fade');

/** Lay the blocks of one web slide out on a PPTX slide (top to bottom, the space shared by font size). */
function layoutSlide(slide, deckConfig, w, h) {
  const blocks = contentBlocks(slide);
  const elements = [];
  const animations = [];
  const margin = 48;
  let y = 36;
  const dark = slide.background && slide.background.color && luminance(slide.background.color) < 0.4;
  const fg = dark ? '#FFFFFF' : '#000000';
  const onlyTitle = blocks.length && blocks.every((b) => b.type === 'heading' || b.type === 'text') && blocks.length <= 2 && blocks[0].type === 'heading' && blocks[0].level === 1;
  if (onlyTitle) y = h / 2 - 80;
  const fragments = [];
  for (const b of blocks) {
    let el = null;
    const color = b.color ? toHex(b.color) || fg : fg;
    const align = b.align === 'center' ? 'ctr' : b.align === 'right' ? 'r' : onlyTitle ? 'ctr' : 'l';
    const scale = b.size || 1;
    if (b.type === 'heading') {
      const size = Math.round(({ 1: 40, 2: 32, 3: 28, 4: 24 }[b.level] || 22) * scale);
      const lines = Math.max(1, (b.html || '').split(/<br\s*\/?>/i).length);
      const height = Math.round(lines * size * 1.6 + 12);
      el = textBox(margin, y, w - 2 * margin, height, splitLines(htmlRuns(b.html, size, { bold: true, color }), b.align ? align : onlyTitle || b.level === 1 ? 'ctr' : 'l'), { name: 'Title' });
    } else if (b.type === 'text' || b.type === 'quote' || b.type === 'html') {
      const size = Math.round(20 * scale);
      const runs = htmlRuns(b.type === 'html' ? (b.html || '').replace(/<\/(p|div|li|h\d)>/gi, '<br>') : b.html, size, { color, italic: b.type === 'quote' });
      const paras = splitLines(runs, align);
      if (b.type === 'quote' && b.cite) paras.push(para([run(`— ${b.cite}`, Math.round(size * 0.8), { color, italic: true })], 'r'));
      const chars = runs.reduce((n, r) => n + r.text.length, 0);
      const lines = paras.length + Math.floor(chars / Math.max(20, (w - 2 * margin) / (size * 0.55)));
      el = textBox(margin, y, w - 2 * margin, Math.round(lines * size * 1.45 + 12), paras);
    } else if (b.type === 'list') {
      const size = Math.round(20 * scale);
      const paras = (b.items || []).map((item) => {
        const depth = (/^((?:&nbsp;){4})+/.exec(item) || [''])[0].length / 24;
        return para(htmlRuns(item.replace(/^(&nbsp;)+/, ''), size, { color }), 'l', { level: depth, bullet: b.ordered ? { auto: 'arabicPeriod' } : { char: '•' } });
      });
      el = textBox(margin, y, w - 2 * margin, Math.round(paras.length * size * 1.55 + 12), paras);
    } else if (b.type === 'code') {
      const lines = (b.code || '').split('\n');
      const size = lines.length > 14 ? 12 : 14;
      el = textBox(margin, y, w - 2 * margin, Math.round(lines.length * size * 1.4 + 16), lines.map((l) => para([run(l || ' ', size, { font: 'Consolas', color: '#000000' })])), { fill: '#F2F2F2' });
    } else if (b.type === 'image' && b.src) {
      const maxH = Math.max(80, h - y - 30);
      const width = Math.min(w - 2 * margin, b.width || (w - 2 * margin) * 0.6);
      const height = Math.min(maxH, width * 0.6);
      el = { id: id('image'), type: 'image', name: b.alt || 'Image', x: (w - width) / 2, y, w: width, h: height, rot: 0, image: { src: b.src } };
    } else if (b.type === 'table') {
      const rows = b.rows || [];
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const cw = (w - 2 * margin) / cols;
      el = {
        id: id('table'), type: 'table', name: 'Table', x: margin, y, w: w - 2 * margin, h: rows.length * 36, rot: 0,
        table: { columns: Array(cols).fill(cw), rows: rows.map((r) => ({ height: 36, cells: Array.from({ length: cols }, (_, i) => ({ text: { anchor: 't', insets: [9.6, 4.8, 9.6, 4.8], paragraphs: [para([run(String(r[i] ?? ''), 14)])] }, fill: null })) })) },
      };
    }
    if (!el) continue;
    elements.push(el);
    y += el.h + 10;
    if (b.fragment || b.itemFragment) fragments.push({ id: el.id, index: Number.isInteger(b.fragmentIndex) ? b.fragmentIndex : null, effect: FRAGMENT_TO_EFFECT(b.fragment || b.itemFragment), order: fragments.length });
  }
  // fragments with the same index appear together; without an index in document order
  fragments.sort((a, b) => (a.index ?? a.order + 1000) - (b.index ?? b.order + 1000) || a.order - b.order);
  let last = null;
  for (const f of fragments) {
    animations.push({ id: f.id, effect: f.effect, start: last !== null && f.index !== null && f.index === last ? 'with' : 'click' });
    last = f.index;
  }
  // content taller than the slide: shrink it to fit
  if (y > h) {
    const k = (h - 20) / y;
    for (const el of elements) {
      el.y *= k; el.h *= k;
      if (el.text) for (const p of el.text.paragraphs) for (const r of p.runs) r.size = Math.max(8, Math.round(r.size * k));
    }
  }
  const t = slide.transition || deckConfig.transition;
  return {
    id: id('slide'), background: slide.background && slide.background.color ? toHex(slide.background.color) || '#FFFFFF' : dark ? '#000000' : '#FFFFFF', elements,
    ...(slide.notes ? { notes: slide.notes } : {}),
    ...(t && t !== 'none' && REVEAL_TO_TRANSITION[t] ? { transition: { type: REVEAL_TO_TRANSITION[t], dir: 'l', duration: (slide.transitionSpeed || deckConfig.transitionSpeed) === 'fast' ? 0.5 : (slide.transitionSpeed || deckConfig.transitionSpeed) === 'slow' ? 1 : 0.75, ...(slide.autoSlide ? { advanceAfter: slide.autoSlide / 1000 } : {}) } } : {}),
    ...(animations.length ? { animations } : {}),
  };
}

export function webSlidesToPptx(deck) {
  const config = deck.config || {};
  const ratio = (config.width || 960) / (config.height || 700);
  const w = 960, h = ratio < 1.5 ? 720 : 540;
  const slides = [];
  for (const stack of deck.slides || []) for (const s of [stack, ...(stack.children || [])]) if (s.visibility !== 'hidden') slides.push(layoutSlide(s, config, w, h));
  return { width: w, height: h, slides: slides.length ? slides : [{ id: id('slide'), background: '#FFFFFF', elements: [] }] };
}
