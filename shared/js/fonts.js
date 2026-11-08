/*
 * Fonts of the suite: the bundled families (vendor/fonts/fonts.css or fonts-mono.css, inlined by build.py into the apps that offer
 * fonts – the overview keeps one copy for all) and fonts the user imports from the file system or an archive (TTF, OTF, WOFF, WOFF2),
 * kept in IndexedDB ("suite-fonts", shared by all the apps of the browser) and loaded with the FontFace API in every app.
 *
 *   Suite.fonts.families(category?) -> [{ name, category: 'sans-serif' | 'serif' | 'monospace' | 'imported', bundled }] of this page
 *   Suite.fonts.imported() -> [{ family, faces: [{ id, weight, style, file }] }]
 *   Suite.fonts.importFiles() / importBytes(name, bytes) / remove(family); Suite.fonts.ready (the imported fonts are loaded)
 *   Suite.fonts.onChange(fn)                    // fonts imported or removed (here or in another app: storage event)
 *   Suite.fonts.Settings                        // the section in the settings of the about dialog
 * Imported fonts are a source of the settings export (shared/js/shell.js: Suite.preferences.register), so they are also part of
 * workspaces. Liberation Sans/Serif/Mono are registered here as aliases of the bundled Arimo/Tinos/Cousine (the same fonts).
 */
(function (Suite) {
  'use strict';

  const BUNDLED = {
    Arimo: 'sans-serif', Tinos: 'serif', Cousine: 'monospace', Carlito: 'sans-serif', Caladea: 'serif', Gelasio: 'serif', Inter: 'sans-serif',
    'Open Sans': 'sans-serif', Roboto: 'sans-serif', Lato: 'sans-serif', Montserrat: 'sans-serif', 'Source Serif 4': 'serif', Merriweather: 'serif',
    'JetBrains Mono': 'monospace', 'Fira Code': 'monospace', 'Source Code Pro': 'monospace',
  };
  const ALIASES = { Arimo: ['Liberation Sans'], Tinos: ['Liberation Serif'], Cousine: ['Liberation Mono'], 'Source Serif 4': ['Source Serif'] };
  // office fonts that are often missing (Linux, Android, thin clients): the installed original wins, else the metric-compatible font
  const METRIC = { Calibri: 'Carlito', Cambria: 'Caladea', Arial: 'Arimo', Helvetica: 'Arimo', 'Times New Roman': 'Tinos', 'Courier New': 'Cousine' };
  const DB = 'suite-fonts', STORE = 'fonts', CHANGED = 'suite.fonts.changed';
  const listeners = new Set();
  let records = []; // imported: { id, family, weight, style, file, bytes }
  let present = []; // bundled families with rules in this page

  Suite.i18n.register({
    en: {
      'fonts.title': 'Fonts', 'fonts.bundled': '{0} fonts are included: {1}.', 'fonts.none': 'No fonts are included in this application.',
      'fonts.imported': 'Imported fonts (all applications of this browser):', 'fonts.noImported': 'No fonts imported.', 'fonts.import': 'Import fonts…',
      'fonts.remove': 'Remove “{0}”', 'fonts.removeAsk': 'Remove the font “{0}” from all applications?', 'fonts.added': 'Imported: {0}.',
      'fonts.invalid': '“{0}” is not a font that the browser can use.', 'fonts.source': 'Imported fonts', 'fonts.hint': 'TTF, OTF, WOFF or WOFF2, also from archives.',
    },
    de: {
      'fonts.title': 'Schriften', 'fonts.bundled': '{0} Schriften sind enthalten: {1}.', 'fonts.none': 'In dieser Anwendung sind keine Schriften enthalten.',
      'fonts.imported': 'Importierte Schriften (alle Anwendungen dieses Browsers):', 'fonts.noImported': 'Keine Schriften importiert.', 'fonts.import': 'Schriften importieren…',
      'fonts.remove': '„{0}“ entfernen', 'fonts.removeAsk': 'Die Schrift „{0}“ aus allen Anwendungen entfernen?', 'fonts.added': 'Importiert: {0}.',
      'fonts.invalid': '„{0}“ ist keine Schrift, die der Browser verwenden kann.', 'fonts.source': 'Importierte Schriften', 'fonts.hint': 'TTF, OTF, WOFF oder WOFF2, auch aus Archiven.',
    },
  });

  // ---- bundled fonts and aliases -----------------------------------------------------------------------------------------
  function bundledRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch (e) { continue; }
      for (const rule of list) if (rule instanceof CSSFontFaceRule && /data:font\/woff2/.test(rule.style.getPropertyValue('src'))) rules.push(rule);
    }
    return rules;
  }
  function setUpBundled() {
    const rules = bundledRules();
    const family = (r) => r.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '');
    present = [...new Set(rules.map(family))].filter((f) => BUNDLED[f]);
    for (const rule of rules) {
      const metric = Object.keys(METRIC).filter((k) => METRIC[k] === family(rule));
      for (const alias of [...(ALIASES[family(rule)] || []), ...metric]) {
        const src = METRIC[alias] ? `local("${alias}"), ${rule.style.getPropertyValue('src')}` : rule.style.getPropertyValue('src');
        try {
          document.fonts.add(new FontFace(alias, src, {
            style: rule.style.getPropertyValue('font-style') || 'normal', weight: rule.style.getPropertyValue('font-weight') || '400',
            unicodeRange: rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
          }));
        } catch (e) { /* not supported */ }
      }
    }
  }

  // ---- reading a font's names (TTF/OTF/TTC, WOFF; WOFF2 is brotli-compressed: its file name is used) -----------------------
  async function sfntOf(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = String.fromCharCode(...bytes.subarray(0, 4));
    if (tag === 'ttcf') return sfntOf(bytes.subarray(v.getUint32(12)));
    const tables = {};
    if (tag === 'wOFF') {
      const n = v.getUint16(12);
      for (let i = 0; i < n; i++) {
        const p = 44 + i * 20;
        const t = String.fromCharCode(...bytes.subarray(p, p + 4));
        if (t !== 'name' && t !== 'OS/2') continue;
        const off = v.getUint32(p + 4), comp = v.getUint32(p + 8), orig = v.getUint32(p + 12);
        let data = bytes.subarray(off, off + comp);
        if (comp < orig) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
        tables[t] = data;
      }
      return tables;
    }
    if (tag !== '\0\x01\0\0' && tag !== 'OTTO' && tag !== 'true') return null;
    const n = v.getUint16(4);
    for (let i = 0; i < n; i++) {
      const p = 12 + i * 16;
      const t = String.fromCharCode(...bytes.subarray(p, p + 4));
      if (t === 'name' || t === 'OS/2') tables[t] = bytes.subarray(v.getUint32(p + 8), v.getUint32(p + 8) + v.getUint32(p + 12));
    }
    return tables;
  }
  function nameOf(table, ids) {
    if (!table) return '';
    const v = new DataView(table.buffer, table.byteOffset, table.byteLength);
    const count = v.getUint16(2), strings = v.getUint16(4);
    for (const id of ids) {
      for (const windows of [true, false]) {
        for (let i = 0; i < count; i++) {
          const p = 6 + i * 12;
          const platform = v.getUint16(p), nameId = v.getUint16(p + 6), len = v.getUint16(p + 8), off = strings + v.getUint16(p + 10);
          if (nameId !== id || (platform === 3) !== windows || (!windows && platform !== 1)) continue;
          const raw = table.subarray(off, off + len);
          if (windows) { let s = ''; for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode((raw[k] << 8) | raw[k + 1]); if (s.trim()) return s.trim(); } else { const s = String.fromCharCode(...raw).trim(); if (s) return s; }
        }
      }
    }
    return '';
  }
  /** { family, weight, style } of a font file. */
  async function describe(file, bytes) {
    let tables = null;
    try { tables = await sfntOf(bytes); } catch (e) { tables = null; }
    const os2 = tables && tables['OS/2'];
    const sub = nameOf(tables && tables.name, [17, 2]) || file;
    let family = nameOf(tables && tables.name, [16, 1]);
    let weight = os2 && os2.length > 6 ? new DataView(os2.buffer, os2.byteOffset).getUint16(4) : (/black|heavy/i.test(sub) ? 900 : /extra ?bold/i.test(sub) ? 800 : /semi ?bold|demi/i.test(sub) ? 600 : /bold/i.test(sub) ? 700 : /medium/i.test(sub) ? 500 : /light/i.test(sub) ? 300 : 400);
    const italic = os2 && os2.length > 64 ? !!(new DataView(os2.buffer, os2.byteOffset).getUint16(62) & 1) : /italic|oblique/i.test(sub);
    if (!family) {
      family = file.replace(/\.[^.]+$/, '').replace(/[-_ ]?(Regular|Bold|Italic|Oblique|Light|Medium|Semi ?Bold|Extra ?Bold|Black|Thin|VariableFont.*|\[.*\])+$/gi, '').replace(/[-_]+/g, ' ').trim() || file;
    }
    weight = Math.max(1, Math.min(1000, weight || 400));
    return { family, weight, style: italic ? 'italic' : 'normal' };
  }

  // ---- storage -------------------------------------------------------------------------------------------------------------
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => { d.close(); resolve(result && 'result' in result ? result.result : undefined); };
      t.onerror = () => { d.close(); reject(t.error); };
    });
  }
  const faces = new Map(); // id -> FontFace added to the page
  async function load() {
    try { records = (await tx('readonly', (s) => s.getAll())) || []; } catch (e) { records = []; }
    for (const [id, face] of faces) if (!records.some((r) => r.id === id)) { document.fonts.delete(face); faces.delete(id); }
    for (const r of records) {
      if (faces.has(r.id)) continue;
      try {
        const face = new FontFace(r.family, r.bytes, { weight: String(r.weight), style: r.style });
        await face.load();
        document.fonts.add(face);
        faces.set(r.id, face);
      } catch (e) { console.warn('font', r.file, e); }
    }
    for (const fn of listeners) { try { fn(); } catch (e) { console.warn(e); } }
  }
  const changed = () => { try { localStorage.setItem(CHANGED, String(Date.now())); } catch (e) { /* storage blocked */ } return load(); };
  window.addEventListener('storage', (e) => { if (e.key === CHANGED) load(); });

  const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  /** Import a font file; resolves to its family (a face of the same family, weight and style replaces the old one). */
  async function importBytes(file, data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const info = await describe(file, bytes);
    try { await new FontFace(`suite-check-${Date.now()}`, bytes).load(); } catch (e) { throw new Suite.LocalizedError('fonts.invalid', file); }
    const old = records.find((r) => r.family === info.family && r.weight === info.weight && r.style === info.style);
    const id = old ? old.id : `${info.family}|${info.weight}|${info.style}|${Date.now().toString(36)}`;
    await tx('readwrite', (s) => s.put({ id, ...info, file, bytes: bytes.slice().buffer }));
    return info.family;
  }
  async function importFiles() {
    const picked = await Suite.files.open({ multiple: true, types: [{ description: 'Fonts', accept: { 'font/ttf': ['.ttf', '.otf', '.ttc', '.woff', '.woff2'] } }] });
    if (!picked) return [];
    const families = [];
    for (const { file } of picked) {
      try { families.push(await importBytes(file.name, await file.arrayBuffer())); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
    }
    await changed();
    if (families.length) Suite.shell.toast(Suite.t('fonts.added', [...new Set(families)].join(', ')));
    return families;
  }
  async function remove(family) {
    const ids = records.filter((r) => r.family === family).map((r) => r.id);
    await tx('readwrite', (s) => { for (const id of ids) s.delete(id); });
    await changed();
  }

  function imported() {
    const map = new Map();
    for (const r of records) { if (!map.has(r.family)) map.set(r.family, []); map.get(r.family).push({ id: r.id, weight: r.weight, style: r.style, file: r.file }); }
    return [...map].map(([family, list]) => ({ family, faces: list })).sort((a, b) => a.family.localeCompare(b.family));
  }
  function families(category = null) {
    const out = [];
    for (const name of present) {
      const cat = BUNDLED[name];
      for (const n of [name, ...(ALIASES[name] || [])]) out.push({ name: n, category: cat, bundled: true });
    }
    for (const f of imported()) if (!out.some((x) => x.name === f.family)) out.push({ name: f.family, category: 'imported', bundled: false });
    return (category ? out.filter((f) => f.category === category || f.category === 'imported') : out).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * @font-face rules for some families (bundled, their aliases, imported) – for documents shown in frames of their own (printing).
   * The rules of the page are copied; imported fonts become data: URLs.
   */
  function cssFor(names) {
    const wanted = new Set(names);
    const out = [];
    for (const rule of bundledRules()) {
      const fam = rule.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '');
      for (const name of [fam, ...(ALIASES[fam] || []), ...Object.keys(METRIC).filter((k) => METRIC[k] === fam)]) {
        if (!wanted.has(name)) continue;
        const src = METRIC[name] ? `local("${name}"), ${rule.style.getPropertyValue('src')}` : rule.style.getPropertyValue('src');
        const prop = (k, d) => rule.style.getPropertyValue(k) || d;
        out.push(`@font-face { font-family: "${name}"; font-style: ${prop('font-style', 'normal')}; font-weight: ${prop('font-weight', '400')}; unicode-range: ${prop('unicode-range', 'U+0-10FFFF')}; src: ${src}; }`);
      }
    }
    for (const r of records) {
      if (wanted.has(r.family)) out.push(`@font-face { font-family: "${r.family.replace(/"/g, '')}"; font-weight: ${r.weight}; font-style: ${r.style}; src: url(data:font/ttf;base64,${toBase64(new Uint8Array(r.bytes))}); }`);
    }
    return out.join('\n');
  }

  // ---- settings export (also workspaces): the imported fonts as base64 in the suite's settings -----------------------------
  if (Suite.preferences) {
    Suite.preferences.register({
      id: 'fonts', app: 'suite', sensitive: false, label: () => Suite.t('fonts.source'), available: () => records.length > 0,
      write(store) { store.app('suite').settings = { ...(store.app('suite').settings || {}), fonts: records.map((r) => ({ family: r.family, weight: r.weight, style: r.style, file: r.file, data: toBase64(new Uint8Array(r.bytes)) })) }; },
      count(store) { const f = (store.app('suite').settings || {}).fonts; return Array.isArray(f) ? f.length : 0; },
      async read(store) {
        let n = 0;
        for (const f of (store.app('suite').settings || {}).fonts || []) {
          try { await importBytes(f.file || `${f.family}.ttf`, Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))); n += 1; } catch (e) { console.warn(e); }
        }
        await changed();
        return n;
      },
    });
  }

  // ---- the section in the settings -----------------------------------------------------------------------------------------
  function Settings() {
    const { html } = Suite.shell;
    const list = imported();
    return html`<fieldset class="suite-fonts" data-testid="fonts">
      <legend>${Suite.t('fonts.title')}</legend>
      <small data-testid="fonts-bundled">${present.length ? Suite.t('fonts.bundled', present.length, present.join(', ')) : Suite.t('fonts.none')}</small>
      <small>${list.length ? Suite.t('fonts.imported') : Suite.t('fonts.noImported')}</small>
      ${list.map((f) => html`<div class="suite-fonts-item" data-testid="font-item"><span style=${`font-family:"${f.family}"`}>${f.family}</span> <small>(${f.faces.length})</small>
        <button type="button" class="secondary outline" data-testid="font-remove" title=${Suite.t('fonts.remove', f.family)} aria-label=${Suite.t('fonts.remove', f.family)}
          onClick=${async () => { if (await Suite.shell.confirm(Suite.t('fonts.removeAsk', f.family))) { await remove(f.family); Suite.shell.refresh(); } }}>×</button></div>`)}
      <button type="button" class="secondary outline" data-testid="fonts-import" title=${Suite.t('fonts.hint')}
        onClick=${() => importFiles().then(() => Suite.shell.refresh()).catch((e) => Suite.shell.toast(Suite.i18n.describe(e), 'error'))}>${Suite.t('fonts.import')}</button>
    </fieldset>`;
  }

  setUpBundled();
  const ready = load();
  Suite.fonts = { BUNDLED, METRIC, cssFor, families, imported, importFiles, importBytes, remove, ready, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, Settings, describe };
})(window.Suite = window.Suite || {});
