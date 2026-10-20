/*
 * Automatic recovery copies of unsaved work (IndexedDB "suite-autosave", one copy per app).
 *
 *   Suite.autosave.register({
 *     app: 'diagram',
 *     save: async () => ({ name: 'plan.drawio', doc: {...} }),   // any structured-cloneable value (also Blobs, file handles)
 *     restore: async (snapshot) => { ... },                       // put it back
 *   });
 *
 * While the shell's dirty flag is set (Suite.shell.setDirty), a copy is stored every few seconds after changes and
 * when the page is hidden; setDirty(false) (saved, discarded) deletes it. When the app starts and a copy exists, a banner
 * offers to restore or discard it. Copies larger than MAX_BYTES (estimated) are not stored.
 */
(function (Suite) {
  'use strict';

  const DB = 'suite-autosave';
  const MAX_BYTES = 64 * 1024 * 1024;
  let interval = 15000;
  try { interval = Number(localStorage.getItem('suite.autosave.interval')) || interval; } catch (e) { /* storage blocked */ }

  Suite.i18n.register({
    en: {
      'autosave.found': 'Unsaved work of “{0}” from {1} was recovered.', 'autosave.restore': 'Restore', 'autosave.discard': 'Discard',
      'autosave.restored': 'The recovered copy was restored. Save it to keep it.', 'autosave.failed': 'The recovered copy could not be restored: {0}',
    },
    de: {
      'autosave.found': 'Ungespeicherte Arbeit an „{0}“ vom {1} wurde gefunden.', 'autosave.restore': 'Wiederherstellen', 'autosave.discard': 'Verwerfen',
      'autosave.restored': 'Die gefundene Kopie wurde wiederhergestellt. Speichern Sie sie, um sie zu behalten.', 'autosave.failed': 'Die gefundene Kopie konnte nicht wiederhergestellt werden: {0}',
    },
  });

  function database() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('copies');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function run(mode, fn) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('copies', mode);
      const req = fn(tx.objectStore('copies'));
      tx.oncomplete = () => { db.close(); resolve(req && 'result' in req ? req.result : undefined); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  /** Rough size of a snapshot in bytes (typed arrays and Blobs counted exactly). */
  function sizeOf(value, seen = new Set()) {
    if (value == null) return 0;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value !== 'object') return 8;
    if (seen.has(value)) return 0;
    seen.add(value);
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
    let n = 0;
    for (const k of Object.keys(value)) n += sizeOf(value[k], seen);
    return n;
  }

  let provider = null;
  let dirty = false;
  let timer = null;
  let saving = false;
  let pending = false;
  let offered = false; // a found copy waits for the user's decision: keep it until then

  async function store() {
    if (!provider || !dirty) return;
    if (saving) { pending = true; return; }
    saving = true;
    try {
      const snapshot = await provider.save();
      if (snapshot != null && dirty && sizeOf(snapshot) <= MAX_BYTES) {
        await run('readwrite', (s) => s.put({ time: Date.now(), name: snapshot.name || '', snapshot }, provider.app));
        document.body.dataset.autosaved = String(Date.now()); // for tests
      }
    } catch (e) { console.warn('autosave', e); } finally {
      saving = false;
      if (pending) { pending = false; schedule(); }
    }
  }

  function schedule() {
    if (timer || !provider) return;
    timer = setTimeout(() => { timer = null; store(); }, interval);
  }

  async function clear() {
    if (!provider || offered) return;
    try { await run('readwrite', (s) => s.delete(provider.app)); } catch (e) { /* storage blocked */ }
    document.body.dataset.autosaved = '';
  }

  /** Called by the shell whenever the dirty flag is set (also on every change in most apps). */
  function dirtyChanged(value) {
    dirty = value;
    if (!provider) return;
    if (dirty) schedule(); else { clearTimeout(timer); timer = null; clear(); }
  }

  /** Offer a stored copy (if any) and start saving copies of this app. */
  async function register(options) {
    provider = { ...options };
    let found = null;
    try { found = await run('readonly', (s) => s.get(provider.app)); } catch (e) { found = null; }
    if (dirty) schedule();
    if (!found) return;
    offered = true;
    const when = new Date(found.time).toLocaleString(Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    Suite.shell.banner(Suite.t('autosave.found', found.name || Suite.t('app.title'), when), [
      { label: Suite.t('autosave.restore'), testid: 'autosave-restore', run: async () => {
        try {
          await provider.restore(found.snapshot); // may load with "not dirty" first: the copy stays (offered)
          offered = false;
          Suite.shell.setDirty(true); // keep a copy until it is saved
          clearTimeout(timer); timer = null;
          await store();
          Suite.shell.toast(Suite.t('autosave.restored'));
        } catch (e) { offered = false; console.warn(e); Suite.shell.toast(Suite.t('autosave.failed', e.message || e), 'error'); }
      } },
      { label: Suite.t('autosave.discard'), testid: 'autosave-discard', run: () => { offered = false; clear(); } },
    ]);
  }

  // store when the page is hidden (tab switched, window closed, phone locked)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) { clearTimeout(timer); timer = null; store(); } });

  Suite.autosave = { register, dirtyChanged, saveNow: store, clear };
})(window.Suite = window.Suite || {});
