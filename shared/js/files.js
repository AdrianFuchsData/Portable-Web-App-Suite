/*
 * Opening and saving local files for all apps.
 *
 * Chromium on the desktop has the File System Access API: files are opened with a handle and "Save" writes
 * back to the same file. Elsewhere (Firefox, Android) files are opened with a file input and saved as a
 * download; the user has to replace the original file with the downloaded one (AGENTS.md), so save() reports
 * how it saved and the app shows the hint (Suite.t('files.downloaded', name)).
 *
 *   const picked = await Suite.files.open({ types: [{ description: 'Text', accept: { 'text/plain': ['.txt'] } }] });
 *   // -> [{ file, handle }] (handle null without File System Access API) or null if cancelled
 *   const doc = { name: picked[0].file.name, handle: picked[0].handle };
 *   const result = await Suite.files.save(doc, data);        // -> { mode: 'written' | 'downloaded', name }
 *   const copy = await Suite.files.saveAs(data, { suggestedName: 'x.txt', types });   // -> { mode, name, handle } or null
 *   Suite.files.dropZone(element, (picked) => ...);           // drag & drop with handles where possible
 *   await Suite.files.remember('texteditor', handle); await Suite.files.recent('texteditor');  // recent files
 *   await Suite.files.forget('texteditor');                                                   // clear the list
 */
(function (Suite) {
  'use strict';

  const canWriteBack = typeof window.showOpenFilePicker === 'function' && window.isSecureContext;

  Suite.i18n.register({
    en: {
      'files.downloaded': 'Downloaded as “{0}”. Replace the original file with the downloaded one, otherwise your changes are lost.',
      'files.written': 'Saved to “{0}”.',
      'files.permission': 'Permission to write to “{0}” was denied.',
      'files.dropHere': 'Drop files here',
      'files.writeBack': 'Changes are saved directly to the opened file.',
      'files.noWriteBack': 'This browser cannot write to opened files: saving creates a download.',
    },
    de: {
      'files.downloaded': 'Als „{0}“ heruntergeladen. Ersetzen Sie die ursprüngliche Datei durch die heruntergeladene, sonst gehen Ihre Änderungen verloren.',
      'files.written': 'In „{0}“ gespeichert.',
      'files.permission': 'Die Berechtigung, in „{0}“ zu schreiben, wurde verweigert.',
      'files.dropHere': 'Dateien hier ablegen',
      'files.writeBack': 'Änderungen werden direkt in die geöffnete Datei gespeichert.',
      'files.noWriteBack': 'Dieser Browser kann nicht in geöffnete Dateien schreiben: Speichern erzeugt einen Download.',
    },
  });

  /** Accept string for <input type="file"> from File System Access API picker types. */
  function acceptOf(types = []) {
    return types.flatMap((t) => Object.entries(t.accept || {}).flatMap(([mime, exts]) => [mime, ...exts])).join(',');
  }

  /** File picker with an <input type="file"> (fallback). Resolves to [File] or null. */
  function inputPicker({ types, multiple }) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = acceptOf(types);
      input.multiple = !!multiple;
      input.style.display = 'none';
      input.addEventListener('change', () => { resolve(input.files.length ? [...input.files] : null); input.remove(); });
      input.addEventListener('cancel', () => { resolve(null); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  }

  /** Let the user pick files. Resolves to [{ file, handle }] or null if cancelled. */
  async function open({ types = [], multiple = false } = {}) {
    if (canWriteBack) {
      try {
        const handles = await window.showOpenFilePicker({ types, multiple, excludeAcceptAllOption: false });
        return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
      }
    }
    const files = await inputPicker({ types, multiple });
    return files && files.map((file) => ({ file, handle: null }));
  }

  /**
   * Files from a drop event. File system handles must be requested synchronously in the drop handler, so call
   * this directly from the handler and await the result afterwards. Resolves to [{ file, handle|null }].
   */
  function fromDrop(dataTransfer) {
    const items = [...(dataTransfer.items || [])].filter((i) => i.kind === 'file');
    if (canWriteBack && items.length && typeof items[0].getAsFileSystemHandle === 'function') {
      const pending = items.map((item) => ({ file: item.getAsFile(), handle: item.getAsFileSystemHandle() }));
      return Promise.all(pending.map(async ({ file, handle }) => {
        let h = null;
        try { h = await handle; } catch (e) { /* read-only */ }
        return { file, handle: h && h.kind === 'file' ? h : null };
      }));
    }
    return Promise.resolve([...(dataTransfer.files || [])].map((file) => ({ file, handle: null })));
  }

  /** Make an element accept dropped files; onFiles([{ file, handle }]). Returns a function that removes it. */
  function dropZone(element, onFiles) {
    let depth = 0;
    const enter = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); depth++; element.classList.add('suite-drop-active'); } };
    const over = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) element.classList.remove('suite-drop-active'); };
    const drop = (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      depth = 0;
      element.classList.remove('suite-drop-active');
      fromDrop(e.dataTransfer).then(onFiles);
    };
    element.addEventListener('dragenter', enter);
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragenter', enter);
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }

  /** Write data (string, Blob, ArrayBuffer, typed array) to a file handle; the original is replaced atomically. */
  async function writeToHandle(handle, data) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) !== 'granted' && (await handle.requestPermission(opts)) !== 'granted') {
      throw new Suite.LocalizedError('files.permission', handle.name);
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (e) {
      try { await writable.abort(); } catch (ignored) { /* nothing to clean up */ }
      throw e;
    }
  }

  /** Offer data as a download. */
  function download(data, filename, type = 'application/octet-stream') {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /**
   * Save an opened document ({ name, handle }): written back if there is a handle, otherwise downloaded.
   * Resolves to { mode: 'written' | 'downloaded', name, message } (message: localized hint for the user).
   */
  async function save(doc, data, { type } = {}) {
    if (doc.handle && (canWriteBack || doc.handle.bridged)) { // bridged: opened from another app (bridge.js)
      await writeToHandle(doc.handle, data);
      return { mode: 'written', name: doc.handle.name, message: Suite.t('files.written', doc.handle.name) };
    }
    download(data, doc.name, type);
    return { mode: 'downloaded', name: doc.name, message: Suite.t('files.downloaded', doc.name) };
  }

  /** Save under a new name: save dialog where available, otherwise a download. Resolves to null if cancelled. */
  async function saveAs(data, { suggestedName, types = [], type } = {}) {
    if (typeof window.showSaveFilePicker === 'function' && window.isSecureContext) {
      let handle;
      try {
        handle = await window.showSaveFilePicker({ suggestedName, types });
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
      }
      await writeToHandle(handle, data);
      return { mode: 'written', name: handle.name, handle, message: Suite.t('files.written', handle.name) };
    }
    download(data, suggestedName, type);
    return { mode: 'downloaded', name: suggestedName, handle: null, message: Suite.t('files.downloaded', suggestedName) };
  }

  // ---- recently used files (file handles in IndexedDB, Chromium only) ---------------------------

  const DB_NAME = 'suite-recent-files';
  const MAX_RECENT = 10;

  function database() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('recent');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function transaction(mode, fn) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recent', mode);
      const result = fn(tx.objectStore('recent'));
      tx.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : undefined); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  /** Recently used file handles of an app, newest first: [{ name, handle, time }]. */
  async function recent(app) {
    if (!canWriteBack) return [];
    try { return (await transaction('readonly', (s) => s.get(app))) || []; } catch (e) { return []; }
  }

  /** Remember a file handle as recently used by an app. */
  // list changes run one after the other (a "clear" right after opening must not be overwritten by the opening's update)
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

  function remember(app, handle) {
    if (!canWriteBack || !handle || handle.bridged) return Promise.resolve();
    return serial(() => rememberNow(app, handle));
  }

  async function rememberNow(app, handle) {
    const list = await recent(app);
    const kept = [];
    for (const item of list) if (!(await item.handle.isSameEntry(handle))) kept.push(item);
    const updated = [{ name: handle.name, handle, time: Date.now() }, ...kept].slice(0, MAX_RECENT);
    try { await transaction('readwrite', (s) => s.put(updated, app)); } catch (e) { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent('suite-recent', { detail: app })); // lists shown by the app update themselves
  }

  /** Forget the recently used files of an app (or one handle of it). */
  function forget(app, handle = null) { return serial(() => forgetNow(app, handle)); }

  async function forgetNow(app, handle) {
    const list = handle ? (await recent(app)).filter((item) => item.handle !== handle) : [];
    try { await transaction('readwrite', (s) => s.put(list, app)); } catch (e) { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent('suite-recent', { detail: app }));
  }

  /** Open a remembered handle again (asks for permission). Resolves to { file, handle } or null. */
  async function reopen(handle) {
    const opts = { mode: 'read' };
    if ((await handle.queryPermission(opts)) !== 'granted' && (await handle.requestPermission(opts)) !== 'granted') return null;
    return { file: await handle.getFile(), handle };
  }

  Suite.files = { canWriteBack, open, fromDrop, dropZone, writeToHandle, download, save, saveAs, recent, remember, forget, reopen };
})(window.Suite = window.Suite || {});
