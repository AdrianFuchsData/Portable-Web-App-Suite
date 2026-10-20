/*
 * Spelling panel of the document editor (the editing surface is a canvas, so words cannot be marked in place): checks the
 * document body with the suite's spell checker (shared/js/spell.js) and lists the unknown words; a word selects its
 * occurrences in the document, a suggestion replaces all of them. The dictionary (English, German or a loaded one), the
 * personal words and the ignored words are shared with the spelling selector in the header and the other apps.
 */
import { spell } from 'app/spell';

const { html } = Suite.shell;
const t = Suite.t;

Suite.i18n.register({
  en: {
    'spell.title': 'Spelling', 'spell.button': 'Spelling', 'spell.close': 'Close', 'spell.language': 'Dictionary',
    'spell.load': 'Load dictionary…', 'spell.loadHint': 'Hunspell dictionaries: the .aff and .dic file together, or a LibreOffice extension (.oxt)',
    'spell.loaded': 'Dictionaries loaded: {0}', 'spell.noDictionary': 'No dictionary found: choose the .aff and the .dic file together, or an .oxt file.',
    'spell.remove': 'Remove this dictionary', 'spell.recheck': 'Check again', 'spell.checking': 'Checking…', 'spell.none': 'No spelling errors found.',
    'spell.count': '{0} unknown words', 'spell.count1': '1 unknown word', 'spell.suggestions': 'Replace all with:', 'spell.noSuggestions': 'No suggestions.', 'spell.ignore': 'Ignore',
    'spell.add': 'Add to dictionary', 'spell.replaced': '“{0}” replaced {1}×.', 'spell.next': 'Next occurrence',
  },
  de: {
    'spell.title': 'Rechtschreibung', 'spell.button': 'Rechtschreibung', 'spell.close': 'Schließen', 'spell.language': 'Wörterbuch',
    'spell.load': 'Wörterbuch laden…', 'spell.loadHint': 'Hunspell-Wörterbücher: die .aff- und die .dic-Datei zusammen oder eine LibreOffice-Erweiterung (.oxt)',
    'spell.loaded': 'Wörterbücher geladen: {0}', 'spell.noDictionary': 'Kein Wörterbuch gefunden: Wählen Sie die .aff- und die .dic-Datei zusammen oder eine .oxt-Datei.',
    'spell.remove': 'Dieses Wörterbuch entfernen', 'spell.recheck': 'Erneut prüfen', 'spell.checking': 'Prüfe…', 'spell.none': 'Keine Rechtschreibfehler gefunden.',
    'spell.count': '{0} unbekannte Wörter', 'spell.count1': '1 unbekanntes Wort', 'spell.suggestions': 'Alle ersetzen durch:', 'spell.noSuggestions': 'Keine Vorschläge.', 'spell.ignore': 'Ignorieren',
    'spell.add': 'Zum Wörterbuch hinzufügen', 'spell.replaced': '„{0}“ {1}× ersetzt.', 'spell.next': 'Nächstes Vorkommen',
  },
});

/** Unknown words of a text, grouped: [{ word, starts }] in order of first appearance. */
function grouped(text) {
  const byWord = new Map();
  for (const { word, start } of spell.errors(text)) {
    if (!byWord.has(word)) byWord.set(word, { word, starts: [] });
    byWord.get(word).starts.push(start);
  }
  return [...byWord.values()];
}

/**
 * ctx: { getBody() -> Univer body of the document, select(start, end), replace([[start, end]], text), changed(), render() }
 */
export function createSpelling(ctx) {
  const s = { open: false, busy: false, errors: null, current: null, suggestions: [], at: 0 };

  async function check() {
    if (!s.open) return;
    s.busy = true;
    ctx.render();
    await new Promise((r) => setTimeout(r, 20)); // show the busy state before the dictionary is built
    try {
      await spell.ready();
      s.errors = grouped(ctx.getBody().dataStream || '');
      if (s.current && !s.errors.some((e) => e.word === s.current)) s.current = null;
    } catch (e) {
      Suite.shell.toast(Suite.i18n.describe(e), 'error');
    }
    s.busy = false;
    ctx.render();
  }

  // dictionary, personal or ignored words changed (here, in the header or in another tab)
  let pending = null;
  spell.onChange(() => { if (s.open && !s.busy) { clearTimeout(pending); pending = setTimeout(check, 50); } });

  function toggle() {
    s.open = !s.open;
    ctx.render();
    if (s.open) check();
  }

  /** The current occurrences of a word (the document may have changed since the check). */
  async function occurrences(word) {
    await spell.ready();
    const found = grouped(ctx.getBody().dataStream || '').find((e) => e.word === word);
    return found ? found.starts : [];
  }

  async function choose(entry) {
    entry.starts = await occurrences(entry.word);
    if (!entry.starts.length) { check(); return; }
    if (s.current === entry.word) { // again: the next occurrence
      s.at = (s.at + 1) % entry.starts.length;
    } else {
      s.current = entry.word;
      s.at = 0;
      s.suggestions = [];
      ctx.render();
      await new Promise((r) => setTimeout(r, 0));
      s.suggestions = spell.suggest(entry.word).slice(0, 6);
    }
    const start = entry.starts[s.at];
    ctx.select(start, start + entry.word.length);
    ctx.render();
  }

  async function replace(entry, text) {
    entry.starts = await occurrences(entry.word);
    ctx.replace(entry.starts.map((start) => [start, start + entry.word.length]), text);
    Suite.shell.toast(t('spell.replaced', entry.word, entry.starts.length));
    s.current = null;
    ctx.changed();
    check();
  }

  function ignore(entry) { s.current = null; spell.ignore(entry.word); }
  function add(entry) { s.current = null; spell.add(entry.word); }

  async function load() {
    const picked = await Suite.files.open({ multiple: true, types: [{ description: 'Hunspell', accept: { 'application/octet-stream': ['.aff', '.dic', '.oxt'] } }] });
    if (!picked || !picked.length) return;
    try {
      const files = await Promise.all(picked.map(async ({ file }) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      const names = await spell.load(files);
      if (!names.length) { Suite.shell.toast(t('spell.noDictionary'), 'warning'); return; }
      Suite.shell.toast(t('spell.loaded', names.join(', ')));
    } catch (e) {
      Suite.shell.toast(Suite.i18n.describe(e), 'error');
    }
  }

  function setLanguage(name) { s.current = null; spell.setLanguage(name); }

  function Panel() {
    if (!s.open) return null;
    const languages = spell.languages();
    const current = languages.find((l) => l.name === spell.language);
    return html`<aside class="doc-spell pico" data-testid="spell-panel" aria-label=${t('spell.title')}>
      <header><strong>${t('spell.title')}</strong>
        <button class="secondary outline" data-testid="spell-close" aria-label=${t('spell.close')} title=${t('spell.close')} onClick=${toggle}>✕</button></header>
      <div class="doc-spell-language">
        <select data-testid="spell-language" value=${spell.language} aria-label=${t('spell.language')} onChange=${(e) => setLanguage(e.target.value)}>
          ${languages.map((l) => html`<option value=${l.name} selected=${l.name === spell.language}>${l.label}</option>`)}
        </select>
        ${current && !current.builtIn ? html`<button class="secondary outline" data-testid="spell-remove" title=${t('spell.remove')} aria-label=${t('spell.remove')} onClick=${() => spell.remove(current.name)}>🗑</button>` : null}
      </div>
      <div class="doc-spell-actions">
        <button class="secondary outline" data-testid="spell-load" title=${t('spell.loadHint')} onClick=${load}>${t('spell.load')}</button>
        <button class="secondary outline" data-testid="spell-recheck" onClick=${check} aria-busy=${s.busy ? 'true' : 'false'}>↻ ${t('spell.recheck')}</button>
      </div>
      <p class="doc-spell-status" data-testid="spell-status" aria-live="polite">${s.busy ? t('spell.checking') : !s.errors ? '' : s.errors.length === 1 ? t('spell.count1') : s.errors.length ? t('spell.count', s.errors.length) : t('spell.none')}</p>
      <ul class="doc-spell-list" data-testid="spell-list">
        ${(s.errors || []).map((e) => html`<li class=${s.current === e.word ? 'current' : ''}>
          <button class="doc-spell-word" data-testid="spell-word" title=${t('spell.next')} onClick=${() => choose(e)}>${e.word}${e.starts.length > 1 ? html` <small>×${e.starts.length}</small>` : null}</button>
          ${s.current === e.word ? html`<div class="doc-spell-detail">
            <small>${s.suggestions.length ? t('spell.suggestions') : t('spell.noSuggestions')}</small>
            <div class="doc-spell-suggestions">${s.suggestions.map((w) => html`<button data-testid="spell-suggestion" onClick=${() => replace(e, w)}>${w}</button>`)}</div>
            <div class="doc-spell-suggestions">
              <button class="secondary outline" data-testid="spell-ignore" onClick=${() => ignore(e)}>${t('spell.ignore')}</button>
              <button class="secondary outline" data-testid="spell-add" onClick=${() => add(e)}>${t('spell.add')}</button>
            </div></div>` : null}
        </li>`)}
      </ul>
    </aside>`;
  }

  return { Panel, toggle, check, get open() { return s.open; }, state: s };
}
