/*
 * Hex editor: virtualized hex/ASCII view, overwrite and insert mode, selection, search, go to offset,
 * data inspector, undo/redo. Runs in the shared app shell (Suite.shell, Preact + htm).
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
      'he.copied': 'Copied {0} bytes as hex.', 'he.unsaved': 'The file has unsaved changes. Discard them?', 'he.discard': 'Discard',
      'he.large': 'Large file ({0} MB): editing needs a lot of memory.', 'he.close': 'Close',
      'he.checksums': 'Checksums', 'he.ofSelection': 'of the selection ({0} bytes)', 'he.ofFile': 'of the file ({0} bytes)', 'he.copy': 'Copy', 'he.copiedValue': '{0} copied.',
      'he.compare': 'Compare with a file…', 'he.comparing': 'Compared with {0}', 'he.differences': '{0} differences', 'he.identical': 'The files are identical.',
      'he.nextDiff': 'Next difference', 'he.prevDiff': 'Previous difference', 'he.noMoreDiff': 'No further difference.', 'he.endCompare': 'End comparison',
    },
    de: {
      'app.title': 'Hex-Editor',
      'he.new': 'Neu', 'he.open': 'Öffnen', 'he.save': 'Speichern', 'he.saveAs': 'Speichern unter', 'he.undo': 'Rückgängig', 'he.redo': 'Wiederholen',
      'he.find': 'Suchen', 'he.goto': 'Gehe zu', 'he.insert': 'Einfügen', 'he.overwrite': 'Überschreiben', 'he.bytesPerRow': 'Bytes pro Zeile',
      'he.auto': 'Auto', 'he.untitled': 'unbenannt.bin', 'he.size': '{0} Bytes', 'he.offset': 'Offset', 'he.selection': 'Auswahl',
      'he.findHex': 'Hex', 'he.findText': 'Text', 'he.next': 'Weiter', 'he.previous': 'Zurück', 'he.notFound': 'Nicht gefunden.',
      'he.badHex': 'Bitte geben Sie hexadezimale Bytes ein, z. B. „4A 6F“.', 'he.gotoPlaceholder': 'Offset (z. B. 1024 oder 0x400)', 'he.badOffset': 'Ungültiger Offset.',
      'he.inspector': 'Dateninspektor', 'he.littleEndian': 'Little Endian', 'he.value': 'Bytewert (hex)', 'he.set': 'Setzen',
      'he.copied': '{0} Bytes als Hex kopiert.', 'he.unsaved': 'Die Datei hat ungespeicherte Änderungen. Verwerfen?', 'he.discard': 'Verwerfen',
      'he.large': 'Große Datei ({0} MB): Bearbeiten braucht viel Arbeitsspeicher.', 'he.close': 'Schließen',
      'he.checksums': 'Prüfsummen', 'he.ofSelection': 'der Auswahl ({0} Bytes)', 'he.ofFile': 'der Datei ({0} Bytes)', 'he.copy': 'Kopieren', 'he.copiedValue': '{0} kopiert.',
      'he.compare': 'Mit einer Datei vergleichen…', 'he.comparing': 'Verglichen mit {0}', 'he.differences': '{0} Unterschiede', 'he.identical': 'Die Dateien sind identisch.',
      'he.nextDiff': 'Nächster Unterschied', 'he.prevDiff': 'Vorheriger Unterschied', 'he.noMoreDiff': 'Kein weiterer Unterschied.', 'he.endCompare': 'Vergleich beenden',
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
    Suite.shell.setDirty(state.buffer.dirty);
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
      Delete: () => deleteSelectionOr(state.cursor, 1),
      Backspace: () => (selection() ? deleteSelectionOr(-1, 0) : deleteSelectionOr(state.cursor - 1, 1)),
    };
    if (ctrl) {
      const k = e.key.toLowerCase();
      const commands = { z: e.shiftKey ? redo : undo, y: redo, s: e.shiftKey ? saveAs : save, o: openFile, f: () => openBar('find'), g: () => openBar('goto'), c: copySelection, v: paste, a: () => { state.anchor = 0; moveTo(Math.max(0, state.buffer.length - 1), true); } };
      if (commands[k]) { e.preventDefault(); commands[k](); return; }
      if (e.key !== 'Home' && e.key !== 'End') return; // Ctrl+Home/End: start/end of the file
    }
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

  async function confirmDiscard() {
    return !state.buffer.dirty || Suite.shell.confirm(t('he.unsaved'), { ok: t('he.discard') });
  }

  function load(name, bytes, handle = null) {
    state.buffer = new HE.ByteBuffer(bytes);
    Object.assign(state, { name, handle, isNew: false, cursor: 0, anchor: null, nibble: 0, scrollTop: 0 });
    if (bytes.length > 256 * 1024 * 1024) Suite.shell.toast(t('he.large', Math.round(bytes.length / 1048576)), 'warning');
    const el = scrollElement();
    if (el) el.scrollTop = 0;
    changed();
  }

  // recovery copies of unsaved work (shared/js/autosave.js)
  Suite.autosave.register({
    app: APP,
    save: () => (state.buffer.dirty ? { name: state.name, handle: state.handle, bytes: state.buffer.bytes() } : null),
    restore: (s) => { load(s.name, s.bytes, s.handle || null); state.buffer.savedVersion = -1; changed(); },
  });

  async function openPicked(picked) {
    if (!picked || !picked.length || !(await confirmDiscard())) return;
    const { file, handle } = picked[0];
    load(file.name, new Uint8Array(await file.arrayBuffer()), handle);
    if (handle) Suite.files.remember(APP, handle);
  }

  async function openFile() {
    try { await openPicked(await Suite.files.open()); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  async function newFile() {
    if (!(await confirmDiscard())) return;
    load(t('he.untitled'), new Uint8Array(0));
    state.isNew = true;
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
      <button class="secondary outline" data-testid="undo" title="${t('he.undo')} (Ctrl+Z)" disabled=${!buf.undoStack.length} onClick=${undo}>↶</button>
      <button class="secondary outline" data-testid="redo" title="${t('he.redo')} (Ctrl+Y)" disabled=${!buf.redoStack.length} onClick=${redo}>↷</button>
      <button class="secondary outline" data-testid="find" title="${t('he.find')} (Ctrl+F)" onClick=${() => openBar('find')}>🔍</button>
      <button class="secondary outline" data-testid="goto" title="${t('he.goto')} (Ctrl+G)" onClick=${() => openBar('goto')}>↧</button>
      <button class="secondary outline" data-testid="checksums" title=${t('he.checksums')} onClick=${showChecksums}>#</button>
      <button class=${state.compare ? '' : 'secondary outline'} data-testid="compare" title=${t('he.compare')} onClick=${() => (state.compare ? (state.compare = null, render()) : pickCompare())}>⇆</button>
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
      <button type="button" class="secondary" data-testid="diff-prev" title=${t('he.prevDiff')} disabled=${!n} onClick=${() => nextDiff(true)}>↑</button>
      <button type="button" class="secondary" data-testid="diff-next" title=${t('he.nextDiff')} disabled=${!n} onClick=${() => nextDiff(false)}>↓</button>
      <button type="button" class="secondary outline" data-testid="compare-close" title=${t('he.endCompare')} onClick=${() => { state.compare = null; render(); }}>×</button>
    </div>`;
  }

  function ChecksumDialog() {
    const s = state.sums;
    if (!s) return null;
    const close = () => { state.sums = null; render(); document.querySelector('.he-view').focus(); };
    return html`<dialog open data-testid="checksum-dialog" onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}><article>
      <header><strong>${t('he.checksums')}</strong> <small>${s.label}</small></header>
      ${s.values ? html`<table class="he-sums"><tbody>${Object.entries(s.values).filter(([, v]) => v).map(([k, v]) => html`<tr>
        <th>${k}</th><td data-testid=${`sum-${k}`}>${v}</td>
        <td><button class="secondary outline" title=${t('he.copy')} onClick=${() => copyValue(k, v)}>⧉</button></td></tr>`)}</tbody></table>` : html`<p aria-busy="true"></p>`}
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
        const cls = [diff, o === state.cursor ? `cursor${state.pane === 'hex' ? ' active' : ''}${state.nibble ? ' low' : ''}` : '', sel && o >= sel.from && o < sel.to ? 'sel' : '', i && i % 8 === 0 ? 'gap' : ''].join(' ');
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

  function Inspector() {
    const buf = state.buffer;
    const bytes = buf.slice(state.cursor, state.cursor + 8);
    const v = HE.inspect(bytes, prefs.littleEndian);
    const sel = selection();
    const rows = [['binary', v.binary], ['uint8', v.uint8], ['int8', v.int8], ['uint16', v.uint16], ['int16', v.int16], ['uint32', v.uint32], ['int32', v.int32],
      ['uint64', v.uint64], ['int64', v.int64], ['float32', v.float32], ['float64', v.float64], ['UTF-8', v.utf8]];
    return html`<aside class="he-inspector" data-testid="inspector">
      <h2>${t('he.inspector')}</h2>
      <p class="he-pos">${t('he.offset')}: <span data-testid="offset">${state.cursor} (0x${state.cursor.toString(16).toUpperCase()})</span>
        ${sel ? html`<br />${t('he.selection')}: <span data-testid="selection">${sel.to - sel.from}</span>` : null}</p>
      <label class="he-endian"><input type="checkbox" data-testid="little-endian" checked=${prefs.littleEndian} onChange=${(e) => { prefs.littleEndian = e.target.checked; savePrefs(); render(); }} /> ${t('he.littleEndian')}</label>
      <table><tbody>${rows.filter(([, val]) => val !== undefined).map(([k, val]) => html`<tr><th>${k}</th><td data-testid=${`v-${k}`}>${val === null ? '–' : String(val)}</td></tr>`)}</tbody></table>
      <form class="he-set" onSubmit=${(e) => { e.preventDefault(); setByteValue(e.target.elements.value.value); e.target.reset(); }}>
        <label>${t('he.value')}<input name="value" data-testid="set-value" inputmode="text" autocomplete="off" placeholder=${state.cursor < buf.length ? hex2(buf.byte(state.cursor)) : '00'} /></label>
        <button type="submit" data-testid="set-button">${t('he.set')}</button>
      </form>
    </aside>`;
  }

  function StatusBar() {
    return html`<footer class="he-status" data-testid="status">
      <span data-testid="file-name">${state.name}${state.buffer.dirty ? ' ●' : ''}</span>
      <span data-testid="size">${t('he.size', state.buffer.length.toLocaleString())}</span>
      <span>${state.insert ? 'INS' : 'OVR'}</span>
    </footer>`;
  }

  function Main() {
    return html`<div class="he-layout"><${Bar} /><${CompareBar} /><${ChecksumDialog} /><div class="he-body"><${HexView} /><${Inspector} /></div><${StatusBar} /></div>`;
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

  Suite.bridge.receive((picked) => openPicked(picked), { app: 'hexeditor' }); // files opened from other apps ("Open with…")

  // for tests
  HE.app = { state, load, openPicked, save, saveAs, undo, redo, moveTo, find, gotoOffset, bytesPerRow, setByteValue, setCompare, nextDiff, showChecksums };
  document.body.dataset.ready = 'true';
})();
