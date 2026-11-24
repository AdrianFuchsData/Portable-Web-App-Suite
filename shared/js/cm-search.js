/*
 * Search and replace in the CodeMirror editors of the suite (text editor, notebook, database tool, HTTP tool) in the suite's
 * layout instead of CodeMirror's own panel: a search field with match case, regular expression and whole word, previous/next,
 * select all, the number of matches, and (in editable documents) a replace field with replace and replace all. CodeMirror's
 * search keys stay (Ctrl+F, F3/Shift+F3, Ctrl+G, Escape); in the fields Enter goes to the next match, Shift+Enter to the
 * previous one, Alt+Enter selects all matches; in the replace field Enter replaces, Ctrl+Alt+Enter replaces all.
 *
 *   import { suiteSearch } from 'app/cm-search';
 *   extensions: [basicSetup, suiteSearch()]
 */
import { search, SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, replaceNext, replaceAll, selectMatches, closeSearchPanel } from '@codemirror/search';

const S = window.Suite;
S.i18n.register({
  en: {
    'cms.find': 'Find', 'cms.replace': 'Replace', 'cms.replaceAll': 'Replace all', 'cms.previous': 'Previous match (Shift+Enter)', 'cms.next': 'Next match (Enter)',
    'cms.all': 'Select all matches (Alt+Enter)', 'cms.case': 'Match case', 'cms.regex': 'Regular expression', 'cms.word': 'Whole word', 'cms.close': 'Close (Escape)',
    'cms.count': '{0} of {1}', 'cms.countMany': '{0} matches', 'cms.none': 'No matches', 'cms.bad': 'Invalid expression', 'cms.toggleReplace': 'Show or hide replacing',
  },
  de: {
    'cms.find': 'Suchen', 'cms.replace': 'Ersetzen', 'cms.replaceAll': 'Alle ersetzen', 'cms.previous': 'Vorheriger Treffer (Umschalt+Eingabe)', 'cms.next': 'Nächster Treffer (Eingabe)',
    'cms.all': 'Alle Treffer auswählen (Alt+Eingabe)', 'cms.case': 'Groß-/Kleinschreibung beachten', 'cms.regex': 'Regulärer Ausdruck', 'cms.word': 'Ganzes Wort', 'cms.close': 'Schließen (Escape)',
    'cms.count': '{0} von {1}', 'cms.countMany': '{0} Treffer', 'cms.none': 'Keine Treffer', 'cms.bad': 'Ungültiger Ausdruck', 'cms.toggleReplace': 'Ersetzen ein- oder ausblenden',
  },
});

const MAX_COUNT = 10000;
const t = (key, ...args) => S.t(key, ...args);
/** An icon of the suite (shared/js/icons.js) or the text when there is none. */
const icon = (name, text) => (S.icons && S.icons.has(name) ? S.icons.svg(name) : text);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

class SuitePanel {
  constructor(view) {
    this.view = view;
    this.query = getSearchQuery(view.state);
    this.showReplace = !!this.query.replace;
    const button = (testid, label, content, onclick, extra = {}) => el('button', { type: 'button', class: 'secondary outline', 'data-testid': testid, title: label, 'aria-label': label, html: content, onclick, ...extra });
    const toggle = (testid, label, text, iconName, key) => {
      const b = button(testid, label, icon(iconName, text), () => { this[key] = !this[key]; b.setAttribute('aria-pressed', String(this[key])); b.classList.toggle('outline', !this[key]); this.commit(); }, { 'aria-pressed': 'false' });
      return b;
    };
    this.caseSensitive = this.query.caseSensitive;
    this.regexp = this.query.regexp;
    this.wholeWord = this.query.wholeWord;
    this.searchField = el('input', { type: 'text', 'main-field': 'true', 'data-testid': 'search-field', placeholder: t('cms.find'), 'aria-label': t('cms.find'), spellcheck: 'false', autocomplete: 'off', 'data-no-symbols': true,
      oninput: () => this.commit(), onkeydown: (e) => this.keys(e, false) });
    this.searchField.value = this.query.search;
    this.replaceField = el('input', { type: 'text', 'data-testid': 'replace-field', placeholder: t('cms.replace'), 'aria-label': t('cms.replace'), spellcheck: 'false', autocomplete: 'off', 'data-no-symbols': true,
      oninput: () => this.commit(), onkeydown: (e) => this.keys(e, true) });
    this.replaceField.value = this.query.replace;
    this.caseButton = toggle('search-case', t('cms.case'), 'Aa', 'case-sensitive', 'caseSensitive');
    this.regexButton = toggle('search-regex', t('cms.regex'), '.*', 'regex', 'regexp');
    this.wordButton = toggle('search-word', t('cms.word'), 'ab', 'whole-word', 'wholeWord');
    for (const [b, on] of [[this.caseButton, this.caseSensitive], [this.regexButton, this.regexp], [this.wordButton, this.wholeWord]]) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('outline', !on); }
    this.count = el('span', { class: 'suite-cm-search-count', 'data-testid': 'search-count', 'aria-live': 'polite' });
    this.expand = button('search-toggle-replace', t('cms.toggleReplace'), icon('chevron-right', '›'), () => { this.showReplace = !this.showReplace; this.layout(); if (this.showReplace) this.replaceField.focus(); });
    const findRow = el('div', { class: 'suite-cm-search-row' }, [
      this.expand, this.searchField, this.caseButton, this.wordButton, this.regexButton,
      button('search-prev', t('cms.previous'), icon('arrow-up', '↑'), () => findPrevious(this.view)),
      button('search-next', t('cms.next'), icon('arrow-down', '↓'), () => findNext(this.view)),
      button('search-all', t('cms.all'), icon('text-select', '⋯'), () => selectMatches(this.view)),
      this.count,
      button('search-close', t('cms.close'), icon('x', '×'), () => closeSearchPanel(this.view)),
    ]);
    this.replaceRow = el('div', { class: 'suite-cm-search-row suite-cm-replace-row' }, [
      el('span', { class: 'suite-cm-search-spacer' }), this.replaceField,
      el('button', { type: 'button', class: 'secondary', 'data-testid': 'replace-next', onclick: () => replaceNext(this.view) }, [t('cms.replace')]),
      el('button', { type: 'button', class: 'secondary', 'data-testid': 'replace-all', onclick: () => replaceAll(this.view) }, [t('cms.replaceAll')]),
    ]);
    this.dom = el('div', { class: 'suite-cm-search pico', 'data-testid': 'search-panel', 'aria-label': t('cms.find') }, [findRow, this.replaceRow]);
    this.dom.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(this.view); this.view.focus(); } });
    this.layout();
    this.updateCount();
  }

  layout() {
    const editable = !this.view.state.readOnly;
    this.expand.hidden = !editable;
    this.expand.innerHTML = this.showReplace ? icon('chevron-down', '⌄') : icon('chevron-right', '›');
    this.expand.setAttribute('aria-expanded', String(this.showReplace));
    this.replaceRow.hidden = !(editable && this.showReplace);
  }

  keys(e, inReplace) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (inReplace) { if (e.ctrlKey && e.altKey) replaceAll(this.view); else replaceNext(this.view); return; }
    if (e.altKey) selectMatches(this.view); else if (e.shiftKey) findPrevious(this.view); else findNext(this.view);
  }

  commit() {
    const query = new SearchQuery({ search: this.searchField.value, caseSensitive: this.caseSensitive, regexp: this.regexp, wholeWord: this.wholeWord, replace: this.replaceField.value });
    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
  }

  setQuery(query) {
    this.query = query;
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    if (query.replace) this.showReplace = true;
    this.caseSensitive = query.caseSensitive; this.regexp = query.regexp; this.wholeWord = query.wholeWord;
    for (const [b, on] of [[this.caseButton, this.caseSensitive], [this.regexButton, this.regexp], [this.wordButton, this.wholeWord]]) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('outline', !on); }
    this.layout();
  }

  updateCount() {
    const q = this.query;
    this.searchField.removeAttribute('aria-invalid');
    if (!q.search) { this.count.textContent = ''; return; }
    if (!q.valid) { this.count.textContent = t('cms.bad'); this.searchField.setAttribute('aria-invalid', 'true'); return; }
    const sel = this.view.state.selection.main;
    let n = 0, current = 0;
    const cursor = q.getCursor(this.view.state);
    for (let m = cursor.next(); !m.done; m = cursor.next()) {
      n++;
      if (m.value.from === sel.from && m.value.to === sel.to) current = n;
      if (n >= MAX_COUNT) break;
    }
    this.count.textContent = !n ? t('cms.none') : current ? t('cms.count', current, n >= MAX_COUNT ? `${MAX_COUNT}+` : n) : t('cms.countMany', n >= MAX_COUNT ? `${MAX_COUNT}+` : n);
  }

  update(update) {
    let changed = update.docChanged || update.selectionSet;
    for (const tr of update.transactions) {
      for (const effect of tr.effects) if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) { this.setQuery(effect.value); changed = true; } else if (effect.is(setSearchQuery)) changed = true;
    }
    if (update.startState.readOnly !== update.state.readOnly) this.layout();
    if (changed) this.updateCount();
  }

  mount() { this.searchField.select(); }

  get top() { return true; }
}

/** CodeMirror's search with the suite's panel (at the top of the editor). */
export function suiteSearch() {
  return search({ top: true, createPanel: (view) => new SuitePanel(view) });
}
