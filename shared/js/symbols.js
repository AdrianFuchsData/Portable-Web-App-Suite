/*
 * Emoji and symbols in every text field of the suite: a picker, codes typed into the text, and conversions.
 *
 *  - Ctrl+. (or the ☺ button in a focused field) opens the picker at the field: search (names and keywords in English
 *    and German, :shortcode:, emoticons like :), code points like U+1F60A), recently used characters, emoji groups
 *    and symbol groups (arrows, currency, maths, Greek, Latin letters, shapes …), skin tones.
 *  - Typing ":name:" replaces it with the emoji (a list of matches appears while typing ":na"); "U+1F60A" or "U1F60A"
 *    followed by a space becomes the character. Alt+X turns a code point before the cursor into the character and a
 *    character back into its code point (as in Word). In code editors only Alt+X and the picker change the text.
 *  - Emoticons such as ":)" become emoji when followed by a space – only if switched on in the settings.
 *
 * Settings (localStorage, shared by the apps where the browser shares it; exported with the suite settings):
 *   suite.symbols.button ("0" hides the ☺ button), suite.symbols.emoticons ("1" converts emoticons),
 *   suite.symbols.recent (JSON list), suite.symbols.skin (0–5).
 *
 * Data: #suite-symbols (vendor/esm/symbols/symbols.json from tools/build_symbols.py, gzip + base64), decoded on first use.
 * Fields: <input> (text, search or without type), <textarea>, contenteditable elements and – through adapters that apps
 * register (shared/js/cm-symbols.js) – CodeMirror editors. data-no-symbols on a field or an ancestor opts out.
 *
 *   Suite.symbols.open(element?)   Suite.symbols.search(query) -> items   Suite.symbols.insert(char)
 *   Suite.symbols.registerAdapter((element) => adapter | null)   Suite.symbols.settings / setSetting(name, value)
 */
(function (Suite) {
  'use strict';

  const KEYS = { button: 'suite.symbols.button', emoticons: 'suite.symbols.emoticons', recent: 'suite.symbols.recent', skin: 'suite.symbols.skin' };
  const RECENT_MAX = 36;
  const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

  Suite.i18n.register({
    en: {
      'sym.title': 'Emoji and symbols', 'sym.button': 'Emoji and symbols (Ctrl+.)', 'sym.search': 'Search: name, :code:, :) or U+1F60A',
      'sym.recent': 'Recently used', 'sym.results': 'Search results', 'sym.none': 'Nothing found.', 'sym.copied': '“{0}” copied (no text field was selected).',
      'sym.skin': 'Skin tone', 'sym.tone0': 'Default', 'sym.tone1': 'Light', 'sym.tone2': 'Medium-light', 'sym.tone3': 'Medium', 'sym.tone4': 'Medium-dark', 'sym.tone5': 'Dark',
      'sym.codePoint': 'Code point', 'sym.close': 'Close', 'sym.empty': 'Characters you insert appear here.',
      'sym.settings': 'Emoji and symbols', 'sym.settingButton': 'Show the ☺ button in text fields (opens the emoji and symbols, also Ctrl+.)',
      'sym.settingEmoticons': 'Replace text emoticons such as :) with emoji while typing',
    },
    de: {
      'sym.title': 'Emoji und Symbole', 'sym.button': 'Emoji und Symbole (Strg+.)', 'sym.search': 'Suchen: Name, :Code:, :) oder U+1F60A',
      'sym.recent': 'Zuletzt verwendet', 'sym.results': 'Suchergebnisse', 'sym.none': 'Nichts gefunden.', 'sym.copied': '„{0}“ kopiert (kein Textfeld war ausgewählt).',
      'sym.skin': 'Hautfarbe', 'sym.tone0': 'Standard', 'sym.tone1': 'Hell', 'sym.tone2': 'Mittelhell', 'sym.tone3': 'Mittel', 'sym.tone4': 'Mitteldunkel', 'sym.tone5': 'Dunkel',
      'sym.codePoint': 'Codepunkt', 'sym.close': 'Schließen', 'sym.empty': 'Eingefügte Zeichen erscheinen hier.',
      'sym.settings': 'Emoji und Symbole', 'sym.settingButton': 'Die Schaltfläche ☺ in Textfeldern zeigen (öffnet Emoji und Symbole, auch Strg+.)',
      'sym.settingEmoticons': 'Text-Emoticons wie :) beim Tippen durch Emoji ersetzen',
    },
  });

  const read = (key, fallback = null) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: for this session */ } };
  const session = {}; // settings when the storage is blocked
  const setting = (name) => (name in session ? session[name] : name === 'button' ? read(KEYS.button) !== '0' : read(KEYS.emoticons) === '1');
  const settings = { get button() { return setting('button'); }, get emoticons() { return setting('emoticons'); } };
  function setSetting(name, on) {
    session[name] = !!on;
    write(KEYS[name], on ? '1' : '0');
    if (name === 'button') updateButton();
  }

  const codeOf = (ch) => [...ch].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
  const lang = () => (Suite.i18n.language === 'de' ? 'de' : 'en');
  const graphemes = (s) => (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : [...s].length);

  // ---- data --------------------------------------------------------------------------------------------------------

  let data = null;
  let loading = null;
  const available = () => !!document.getElementById('suite-symbols');

  async function decode() {
    const el = document.getElementById('suite-symbols');
    const binary = atob(el.textContent.trim());
    const packed = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  /** The data: { groups, items: [{ c, g, en, de, words, codes, emoticons, skins }], byCode, byEmoticon, byChar }. */
  function load() {
    if (!loading) {
      loading = decode().then((raw) => {
        const items = raw.items.map(([c, g, en, de, enWords, deWords, codes, emoticons, skins]) => ({
          c, g, en, de, codes: codes ? codes.split(' ') : [], emoticons: emoticons ? emoticons.split(' ') : [], skins: skins ? skins.split(' ') : [],
          words: `${en} ${de} ${enWords} ${deWords}`.toLowerCase(),
        }));
        const byCode = new Map(), byEmoticon = new Map(), byChar = new Map();
        for (const it of items) {
          for (const code of it.codes) if (!byCode.has(code.toLowerCase())) byCode.set(code.toLowerCase(), it);
          for (const e of it.emoticons) if (!byEmoticon.has(e)) byEmoticon.set(e, it);
          byChar.set(it.c, it);
          byChar.set(it.c.replace(/️/g, ''), it);
        }
        data = { groups: raw.groups, items, byCode, byEmoticon, byChar };
        return data;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  /** The character of a code point ("1F60A", "U+1F60A"), or null for invalid, unassigned-looking or control code points. */
  function fromCodePoint(hex) {
    const n = parseInt(hex, 16);
    if (!(n >= 0x20 && n <= 0x10FFFF) || (n >= 0xD800 && n <= 0xDFFF) || (n >= 0x7F && n < 0xA0)) return null;
    return String.fromCodePoint(n);
  }

  /** An item for a character that is not in the data (code point input). */
  const itemFor = (ch) => (data && data.byChar.get(ch)) || { c: ch, g: -1, en: '', de: '', codes: [], emoticons: [], skins: [], words: '' };

  /**
   * Search: ":code" (shortcodes first), emoticons, code points ("U+1F60A", "1F60A") and words (all words must match a name,
   * keyword or shortcode; matches at the start of a name rank first).
   */
  function search(query) {
    if (!data) return [];
    const q = query.trim();
    if (!q) return [];
    const out = [];
    const add = (it) => { if (it && !out.includes(it)) out.push(it); };
    const cp = /^(?:u\+?|0x)?([0-9a-f]{2,6})$/i.exec(q);
    // a code point inserts exactly that character (with its name, if known)
    if (cp && (/^(u|0x)/i.test(q) || cp[1].length >= 4)) { const ch = fromCodePoint(cp[1]); if (ch) add({ ...itemFor(ch), c: ch, skins: [] }); }
    if (data.byEmoticon.has(q)) add(data.byEmoticon.get(q));
    const code = /^:([^:\s]+):?$/.exec(q);
    const text = (code ? code[1] : q).toLowerCase();
    if (code && data.byCode.has(text)) add(data.byCode.get(text));
    if (code) for (const [k, it] of data.byCode) if (k.startsWith(text)) add(it);
    const terms = text.split(/[\s_]+/).filter(Boolean);
    if (!terms.length) return out;
    const scored = [];
    data.items.forEach((it, index) => {
      if (!terms.every((term) => it.words.includes(term) || it.codes.some((c) => c.includes(term)))) return;
      const name = (lang() === 'de' && it.de ? it.de : it.en).toLowerCase();
      const nameWords = name.split(/[\s:,-]+/);
      // exact name, name starting with the query, all words in the name (shorter names first), a keyword, anything
      const rank = name === text ? 0 : name.startsWith(text) ? 1 : terms.every((t) => nameWords.some((w) => w.startsWith(t))) ? 2
        : it.words.split(' ').includes(terms[0]) ? 3 : 4;
      const symbol = it.g >= 0 && data.groups[it.g].kind === 'symbol' ? 1 : 0;
      scored.push([rank, rank === 2 ? name.length : 0, symbol, index, it]);
    });
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    for (const entry of scored) add(entry[4]);
    return out.slice(0, 300);
  }

  /** The emoji for an inline ":name:": a shortcode, else the first emoji with that keyword. */
  function forName(name) {
    const key = name.toLowerCase();
    if (data.byCode.has(key)) return data.byCode.get(key);
    const term = key.replace(/_/g, ' ');
    return data.items.find((it) => it.g >= 0 && data.groups[it.g].kind === 'emoji' && (` ${it.words} `).includes(` ${term} `)) || null;
  }

  // ---- recently used and skin tone -----------------------------------------------------------------------------------

  const recent = () => { try { const v = JSON.parse(read(KEYS.recent, '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  function remember(ch) {
    write(KEYS.recent, JSON.stringify([ch, ...recent().filter((c) => c !== ch)].slice(0, RECENT_MAX)));
  }
  const skin = () => Math.max(0, Math.min(5, Number(read(KEYS.skin, '0')) || 0));
  const withSkin = (it) => (skin() && it.skins.length === 5 ? it.skins[skin() - 1] : it.c);

  // ---- fields ----------------------------------------------------------------------------------------------------------

  const adapters = [];
  /** Register an adapter for an editor kind (e.g. CodeMirror): fn(element) -> adapter or null. */
  function registerAdapter(fn) { adapters.push(fn); }

  const TEXT_TYPES = new Set(['text', 'search', '']);
  const inPicker = (el) => !!(el && el.closest && el.closest('.suite-symbols, .suite-symbols-suggest'));

  /** The field an element belongs to, as an adapter (or null). */
  function adapterFor(el) {
    if (!el || !el.closest || inPicker(el) || el.closest('[data-no-symbols], .xterm')) return null; // (terminals: keys go to the server)
    for (const fn of adapters) { const a = fn(el); if (a) return a; }
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase()))) {
      return el.readOnly || el.disabled ? null : fieldAdapter(el);
    }
    const host = el.isContentEditable ? el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') : null;
    return host ? richAdapter(host) : null;
  }

  /** <input> and <textarea> (they keep their selection while the picker has the focus). */
  function fieldAdapter(el) {
    return {
      el, kind: 'field',
      save() {},
      before: (n) => el.value.slice(Math.max(0, el.selectionStart - n), el.selectionStart),
      selected: () => el.value.slice(el.selectionStart, el.selectionEnd),
      collapsed: () => el.selectionStart === el.selectionEnd,
      replace(text, old = '') {
        el.focus();
        const s = el.selectionStart, e = el.selectionEnd;
        const from = Math.max(0, s - old.length);
        el.setSelectionRange(from, e);
        // insertText keeps the browser's undo history and fires the input events of the app
        if (!document.execCommand('insertText', false, text)) {
          el.setRangeText(text, from, e, 'end');
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
      },
      rect: () => el.getBoundingClientRect(),
    };
  }

  /** contenteditable: the selection range is kept while the picker has the focus. */
  function richAdapter(el) {
    const sel = () => window.getSelection();
    let saved = sel().rangeCount && el.contains(sel().getRangeAt(0).startContainer) ? sel().getRangeAt(0).cloneRange() : null;
    const caretText = (n) => {
      const s = sel();
      if (!s.rangeCount) return '';
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset);
      return r.toString().slice(-n);
    };
    return {
      el, kind: 'rich',
      save() { if (sel().rangeCount && el.contains(sel().getRangeAt(0).startContainer)) saved = sel().getRangeAt(0).cloneRange(); },
      before: caretText,
      selected: () => (sel().rangeCount ? sel().toString() : ''),
      collapsed: () => !sel().rangeCount || sel().isCollapsed,
      replace(text, old = '') {
        el.focus();
        if (saved) { sel().removeAllRanges(); sel().addRange(saved); }
        for (let i = graphemes(old); i > 0; i--) sel().modify('extend', 'backward', 'character');
        document.execCommand('insertText', false, text);
        saved = sel().rangeCount ? sel().getRangeAt(0).cloneRange() : null;
      },
      rect: () => {
        const s = sel();
        if (s.rangeCount && el.contains(s.getRangeAt(0).startContainer)) {
          const r = s.getRangeAt(0).getBoundingClientRect();
          if (r.width || r.height) return r;
        }
        return el.getBoundingClientRect();
      },
    };
  }

  let current = null; // the adapter of the field the picker inserts into
  let lastField = null;
  document.addEventListener('focusin', (e) => {
    const a = adapterFor(e.target);
    if (a) { lastField = a; updateButton(); if (available()) load().catch(() => {}); } else if (!inPicker(e.target)) hideButton(); // (data loaded ahead)
  }, true);
  document.addEventListener('focusout', (e) => {
    // the ☺ button keeps the focus in the field (mousedown is prevented); hide it when the focus goes elsewhere
    setTimeout(() => { if (!adapterFor(document.activeElement) && !inPicker(document.activeElement)) hideButton(); }, 0);
  }, true);

  /** Insert a character into the field the picker was opened for (or copy it when there is none). */
  function insert(ch, adapter = current || lastField) {
    remember(ch);
    if (adapter && adapter.el.isConnected) {
      adapter.replace(ch);
      return true;
    }
    if (navigator.clipboard) navigator.clipboard.writeText(ch).catch(() => {});
    if (Suite.shell && Suite.shell.toast) Suite.shell.toast(Suite.t('sym.copied', ch));
    return false;
  }

  // ---- picker ------------------------------------------------------------------------------------------------------

  let picker = null; // { root, search, tabs, grid, info, group, items, keep }

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in e && k !== 'role') e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c != null) e.append(c);
    return e;
  }

  const nameOf = (it) => (lang() === 'de' && it.de ? it.de : it.en) || codeOf(it.c);

  /** Open the picker for a field (default: the focused one, else the last one). */
  async function open(target) {
    if (!available()) return;
    const adapter = target ? adapterFor(target) : adapterFor(document.activeElement) || lastField;
    if (adapter) adapter.save();
    current = adapter;
    await load();
    close(false);
    const box = el('input', { type: 'search', className: 'suite-symbols-search', placeholder: Suite.t('sym.search'), 'aria-label': Suite.t('sym.search'), dataset: { testid: 'symbols-search' }, autocomplete: 'off', spellcheck: false });
    const tabs = el('div', { className: 'suite-symbols-tabs', role: 'tablist', 'aria-label': Suite.t('sym.title') });
    const grid = el('div', { className: 'suite-symbols-grid', role: 'listbox', 'aria-label': Suite.t('sym.title'), dataset: { testid: 'symbols-grid' } });
    const info = el('span', { className: 'suite-symbols-info', dataset: { testid: 'symbols-info' }, 'aria-live': 'polite' });
    const tone = el('select', { className: 'suite-symbols-skin', 'aria-label': Suite.t('sym.skin'), title: Suite.t('sym.skin'), dataset: { testid: 'symbols-skin' },
      onChange: (e) => { write(KEYS.skin, e.target.value); show(picker.items); } },
    TONES.map((t, i) => el('option', { value: String(i), selected: i === skin() }, `${t ? `👋${t}` : '👋'} ${Suite.t(`sym.tone${i}`)}`)));
    const closeButton = el('button', { type: 'button', className: 'suite-symbols-close secondary outline', 'aria-label': Suite.t('sym.close'), title: `${Suite.t('sym.close')} (Esc)`, dataset: { testid: 'symbols-close' }, onClick: () => close() }, '×');
    const root = el('div', { className: 'suite-symbols', role: 'dialog', 'aria-label': Suite.t('sym.title'), dataset: { testid: 'symbols-picker' } },
      [el('div', { className: 'suite-symbols-head' }, [box, closeButton]), tabs, grid, el('div', { className: 'suite-symbols-foot' }, [info, tone])]);
    picker = { root, search: box, tabs, grid, info, items: [], group: null };
    const groups = [{ id: 'recent', icon: '🕘', label: Suite.t('sym.recent') }, ...data.groups.map((g, i) => ({ id: g.id, icon: g.icon, label: g[lang()] || g.en, index: i }))];
    for (const g of groups) {
      tabs.append(el('button', { type: 'button', role: 'tab', className: 'suite-symbols-tab', title: g.label, 'aria-label': g.label, dataset: { testid: 'symbols-tab', group: g.id },
        onClick: () => { box.value = ''; showGroup(g); } }, g.icon));
    }
    box.addEventListener('input', () => {
      const q = box.value;
      if (q.trim()) { picker.group = null; markTab(null); show(search(q), true); } else showGroup(groups[recent().length ? 0 : 1]);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey && picker.items.length)) { e.preventDefault(); focusCell(0); }
      else if (e.key === 'Enter' && picker.items.length) { e.preventDefault(); choose(picker.items[0], e.shiftKey); }
    });
    grid.addEventListener('keydown', onGridKey);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    document.body.append(root);
    showGroup(groups[recent().length ? 0 : 1]);
    place(root, adapter);
    box.focus();
  }

  function place(root, adapter) {
    if (window.innerWidth < 600) { root.classList.add('sheet'); return; } // phones: a sheet at the bottom
    const r = adapter ? adapter.rect() : { left: window.innerWidth / 2 - 180, bottom: window.innerHeight / 3, top: window.innerHeight / 3 };
    const w = root.offsetWidth, h = root.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  function markTab(id) {
    for (const t of picker.tabs.children) t.setAttribute('aria-selected', String(t.dataset.group === id));
  }

  function showGroup(g) {
    picker.group = g.id;
    markTab(g.id);
    if (g.id === 'recent') show(recent().map((c) => itemFor(c)), false, Suite.t('sym.empty'));
    else show(data.items.filter((it) => it.g === g.index));
  }

  /** Fill the grid (the first item is shown in the footer). */
  function show(items, isSearch = false, emptyText = Suite.t('sym.none')) {
    picker.items = items;
    picker.grid.replaceChildren(...items.map((it, i) => el('button', {
      type: 'button', role: 'option', className: 'suite-symbols-cell', tabIndex: i === 0 ? 0 : -1, title: `${nameOf(it)} (${codeOf(it.c)})`, 'aria-label': nameOf(it),
      dataset: { testid: 'symbol', index: String(i) },
      onClick: (e) => choose(it, e.shiftKey), onFocus: () => describe(it), onMouseenter: () => describe(it),
    }, withSkin(it))));
    if (!items.length) picker.grid.append(el('p', { className: 'suite-symbols-empty', dataset: { testid: 'symbols-empty' } }, emptyText));
    describe(items[0] || null);
    picker.grid.scrollTop = 0;
    picker.grid.setAttribute('aria-label', isSearch ? Suite.t('sym.results') : Suite.t('sym.title'));
  }

  function describe(it) {
    picker.info.textContent = it ? `${withSkin(it)}  ${nameOf(it)} · ${codeOf(withSkin(it))}${it.codes[0] ? ` · :${it.codes[0]}:` : ''}${it.emoticons[0] ? ` · ${it.emoticons[0]}` : ''}` : '';
  }

  function focusCell(i) {
    const cells = picker.grid.querySelectorAll('.suite-symbols-cell');
    if (!cells.length) return;
    const idx = Math.max(0, Math.min(cells.length - 1, i));
    cells.forEach((c, j) => { c.tabIndex = j === idx ? 0 : -1; });
    cells[idx].focus();
  }

  function onGridKey(e) {
    const cell = e.target.closest('.suite-symbols-cell');
    if (!cell) return;
    const i = Number(cell.dataset.index);
    const cells = picker.grid.querySelectorAll('.suite-symbols-cell');
    const columns = Math.max(1, [...cells].filter((c) => c.offsetTop === cells[0].offsetTop).length);
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, Home: -i, End: cells.length - 1 - i, PageDown: columns * 5, PageUp: -columns * 5 };
    if (e.key in moves) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && i < columns) picker.search.focus(); else focusCell(i + moves[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(picker.items[i], e.shiftKey);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      picker.search.focus(); // typing searches
    }
  }

  /** Insert an item; Shift keeps the picker open for more. */
  function choose(it, keep) {
    const adapter = current;
    const ch = withSkin(it);
    if (!keep) close(false);
    insert(ch, adapter);
    if (keep && picker) { if (adapter) adapter.save(); picker.search.focus(); }
  }

  function close(refocus = true) {
    if (!picker) return;
    picker.root.remove();
    picker = null;
    if (refocus && current && current.el.isConnected) current.el.focus();
  }

  document.addEventListener('mousedown', (e) => { if (picker && !picker.root.contains(e.target) && e.target !== button) close(false); }, true);

  // ---- the ☺ button ----------------------------------------------------------------------------------------------

  let button = null;
  function hideButton() { if (button) button.hidden = true; }

  function updateButton() {
    const a = adapterFor(document.activeElement);
    if (!a || !settings.button || !available()) { hideButton(); return; }
    const r = a.el.getBoundingClientRect();
    if (r.width < 120 || r.height < 16) { hideButton(); return; }
    if (!button) {
      button = el('button', { type: 'button', className: 'suite-symbols-button', tabIndex: -1, title: Suite.t('sym.button'), 'aria-label': Suite.t('sym.button'), dataset: { testid: 'symbols-button' },
        onMousedown: (e) => e.preventDefault(), // keep the focus (and selection) in the field
        onClick: () => (picker ? close() : open(document.activeElement)) }, '☺');
      document.body.append(button);
    }
    button.hidden = false;
    const size = 22;
    const single = a.el.tagName === 'INPUT';
    button.style.left = `${Math.round(r.right - size - (single ? 6 : 10))}px`;
    button.style.top = `${Math.round(single ? r.top + (r.height - size) / 2 : r.top + 4)}px`;
  }
  window.addEventListener('scroll', () => { if (button && !button.hidden) updateButton(); }, true);
  window.addEventListener('resize', () => { if (button && !button.hidden) updateButton(); });

  // ---- keys: Ctrl+. opens the picker, Alt+X converts --------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    if (suggest && onSuggestKey(e)) return;
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === '.' || e.code === 'Period') && !inPicker(e.target)) {
      if (!available()) return;
      e.preventDefault();
      e.stopPropagation();
      if (picker) close(); else open();
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyX' || e.key === 'x' || e.key === 'X')) {
      const a = adapterFor(e.target);
      if (a && convertCodePoint(a)) { e.preventDefault(); e.stopPropagation(); }
    }
  }, true);

  /** Alt+X: "1F60A" / "U+1F60A" before the cursor (or selected) -> the character; a character -> "U+…". */
  function convertCodePoint(a) {
    const selected = a.collapsed() ? '' : a.selected();
    if (selected) {
      const m = /^(?:U\+?)?([0-9A-Fa-f]{2,6})$/.exec(selected.trim());
      if (m) { const ch = fromCodePoint(m[1]); if (ch) { a.replace(ch); return true; } }
      const chars = [...selected];
      if (chars.length <= 8) { a.replace(chars.map((c) => codeOf(c)).join(' ')); return true; }
      return false;
    }
    const before = a.before(12);
    const m = /(?:U\+?)?([0-9A-Fa-f]{4,6})$/.exec(before);
    if (m) { const ch = fromCodePoint(m[1]); if (ch) { a.replace(ch, m[0]); return true; } }
    const last = [...before].pop();
    if (last && last.codePointAt(0) > 0x7F) { a.replace(codeOf(last), last); return true; }
    return false;
  }

  // ---- typing: ":name:", "U+1F60A ", emoticons --------------------------------------------------------------------

  const NAME_END = /(^|[\s([{"'„“«])(:([\p{L}\p{N}_+-]{2,40}):)$/u;
  const NAME_PART = /(^|[\s([{"'„“«]):([\p{L}\p{N}_+-]{2,30})$/u;
  const CODE_POINT = /(^|\s)(U\+?([0-9A-Fa-f]{4,6}))(\s)$/;
  const EMOTICON = /(^|\s)(\S{2,4})(\s)$/;

  document.addEventListener('input', (e) => {
    if (e.inputType !== 'insertText' || !e.data || inPicker(e.target) || !available()) return;
    const a = adapterFor(e.target);
    if (!a || a.kind === 'cm') { closeSuggest(); return; } // code editors: only the picker and Alt+X
    const typed = e.data;
    // at once when the data is there (later keys must not change the text before the cursor first)
    (data ? { then: (fn) => { fn(); return { catch() {} }; } } : load()).then(() => {
      const before = a.before(48);
      if (typed === ':') {
        const m = NAME_END.exec(before);
        const it = m && forName(m[3]);
        if (it) { closeSuggest(); a.replace(it.c, m[2]); remember(it.c); return; }
      }
      if (/\s/.test(typed)) {
        const cp = CODE_POINT.exec(before);
        const ch = cp && fromCodePoint(cp[3]);
        if (ch) { closeSuggest(); a.replace(ch + cp[4], cp[2] + cp[4]); return; }
        if (settings.emoticons) {
          const em = EMOTICON.exec(before);
          // (only emoticons with punctuation: "xo" or "8D" are too often ordinary text)
          const it = em && /[^\p{L}\p{N}]/u.test(em[2]) && data.byEmoticon.get(em[2]);
          if (it) { closeSuggest(); a.replace(it.c + em[3], em[2] + em[3]); return; }
        }
      }
      const part = NAME_PART.exec(before);
      if (part) showSuggest(a, part[2]); else closeSuggest();
    }).catch(() => {});
  }, true);

  // the list of matches while typing ":na"
  let suggest = null; // { root, adapter, items, index, typed }

  function showSuggest(a, typed) {
    const items = search(`:${typed}`).filter((it) => it.g >= 0 && data.groups[it.g].kind === 'emoji').slice(0, 6);
    if (!items.length) { closeSuggest(); return; }
    if (!suggest) {
      suggest = { root: el('div', { className: 'suite-symbols-suggest', role: 'listbox', 'aria-label': Suite.t('sym.title'), dataset: { testid: 'symbols-suggest' } }) };
      document.body.append(suggest.root);
    }
    Object.assign(suggest, { adapter: a, items, index: 0, typed });
    renderSuggest();
    const r = a.rect();
    suggest.root.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - suggest.root.offsetWidth - 4))}px`;
    suggest.root.style.top = `${r.bottom + 4 + suggest.root.offsetHeight > window.innerHeight ? Math.max(4, r.top - suggest.root.offsetHeight - 4) : r.bottom + 4}px`;
  }

  function renderSuggest() {
    suggest.root.replaceChildren(...suggest.items.map((it, i) => el('div', {
      role: 'option', className: `suite-symbols-option${i === suggest.index ? ' active' : ''}`, 'aria-selected': String(i === suggest.index), dataset: { testid: 'symbols-suggestion' },
      onMousedown: (e) => { e.preventDefault(); acceptSuggest(i); },
    }, [el('span', { className: 'suite-symbols-option-char' }, withSkin(it)), ` :${it.codes.find((c) => c.toLowerCase().startsWith(suggest.typed.toLowerCase())) || it.codes[0] || suggest.typed}:`])));
  }

  function acceptSuggest(i) {
    const { adapter, items, typed } = suggest;
    const ch = withSkin(items[i]);
    closeSuggest();
    adapter.replace(ch, `:${typed}`);
    remember(ch);
  }

  function onSuggestKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      suggest.index = (suggest.index + (e.key === 'ArrowDown' ? 1 : -1) + suggest.items.length) % suggest.items.length;
      renderSuggest();
    } else if (e.key === 'Enter' || e.key === 'Tab') acceptSuggest(suggest.index);
    else if (e.key === 'Escape') closeSuggest();
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  function closeSuggest() {
    if (suggest) { suggest.root.remove(); suggest = null; }
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (suggest && document.activeElement !== suggest.adapter.el && !suggest.adapter.el.contains(document.activeElement)) closeSuggest(); }, 0), true);

  // settings changed in another tab
  window.addEventListener('storage', (e) => { if (e.key === KEYS.button) { delete session.button; updateButton(); } if (e.key === KEYS.emoticons) delete session.emoticons; });

  Suite.symbols = { KEYS, settings, setSetting, available, load, search, open, close, insert, registerAdapter, fromCodePoint, codeOf, get isOpen() { return !!picker; } };
})(window.Suite = window.Suite || {});
