/*
 * Deck model of the reveal.js editor, HTML generation (presentation and editing preview) and import of reveal.js HTML,
 * Markdown and Jupyter notebooks.
 *
 * deck  = { version, title, lang, theme, highlightTheme, css, config: { transition, … }, slides: [stack] }
 * stack = { ...slide, children: [slide] }      (horizontal slide with optional vertical sub-slides)
 * slide = { id, kind: 'blocks' | 'markdown' | 'html', blocks, markdown, html, notes, background, transition,
 *           transitionSpeed, autoAnimate, visibility, layout, autoSlide, className }
 * block = { id, type: 'heading' | 'text' | 'list' | 'image' | 'code' | 'quote' | 'table' | 'html' | 'diagram', …,
 *           fragment, fragmentIndex, animateId, align, size, color }
 */

export const THEMES = ['black', 'white', 'league', 'beige', 'night', 'serif', 'simple', 'sky', 'solarized', 'moon', 'dracula', 'blood', 'black-contrast', 'white-contrast'];
export const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'];
export const SPEEDS = ['default', 'fast', 'slow'];
export const FRAGMENTS = ['', 'fade-in', 'fade-out', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-in-then-out', 'fade-in-then-semi-out',
  'grow', 'shrink', 'strike', 'highlight-red', 'highlight-green', 'highlight-blue', 'highlight-current-red', 'highlight-current-blue', 'semi-fade-out'];
export const BLOCK_TYPES = ['heading', 'text', 'list', 'image', 'code', 'quote', 'table', 'diagram', 'html'];
export const CODE_LANGUAGES = ['', 'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift',
  'sql', 'bash', 'powershell', 'json', 'yaml', 'xml', 'html', 'css', 'markdown', 'plaintext'];
export const DEFAULT_CONFIG = {
  transition: 'slide', transitionSpeed: 'default', backgroundTransition: 'fade', controls: true, progress: true, slideNumber: false,
  center: true, hash: false, loop: false, autoSlide: 0, width: 960, height: 700, navigationMode: 'default', autoAnimateDuration: 1, view: '',
};

let counter = 0;
export const newId = (prefix = 'b') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newBlock(type, props = {}) {
  const base = { id: newId('b'), type, fragment: '', fragmentIndex: null, animateId: '', align: '', size: 0, color: '' };
  const defaults = {
    heading: { level: 2, html: 'Heading', fit: false },
    text: { html: 'Text' },
    list: { ordered: false, items: ['First point', 'Second point'], itemFragment: '' },
    image: { src: '', alt: '', width: 0, stretch: false },
    code: { language: 'javascript', code: 'console.log("Hello");', lineNumbers: '', trim: true },
    quote: { html: 'Quote', cite: '' },
    table: { header: true, rows: [['Column 1', 'Column 2'], ['A', 'B']] },
    html: { html: '<p>HTML</p>' },
    // a Mermaid flowchart; the editor keeps its SVG (rendered with the diagram editor's layout) in svg
    diagram: { source: 'flowchart LR\n  A[Idea] --> B{Good?}\n  B -->|yes| C([Slides])\n  B -->|no| A', svg: '', error: '' },
  };
  return { ...base, ...(defaults[type] || {}), ...props };
}

export function newSlide(template = 'content', props = {}) {
  const slide = { id: newId('s'), kind: 'blocks', blocks: [], markdown: '', html: '', notes: '', background: {}, transition: '', transitionSpeed: '',
    autoAnimate: false, visibility: '', layout: '', autoSlide: 0, className: '' };
  const templates = {
    title: () => [newBlock('heading', { level: 1, html: 'Title' }), newBlock('text', { html: 'Subtitle' })],
    content: () => [newBlock('heading', { html: 'Heading' }), newBlock('list')],
    section: () => [newBlock('heading', { level: 2, html: 'Section', fit: true })],
    image: () => [newBlock('heading', { level: 3, html: 'Image' }), newBlock('image', { stretch: true })],
    code: () => [newBlock('heading', { level: 3, html: 'Code' }), newBlock('code')],
    quote: () => [newBlock('quote', { html: 'A memorable quote.', cite: 'Someone' })],
    blank: () => [],
  };
  if (template === 'markdown') Object.assign(slide, { kind: 'markdown', markdown: '## Markdown\n\n- one\n- two' });
  else if (template === 'html') Object.assign(slide, { kind: 'html', html: '<h2>HTML</h2>' });
  else slide.blocks = (templates[template] || templates.content)();
  return { ...slide, ...props };
}

export function newDeck(title = 'Presentation') {
  const first = newSlide('title');
  first.blocks[0].html = title;
  return { version: 1, title, lang: 'en', theme: 'black', highlightTheme: 'monokai', css: '', config: { ...DEFAULT_CONFIG }, slides: [{ ...first, children: [] }, { ...newSlide('content'), children: [] }] };
}

/** Normalize a deck read from a file (missing fields, old versions). */
export function normalizeDeck(deck) {
  const slide = (s) => ({ ...newSlide('blank'), ...s, background: s.background || {}, blocks: (s.blocks || []).map((b) => ({ ...newBlock(b.type), ...b })) });
  return {
    ...newDeck(), ...deck, config: { ...DEFAULT_CONFIG, ...(deck.config || {}) },
    slides: (deck.slides || []).map((s) => ({ ...slide(s), children: (s.children || []).map(slide) })),
  };
}

// ---- iteration -----------------------------------------------------------------------------------------------

/** [{ slide, h, v }] in presentation order. */
export function flatten(deck) {
  const out = [];
  deck.slides.forEach((stack, h) => {
    out.push({ slide: stack, h, v: 0 });
    stack.children.forEach((child, i) => out.push({ slide: child, h, v: i + 1 }));
  });
  return out;
}
export const slideAt = (deck, h, v) => { const stack = deck.slides[h]; return stack ? (v ? stack.children[v - 1] : stack) : null; };
export function findSlide(deck, id) { return flatten(deck).find((x) => x.slide.id === id) || null; }
export function slideTitle(slide) {
  if (slide.kind === 'markdown') return (slide.markdown.match(/^#+\s*(.+)$/m) || [, slide.markdown.split('\n')[0]])[1].trim();
  const source = slide.kind === 'html' ? slide.html : (slide.blocks.find((b) => b.type === 'heading') || slide.blocks.find((b) => b.html) || {}).html || '';
  const tmp = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  return tmp.body.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
}

// ---- HTML generation ------------------------------------------------------------------------------------------

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attrs = (obj) => Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
  .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');

function blockAttrs(b, extraClass = '', editable = false) {
  const cls = [extraClass, b.fragment ? `fragment ${b.fragment === 'fade-in' ? '' : b.fragment}` : ''].join(' ').replace(/\s+/g, ' ').trim();
  const style = [b.align ? `text-align:${b.align}` : '', b.size ? `font-size:${b.size}em` : '', b.color ? `color:${b.color}` : ''].filter(Boolean).join(';');
  return attrs({ class: cls, style, 'data-fragment-index': b.fragment && Number.isInteger(b.fragmentIndex) ? b.fragmentIndex : '', 'data-id': b.animateId, 'data-block': editable ? b.id : '' });
}

export function renderBlock(b, editable = false) {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, b.level || 2));
      return `<h${level}${blockAttrs(b, b.fit ? 'r-fit-text' : '', editable)}>${b.html}</h${level}>`;
    }
    case 'text': return `<p${blockAttrs(b, '', editable)}>${b.html}</p>`;
    case 'quote': return `<blockquote${blockAttrs(b, '', editable)}>${b.html}${b.cite ? `<br><cite>— ${esc(b.cite)}</cite>` : ''}</blockquote>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const item = (html) => `<li${attrs({ class: b.itemFragment ? `fragment ${b.itemFragment === 'fade-in' ? '' : b.itemFragment}`.trim() : '' })}>${html}</li>`;
      return `<${tag}${blockAttrs(b, '', editable)}>${b.items.map(item).join('')}</${tag}>`;
    }
    case 'image': {
      if (!b.src) return editable ? `<div${blockAttrs(b, 'suite-placeholder', editable)}>🖼</div>` : '';
      const style = b.width ? `width:${b.width}%` : '';
      return `<img${blockAttrs({ ...b, align: '' }, b.stretch ? 'r-stretch' : '', editable)}${attrs({ src: b.src, alt: b.alt, style: [style, b.align === 'left' ? 'margin-right:auto;display:block' : b.align === 'right' ? 'margin-left:auto;display:block' : ''].filter(Boolean).join(';') })}>`;
    }
    case 'code': {
      const code = attrs({ class: b.language ? `language-${b.language}` : '', 'data-trim': b.trim, 'data-noescape': false, 'data-line-numbers': b.lineNumbers === 'all' ? true : b.lineNumbers });
      return `<pre${blockAttrs(b, '', editable)}><code${code}>${esc(b.code)}</code></pre>`;
    }
    case 'table': {
      const rows = b.rows.map((row, i) => `<tr>${row.map((cell) => (b.header && i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`);
      return `<table${blockAttrs(b, '', editable)}>${b.header && rows.length ? `<thead>${rows[0]}</thead><tbody>${rows.slice(1).join('')}</tbody>` : `<tbody>${rows.join('')}</tbody>`}</table>`;
    }
    case 'html': return `<div${blockAttrs(b, '', editable)}>${b.html}</div>`;
    case 'diagram': return b.svg ? `<div${blockAttrs(b, 'suite-diagram', editable)}>${b.svg}</div>` : editable ? `<div${blockAttrs(b, 'suite-placeholder', editable)}>◇ ${esc(b.error || 'Mermaid')}</div>` : '';
    default: return '';
  }
}

function slideAttrs(s, editable) {
  const bg = s.background || {};
  return attrs({
    'data-background-color': bg.color, 'data-background-gradient': bg.gradient, 'data-background-image': bg.image,
    'data-background-size': bg.image ? bg.size : '', 'data-background-position': bg.image ? bg.position : '', 'data-background-repeat': bg.image ? bg.repeat : '',
    'data-background-opacity': bg.image && bg.opacity !== undefined && bg.opacity !== '' && bg.opacity !== 1 ? bg.opacity : '',
    'data-background-transition': bg.transition,
    'data-transition': s.transition, 'data-transition-speed': s.transitionSpeed && s.transitionSpeed !== 'default' ? s.transitionSpeed : '',
    'data-auto-animate': s.autoAnimate, 'data-visibility': s.visibility, 'data-autoslide': s.autoSlide ? s.autoSlide * 1000 : '',
    class: [s.className, s.layout === 'top' ? 'suite-top' : ''].filter(Boolean).join(' '), 'data-slide': editable ? s.id : '',
    'data-markdown': s.kind === 'markdown',
  });
}

export function renderSlide(s, editable = false) {
  const notes = s.notes ? `<aside class="notes">${esc(s.notes).replace(/\n/g, '<br>')}</aside>` : '';
  let body;
  if (s.kind === 'markdown') body = `<textarea data-template>\n${mathForMarked(s.markdown).replace(/<\/textarea/gi, '&lt;/textarea')}\n</textarea>`;
  else if (s.kind === 'html') body = s.html;
  else body = s.blocks.map((b) => renderBlock(b, editable)).join('\n');
  return `<section${slideAttrs(s, editable)}>${body}${notes}</section>`;
}

export function renderSlides(deck, editable = false) {
  return deck.slides.map((stack) => (stack.children.length
    ? `<section>${renderSlide(stack, editable)}${stack.children.map((c) => renderSlide(c, editable)).join('')}</section>`
    : renderSlide(stack, editable))).join('\n');
}

/** reveal.js configuration of a deck (the plugins are added by the page). */
export function revealConfig(deck, overrides = {}) {
  const c = { ...DEFAULT_CONFIG, ...deck.config };
  const config = {
    transition: c.transition, transitionSpeed: c.transitionSpeed, backgroundTransition: c.backgroundTransition, controls: c.controls,
    progress: c.progress, slideNumber: c.slideNumber, center: c.center, hash: c.hash, loop: c.loop, autoSlide: (c.autoSlide || 0) * 1000,
    width: c.width, height: c.height, navigationMode: c.navigationMode, autoAnimateDuration: c.autoAnimateDuration,
  };
  if (c.view) config.view = c.view;
  return { ...config, ...overrides };
}

const scriptText = (text) => text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/**
 * A complete, self-contained HTML page with the deck. assets: { reveal, plugins: {name: code}, css: {reveal, theme, fonts,
 * highlight} } (texts). options: { editable, config (reveal overrides), extraHead, extraBody }.
 */
// TeX between $$…$$ or \[…\] (display) and \(…\) (inline); a single $ is left alone (prices, shell code)
const MATH_RE = /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/;
export const MATH_DELIMITERS = [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }];

// Markdown (marked) would eat the backslashes of \( \[ \, \{ … and turn _ and * into emphasis: inside formulas they are
// escaped for the Markdown plugin, and unescaped again when a presentation is imported
const MATH_SPAN_RE = /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;
const ESCAPED_SPAN_RE = /\$\$[\s\S]+?\$\$|\\\\\([\s\S]+?\\\\\)|\\\\\[[\s\S]+?\\\\\]/g;
export const mathForMarked = (md) => md.replace(MATH_SPAN_RE, (m) => m.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\').replace(/[_*]/g, '\\$&'));
export const mathFromMarked = (md) => md.replace(ESCAPED_SPAN_RE, (m) => m.replace(/\\([_*])/g, '$1').replace(/\\\\(?=[!-/:-@[-`{-~])/g, '\\'));

/** True when a slide of the deck contains TeX formulas (the page then embeds KaTeX). */
export function usesMath(deck) {
  return flatten(deck).some(({ slide }) => MATH_RE.test(JSON.stringify([slide.blocks, slide.markdown, slide.html])));
}

/** KaTeX for a page: stylesheet, scripts and the rendering after reveal.js (and its Markdown plugin) is ready. */
function mathPart(assets, editable) {
  const options = { delimiters: MATH_DELIMITERS, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'], throwOnError: false };
  return {
    head: `<style>${assets.math.css}</style>`,
    body: `<script>${scriptText(assets.math.katex)}</script>
<script>${scriptText(assets.math.autoRender)}</script>
<script>
(function (typeset) { if (Reveal.isReady()) typeset(); else Reveal.on('ready', typeset); })(function () {
  var slides = document.querySelector('.reveal .slides');
  ${editable ? "slides.querySelectorAll('[data-block]').forEach(function (el) { el.suiteSource = el.innerHTML; }); // the editor edits the TeX source" : ''}
  renderMathInElement(slides, ${scriptText(JSON.stringify(options))});
  Reveal.layout();
  document.body.dataset.math = 'rendered';
});
</script>`,
  };
}

/** A random nonce for the scripts of one rendered page. */
function newNonce() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}

const ACTIVE = /<\s*(script|iframe|frame|object|embed|base|meta|form)\b|\son[a-z]+\s*=|(?:href|src|action|data)\s*=\s*["']?\s*(?:javascript|vbscript):|srcdoc\s*=/i;

/**
 * Does the deck carry markup that could run code (scripts, event handlers, javascript: links, frames, …)? Code blocks and
 * notes are shown as text and do not count. The question is only for asking the user – the protection is the page's
 * Content Security Policy (renderPage), which blocks such content in any case unless the deck is trusted.
 */
export function hasActiveContent(deck) {
  const walk = (v, key) => {
    if (typeof v === 'string') return key !== 'code' && key !== 'notes' && ACTIVE.test(v);
    if (Array.isArray(v)) return v.some((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => walk(x, k));
    return false;
  };
  return walk(deck && deck.slides, '');
}

/**
 * The page of a deck. Only the editor's own scripts (reveal.js, plugins, math, the parts in extraHead/extraBody) carry the
 * page's nonce; the Content Security Policy allows no other script, so markup in the slides (HTML blocks, Markdown, imported
 * presentations) cannot run code – neither inline scripts nor event handlers nor javascript: links – also when the saved
 * file is opened in a browser. A trusted deck (the user allowed its scripts) gets no policy: its own scripts run.
 */
export function renderPage(deck, assets, { editable = false, config = {}, extraHead = '', extraBody = '', trusted = false } = {}) {
  const plugins = ['RevealHighlight', 'RevealMarkdown', 'RevealNotes', 'RevealZoom', 'RevealSearch'].filter((p) => assets.plugins[p]);
  const model = JSON.stringify(deck);
  const math0 = assets.math && assets.math.katex && usesMath(deck) ? mathPart(assets, editable) : { head: '', body: '' };
  const nonce = newNonce();
  const own = (part) => String(part || '').replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`); // (never applied to slide content)
  const math = { head: own(math0.head), body: own(math0.body) };
  extraHead = own(extraHead);
  extraBody = own(extraBody);
  return `<!doctype html>
<html lang="${esc(deck.lang || 'en')}">
<head>
${trusted ? '' : `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; object-src 'none'; base-uri 'none'; form-action 'none'">`}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Portable Web App Suite – reveal.js editor">
<title>${esc(deck.title)}</title>
<style>${assets.css.reveal}</style>
<style>${assets.css.fonts || ''}</style>
<style>${assets.css.theme}</style>
<style>${assets.css.highlight || ''}</style>
<style>.reveal .slides section.suite-top { top: 0 !important; } .reveal .r-stretch { object-fit: contain; }
${deck.css || ''}</style>
${math.head}
${extraHead}
</head>
<body>
<div class="reveal"><div class="slides">
${renderSlides(deck, editable)}
</div></div>
<script type="application/json" id="suite-reveal-deck">${scriptText(model)}</script>
<script nonce="${nonce}">${scriptText(assets.reveal)}</script>
${plugins.map((p) => `<script nonce="${nonce}">${scriptText(assets.plugins[p])}</script>`).join('\n')}
<script nonce="${nonce}">
Reveal.initialize(Object.assign(${scriptText(JSON.stringify(revealConfig(deck, config)))}, { plugins: [${plugins.join(', ')}] }));
</script>
${math.body}
${extraBody}
</body>
</html>
`;
}

// ---- import ---------------------------------------------------------------------------------------------------

/** A deck saved by this editor (embedded model) or any reveal.js presentation (slides as HTML). */
export function fromHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const embedded = doc.getElementById('suite-reveal-deck');
  if (embedded) {
    try { return normalizeDeck(JSON.parse(embedded.textContent)); } catch (e) { /* fall back to the slides */ }
  }
  const container = doc.querySelector('.reveal .slides');
  if (!container) throw new Error('no reveal.js slides found');
  const deck = newDeck(doc.title || 'Presentation');
  deck.title = doc.title || deck.title;
  deck.lang = doc.documentElement.lang || 'en';
  const themeLink = [...doc.querySelectorAll('link[href*="theme/"]')].map((l) => (l.getAttribute('href').match(/theme\/([\w-]+)\.css/) || [])[1]).find((n) => THEMES.includes(n));
  if (themeLink) deck.theme = themeLink;
  const config = text.match(/Reveal\.initialize\(\s*(\{[\s\S]*?\})\s*\)/);
  if (config) {
    for (const key of ['transition', 'transitionSpeed', 'backgroundTransition', 'navigationMode']) {
      const m = config[1].match(new RegExp(`${key}\\s*:\\s*['"\`](\\w+)['"\`]`));
      if (m) deck.config[key] = m[1];
    }
    for (const key of ['controls', 'progress', 'slideNumber', 'center', 'hash', 'loop']) {
      const m = config[1].match(new RegExp(`${key}\\s*:\\s*(true|false)`));
      if (m) deck.config[key] = m[1] === 'true';
    }
    for (const key of ['width', 'height']) {
      const m = config[1].match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
      if (m) deck.config[key] = +m[1];
    }
  }
  const toSlide = (section) => {
    const s = newSlide('blank');
    const d = section.dataset;
    const legacy = d.background || ''; // data-background: a colour or an image URL
    const legacyImage = /[./]|url\(/i.test(legacy) && !/^(#|rgb|hsl)/i.test(legacy);
    s.background = { color: d.backgroundColor || (legacyImage ? '' : legacy), gradient: d.backgroundGradient || '', image: d.backgroundImage || (legacyImage ? legacy : ''),
      size: d.backgroundSize || '', position: d.backgroundPosition || '', repeat: d.backgroundRepeat || '', opacity: d.backgroundOpacity ? +d.backgroundOpacity : '' };
    s.transition = d.transition || '';
    s.transitionSpeed = d.transitionSpeed || '';
    s.autoAnimate = 'autoAnimate' in d;
    s.visibility = d.visibility || '';
    const notes = section.querySelector(':scope > aside.notes');
    if (notes) { s.notes = notes.textContent.trim(); notes.remove(); }
    if ('markdown' in d) {
      const tpl = section.querySelector('textarea[data-template], script[type="text/template"]');
      Object.assign(s, { kind: 'markdown', markdown: tpl ? mathFromMarked(tpl.textContent.replace(/^\n|\n\s*$/g, '')) : '' });
    } else Object.assign(s, { kind: 'html', html: section.innerHTML.trim() });
    return s;
  };
  deck.slides = [...container.children].filter((el) => el.tagName === 'SECTION').map((section) => {
    const nested = [...section.children].filter((el) => el.tagName === 'SECTION');
    if (!nested.length) return { ...toSlide(section), children: [] };
    const [first, ...rest] = nested.map(toSlide);
    return { ...first, children: rest };
  });
  if (!deck.slides.length) deck.slides = [{ ...newSlide('title'), children: [] }];
  return deck;
}

/** Markdown with reveal.js separators: "---" between horizontal slides, "--" between vertical ones, "Note:" for notes. */
export function fromMarkdown(text, title = 'Presentation') {
  const deck = newDeck(title);
  const md = text.replace(/\r\n/g, '\n');
  const toSlide = (chunk) => {
    const [content, ...notes] = chunk.split(/^Note:\s*$/m);
    return newSlide('markdown', { markdown: content.trim(), notes: notes.join('\n').trim() });
  };
  deck.slides = md.split(/^\r?---\r?$/m).map((horizontal) => {
    const [first, ...rest] = horizontal.split(/^\r?--\r?$/m).map(toSlide);
    return { ...first, children: rest };
  }).filter((s) => s.markdown || s.children.length);
  if (!deck.slides.length) deck.slides = [{ ...newSlide('markdown'), children: [] }];
  const heading = md.match(/^#\s+(.+)$/m);
  if (heading) deck.title = heading[1].trim();
  return deck;
}

/** Jupyter notebook with slideshow metadata (slide, subslide, fragment, skip, notes), like nbconvert --to slides. */
export function fromNotebook(text, title = 'Notebook') {
  const nb = JSON.parse(text);
  const deck = newDeck(title);
  deck.theme = 'simple';
  const lang = ((nb.metadata && (nb.metadata.language_info || {}).name) || 'python').toLowerCase();
  const source = (s) => (Array.isArray(s) ? s.join('') : s || '');
  const outputs = (cell) => (cell.outputs || []).map((o) => {
    const data = o.data || {};
    if (o.output_type === 'stream') return `<pre class="suite-output">${esc(source(o.text))}</pre>`;
    if (o.output_type === 'error') return `<pre class="suite-output">${esc(`${o.ename}: ${o.evalue}`)}</pre>`;
    if (data['image/png']) return `<img alt="" src="data:image/png;base64,${source(data['image/png']).replace(/\s/g, '')}">`;
    if (data['image/svg+xml']) return `<div>${source(data['image/svg+xml'])}</div>`;
    if (data['text/html']) return `<div class="suite-output">${source(data['text/html'])}</div>`;
    if (data['text/plain']) return `<pre class="suite-output">${esc(source(data['text/plain']))}</pre>`;
    return '';
  }).join('\n');
  const slides = [];
  let current = null;
  const add = (kind) => {
    current = newSlide('markdown', { markdown: '' });
    if (kind === 'subslide' && slides.length) slides[slides.length - 1].children.push(current);
    else {
      current.children = [];
      slides.push(current);
    }
  };
  for (const cell of nb.cells || []) {
    const type = ((cell.metadata || {}).slideshow || {}).slide_type || '-';
    if (type === 'skip') continue;
    let content = cell.cell_type === 'code'
      ? [source(cell.source).trim() ? `\`\`\`${lang}\n${source(cell.source).trim()}\n\`\`\`` : '', outputs(cell)].filter(Boolean).join('\n\n')
      : source(cell.source).trim();
    if (!content) continue;
    if (type === 'notes') { if (!current) add('slide'); current.notes = [current.notes, source(cell.source).trim()].filter(Boolean).join('\n\n'); continue; }
    if (type === 'slide' || type === 'subslide' || !current) add(type === 'subslide' ? 'subslide' : 'slide');
    if (type === 'fragment') content = `<div class="fragment">\n\n${content}\n\n</div>`;
    current.markdown = [current.markdown, content].filter(Boolean).join('\n\n');
  }
  deck.slides = slides.length ? slides : [{ ...newSlide('markdown'), children: [] }];
  deck.css = '.reveal pre.suite-output { font-size: .5em; box-shadow: none; } .reveal .suite-output table { font-size: .55em; }';
  return deck;
}

/** The deck as Markdown with reveal.js separators (block slides are converted to HTML). */
export function toMarkdown(deck) {
  const one = (s) => {
    const body = s.kind === 'markdown' ? s.markdown : s.kind === 'html' ? s.html : s.blocks.map((b) => renderBlock(b)).join('\n\n');
    return s.notes ? `${body}\n\nNote:\n${s.notes}` : body;
  };
  return `${deck.slides.map((stack) => [stack, ...stack.children].map(one).join('\n\n--\n\n')).join('\n\n---\n\n')}\n`;
}
