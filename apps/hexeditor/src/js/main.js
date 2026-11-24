/*
 * Hex editor: virtualized hex/ASCII view, overwrite and insert mode, selection, search, go to offset,
 * data inspector, undo/redo, several files in tabs. Runs in the shared app shell (Suite.shell, Preact + htm).
 *
 * `state` holds the active document; the other tabs keep their fields (DOC_KEYS) in `docs` until they are activated.
 */
(function () {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const APP = 'hexeditor';
  const ROW_HEIGHT = 22;
  const PREFS_KEY = 'hexeditor.prefs';

  Suite.i18n.register({
    en: {
      'app.title': 'Hex editor',
      'he.new': 'New', 'he.open': 'Open', 'he.save': 'Save', 'he.saveAs': 'Save as', 'he.undo': 'Undo', 'he.redo': 'Redo',
      'he.find': 'Find', 'he.goto': 'Go to', 'he.insert': 'Insert', 'he.overwrite': 'Overwrite', 'he.bytesPerRow': 'Bytes per row',
      'he.auto': 'Auto', 'he.untitled': 'untitled.bin', 'he.size': '{0} bytes', 'he.offset': 'Offset', 'he.selection': 'Selection',
      'he.findHex': 'Hex', 'he.findText': 'Text', 'he.next': 'Next', 'he.previous': 'Previous', 'he.notFound': 'Not found.',
      'he.badHex': 'Please enter hexadecimal bytes, e.g. "4A 6F".', 'he.gotoPlaceholder': 'Offset (e.g. 1024 or 0x400)', 'he.badOffset': 'Invalid offset.',
      'he.inspector': 'Data inspector', 'he.littleEndian': 'Little endian', 'he.value': 'Byte value (hex)', 'he.set': 'Set',
      'he.copied': 'Copied {0} bytes as hex.',
      'he.large': 'Large file ({0} MB): editing needs a lot of memory.', 'he.close': 'Close',
      'he.checksums': 'Checksums', 'he.ofSelection': 'of the selection ({0} bytes)', 'he.ofFile': 'of the file ({0} bytes)', 'he.copy': 'Copy', 'he.copiedValue': '{0} copied.',
      'he.compare': 'Compare with a file…', 'he.comparing': 'Compared with {0}', 'he.differences': '{0} differences', 'he.identical': 'The files are identical.',
      'he.nextDiff': 'Next difference', 'he.prevDiff': 'Previous difference', 'he.noMoreDiff': 'No further difference.', 'he.endCompare': 'End comparison',
      'he.structure': 'Structure', 'he.stats': 'Statistics: byte histogram and entropy', 'he.entropy': 'Entropy', 'he.bitsPerByte': 'bits per byte', 'he.zeros': 'Zero bytes', 'he.printable': 'Printable text',
      'he.histogram': 'How often each byte value (00–FF) occurs', 'he.logScale': 'Logarithmic', 'he.mostFrequent': 'Most frequent', 'he.entropyCurve': 'Entropy along the data (blocks of {0} bytes; dashed: 7.5)', 'he.entropyJump': 'Click to go there',
      'he.entHigh': 'random-looking: compressed or encrypted', 'he.entMid': 'dense binary data (code, pictures)', 'he.entText': 'structured data or text', 'he.entLow': 'very repetitive (e.g. mostly zeros)', 'he.side.inspector': 'Inspector', 'he.side.structure': 'Structure', 'he.side.marks': 'Marks', 'he.bookmark': 'Bookmark', 'he.range': 'Range', 'he.markRange': 'Colour the selection', 'he.markLabel': 'Label (optional)', 'he.markColour': 'Colour {0}',
      'he.markRename': 'Rename', 'he.markDelete': 'Remove', 'he.markNoSelection': 'Select the bytes to colour first.', 'he.markNone': 'There are no marks (Ctrl+F2 sets a bookmark).', 'he.markHint': 'Bookmarks (Ctrl+F2, F2 / Shift+F2 to jump) and coloured ranges appear here; they move along when bytes are inserted or deleted.', 'he.stNone': 'No known structure. Known formats: {0}.', 'he.stFields': '{0} parts',
      'he.closeTab': 'Close', 'he.closeUnsaved': '“{0}” has unsaved changes. Close it anyway?', 'he.closeAnyway': 'Close anyway', 'he.tabs': 'Open files',
    },
    de: {
      'app.title': 'Hex-Editor',
      'he.new': 'Neu', 'he.open': 'Öffnen', 'he.save': 'Speichern', 'he.saveAs': 'Speichern unter', 'he.undo': 'Rückgängig', 'he.redo': 'Wiederholen',
      'he.find': 'Suchen', 'he.goto': 'Gehe zu', 'he.insert': 'Einfügen', 'he.overwrite': 'Überschreiben', 'he.bytesPerRow': 'Bytes pro Zeile',
      'he.auto': 'Auto', 'he.untitled': 'unbenannt.bin', 'he.size': '{0} Bytes', 'he.offset': 'Offset', 'he.selection': 'Auswahl',
      'he.findHex': 'Hex', 'he.findText': 'Text', 'he.next': 'Weiter', 'he.previous': 'Zurück', 'he.notFound': 'Nicht gefunden.',
      'he.badHex': 'Bitte geben Sie hexadezimale Bytes ein, z. B. „4A 6F“.', 'he.gotoPlaceholder': 'Offset (z. B. 1024 oder 0x400)', 'he.badOffset': 'Ungültiger Offset.',
      'he.inspector': 'Dateninspektor', 'he.littleEndian': 'Little Endian', 'he.value': 'Bytewert (hex)', 'he.set': 'Setzen',
      'he.copied': '{0} Bytes als Hex kopiert.',
      'he.large': 'Große Datei ({0} MB): Bearbeiten braucht viel Arbeitsspeicher.', 'he.close': 'Schließen',
      'he.checksums': 'Prüfsummen', 'he.ofSelection': 'der Auswahl ({0} Bytes)', 'he.ofFile': 'der Datei ({0} Bytes)', 'he.copy': 'Kopieren', 'he.copiedValue': '{0} kopiert.',
      'he.compare': 'Mit einer Datei vergleichen…', 'he.comparing': 'Verglichen mit {0}', 'he.differences': '{0} Unterschiede', 'he.identical': 'Die Dateien sind identisch.',
      'he.nextDiff': 'Nächster Unterschied', 'he.prevDiff': 'Vorheriger Unterschied', 'he.noMoreDiff': 'Kein weiterer Unterschied.', 'he.endCompare': 'Vergleich beenden',
      'he.structure': 'Struktur', 'he.stats': 'Statistik: Byte-Histogramm und Entropie', 'he.entropy': 'Entropie', 'he.bitsPerByte': 'Bit pro Byte', 'he.zeros': 'Null-Bytes', 'he.printable': 'Druckbarer Text',
      'he.histogram': 'Wie oft jeder Bytewert (00–FF) vorkommt', 'he.logScale': 'Logarithmisch', 'he.mostFrequent': 'Am häufigsten', 'he.entropyCurve': 'Entropie entlang der Daten (Blöcke zu {0} Bytes; gestrichelt: 7,5)', 'he.entropyJump': 'Klicken, um dorthin zu springen',
      'he.entHigh': 'zufällig wirkend: komprimiert oder verschlüsselt', 'he.entMid': 'dichte Binärdaten (Code, Bilder)', 'he.entText': 'strukturierte Daten oder Text', 'he.entLow': 'sehr gleichförmig (etwa überwiegend Nullen)', 'he.side.inspector': 'Inspektor', 'he.side.structure': 'Struktur', 'he.side.marks': 'Marken', 'he.bookmark': 'Lesezeichen', 'he.range': 'Bereich', 'he.markRange': 'Auswahl einfärben', 'he.markLabel': 'Bezeichnung (optional)', 'he.markColour': 'Farbe {0}',
      'he.markRename': 'Umbenennen', 'he.markDelete': 'Entfernen', 'he.markNoSelection': 'Wählen Sie zuerst die Bytes aus, die eingefärbt werden sollen.', 'he.markNone': 'Es gibt keine Marken (Strg+F2 setzt ein Lesezeichen).', 'he.markHint': 'Lesezeichen (Strg+F2, F2 / Umschalt+F2 springen) und eingefärbte Bereiche erscheinen hier; sie wandern mit, wenn Bytes eingefügt oder gelöscht werden.', 'he.stNone': 'Keine bekannte Struktur. Bekannte Formate: {0}.', 'he.stFields': '{0} Teile',
      'he.closeTab': 'Schließen', 'he.closeUnsaved': '„{0}“ hat ungespeicherte Änderungen. Trotzdem schließen?', 'he.closeAnyway': 'Trotzdem schließen', 'he.tabs': 'Geöffnete Dateien',
    },
  });

  const prefs = Object.assign({ bytesPerRow: 0, littleEndian: true }, (() => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
  })());
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ } };

  const state = {
    buffer: new HE.ByteBuffer(), name: t('he.untitled'), handle: null, isNew: true,
    cursor: 0, anchor: null, nibble: 0, pane: 'hex', insert: false,
    bar: null, // 'find' | 'goto'
    findType: 'hex', findText: '',
    scrollTop: 0, viewHeight: 400, width: 1000,
    compare: null, // { name, bytes, count, version } – a second file shown next to the hex column
    sums: null, // { label, values } – the checksum dialog
  };

  // ---- documents (tabs) ------------------------------------------------------------------------

  const DOC_KEYS = ['buffer', 'name', 'handle', 'isNew', 'cursor', 'anchor', 'nibble', 'scrollTop', 'compare'];
  const emptyDoc = () => ({ buffer: new HE.ByteBuffer(), name: t('he.untitled'), handle: null, isNew: true, cursor: 0, anchor: null, nibble: 0, scrollTop: 0, compare: null });
  const docs = [emptyDoc()];
  let active = 0;
  const docAt = (i) => (i === active ? state : docs[i]);
  const isDirty = (d) => d.buffer.dirty;

  /** Keep the fields of the active document in its tab. */
  function stash() {
    if (!docs[active]) return;
    for (const k of DOC_KEYS) docs[active][k] = state[k];
  }

  function activate(i) {
    if (!docs[i]) return;
    stash();
    active = i;
    for (const k of DOC_KEYS) state[k] = docs[i][k];
    const el = scrollElement();
    if (el) el.scrollTop = state.scrollTop;
    changed();
  }

  /** A new tab (or the untouched empty one) for a file. */
  function addDoc(name, bytes, handle = null) {
    stash();
    const untouched = state.isNew && !state.handle && state.buffer.length === 0 && !isDirty(state);
    if (!untouched) {
      docs.push(emptyDoc());
      activate(docs.length - 1);
    }
    load(name, bytes, handle);
  }

  async function closeDoc(i) {
    stash();
    const d = docs[i];
    if (!d) return;
    if (isDirty(d) && !(await Suite.shell.confirm(t('he.closeUnsaved', d.name), { ok: t('he.closeAnyway') }))) return;
    docs.splice(i, 1);
    if (!docs.length) docs.push(emptyDoc());
    const next = i === active ? Math.min(i, docs.length - 1) : i < active ? active - 1 : active;
    active = -1; // the closed tab's fields must not be stashed
    activate(next);
  }

  const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  const offsetHex = (o) => o.toString(16).toUpperCase().padStart(8, '0');
  const printable = (b) => (b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : b >= 0xA0 ? String.fromCharCode(b) : '.');

  function bytesPerRow() {
    if (prefs.bytesPerRow) return prefs.bytesPerRow;
    return state.width < 560 ? 8 : state.width > 1400 ? 32 : 16;
  }

  function selection() {
    if (state.anchor === null || state.anchor === state.cursor) return null;
    return { from: Math.min(state.anchor, state.cursor), to: Math.max(state.anchor, state.cursor) + 1 };
  }

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
  }

  function changed() {
    Suite.shell.setDirty(docs.some((d, i) => isDirty(docAt(i))));
    render();
  }

  // ---- cursor and scrolling -------------------------------------------------------------------

  function scrollElement() { return document.querySelector('.he-scroll'); }

  function moveTo(offset, extend = false) {
    const max = state.buffer.length; // the position after the last byte allows appending
    offset = Math.max(0, Math.min(max, offset));
    if (extend) { if (state.anchor === null) state.anchor = state.cursor; } else state.anchor = null;
    state.cursor = offset;
    state.nibble = 0;
    const el = scrollElement();
    if (el) {
      const row = Math.floor(offset / bytesPerRow());
      const top = row * ROW_HEIGHT;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
      state.scrollTop = el.scrollTop;
    }
    render();
  }

  // ---- editing ----------------------------------------------------------------------------------

  function deleteSelectionOr(offset, count) {
    const sel = selection();
    if (sel) { state.buffer.remove(sel.from, sel.to - sel.from); state.anchor = null; state.cursor = sel.from; } else if (offset >= 0 && offset < state.buffer.length) { state.buffer.remove(offset, count); state.cursor = offset; }
    state.nibble = 0;
    changed();
  }

  function typeNibble(value) {
    const buf = state.buffer;
    const sel = selection();
    if (sel) { buf.remove(sel.from, sel.to - sel.from); state.cursor = sel.from; state.anchor = null; }
    const pos = state.cursor;
    if (state.nibble === 0) {
      if (state.insert || pos >= buf.length) buf.insert(pos, [value << 4]);
      else buf.replace(pos, [(value << 4) | (buf.byte(pos) & 0x0F)]);
      state.nibble = 1;
    } else {
      buf.replace(pos, [(buf.byte(pos) & 0xF0) | value], true);
      state.nibble = 0;
      state.cursor = pos + 1;
    }
    changed();
    if (state.nibble === 0) moveTo(state.cursor);
  }

  function typeByte(value) {
    const buf = state.buffer;
    const sel = selection();
    if (sel) { buf.remove(sel.from, sel.to - sel.from); state.cursor = sel.from; state.anchor = null; }
    const pos = state.cursor;
    if (state.insert || pos >= buf.length) buf.insert(pos, [value]); else buf.replace(pos, [value]);
    changed();
    moveTo(pos + 1);
  }

  function setByteValue(text) {
    const bytes = HE.parseHex(text);
    if (!bytes) { Suite.shell.toast(t('he.badHex'), 'error'); return; }
    const pos = state.cursor;
    if (pos >= state.buffer.length) state.buffer.insert(pos, bytes); else state.buffer.replace(pos, bytes);
    changed();
    moveTo(pos + bytes.length);
  }

  function undo() { const op = state.buffer.undo(); if (op) { changed(); moveTo(Math.min(op.offset, state.buffer.length)); } }

  function redo() { const op = state.buffer.redo(); if (op) { changed(); moveTo(Math.min(op.offset, state.buffer.length)); } }

  async function copySelection() {
    const sel = selection() || (state.cursor < state.buffer.length ? { from: state.cursor, to: state.cursor + 1 } : null);
    if (!sel) return;
    const text = Array.from(state.buffer.slice(sel.from, sel.to), hex2).join(' ');
    try { await navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ }
    state.lastCopied = text;
    Suite.shell.toast(t('he.copied', sel.to - sel.from));
  }

  async function paste() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { return; }
    const bytes = HE.parseHex(text);
    if (bytes) setByteValue(text);
  }

  function onKeyDown(e) {
    const row = bytesPerRow();
    const ctrl = e.ctrlKey || e.metaKey;
    const page = Math.max(1, Math.floor((scrollElement() ? scrollElement().clientHeight : 400) / ROW_HEIGHT) - 1) * row;
    const keys = {
      ArrowLeft: () => moveTo(state.cursor - 1, e.shiftKey), ArrowRight: () => moveTo(state.cursor + 1, e.shiftKey),
      ArrowUp: () => moveTo(state.cursor - row, e.shiftKey), ArrowDown: () => moveTo(state.cursor + row, e.shiftKey),
      PageUp: () => moveTo(state.cursor - page, e.shiftKey), PageDown: () => moveTo(state.cursor + page, e.shiftKey),
      Home: () => moveTo(ctrl ? 0 : state.cursor - (state.cursor % row), e.shiftKey),
      End: () => moveTo(ctrl ? state.buffer.length : Math.min(state.buffer.length, state.cursor - (state.cursor % row) + row - 1), e.shiftKey),
      Tab: () => { state.pane = state.pane === 'hex' ? 'ascii' : 'hex'; state.nibble = 0; render(); },
      Insert: () => { state.insert = !state.insert; render(); },
      F2: () => (ctrl ? toggleBookmark() : jumpMark(e.shiftKey ? -1 : 1)),
      Delete: () => deleteSelectionOr(state.cursor, 1),
      Backspace: () => (selection() ? deleteSelectionOr(-1, 0) : deleteSelectionOr(state.cursor - 1, 1)),
    };
    if (ctrl) {
      const k = e.key.toLowerCase();
      const commands = { z: e.shiftKey ? redo : undo, y: redo, s: e.shiftKey ? saveAs : save, o: openFile, f: () => openBar('find'), g: () => openBar('goto'), c: copySelection, v: paste, a: () => { state.anchor = 0; moveTo(Math.max(0, state.buffer.length - 1), true); } };
      if (commands[k]) { e.preventDefault(); commands[k](); return; }
      if (e.key !== 'Home' && e.key !== 'End' && e.key !== 'F2') return; // Ctrl+Home/End: start/end of the file; Ctrl+F2: bookmark
    }
    if (e.altKey && !ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); closeDoc(active); return; }
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); return; }
    if (e.key.length === 1 && !e.altKey) {
      if (state.pane === 'hex' && /^[0-9a-f]$/i.test(e.key)) { e.preventDefault(); typeNibble(parseInt(e.key, 16)); } else if (state.pane === 'ascii') {
        const code = e.key.charCodeAt(0);
        if (code < 256) { e.preventDefault(); typeByte(code); }
      }
    }
  }

  // ---- mouse selection ----------------------------------------------------------------------------

  let dragging = false;
  function offsetFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('[data-offset]');
    return cell ? { offset: +cell.dataset.offset, pane: cell.dataset.pane } : null;
  }
  function onPointerDown(e) {
    const hit = offsetFromEvent(e);
    if (!hit) return;
    state.pane = hit.pane;
    moveTo(hit.offset, e.shiftKey);
    dragging = e.pointerType === 'mouse';
    document.querySelector('.he-view').focus();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const hit = offsetFromEvent(e);
    if (hit && hit.offset !== state.cursor) moveTo(hit.offset, true);
  }
  window.addEventListener('pointerup', () => { dragging = false; });

  // ---- search and go to ----------------------------------------------------------------------------

  function openBar(kind) {
    state.bar = kind;
    render();
    requestAnimationFrame(() => { const input = document.querySelector('.he-bar input'); if (input) input.focus(); });
  }

  function find(backwards = false) {
    const pattern = state.findType === 'hex' ? HE.parseHex(state.findText) : new TextEncoder().encode(state.findText);
    if (!pattern || !pattern.length) { Suite.shell.toast(t('he.badHex'), 'error'); return; }
    const sel = selection();
    const start = backwards ? (sel ? sel.from : state.cursor) - 1 : (sel ? sel.from : state.cursor) + (sel ? 1 : 0);
    let pos = state.buffer.find(pattern, start, backwards);
    if (pos < 0) pos = state.buffer.find(pattern, backwards ? state.buffer.length : 0, backwards); // wrap around
    if (pos < 0) { Suite.shell.toast(t('he.notFound'), 'warning'); return; }
    state.anchor = pos;
    state.cursor = pos + pattern.length - 1;
    moveTo(pos);
    state.anchor = pos;
    state.cursor = pos + pattern.length - 1;
    render();
  }

  function gotoOffset(text) {
    const s = text.trim();
    const value = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : /^[0-9a-f]+h$/i.test(s) ? parseInt(s, 16) : NaN;
    if (Number.isNaN(value) || value > state.buffer.length) { Suite.shell.toast(t('he.badOffset'), 'error'); return; }
    moveTo(value);
    document.querySelector('.he-view').focus();
  }

  // ---- checksums and comparison ------------------------------------------------------------------------

  async function showChecksums() {
    const sel = selection();
    const bytes = sel ? state.buffer.slice(sel.from, sel.to) : state.buffer.bytes();
    state.sums = { label: sel ? t('he.ofSelection', bytes.length.toLocaleString()) : t('he.ofFile', bytes.length.toLocaleString()), values: null };
    render();
    state.sums.values = await HE.checksums(bytes);
    render();
  }

  async function copyValue(name, value) {
    try { await navigator.clipboard.writeText(value); } catch (e) { /* clipboard blocked */ }
    state.lastCopied = value;
    Suite.shell.toast(t('he.copiedValue', name));
  }

  function setCompare(name, bytes) {
    state.compare = { name, bytes, count: 0, version: -1 };
    diffCount();
    if (!state.compare.count) Suite.shell.toast(t('he.identical'));
    else nextDiff(false, -1);
    render();
  }

  /** Number of differing bytes (recounted when the buffer changed). */
  function diffCount() {
    const c = state.compare;
    if (c && c.version !== state.buffer.version) {
      c.count = HE.differences(state.buffer.bytes(), c.bytes, 0).count;
      c.version = state.buffer.version;
    }
    return c ? c.count : 0;
  }

  function differs(o) {
    const other = state.compare.bytes;
    return o < state.buffer.length ? o >= other.length || other[o] !== state.buffer.byte(o) : o < other.length;
  }

  /** Move to the start of the next/previous run of differing bytes. */
  function nextDiff(backwards = false, from = state.cursor) {
    const end = Math.max(state.buffer.length, state.compare.bytes.length);
    let o = from;
    if (backwards) {
      while (o > 0 && differs(o - 1) && differs(o)) o--; // leave the current run
      for (o -= 1; o >= 0 && !differs(o); o--);
      while (o > 0 && differs(o - 1)) o--;
    } else {
      while (o >= 0 && o < end && differs(o)) o++; // skip the current run
      for (o = Math.max(o, 0); o < end && !differs(o); o++);
    }
    if (o < 0 || o >= end) { Suite.shell.toast(t('he.noMoreDiff')); return; }
    moveTo(Math.min(o, state.buffer.length));
  }

  async function pickCompare() {
    try {
      const picked = await Suite.files.open();
      if (!picked || !picked.length) return;
      const { file } = picked[0];
      setCompare(file.name, new Uint8Array(await file.arrayBuffer()));
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  // ---- files ---------------------------------------------------------------------------------------

  /** Replace the content of the active tab. */
  function load(name, bytes, handle = null) {
    state.buffer = new HE.ByteBuffer(bytes);
    Object.assign(state, { name, handle, isNew: false, cursor: 0, anchor: null, nibble: 0, scrollTop: 0 });
    if (bytes.length > 256 * 1024 * 1024) Suite.shell.toast(t('he.large', Math.round(bytes.length / 1048576)), 'warning');
    const el = scrollElement();
    if (el) el.scrollTop = 0;
    stash();
    changed();
  }

  // recovery copies of unsaved work (shared/js/autosave.js): every changed tab
  Suite.autosave.register({
    app: APP,
    save: () => {
      const list = docs.map((d, i) => docAt(i)).filter(isDirty).map((d) => ({ name: d.name, handle: d.handle, bytes: d.buffer.bytes() }));
      return list.length ? { name: list.map((d) => d.name).join(', '), docs: list } : null;
    },
    restore: (s) => {
      for (const d of s.docs || [s]) { addDoc(d.name, d.bytes, d.handle || null); state.buffer.savedVersion = -1; }
      changed();
    },
  });

  /** Open files in tabs (a file that is open already is shown). */
  async function openPicked(picked) {
    for (const { file, handle } of picked || []) {
      let existing = -1;
      for (let i = 0; i < docs.length; i++) {
        const d = docAt(i);
        if ((handle && d.handle && (await d.handle.isSameEntry(handle))) || (!handle && !d.handle && !d.isNew && d.name === file.name && !isDirty(d))) existing = i;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (existing >= 0) {
        activate(existing);
        // the same name without a handle (dropped, or opened in Firefox): a newer version replaces the unchanged tab
        const old = state.buffer.bytes();
        if (!handle && (old.length !== bytes.length || old.some((b, k) => b !== bytes[k]))) load(file.name, bytes, null);
        continue;
      }
      addDoc(file.name, bytes, handle);
      if (handle) Suite.files.remember(APP, handle);
    }
  }

  async function openFile() {
    try { await openPicked(await Suite.files.open({ multiple: true })); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  function newFile() {
    addDoc(t('he.untitled'), new Uint8Array(0));
    state.isNew = true;
    stash();
  }

  function report(result) {
    if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
  }

  async function save() {
    if (state.isNew && !state.handle) { await saveAs(); return; }
    try {
      report(await Suite.files.save({ name: state.name, handle: state.handle }, state.buffer.bytes()));
      state.buffer.markSaved();
      changed();
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  async function saveAs() {
    try {
      const result = await Suite.files.saveAs(state.buffer.bytes(), { suggestedName: state.name });
      if (!result) return;
      report(result);
      state.name = result.name;
      state.isNew = false;
      if (result.handle) state.handle = result.handle;
      state.buffer.markSaved();
      changed();
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  // ---- UI ------------------------------------------------------------------------------------------

  function Toolbar() {
    const buf = state.buffer;
    return html`<nav class="he-toolbar" role="toolbar">
      <button class="secondary" data-testid="new" onClick=${newFile}>${t('he.new')}</button>
      <button class="secondary" data-testid="open" title="${t('he.open')} (Ctrl+O)" onClick=${openFile}>${t('he.open')}</button>
      <${Suite.shell.Recent} app=${APP} onOpen=${(p) => openPicked([p])} />
      <button data-testid="save" class=${buf.dirty ? '' : 'secondary'} title="${t('he.save')} (Ctrl+S)" onClick=${save}>${t('he.save')}</button>
      <button class="secondary" data-testid="save-as" onClick=${saveAs}>${t('he.saveAs')}</button>
      <button class="secondary outline" data-testid="undo" title="${t('he.undo')} (Ctrl+Z)" disabled=${!buf.undoStack.length} onClick=${undo}>${Suite.icon('undo-2')}</button>
      <button class="secondary outline" data-testid="redo" title="${t('he.redo')} (Ctrl+Y)" disabled=${!buf.redoStack.length} onClick=${redo}>${Suite.icon('redo-2')}</button>
      <button class="secondary outline" data-testid="find" title="${t('he.find')} (Ctrl+F)" onClick=${() => openBar('find')}>${Suite.icon('search')}</button>
      <button class="secondary outline" data-testid="goto" title="${t('he.goto')} (Ctrl+G)" onClick=${() => openBar('goto')}>${Suite.icon('arrow-down-to-line')}</button>
      <button class="secondary outline" data-testid="checksums" title=${t('he.checksums')} onClick=${showChecksums}>#</button>
      <button class="secondary outline" data-testid="stats" title=${t('he.stats')} onClick=${showStats}>${Suite.icon('chart-column')}</button>
      <button class=${state.compare ? '' : 'secondary outline'} data-testid="compare" title=${t('he.compare')} onClick=${() => (state.compare ? (state.compare = null, render()) : pickCompare())}>${Suite.icon('arrow-left-right')}</button>
      <button class=${state.insert ? '' : 'secondary outline'} data-testid="mode" title="Insert" onClick=${() => { state.insert = !state.insert; render(); }}>${state.insert ? t('he.insert') : t('he.overwrite')}</button>
      <select data-testid="bytes-per-row" aria-label=${t('he.bytesPerRow')} onChange=${(e) => { prefs.bytesPerRow = +e.target.value; savePrefs(); render(); }}>
        ${[0, 8, 16, 32].map((n) => html`<option value=${n} selected=${prefs.bytesPerRow === n}>${n ? `${n} / ${t('he.bytesPerRow')}` : `${t('he.auto')} (${bytesPerRow()})`}</option>`)}
      </select>
    </nav>`;
  }

  function CompareBar() {
    if (!state.compare) return null;
    const n = diffCount();
    return html`<div class="he-bar he-compare" data-testid="compare-bar">
      <span>${t('he.comparing', state.compare.name)} · <strong data-testid="diff-count">${n ? t('he.differences', n.toLocaleString()) : t('he.identical')}</strong></span>
      <button type="button" class="secondary" data-testid="diff-prev" title=${t('he.prevDiff')} disabled=${!n} onClick=${() => nextDiff(true)}>${Suite.icon('arrow-up')}</button>
      <button type="button" class="secondary" data-testid="diff-next" title=${t('he.nextDiff')} disabled=${!n} onClick=${() => nextDiff(false)}>${Suite.icon('arrow-down')}</button>
      <button type="button" class="secondary outline" data-testid="compare-close" title=${t('he.endCompare')} onClick=${() => { state.compare = null; render(); }}>×</button>
    </div>`;
  }

  // ---- statistics: histogram and entropy of the selection or the file ----------------------------------------------------

  function showStats() {
    const buf = state.buffer, sel = selection();
    const bytes = sel ? buf.data.subarray(sel.from, sel.to) : buf.data.subarray(0, buf.length);
    state.stats = { base: sel ? sel.from : 0, label: sel ? t('he.ofSelection', (sel.to - sel.from).toLocaleString()) : t('he.ofFile', buf.length.toLocaleString()), s: HE.byteStats(bytes), log: false };
    render();
  }

  function entropyNote(h) { return t(h > 7.5 ? 'he.entHigh' : h > 6 ? 'he.entMid' : h < 1 ? 'he.entLow' : 'he.entText'); }

  function StatsDialog() {
    const d = state.stats;
    if (!d) return null;
    const s = d.s;
    const close = () => { state.stats = null; render(); document.querySelector('.he-view').focus(); };
    const css = getComputedStyle(document.body);
    const fg = css.getPropertyValue('--pico-primary').trim() || '#1e88e5', muted = css.getPropertyValue('--pico-muted-color').trim() || '#888';
    const drawHist = (c) => {
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
      const g = c.getContext('2d'), w = c.width, h = c.height;
      g.clearRect(0, 0, w, h);
      const max = Math.max(1, ...s.counts);
      const scale = (v) => (d.log ? Math.log1p(v) / Math.log1p(max) : v / max);
      g.fillStyle = fg;
      for (let b = 0; b < 256; b++) { const bh = scale(s.counts[b]) * (h - 2); g.fillRect((b * w) / 256, h - bh, Math.max(1, w / 256 - 0.5), bh); }
      g.fillStyle = muted; g.font = `${10 * dpr}px sans-serif`;
      for (const b of [0, 0x20, 0x41, 0x61, 0x80, 0xff]) g.fillText(b.toString(16).toUpperCase().padStart(2, '0'), (b * w) / 256, 10 * dpr);
    };
    const drawBlocks = (c) => {
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
      const g = c.getContext('2d'), w = c.width, h = c.height;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = muted; g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(0, h - (7.5 / 8) * h); g.lineTo(w, h - (7.5 / 8) * h); g.stroke(); g.setLineDash([]);
      g.strokeStyle = fg; g.lineWidth = 1.5 * dpr; g.beginPath();
      s.blocks.forEach((b, i) => { const x = ((i + 0.5) * w) / s.blocks.length, y = h - (b.entropy / 8) * h; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    };
    const jump = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.min(s.blocks.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * s.blocks.length)));
      if (!s.blocks[i]) return;
      state.stats = null;
      moveTo(d.base + s.blocks[i].offset);
    };
    const pct = (v) => (s.n ? `${((v / s.n) * 100).toFixed(1)} %` : '–');
    return html`<dialog open data-testid="stats-dialog" onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}><article class="he-stats">
      <header><strong>${t('he.stats')}</strong> <small>${d.label}</small></header>
      <p><strong>${t('he.entropy')}:</strong> <span data-testid="stats-entropy">${s.entropy.toFixed(3)}</span> ${t('he.bitsPerByte')} – ${entropyNote(s.entropy)}<br />
        ${t('he.zeros')}: <span data-testid="stats-zeros">${pct(s.zeros)}</span> · ${t('he.printable')}: <span data-testid="stats-printable">${pct(s.printable)}</span></p>
      <p class="he-stats-label">${t('he.histogram')} <label class="he-inline"><input type="checkbox" checked=${d.log} data-testid="stats-log" onChange=${(e) => { d.log = e.target.checked; render(); }} /> ${t('he.logScale')}</label></p>
      <canvas class="he-hist" data-testid="stats-histogram" ref=${drawHist}></canvas>
      <p class="he-stats-top" data-testid="stats-top">${t('he.mostFrequent')}: ${s.top.map(([b, c]) => html`<code>${b.toString(16).toUpperCase().padStart(2, '0')}</code> ${pct(c)} `)}</p>
      ${s.blocks.length > 1 ? html`<p class="he-stats-label">${t('he.entropyCurve', s.blockSize.toLocaleString())}</p>
        <canvas class="he-blocks" data-testid="stats-blocks" ref=${drawBlocks} onClick=${jump} title=${t('he.entropyJump')}></canvas>` : null}
      <footer><button data-testid="stats-close" onClick=${close}>${t('he.close')}</button></footer>
    </article></dialog>`;
  }

  function ChecksumDialog() {
    const s = state.sums;
    if (!s) return null;
    const close = () => { state.sums = null; render(); document.querySelector('.he-view').focus(); };
    return html`<dialog open data-testid="checksum-dialog" onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}><article>
      <header><strong>${t('he.checksums')}</strong> <small>${s.label}</small></header>
      ${s.values ? html`<table class="he-sums"><tbody>${Object.entries(s.values).filter(([, v]) => v).map(([k, v]) => html`<tr>
        <th>${k}</th><td data-testid=${`sum-${k}`}>${v}</td>
        <td><button class="secondary outline" title=${t('he.copy')} onClick=${() => copyValue(k, v)}>${Suite.icon('copy')}</button></td></tr>`)}</tbody></table>` : html`<p aria-busy="true"></p>`}
      <footer><button data-testid="checksum-close" onClick=${close}>${t('he.close')}</button></footer>
    </article></dialog>`;
  }

  function Bar() {
    if (state.bar === 'find') {
      return html`<form class="he-bar" data-testid="find-bar" onSubmit=${(e) => { e.preventDefault(); find(false); }}>
        <select data-testid="find-type" value=${state.findType} onChange=${(e) => { state.findType = e.target.value; }}>
          <option value="hex" selected=${state.findType === 'hex'}>${t('he.findHex')}</option>
          <option value="text" selected=${state.findType === 'text'}>${t('he.findText')}</option>
        </select>
        <input data-testid="find-input" value=${state.findText} onInput=${(e) => { state.findText = e.target.value; }} placeholder=${state.findType === 'hex' ? '4A 6F' : 'text'} />
        <button type="button" class="secondary" data-testid="find-prev" onClick=${() => find(true)}>${t('he.previous')}</button>
        <button type="submit" data-testid="find-next">${t('he.next')}</button>
        <button type="button" class="secondary outline" onClick=${() => { state.bar = null; render(); }}>×</button>
      </form>`;
    }
    if (state.bar === 'goto') {
      return html`<form class="he-bar" data-testid="goto-bar" onSubmit=${(e) => { e.preventDefault(); gotoOffset(e.target.elements.offset.value); }}>
        <input name="offset" data-testid="goto-input" placeholder=${t('he.gotoPlaceholder')} />
        <button type="submit">${t('he.goto')}</button>
        <button type="button" class="secondary outline" onClick=${() => { state.bar = null; render(); }}>×</button>
      </form>`;
    }
    return null;
  }

  function HexView() {
    const buf = state.buffer;
    const row = bytesPerRow();
    const rows = Math.floor(Math.max(buf.length, state.compare ? state.compare.bytes.length : 0) / row) + 1; // one extra row for appending
    const first = Math.max(0, Math.floor(state.scrollTop / ROW_HEIGHT) - 5);
    const last = Math.min(rows, Math.ceil((state.scrollTop + state.viewHeight) / ROW_HEIGHT) + 5);
    const sel = selection();
    const st = state.side === 'structure' ? structure() : null;
    const stFields = st ? st.fields : null;
    const lines = [];
    for (let r = first; r < last; r++) {
      const start = r * row;
      const hexCells = [];
      const asciiCells = [];
      const otherCells = [];
      const other = state.compare && state.compare.bytes;
      for (let i = 0; i < row; i++) {
        const o = start + i;
        const exists = o < buf.length;
        const diff = other && (o < buf.length || o < other.length) && differs(o) ? 'diff' : '';
        if (other) otherCells.push(html`<span class=${[diff, i && i % 8 === 0 ? 'gap' : ''].join(' ')}>${o < other.length ? hex2(other[o]) : '  '}</span>`);
        const fi = stFields && exists ? fieldIndexAt(stFields, o) : -1;
        const mk = buf.marks.length && exists ? markClass(buf.marks, o) : '';
        const cls = [diff, fi >= 0 ? `st${fi % 6}` : '', mk, o === state.cursor ? `cursor${state.pane === 'hex' ? ' active' : ''}${state.nibble ? ' low' : ''}` : '', sel && o >= sel.from && o < sel.to ? 'sel' : '', i && i % 8 === 0 ? 'gap' : ''].join(' ');
        const aCls = [o === state.cursor ? `cursor${state.pane === 'ascii' ? ' active' : ''}` : '', sel && o >= sel.from && o < sel.to ? 'sel' : ''].join(' ');
        if (exists || o === buf.length) {
          hexCells.push(html`<span class=${cls} data-offset=${o} data-pane="hex">${exists ? hex2(buf.byte(o)) : '__'}</span>`);
          asciiCells.push(html`<span class=${aCls} data-offset=${o} data-pane="ascii">${exists ? printable(buf.byte(o)) : ' '}</span>`);
        } else {
          hexCells.push(html`<span class=${cls}>  </span>`);
        }
      }
      lines.push(html`<div class="he-row" style=${`top:${r * ROW_HEIGHT}px`} key=${r}>
        <span class="he-offset">${offsetHex(start)}</span><span class="he-hex">${hexCells}</span>${other ? html`<span class="he-hex he-other" data-testid="other-row">${otherCells}</span>` : html`<span class="he-ascii">${asciiCells}</span>`}</div>`);
    }
    return html`<div class="he-view" tabindex="0" data-testid="view" onKeyDown=${onKeyDown}>
      <div class="he-scroll" onScroll=${(e) => { state.scrollTop = e.target.scrollTop; state.viewHeight = e.target.clientHeight; render(); }}
           onPointerDown=${onPointerDown} onPointerMove=${onPointerMove}>
        <div class="he-spacer" style=${`height:${rows * ROW_HEIGHT}px`}>${lines}</div>
      </div>
    </div>`;
  }

  // ---- structure (js/structures.js): the fields of known formats; the top-level fields tint the hex view -------------------

  const structureCache = new WeakMap(); // buffer -> { version, result }
  function structure() {
    const buf = state.buffer;
    const hit = structureCache.get(buf);
    if (hit && hit.version === buf.version) return hit.result;
    const result = HE.structures.parse(buf.data.subarray(0, buf.length));
    structureCache.set(buf, { version: buf.version, result });
    return result;
  }

  /** The index of the top-level structure field containing offset o (or −1), for the tint (binary search). */
  function fieldIndexAt(fields, o) {
    let lo = 0, hi = fields.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, f = fields[mid];
      if (o < f.offset) hi = mid - 1; else if (o >= f.offset + f.size) lo = mid + 1; else return mid;
    }
    return -1;
  }

  function selectField(f) {
    if (!f.size) { moveTo(f.offset); return; }
    moveTo(f.offset);
    state.anchor = f.offset;
    state.cursor = Math.min(state.buffer.length - 1, f.offset + f.size - 1);
    render();
  }

  function FieldRow({ f, depth }) {
    const label = html`<span class="he-st-name">${f.name}</span><span class="he-st-value">${f.value || ''}</span>
      <span class="he-st-pos">${f.offset.toString(16).toUpperCase()} · ${f.size}</span>`;
    const pick = (e) => { e.preventDefault(); selectField(f); };
    if (!f.children || !f.children.length) return html`<li><a href="#" class="he-st-row" data-testid="st-field" data-name=${f.name} onClick=${pick}>${label}</a></li>`;
    return html`<li><details open=${depth === 0 && f.children.length <= 12}><summary><a href="#" class="he-st-row" data-testid="st-field" data-name=${f.name} onClick=${pick}>${label}</a></summary>
      <ul>${f.children.map((c) => html`<${FieldRow} f=${c} depth=${depth + 1} />`)}</ul></details></li>`;
  }

  function Structure() {
    const st = structure();
    if (!st) return html`<p class="he-st-none" data-testid="st-none">${t('he.stNone', HE.structures.FORMATS.join(', '))}</p>`;
    return html`<div class="he-structure" data-testid="structure"><p><strong data-testid="st-format">${st.format}</strong> · ${t('he.stFields', st.fields.length)}</p>
      ${st.error ? html`<p class="he-st-none">${st.error}</p>` : null}
      <ul class="he-st-tree">${st.fields.map((f) => html`<${FieldRow} f=${f} depth=${0} />`)}</ul></div>`;
  }

  // ---- marks: bookmarks and coloured ranges (kept on the buffer, moved by inserts and deletions: buffer.js) -----------------

  const MARK_COLORS = 6;
  let markId = 1;

  function toggleBookmark() {
    const buf = state.buffer, o = Math.min(state.cursor, Math.max(0, buf.length - 1));
    const existing = buf.marks.find((m) => m.kind === 'bookmark' && m.from === o);
    buf.marks = existing ? buf.marks.filter((m) => m !== existing) : [...buf.marks, { id: markId++, from: o, to: o + 1, kind: 'bookmark', color: 0, label: '' }];
    render();
  }

  function colourSelection(color, label) {
    const sel = selection();
    if (!sel) { Suite.shell.toast(t('he.markNoSelection'), 'warning'); return; }
    state.buffer.marks = [...state.buffer.marks, { id: markId++, from: sel.from, to: sel.to, kind: 'range', color, label }];
    state.markLabel = '';
    render();
  }

  /** The next (1) or previous (−1) mark from the cursor, wrapping around. */
  function jumpMark(direction) {
    const starts = [...new Set(state.buffer.marks.map((m) => m.from))].sort((a, b) => a - b);
    if (!starts.length) { Suite.shell.toast(t('he.markNone'), 'warning'); return; }
    const target = direction > 0 ? (starts.find((x) => x > state.cursor) ?? starts[0]) : ([...starts].reverse().find((x) => x < state.cursor) ?? starts[starts.length - 1]);
    moveTo(target);
  }

  function selectMark(m) {
    if (m.kind === 'bookmark') { moveTo(m.from); return; }
    selectField({ offset: m.from, size: m.to - m.from });
  }

  /** The mark class of a byte (the last range wins; bookmarks are outlined). */
  function markClass(marks, o) {
    let cls = '';
    for (const m of marks) if (o >= m.from && o < m.to) cls = m.kind === 'bookmark' ? `${cls} bm` : ` mk${m.color}`;
    return cls;
  }

  function Marks() {
    const buf = state.buffer;
    const color = state.markColor || 0;
    return html`<div class="he-marks" data-testid="marks">
      <div class="he-mark-actions">
        <button class="secondary outline" data-testid="mark-bookmark" title="Ctrl+F2" onClick=${toggleBookmark}>${Suite.icon('bookmark')} ${t('he.bookmark')}</button>
      </div>
      <form class="he-mark-form" onSubmit=${(e) => { e.preventDefault(); colourSelection(color, state.markLabel || ''); }}>
        <div class="he-swatches">${Array.from({ length: MARK_COLORS }, (_, i) => html`<button type="button" class=${`he-swatch mk${i} ${color === i ? 'on' : ''}`} aria-label=${t('he.markColour', i + 1)}
          data-testid=${`mark-colour-${i}`} onClick=${() => { state.markColor = i; render(); }}></button>`)}</div>
        <input data-testid="mark-label" placeholder=${t('he.markLabel')} value=${state.markLabel || ''} onInput=${(e) => { state.markLabel = e.target.value; }} />
        <button type="submit" data-testid="mark-range" disabled=${!selection()}>${t('he.markRange')}</button>
      </form>
      ${buf.marks.length ? html`<ul class="he-mark-list">${[...buf.marks].sort((a, b) => a.from - b.from).map((m) => html`<li data-testid="mark">
        ${state.renamingMark === m.id ? html`<input class="he-mark-rename" data-testid="mark-rename-input" value=${m.label} ref=${(el) => { if (el && document.activeElement !== el) el.focus(); }}
            onKeyDown=${(e) => { if (e.key === 'Enter') { m.label = e.target.value; state.renamingMark = null; render(); } else if (e.key === 'Escape') { state.renamingMark = null; render(); } }}
            onBlur=${(e) => { if (state.renamingMark === m.id) { m.label = e.target.value; state.renamingMark = null; render(); } }} />`
          : html`<a href="#" class="he-st-row" onClick=${(e) => { e.preventDefault(); selectMark(m); }}>
          <span class="he-st-name"><span class=${m.kind === 'bookmark' ? 'he-mark-dot bm' : `he-mark-dot mk${m.color}`}></span>${m.label || (m.kind === 'bookmark' ? t('he.bookmark') : t('he.range'))}</span>
          <span class="he-st-pos">${m.from.toString(16).toUpperCase()}${m.kind === 'range' ? ` · ${m.to - m.from}` : ''}</span></a>`}
        <button class="secondary outline" title=${t('he.markRename')} aria-label=${t('he.markRename')} data-testid="mark-rename" onClick=${() => { state.renamingMark = m.id; render(); }}>${Suite.icon('pencil')}</button>
        <button class="secondary outline" title=${t('he.markDelete')} aria-label=${t('he.markDelete')} data-testid="mark-delete" onClick=${() => { buf.marks = buf.marks.filter((x) => x !== m); render(); }}>×</button>
      </li>`)}</ul>` : html`<p class="he-st-none">${t('he.markHint')}</p>`}
    </div>`;
  }

  function Side() {
    const tab = state.side || 'inspector';
    return html`<aside class="he-inspector" data-testid="side">
      <div class="he-side-tabs" role="tablist">${['inspector', 'structure', 'marks'].map((k) => html`<button role="tab" class=${tab === k ? '' : 'secondary outline'} aria-selected=${String(tab === k)}
        data-testid=${`side-${k}`} onClick=${() => { state.side = k; render(); }}>${t(`he.side.${k}`)}${k === 'marks' && state.buffer.marks.length ? ` (${state.buffer.marks.length})` : ''}</button>`)}</div>
      ${tab === 'structure' ? html`<${Structure} />` : tab === 'marks' ? html`<${Marks} />` : html`<${Inspector} />`}
    </aside>`;
  }

  function Inspector() {
    const buf = state.buffer;
    const bytes = buf.slice(state.cursor, state.cursor + 8);
    const v = HE.inspect(bytes, prefs.littleEndian);
    const sel = selection();
    const rows = [['binary', v.binary], ['uint8', v.uint8], ['int8', v.int8], ['uint16', v.uint16], ['int16', v.int16], ['uint32', v.uint32], ['int32', v.int32],
      ['uint64', v.uint64], ['int64', v.int64], ['float32', v.float32], ['float64', v.float64], ['UTF-8', v.utf8]];
    return html`<div data-testid="inspector">
      <p class="he-pos">${t('he.offset')}: <span data-testid="offset">${state.cursor} (0x${state.cursor.toString(16).toUpperCase()})</span>
        ${sel ? html`<br />${t('he.selection')}: <span data-testid="selection">${sel.to - sel.from}</span>` : null}</p>
      <label class="he-endian"><input type="checkbox" data-testid="little-endian" checked=${prefs.littleEndian} onChange=${(e) => { prefs.littleEndian = e.target.checked; savePrefs(); render(); }} /> ${t('he.littleEndian')}</label>
      <table><tbody>${rows.filter(([, val]) => val !== undefined).map(([k, val]) => html`<tr><th>${k}</th><td data-testid=${`v-${k}`}>${val === null ? '–' : String(val)}</td></tr>`)}</tbody></table>
      <form class="he-set" onSubmit=${(e) => { e.preventDefault(); setByteValue(e.target.elements.value.value); e.target.reset(); }}>
        <label>${t('he.value')}<input name="value" data-testid="set-value" inputmode="text" autocomplete="off" placeholder=${state.cursor < buf.length ? hex2(buf.byte(state.cursor)) : '00'} /></label>
        <button type="submit" data-testid="set-button">${t('he.set')}</button>
      </form>
    </div>`;
  }

  function StatusBar() {
    return html`<footer class="he-status" data-testid="status">
      <span data-testid="file-name">${state.name}${state.buffer.dirty ? ' ●' : ''}</span>
      <span data-testid="size">${t('he.size', state.buffer.length.toLocaleString())}</span>
      <span>${state.insert ? 'INS' : 'OVR'}</span>
    </footer>`;
  }

  function Tabs() {
    return html`<div class="he-tabs" role="tablist" aria-label=${t('he.tabs')} data-testid="tabs">${docs.map((d, i) => {
      const doc = docAt(i);
      return html`<div role="tab" class=${`he-tab${i === active ? ' active' : ''}`} aria-selected=${i === active ? 'true' : 'false'} tabindex="0" data-testid="tab" title=${doc.name}
           onClick=${() => activate(i)} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(i); } else if (e.key === 'Delete') closeDoc(i); }}
           onAuxClick=${(e) => { if (e.button === 1) closeDoc(i); }}>
        <span class="he-tab-name" data-testid="tab-name">${doc.name}</span>${isDirty(doc) ? html`<span class="he-dirty" data-testid="dirty">●</span>` : null}
        <span class="he-tab-close" data-testid="close-tab" aria-hidden="true" title="${t('he.closeTab')} (Alt+W, Delete)" onClick=${(e) => { e.stopPropagation(); closeDoc(i); }}>×</span>
      </div>`;
    })}</div>`;
  }

  function Main() {
    return html`<div class="he-layout"><${Tabs} /><${Bar} /><${CompareBar} /><${ChecksumDialog} /><${StatsDialog} /><div class="he-body"><${HexView} /><${Side} /></div><${StatusBar} /></div>`;
  }

  function measure() {
    const el = scrollElement();
    state.width = window.innerWidth;
    if (el) state.viewHeight = el.clientHeight;
    render();
  }

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
  Suite.files.dropZone(document.body, openPicked);
  window.addEventListener('resize', measure);
  requestAnimationFrame(measure);

  Suite.bridge.receive((picked) => openPicked([picked]), { app: 'hexeditor' }); // files opened from other apps ("Open with…")

  // the open files for "Create an archive from the open files" (about dialog)
  Suite.openFiles.register(() => docs.map((_, i) => docAt(i)).filter((d) => !(d.isNew && d.buffer.length === 0))
    .map((d) => ({ name: d.name, bytes: d.buffer.bytes(), dirty: isDirty(d) })));

  // for tests
  HE.app = { showStats, toggleBookmark, colourSelection, jumpMark, state, docs, get active() { return active; }, activate, closeDoc, newFile, load, openPicked, save, saveAs, undo, redo, moveTo, find, gotoOffset, bytesPerRow, setByteValue, setCompare, nextDiff, showChecksums };
  document.body.dataset.ready = 'true';
})();
