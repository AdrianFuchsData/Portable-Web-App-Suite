/*
 * Spell checking of the suite: Hunspell (hunspell-asm, WebAssembly) with the built-in English (US) and German (Germany)
 * dictionaries, dictionaries loaded by the user and a personal word list. ES module.
 *
 *   import { spell, words } from 'app/spell';
 *   spell.available                       // the page embeds the dictionaries (#dict-<name>-aff/-dic)
 *   spell.enabled / spell.setEnabled(on)  // checking of text fields and editors (suite-wide setting)
 *   spell.language / spell.setLanguage()  // 'en_US', 'de_DE' or the name of a loaded dictionary
 *   await spell.ready()                   // the checker of the current language is loaded
 *   spell.isWrong(word)  spell.suggest(word)  spell.add(word)  spell.ignore(word)
 *   spell.onChange(fn) -> unsubscribe     // settings, dictionaries, words or the loaded checker changed
 *   spell.languages()                     // [{ name, label, builtIn }]
 *   await spell.load(files) / spell.remove(name)   // files: [{ name, bytes }] (.aff + .dic or .oxt)
 *
 * Settings in localStorage: suite.spell.enabled ("1"), suite.spell.language, suite.spell.words (JSON list of personal words,
 * for all languages). Loaded dictionaries are kept in IndexedDB "suite-dictionaries" (converted to UTF-8).
 * Words with digits, all-caps words (abbreviations), single letters and web or mail addresses are not checked.
 */
import { loadModule } from 'hunspell-asm';
import { unzipSync } from 'fflate';

const BUILT_IN = { en_US: 'spell.en_US', de_DE: 'spell.de_DE' };
const KEYS = { enabled: 'suite.spell.enabled', language: 'suite.spell.language', words: 'suite.spell.words' };
const DB = 'suite-dictionaries';

Suite.i18n.register({
  en: { 'spell.en_US': 'English (US)', 'spell.de_DE': 'German (Germany)' },
  de: { 'spell.en_US': 'Englisch (USA)', 'spell.de_DE': 'Deutsch (Deutschland)' },
});

// ---- words ---------------------------------------------------------------------------------------------------------

const CHUNK = /[\p{L}\p{M}\p{N}'’_@.\/:\-]+/gu;
const PART = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** The words of a text that should be checked: [{ word, start }]. */
export function words(text) {
  const out = [];
  for (const chunk of text.matchAll(CHUNK)) {
    const s = chunk[0];
    if (/[\p{N}_@\/]|:\/\/|^www\./u.test(s)) continue; // numbers, code, addresses
    for (const m of s.matchAll(PART)) {
      const word = m[0];
      if ([...word].length < 2 || (word === word.toUpperCase() && word !== word.toLowerCase())) continue;
      out.push({ word, start: chunk.index + m.index });
    }
  }
  return out;
}

/** The word at an offset of a text: { word, start } or null. */
export function wordAt(text, offset) {
  for (const w of words(text)) if (offset >= w.start && offset <= w.start + w.word.length) return w;
  return null;
}

// ---- dictionaries ---------------------------------------------------------------------------------------------------

const ENCODINGS = { 'iso8859-1': 'iso-8859-1', 'iso8859-15': 'iso-8859-15', 'iso8859-2': 'iso-8859-2', 'microsoft-cp1251': 'windows-1251', 'koi8-r': 'koi8-r', 'utf-8': 'utf-8' };

/** Decode an .aff/.dic pair (bytes) in the character set of the SET line of the .aff file. */
export function decodePair(affBytes, dicBytes) {
  const head = new TextDecoder('iso-8859-1').decode(affBytes.subarray(0, 4096));
  const set = ((head.match(/^SET\s+(\S+)/m) || [])[1] || 'UTF-8').toLowerCase();
  const decoder = new TextDecoder(ENCODINGS[set] || set.replace(/^iso(\d)/, 'iso-$1'));
  return { aff: decoder.decode(affBytes), dic: decoder.decode(dicBytes) };
}

/** A dictionary as UTF-8 bytes (Hunspell then takes and returns UTF-8 words, whatever the original character set). */
function utf8Pair(aff, dic) {
  if (typeof aff !== 'string') ({ aff, dic } = decodePair(aff, dic));
  const affText = /^SET\s+\S+/m.test(aff) ? aff.replace(/^SET\s+\S+/m, 'SET UTF-8') : `SET UTF-8\n${aff}`;
  const enc = new TextEncoder();
  return { aff: enc.encode(affText), dic: enc.encode(dic) };
}

const stem = (path) => path.split('/').pop().replace(/\.[^.]+$/, '');

/** Dictionaries from chosen files ({ name, bytes }): .aff and .dic files of the same name, or .oxt extensions. */
export function readDictionaries(files) {
  const affs = new Map(), dics = new Map();
  const add = (path, bytes) => {
    if (/\.aff$/i.test(path)) affs.set(stem(path), bytes);
    else if (/\.dic$/i.test(path)) dics.set(stem(path), bytes);
  };
  for (const { name, bytes } of files) {
    if (/\.(oxt|zip)$/i.test(name)) {
      const entries = unzipSync(bytes, { filter: (f) => /\.(aff|dic)$/i.test(f.name) && !/^(hyph_|th_)/i.test(f.name.split('/').pop()) });
      for (const [path, data] of Object.entries(entries)) add(path, data);
    } else add(name, bytes);
  }
  const out = [];
  for (const [name, aff] of affs) if (dics.has(name)) out.push({ name, ...utf8Pair(aff, dics.get(name)) });
  return out;
}

let factory = null;

/** A Hunspell checker: { correct(word), suggest(word), add(word) }. aff/dic: bytes or decoded strings. */
export async function createChecker({ aff, dic }, personal = []) {
  if (!factory) factory = loadModule({ timeout: 30000 });
  const f = await factory;
  const pair = utf8Pair(aff, dic);
  const id = `d${Math.random().toString(36).slice(2, 10)}`;
  const affPath = f.mountBuffer(pair.aff, `${id}.aff`);
  const dicPath = f.mountBuffer(pair.dic, `${id}.dic`);
  const hunspell = f.create(affPath, dicPath);
  f.unmount(affPath); // Hunspell has read both files
  f.unmount(dicPath);
  for (const w of personal) hunspell.addWord(w);
  const cache = new Map();
  const plain = (w) => w.replace(/’/g, "'");
  return {
    correct(word) {
      let ok = cache.get(word);
      if (ok === undefined) {
        ok = hunspell.spell(plain(word));
        cache.set(word, ok);
      }
      return ok;
    },
    suggest: (word) => hunspell.suggest(plain(word)),
    add(word) { hunspell.addWord(plain(word)); cache.set(word, true); },
    dispose() { hunspell.dispose(); },
  };
}

// ---- stored dictionaries ------------------------------------------------------------------------------------------------

function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('dictionaries');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function stored(mode, fn) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dictionaries', mode);
    const req = fn(tx.objectStore('dictionaries'));
    tx.oncomplete = () => { db.close(); resolve(req && 'result' in req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const read = (key, fallback = null) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } };

// ---- service ------------------------------------------------------------------------------------------------------------

function createService() {
  const listeners = new Set();
  const checkers = new Map(); // name -> Promise<checker>
  const ignored = new Set();
  let loaded = null; // { name, checker } of the current language, once ready
  let userNames = [];
  const emit = () => { for (const fn of [...listeners]) { try { fn(); } catch (e) { console.warn(e); } } };

  const personal = () => { try { return JSON.parse(read(KEYS.words, '[]')); } catch (e) { return []; } };
  const embedded = (name) => document.getElementById(`dict-${name}-aff`) && document.getElementById(`dict-${name}-dic`);

  async function source(name) {
    if (BUILT_IN[name]) {
      const [aff, dic] = await Promise.all([Suite.embed.bytes(`dict-${name}-aff`), Suite.embed.bytes(`dict-${name}-dic`)]);
      return { aff: new Uint8Array(aff), dic: new Uint8Array(dic) };
    }
    const d = await stored('readonly', (s) => s.get(name));
    if (!d) throw new Error(`dictionary ${name} not found`);
    return d;
  }

  function checkerFor(name) {
    if (!checkers.has(name)) {
      const p = source(name).then((src) => createChecker(src, personal()));
      p.catch(() => checkers.delete(name));
      checkers.set(name, p);
    }
    return checkers.get(name);
  }

  const service = {
    get available() { return !!embedded('en_US'); },
    get enabled() { return read(KEYS.enabled) === '1'; },
    setEnabled(on) { write(KEYS.enabled, on ? '1' : '0'); emit(); if (on) service.ready().catch(() => {}); },
    get language() {
      const lang = read(KEYS.language);
      if (lang && (BUILT_IN[lang] || userNames.includes(lang))) return lang;
      return Suite.i18n.language === 'de' ? 'de_DE' : 'en_US';
    },
    setLanguage(name) { write(KEYS.language, name); loaded = null; ignored.clear(); emit(); service.ready().catch(() => {}); },
    languages() {
      return [...Object.keys(BUILT_IN).filter(embedded).map((name) => ({ name, label: Suite.t(BUILT_IN[name]), builtIn: true })),
        ...userNames.filter((n) => !BUILT_IN[n]).map((name) => ({ name, label: name, builtIn: false }))];
    },
    /** Load the checker of the current language (resolves to it). */
    async ready() {
      const name = service.language;
      const checker = await checkerFor(name);
      if (service.language === name && (!loaded || loaded.name !== name)) { loaded = { name, checker }; emit(); }
      return checker;
    },
    get isReady() { return !!loaded && loaded.name === service.language; },
    /** Is the word unknown? (false while the checker is loading) */
    isWrong(word) { return !!loaded && loaded.name === service.language && !ignored.has(word) && !loaded.checker.correct(word); },
    // (Hunspell also offers compound parts such as "-rum")
    suggest(word) { return loaded ? loaded.checker.suggest(word).filter((s) => !/^-|-$/.test(s)).slice(0, 8) : []; },
    add(word) {
      write(KEYS.words, JSON.stringify([...new Set([...personal(), word])].sort()));
      for (const p of checkers.values()) p.then((c) => c.add(word), () => {});
      emit();
    },
    ignore(word) { ignored.add(word); emit(); },
    /** Words of a text that are unknown: [{ word, start }]. */
    errors(text) { return loaded ? words(text).filter((w) => service.isWrong(w.word)) : []; },
    async load(files) {
      const found = readDictionaries(files);
      for (const d of found) {
        try { await stored('readwrite', (s) => s.put({ aff: d.aff, dic: d.dic }, d.name)); } catch (e) { /* storage blocked: for this session */ }
        checkers.set(d.name, createChecker(d, personal()));
      }
      userNames = [...new Set([...userNames, ...found.map((d) => d.name)])];
      if (found.length) service.setLanguage(found[0].name);
      return found.map((d) => d.name);
    },
    async remove(name) {
      if (BUILT_IN[name]) return;
      try { await stored('readwrite', (s) => s.delete(name)); } catch (e) { /* storage blocked */ }
      checkers.delete(name);
      userNames = userNames.filter((n) => n !== name);
      if (read(KEYS.language) === name) write(KEYS.language, '');
      loaded = null;
      emit();
      service.ready().catch(() => {});
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  // dictionaries loaded earlier; settings changed in another tab
  stored('readonly', (s) => s.getAllKeys()).then((keys) => { userNames = [...new Set([...keys.map(String), ...userNames])]; emit(); if (service.enabled) service.ready().catch(() => {}); }, () => {});
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.words) { checkers.clear(); loaded = null; service.ready().catch(() => {}); }
    if (Object.values(KEYS).includes(e.key)) emit();
  });
  Suite.i18n.onChange(() => { if (!read(KEYS.language)) { loaded = null; emit(); if (service.enabled) service.ready().catch(() => {}); } });
  return service;
}

export const spell = createService();
