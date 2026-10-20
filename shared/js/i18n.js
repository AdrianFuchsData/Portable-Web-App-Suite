/*
 * Internationalization for all apps (English and German).
 *
 *   Suite.i18n.register({ en: {'app.title': 'Text editor'}, de: {'app.title': 'Texteditor'} });
 *   Suite.t('app.title');  Suite.t('files.saved', name);   // {0}, {1}, ... are replaced by the arguments
 *   Suite.i18n.setLanguage('de');  Suite.i18n.onChange(render);
 *   throw new Suite.LocalizedError('err.unknown', message);  // shown in the current language
 *
 * The language is detected from the browser and remembered in localStorage (a UI preference only).
 */
(function (Suite) {
  'use strict';

  const STORAGE_KEY = 'suite.lang';
  const LANGUAGES = ['en', 'de'];
  const strings = { en: {}, de: {} };
  const listeners = new Set();

  function detectLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (LANGUAGES.includes(stored)) return stored;
    } catch (e) { /* storage blocked */ }
    const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
    return nav.startsWith('de') ? 'de' : 'en';
  }

  let language = detectLanguage();
  document.documentElement.lang = language;

  /** Add strings: { en: {...}, de: {...} }. Later registrations override earlier ones. */
  function register(table) {
    for (const lang of LANGUAGES) Object.assign(strings[lang], table[lang] || {});
  }

  function t(key, ...args) {
    const s = strings[language][key] ?? strings.en[key] ?? key;
    return s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? String(args[i]) : m));
  }

  function setLanguage(lang) {
    if (!LANGUAGES.includes(lang) || lang === language) return;
    language = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage blocked */ }
    for (const fn of listeners) fn(lang);
  }

  /** Call fn(language) whenever the language changes; returns a function that removes the listener. */
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Error carrying an i18n key, so that it can be shown in the current language. */
  class LocalizedError extends Error {
    constructor(key, ...args) {
      super(t(key, ...args));
      this.key = key;
      this.args = args;
    }

    localized() { return t(this.key, ...this.args); }
  }

  /** Message of any error in the current language. */
  function describe(e) {
    if (e instanceof LocalizedError) return e.localized();
    return t('err.unknown', (e && e.message) || String(e));
  }

  // strings used by the shared modules
  register({
    en: {
      'lang.name': 'English', 'lang.switch': 'Deutsch',
      'err.unknown': 'Error: {0}',
      'common.ok': 'OK', 'common.cancel': 'Cancel', 'common.close': 'Close', 'common.save': 'Save',
      'common.open': 'Open', 'common.new': 'New', 'common.delete': 'Delete', 'common.yes': 'Yes', 'common.no': 'No',
      'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.auto': 'Automatic',
      'shell.menu': 'Menu', 'shell.language': 'Language', 'shell.theme': 'Theme', 'shell.about': 'About',
      'shell.offline': 'Runs completely offline in your browser.',
      'shell.licence': 'Licence', 'shell.licensedUnder': 'Licensed under the {0}', 'shell.source': 'Source code', 'shell.notice': 'Licence notice (modified versions, no warranty)',
      'shell.licenceText': 'Licence text ({0})', 'shell.components': 'Third-party components ({0})', 'shell.noLicenceText': 'No licence text required (public domain).',
      'shell.modifiedVersion': 'Modified version', 'shell.modifiedShort': 'modified version',
      'shell.unsaved': 'You have unsaved changes.',
      'shell.shortcuts': 'Keyboard shortcuts (F1)', 'shell.recent': 'Recent', 'shell.noRecent': 'No recently used files', 'shell.clearRecent': 'Clear list',
      'shell.reopenFailed': 'The file could not be opened again (moved, deleted or no permission).',
    },
    de: {
      'lang.name': 'Deutsch', 'lang.switch': 'English',
      'err.unknown': 'Fehler: {0}',
      'common.ok': 'OK', 'common.cancel': 'Abbrechen', 'common.close': 'Schließen', 'common.save': 'Speichern',
      'common.open': 'Öffnen', 'common.new': 'Neu', 'common.delete': 'Löschen', 'common.yes': 'Ja', 'common.no': 'Nein',
      'theme.light': 'Hell', 'theme.dark': 'Dunkel', 'theme.auto': 'Automatisch',
      'shell.menu': 'Menü', 'shell.language': 'Sprache', 'shell.theme': 'Design', 'shell.about': 'Über',
      'shell.licence': 'Lizenz', 'shell.licensedUnder': 'Lizenziert unter der {0}', 'shell.source': 'Quellcode', 'shell.notice': 'Lizenzhinweis (geänderte Fassungen, keine Gewährleistung)',
      'shell.licenceText': 'Lizenztext ({0})', 'shell.components': 'Komponenten Dritter ({0})', 'shell.noLicenceText': 'Kein Lizenztext erforderlich (gemeinfrei).',
      'shell.modifiedVersion': 'Geänderte Fassung', 'shell.modifiedShort': 'geänderte Fassung',
      'shell.offline': 'Läuft vollständig offline in Ihrem Browser.',
      'shell.unsaved': 'Sie haben ungespeicherte Änderungen.',
      'shell.shortcuts': 'Tastenkürzel (F1)', 'shell.recent': 'Zuletzt', 'shell.noRecent': 'Keine zuletzt verwendeten Dateien', 'shell.clearRecent': 'Liste leeren',
      'shell.reopenFailed': 'Die Datei konnte nicht erneut geöffnet werden (verschoben, gelöscht oder keine Berechtigung).',
    },
  });

  Suite.i18n = { register, setLanguage, onChange, describe, languages: LANGUAGES, get language() { return language; } };
  Suite.t = t;
  Suite.LocalizedError = LocalizedError;
})(window.Suite = window.Suite || {});
