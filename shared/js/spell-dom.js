/*
 * Spell checking in the text fields of a page (shared/js/spell.js): importing this module adds the spelling selector to the
 * header ("Spelling off" / a language / "Load dictionary…") and, while spelling is on, underlines unknown words in
 *  - <textarea> and <input data-spell> (a mirror element behind the field carries the marks),
 *  - contenteditable elements (marks on the text itself),
 * using the CSS Custom Highlight API (::highlight(suite-spell)). A right click on a marked word opens a menu with suggestions,
 * "Add to dictionary" and "Ignore" (Shift+right click: the browser's menu). CodeMirror editors use shared/js/cm-spell.js, which
 * uses the same menu. Fields with spellcheck="false" (code, addresses) are left out; the browser's own spell checking is
 * switched off in the fields this module checks.
 *
 *   import { showMenu } from 'app/spell-dom';    // showMenu(x, y, word, replace(text)) for other editors
 */
import { spell, words, wordAt } from 'app/spell';

const { html } = Suite.shell;
const t = Suite.t;
const NAME = 'suite-spell';
const MAX = 100000; // longer texts are not checked
const supported = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';

Suite.i18n.register({
  en: {
    'sp.label': 'Spelling', 'sp.off': 'Spelling off', 'sp.load': 'Load dictionary…', 'sp.add': 'Add to dictionary', 'sp.ignore': 'Ignore',
    'sp.none': 'No suggestions', 'sp.loaded': 'Dictionaries loaded: {0}', 'sp.noDictionary': 'No dictionary found: choose the .aff and the .dic file together, or an .oxt file.',
    'sp.unsupported': 'This browser cannot mark words in text fields (CSS Custom Highlight API); the spelling panels still work.',
  },
  de: {
    'sp.label': 'Rechtschreibung', 'sp.off': 'Rechtschreibung aus', 'sp.load': 'Wörterbuch laden…', 'sp.add': 'Zum Wörterbuch hinzufügen', 'sp.ignore': 'Ignorieren',
    'sp.none': 'Keine Vorschläge', 'sp.loaded': 'Wörterbücher geladen: {0}', 'sp.noDictionary': 'Kein Wörterbuch gefunden: Wählen Sie die .aff- und die .dic-Datei zusammen oder eine .oxt-Datei.',
    'sp.unsupported': 'Dieser Browser kann Wörter in Textfeldern nicht markieren (CSS Custom Highlight API); die Rechtschreib-Panels funktionieren trotzdem.',
  },
});

// ---- marks ----------------------------------------------------------------------------------------------------------------

const highlight = supported ? new Highlight() : null;
if (highlight) CSS.highlights.set(NAME, highlight);
const ranges = new Map(); // element -> [Range]
const mirrors = new Map(); // field -> mirror element
let layer = null;

const FIELD = 'textarea, input[data-spell]';
const EDITABLE = '[contenteditable=""], [contenteditable="true"]';
const skipped = (el) => el.closest('.cm-editor, [data-nospell]') || (el.getAttribute('spellcheck') === 'false' && el.dataset.suiteSpell === undefined)
  || el.disabled || el.readOnly || (el.tagName === 'INPUT' && !/^(text|search)?$/.test(el.type));

function targets() {
  return [...document.querySelectorAll(`${FIELD}, ${EDITABLE}`)].filter((el) => !skipped(el) && !(el.matches(EDITABLE) && el.parentElement && el.parentElement.closest(EDITABLE)));
}

function setRanges(el, list) {
  for (const r of ranges.get(el) || []) highlight.delete(r);
  if (list.length) { ranges.set(el, list); for (const r of list) highlight.add(r); } else ranges.delete(el);
}

/** Is a point of the element the top-most thing on the screen (not covered by a dialog or menu)? */
function visible(el, rect) {
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return false;
  const x = Math.min(Math.max(rect.left + 4, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + 4, 0), innerHeight - 1);
  const top = document.elementFromPoint(x, y);
  return !!top && (top === el || el.contains(top) || (top.classList && top.classList.contains('suite-spell-mirror')));
}

const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textAlign', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'direction', 'wordSpacing'];

function markField(el) {
  const rect = el.getBoundingClientRect();
  const text = el.value || '';
  let m = mirrors.get(el);
  if (!visible(el, rect) || !text || text.length > MAX) { if (m) m.hidden = true; setRanges(el, []); return; }
  if (!layer) { layer = document.createElement('div'); layer.className = 'suite-spell-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); }
  if (!m) { m = document.createElement('div'); m.className = 'suite-spell-mirror'; layer.append(m); mirrors.set(el, m); }
  m.hidden = false;
  const cs = getComputedStyle(el);
  for (const p of COPY) m.style[p] = cs[p];
  Object.assign(m.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    whiteSpace: el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre', overflowWrap: el.tagName === 'TEXTAREA' ? 'break-word' : 'normal' });
  // the scroll bar of the field narrows its text
  const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
  if (bar > 0) m.style.paddingRight = `${parseFloat(cs.paddingRight) + bar}px`;
  if (m.firstChild && m.firstChild.data === text) { /* unchanged text */ } else m.textContent = text;
  m.scrollTop = el.scrollTop;
  m.scrollLeft = el.scrollLeft;
  const node = m.firstChild;
  setRanges(el, spell.errors(text).map((w) => { const r = new Range(); r.setStart(node, w.start); r.setEnd(node, w.start + w.word.length); return r; }));
}

function markEditable(el) {
  if (!visible(el, el.getBoundingClientRect())) { setRanges(el, []); return; }
  const list = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('code, pre, a, [data-nospell]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let total = 0;
  for (let n = walker.nextNode(); n && total < MAX; n = walker.nextNode()) {
    total += n.data.length;
    for (const w of spell.errors(n.data)) { const r = new Range(); r.setStart(n, w.start); r.setEnd(n, w.start + w.word.length); list.push(r); }
  }
  setRanges(el, list);
}

function clear() {
  if (highlight) highlight.clear();
  ranges.clear();
  for (const m of mirrors.values()) m.remove();
  mirrors.clear();
}

let queued = false;
function update() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!supported) return;
    if (!spell.enabled || !spell.isReady) { clear(); syncNative(false); return; }
    const list = targets();
    syncNative(true, list);
    const keep = new Set(list);
    for (const el of [...ranges.keys(), ...mirrors.keys()]) {
      if (keep.has(el)) continue;
      setRanges(el, []);
      const m = mirrors.get(el);
      if (m) { m.remove(); mirrors.delete(el); }
    }
    for (const el of list) (el.matches(FIELD) ? markField : markEditable)(el);
  });
}

/** While spelling is on, the browser's own checking is off in the checked fields (no double marks). */
function syncNative(on, list = []) {
  if (on) {
    for (const el of list) if (el.dataset.suiteSpell === undefined) { el.dataset.suiteSpell = el.getAttribute('spellcheck') ?? ''; el.setAttribute('spellcheck', 'false'); }
  } else {
    for (const el of document.querySelectorAll('[data-suite-spell]')) {
      const old = el.dataset.suiteSpell;
      if (old) el.setAttribute('spellcheck', old); else el.removeAttribute('spellcheck');
      delete el.dataset.suiteSpell;
    }
  }
}

// ---- menu -------------------------------------------------------------------------------------------------------------------

let menu = null;

function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  document.removeEventListener('pointerdown', outside, true);
}
const outside = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };

/** The suggestion menu for a word at a screen position; replace(text) changes the word in its editor. */
export function showMenu(x, y, word, replace) {
  closeMenu();
  menu = document.createElement('div');
  menu.className = 'suite-spell-menu pico';
  menu.setAttribute('role', 'menu');
  menu.dataset.testid = 'spell-menu';
  const item = (label, run, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `secondary outline ${cls}`;
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.addEventListener('click', () => { closeMenu(); run(); });
    menu.append(b);
    return b;
  };
  const suggestions = spell.suggest(word);
  for (const s of suggestions) item(s, () => replace(s), 'suite-spell-suggestion').dataset.testid = 'spell-menu-suggestion';
  if (!suggestions.length) { const p = document.createElement('p'); p.textContent = t('sp.none'); menu.append(p); }
  menu.append(document.createElement('hr'));
  item(t('sp.add'), () => spell.add(word)).dataset.testid = 'spell-menu-add';
  item(t('sp.ignore'), () => spell.ignore(word)).dataset.testid = 'spell-menu-ignore';
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  const first = menu.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

/** Replace text in a field or editable element as typed input (keeps undo, informs the app). */
function insert(text) {
  if (!document.execCommand('insertText', false, text)) {
    const el = document.activeElement;
    if (el && 'setRangeText' in el) { el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}

document.addEventListener('contextmenu', (e) => {
  if (e.shiftKey || !spell.enabled || !spell.isReady) return;
  const el = e.target.closest && e.target.closest(`${FIELD}, ${EDITABLE}`);
  if (!el || skipped(el)) return;
  if (el.matches(FIELD)) {
    const w = wordAt(el.value || '', el.selectionStart ?? 0);
    if (!w || !spell.isWrong(w.word)) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, w.word, (text) => { el.focus(); el.setSelectionRange(w.start, w.start + w.word.length); insert(text); });
    return;
  }
  const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : null;
  const range = pos ? null : document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
  const node = pos ? pos.offsetNode : range && range.startContainer;
  const offset = pos ? pos.offset : range && range.startOffset;
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return;
  const w = wordAt(node.data, offset);
  if (!w || !spell.isWrong(w.word)) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, w.word, (text) => {
    const r = new Range();
    r.setStart(node, w.start);
    r.setEnd(node, w.start + w.word.length);
    el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    insert(text);
  });
}, true);

// ---- updates ------------------------------------------------------------------------------------------------------------------

spell.onChange(update);
for (const type of ['input', 'focusin', 'resize']) window.addEventListener(type, update, true);
document.addEventListener('scroll', update, true);
new MutationObserver((list) => {
  // own elements (mirrors, menu) do not count
  if (list.every((m) => m.target === layer || (layer && layer.contains(m.target)) || (menu && menu.contains(m.target)))) return;
  update();
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'hidden', 'open', 'class', 'style'] });

// ---- header control ----------------------------------------------------------------------------------------------------------

async function loadFromFiles() {
  const picked = await Suite.files.open({ multiple: true, types: [{ description: 'Hunspell', accept: { 'application/octet-stream': ['.aff', '.dic', '.oxt'] } }] });
  if (!picked || !picked.length) return;
  try {
    const files = await Promise.all(picked.map(async ({ file }) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
    const names = await spell.load(files);
    if (!names.length) { Suite.shell.toast(t('sp.noDictionary'), 'warning'); return; }
    spell.setEnabled(true);
    Suite.shell.toast(t('sp.loaded', names.join(', ')));
  } catch (err) { Suite.shell.toast(Suite.i18n.describe(err), 'error'); }
}

function SpellControl() {
  const value = spell.enabled ? spell.language : 'off';
  return html`<select class="suite-spell-select" data-testid="spell-select" aria-label=${t('sp.label')} title=${t('sp.label')}
    onChange=${(e) => {
      const v = e.target.value;
      if (v === 'load') { e.target.value = value; loadFromFiles(); return; }
      if (v === 'off') { spell.setEnabled(false); return; }
      if (v !== spell.language) spell.setLanguage(v);
      if (!spell.enabled) { spell.setEnabled(true); if (!supported) Suite.shell.toast(t('sp.unsupported'), 'warning'); }
    }} value=${value}>
    <option value="off" selected=${value === 'off'}>ABC ${t('sp.off')}</option>
    ${spell.languages().map((l) => html`<option value=${l.name} selected=${value === l.name}>ABC✓ ${l.label}</option>`)}
    <option value="load">${t('sp.load')}</option>
  </select>`;
}

if (spell.available) {
  Suite.shell.addHeaderItem(SpellControl);
  spell.onChange(() => Suite.shell.refresh());
  if (spell.enabled) spell.ready().catch((err) => console.warn('spelling', err));
}

export { spell, words };
