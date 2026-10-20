/*
 * Web inspector (reduced browser wrapper, decision D-004): loads pages through the relay (or directly, or from a file or
 * pasted source) and shows a script-free preview with inlined styles and images, response headers with security checks,
 * the source, the structure and the requests (also as HAR); a HAR viewer; and a developer-tools bookmarklet.
 */
import * as an from 'app/analyze';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'webinspector';
const UAS = {
  default: '',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
};

Suite.i18n.register({
  en: {
    'app.title': 'Web inspector',
    'wi.page': 'Page', 'wi.hdrs': 'Headers', 'wi.har': 'HAR viewer', 'wi.bookmarklet': 'Bookmarklet', 'wi.go': 'Load', 'wi.back': 'Back', 'wi.url': 'Address', 'wi.ua': 'User agent',
    'wi.uaDefault': 'relay default', 'wi.uaDesktop': 'desktop browser', 'wi.uaMobile': 'mobile browser', 'wi.follow': 'Follow redirects', 'wi.openHtml': 'Open HTML file', 'wi.paste': 'Paste source',
    'wi.preview': 'Preview', 'wi.headers': 'Headers & security', 'wi.source': 'Source', 'wi.structure': 'Structure', 'wi.network': 'Requests',
    'wi.viewport': 'Preview size', 'wi.vp.full': 'full width', 'wi.vp.phone': 'phone (390 × 844)', 'wi.vp.tablet': 'tablet (820 × 1180)', 'wi.vp.desktop': 'desktop (1366 × 768)', 'wi.vp.rotate': 'Rotate',
    'wi.keepCookies': 'Keep cookies', 'wi.keepCookiesHint': 'Cookies set by pages are stored here and sent with later requests (through the relay), like a browser does.',
    'wi.setByPage': 'Set by this page ({0})', 'wi.stored': 'Stored cookies ({0})', 'wi.clearCookies': 'Delete all', 'wi.noCookies': 'No cookies.', 'wi.cookiesDirect': 'Browsers hide Set-Cookie from pages: cookies are only visible through the relay.',
    'wi.name': 'Name', 'wi.domain': 'Domain', 'wi.path': 'Path', 'wi.expires': 'Expires', 'wi.session': 'session', 'wi.flags': 'Flags', 'wi.setBy': 'Set by', 'wi.delete': 'Delete',
    'wi.storageNote': 'localStorage, sessionStorage and IndexedDB are filled by scripts, which the preview does not run; use the bookmarklet in the real page to see them.',
    'wi.block': 'Block requests', 'wi.blockHint': 'One rule per line: a host (blocks its subdomains too) or an address pattern with * (e.g. *.woff2). Applies to the resources of the preview.',
    'wi.blockHost': 'Block this host', 'wi.blocked': 'blocked', 'wi.reload': 'Apply and reload', 'wi.blockedCount': '{0} blocked',
    'wi.noPage': 'Enter an address and press Load (needs the relay for most sites), open an HTML file or paste a page source.',
    'wi.relayHint': 'Without the relay, pages can only be loaded from servers that allow it (CORS); styles and images of the preview are not loaded.',
    'wi.direct': 'loaded directly', 'wi.viaRelay': 'through the relay', 'wi.fromFile': 'from a file', 'wi.pasted': 'pasted', 'wi.status': 'Status', 'wi.time': 'Time', 'wi.size': 'Size',
    'wi.resources': '{0} resources loaded for the preview.', 'wi.noResources': 'Styles and images are only loaded through the relay.', 'wi.saveSource': 'Save source', 'wi.saveHar': 'Save as HAR',
    'wi.openInHar': 'Show in HAR viewer', 'wi.check': 'Check', 'wi.value': 'Value', 'wi.result': 'Result', 'wi.responseHeaders': 'Response headers', 'wi.title': 'Title', 'wi.lang': 'Language',
    'wi.charset': 'Character set', 'wi.canonical': 'Canonical URL', 'wi.elements': 'Elements', 'wi.meta': 'Meta tags', 'wi.headings': 'Headings', 'wi.links': 'Links ({0}, {1} external)',
    'wi.images': 'Images ({0})', 'wi.scripts': 'Scripts ({0})', 'wi.styles': 'Stylesheets ({0})', 'wi.forms': 'Forms ({0})', 'wi.frames': 'Frames ({0})', 'wi.hints': 'Hints',
    'wi.noHints': 'No problems found.', 'wi.inline': 'inline', 'wi.search': 'Search', 'wi.openHar': 'Open HAR file', 'wi.noHar': 'Open a HAR file (exported from the network panel of a browser’s developer tools) or drop it here.',
    'wi.requests': '{0} requests', 'wi.transferred': '{0} transferred', 'wi.all': 'All', 'wi.method': 'Method', 'wi.type': 'Type', 'wi.general': 'General', 'wi.request': 'Request',
    'wi.response': 'Response', 'wi.body': 'Body', 'wi.timing': 'Timing', 'wi.cookies': 'Cookies', 'wi.query': 'Query', 'wi.copyCurl': 'Copy as cURL', 'wi.copied': 'Copied.',
    'wi.noBody': 'The HAR file contains no body for this request.', 'wi.bmIntro': 'The bookmarklet opens a small developer-tools panel inside any page: console (with errors and console output after opening, and an input line), element picker with attributes and computed styles, loaded resources, cookies and storage, page information. Useful where the browser’s developer tools are missing or disabled, e.g. on phones.',
    'wi.bmDrag': 'Drag this link to the bookmarks bar:', 'wi.bmMobile': 'On phones: copy the code, create a bookmark of any page, edit it and replace its address with the code. Open the page to inspect and choose the bookmark (in Chrome for Android: type the bookmark’s name into the address bar and tap it).',
    'wi.bmCopy': 'Copy code', 'wi.bmTry': 'Try it on this page', 'wi.bmLimits': 'Pages whose Content Security Policy forbids eval() still show the panel, but the console input cannot run code there.',
    'wi.pasteTitle': 'Page source', 'wi.baseUrl': 'Page address (for relative links, optional)', 'wi.ok': 'OK', 'wi.cancel': 'Cancel', 'wi.cannotOpen': '“{0}” cannot be opened: {1}',
    'wi.failed': 'Loading failed: {0}', 'wi.notHtml': 'The response is not an HTML page ({0}); only headers and source are shown.',
    'sec.noHttps': 'The page is not served over HTTPS.', 'sec.hstsMissing': 'Missing: browsers may connect over HTTP first.', 'sec.hstsOk': 'Set with a long max-age.', 'sec.hstsShort': 'max-age is shorter than 180 days.',
    'sec.cspMissing': 'No Content Security Policy: no second line of defence against XSS.', 'sec.cspWeak': 'Weakened: {0}.', 'sec.cspOk': 'Present.', 'sec.framingOk': 'Framing by other sites is restricted.',
    'sec.framingMissing': 'Other sites may embed the page in a frame (clickjacking).', 'sec.ok': 'Set.', 'sec.nosniffMissing': 'Missing: browsers may guess content types.',
    'sec.referrerDefault': 'Not set: the browser default (strict-origin-when-cross-origin) applies.', 'sec.permissionsMissing': 'Not set (optional).', 'sec.optional': 'Not set (needed only for cross-origin isolation).',
    'sec.cookieFlags': 'Cookie without {0}.', 'sec.disclosure': 'Reveals software versions.', 'sec.mixed': 'Script loaded over HTTP on an HTTPS page: {0}', 'sec.formHttp': 'Form sends to HTTP: {0}',
    'a11y.noLang': 'The page has no lang attribute.', 'a11y.noTitle': 'The page has no title.', 'a11y.noViewport': 'No viewport meta tag: the page will not adapt to phones.', 'a11y.noAlt': '{0} image(s) without alt text.',
    'a11y.h1': 'The page has {0} h1 headings (one is recommended).', 'a11y.skip': 'Heading levels are skipped ({0}).', 'a11y.noLabel': '{0} form field(s) without a label.', 'a11y.emptyLinks': '{0} link(s) without text.',
  },
  de: {
    'app.title': 'Web-Inspektor',
    'wi.page': 'Seite', 'wi.hdrs': 'Header', 'wi.har': 'HAR-Betrachter', 'wi.bookmarklet': 'Bookmarklet', 'wi.go': 'Laden', 'wi.back': 'Zurück', 'wi.url': 'Adresse', 'wi.ua': 'User-Agent',
    'wi.uaDefault': 'Relay-Standard', 'wi.uaDesktop': 'Desktop-Browser', 'wi.uaMobile': 'Mobilbrowser', 'wi.follow': 'Weiterleitungen folgen', 'wi.openHtml': 'HTML-Datei öffnen', 'wi.paste': 'Quelltext einfügen',
    'wi.preview': 'Vorschau', 'wi.headers': 'Header & Sicherheit', 'wi.source': 'Quelltext', 'wi.structure': 'Struktur', 'wi.network': 'Anfragen',
    'wi.viewport': 'Vorschaugröße', 'wi.vp.full': 'volle Breite', 'wi.vp.phone': 'Smartphone (390 × 844)', 'wi.vp.tablet': 'Tablet (820 × 1180)', 'wi.vp.desktop': 'Desktop (1366 × 768)', 'wi.vp.rotate': 'Drehen',
    'wi.keepCookies': 'Cookies behalten', 'wi.keepCookiesHint': 'Von Seiten gesetzte Cookies werden hier gespeichert und wie in einem Browser bei späteren Anfragen (über das Relay) mitgeschickt.',
    'wi.setByPage': 'Von dieser Seite gesetzt ({0})', 'wi.stored': 'Gespeicherte Cookies ({0})', 'wi.clearCookies': 'Alle löschen', 'wi.noCookies': 'Keine Cookies.', 'wi.cookiesDirect': 'Browser verbergen Set-Cookie vor Seiten: Cookies sind nur über das Relay sichtbar.',
    'wi.name': 'Name', 'wi.domain': 'Domain', 'wi.path': 'Pfad', 'wi.expires': 'Ablauf', 'wi.session': 'Sitzung', 'wi.flags': 'Attribute', 'wi.setBy': 'Gesetzt von', 'wi.delete': 'Löschen',
    'wi.storageNote': 'localStorage, sessionStorage und IndexedDB werden von Skripten befüllt, die die Vorschau nicht ausführt; das Bookmarklet zeigt sie in der echten Seite.',
    'wi.block': 'Anfragen blockieren', 'wi.blockHint': 'Eine Regel je Zeile: ein Host (blockiert auch seine Subdomains) oder ein Adressmuster mit * (z. B. *.woff2). Gilt für die Ressourcen der Vorschau.',
    'wi.blockHost': 'Diesen Host blockieren', 'wi.blocked': 'blockiert', 'wi.reload': 'Übernehmen und neu laden', 'wi.blockedCount': '{0} blockiert',
    'wi.noPage': 'Geben Sie eine Adresse ein und drücken Sie Laden (braucht für die meisten Seiten das Relay), öffnen Sie eine HTML-Datei oder fügen Sie einen Quelltext ein.',
    'wi.relayHint': 'Ohne Relay lassen sich nur Seiten von Servern laden, die das erlauben (CORS); Stile und Bilder der Vorschau werden nicht geladen.',
    'wi.direct': 'direkt geladen', 'wi.viaRelay': 'über das Relay', 'wi.fromFile': 'aus einer Datei', 'wi.pasted': 'eingefügt', 'wi.status': 'Status', 'wi.time': 'Zeit', 'wi.size': 'Größe',
    'wi.resources': '{0} Ressourcen für die Vorschau geladen.', 'wi.noResources': 'Stile und Bilder werden nur über das Relay geladen.', 'wi.saveSource': 'Quelltext speichern', 'wi.saveHar': 'Als HAR speichern',
    'wi.openInHar': 'Im HAR-Betrachter zeigen', 'wi.check': 'Prüfung', 'wi.value': 'Wert', 'wi.result': 'Ergebnis', 'wi.responseHeaders': 'Antwort-Header', 'wi.title': 'Titel', 'wi.lang': 'Sprache',
    'wi.charset': 'Zeichensatz', 'wi.canonical': 'Kanonische URL', 'wi.elements': 'Elemente', 'wi.meta': 'Meta-Tags', 'wi.headings': 'Überschriften', 'wi.links': 'Links ({0}, {1} extern)',
    'wi.images': 'Bilder ({0})', 'wi.scripts': 'Skripte ({0})', 'wi.styles': 'Stylesheets ({0})', 'wi.forms': 'Formulare ({0})', 'wi.frames': 'Frames ({0})', 'wi.hints': 'Hinweise',
    'wi.noHints': 'Keine Probleme gefunden.', 'wi.inline': 'eingebettet', 'wi.search': 'Suchen', 'wi.openHar': 'HAR-Datei öffnen', 'wi.noHar': 'Öffnen Sie eine HAR-Datei (exportiert aus dem Netzwerkbereich der Entwicklerwerkzeuge eines Browsers) oder ziehen Sie sie hierher.',
    'wi.requests': '{0} Anfragen', 'wi.transferred': '{0} übertragen', 'wi.all': 'Alle', 'wi.method': 'Methode', 'wi.type': 'Typ', 'wi.general': 'Allgemein', 'wi.request': 'Anfrage',
    'wi.response': 'Antwort', 'wi.body': 'Inhalt', 'wi.timing': 'Zeiten', 'wi.cookies': 'Cookies', 'wi.query': 'Parameter', 'wi.copyCurl': 'Als cURL kopieren', 'wi.copied': 'Kopiert.',
    'wi.noBody': 'Die HAR-Datei enthält für diese Anfrage keinen Inhalt.', 'wi.bmIntro': 'Das Bookmarklet öffnet in jeder Seite einen kleinen Entwicklerbereich: Konsole (mit Fehlern und Konsolenausgaben nach dem Öffnen und einer Eingabezeile), Elementauswahl mit Attributen und berechneten Stilen, geladene Ressourcen, Cookies und Speicher, Seiteninformationen. Nützlich, wo die Entwicklerwerkzeuge des Browsers fehlen oder gesperrt sind, z. B. auf Smartphones.',
    'wi.bmDrag': 'Ziehen Sie diesen Link in die Lesezeichenleiste:', 'wi.bmMobile': 'Auf Smartphones: Kopieren Sie den Code, legen Sie ein Lesezeichen einer beliebigen Seite an, bearbeiten Sie es und ersetzen Sie die Adresse durch den Code. Öffnen Sie die zu untersuchende Seite und wählen Sie das Lesezeichen (in Chrome für Android: den Namen des Lesezeichens in die Adresszeile tippen und antippen).',
    'wi.bmCopy': 'Code kopieren', 'wi.bmTry': 'Auf dieser Seite ausprobieren', 'wi.bmLimits': 'Auf Seiten, deren Content Security Policy eval() verbietet, erscheint der Bereich trotzdem, aber die Konsoleneingabe kann dort keinen Code ausführen.',
    'wi.pasteTitle': 'Quelltext der Seite', 'wi.baseUrl': 'Adresse der Seite (für relative Links, optional)', 'wi.ok': 'OK', 'wi.cancel': 'Abbrechen', 'wi.cannotOpen': '„{0}“ kann nicht geöffnet werden: {1}',
    'wi.failed': 'Laden fehlgeschlagen: {0}', 'wi.notHtml': 'Die Antwort ist keine HTML-Seite ({0}); nur Header und Quelltext werden gezeigt.',
    'sec.noHttps': 'Die Seite wird nicht über HTTPS ausgeliefert.', 'sec.hstsMissing': 'Fehlt: Browser verbinden sich eventuell zuerst über HTTP.', 'sec.hstsOk': 'Mit langer max-age gesetzt.', 'sec.hstsShort': 'max-age ist kürzer als 180 Tage.',
    'sec.cspMissing': 'Keine Content Security Policy: keine zweite Verteidigungslinie gegen XSS.', 'sec.cspWeak': 'Abgeschwächt: {0}.', 'sec.cspOk': 'Vorhanden.', 'sec.framingOk': 'Einbetten durch andere Seiten ist eingeschränkt.',
    'sec.framingMissing': 'Andere Seiten dürfen die Seite in einen Frame einbetten (Clickjacking).', 'sec.ok': 'Gesetzt.', 'sec.nosniffMissing': 'Fehlt: Browser dürfen Inhaltstypen erraten.',
    'sec.referrerDefault': 'Nicht gesetzt: Es gilt die Browser-Vorgabe (strict-origin-when-cross-origin).', 'sec.permissionsMissing': 'Nicht gesetzt (optional).', 'sec.optional': 'Nicht gesetzt (nur für Cross-Origin-Isolation nötig).',
    'sec.cookieFlags': 'Cookie ohne {0}.', 'sec.disclosure': 'Verrät Software-Versionen.', 'sec.mixed': 'Skript über HTTP auf einer HTTPS-Seite: {0}', 'sec.formHttp': 'Formular sendet an HTTP: {0}',
    'a11y.noLang': 'Die Seite hat kein lang-Attribut.', 'a11y.noTitle': 'Die Seite hat keinen Titel.', 'a11y.noViewport': 'Kein Viewport-Meta-Tag: Die Seite passt sich nicht an Smartphones an.', 'a11y.noAlt': '{0} Bild(er) ohne Alternativtext.',
    'a11y.h1': 'Die Seite hat {0} h1-Überschriften (empfohlen ist eine).', 'a11y.skip': 'Überschriftenebenen werden übersprungen ({0}).', 'a11y.noLabel': '{0} Formularfeld(er) ohne Beschriftung.', 'a11y.emptyLinks': '{0} Link(s) ohne Text.',
  },
});

const state = {
  tab: 'page', url: '', ua: 'default', follow: true, loading: false, page: null, sub: 'preview', preview: null, previewing: false,
  requests: [], history: [], har: null, harSel: null, harFilter: '', harType: 'all', harSort: null, harDetail: 'headers', dialog: null, sourceFilter: '',
  jar: [], ...loadPrefs(),
};
const VIEWPORTS = { full: null, phone: [390, 844], tablet: [820, 1180], desktop: [1366, 768] };

// per-browser conveniences: preview size, blocking rules, whether cookies are kept
function loadPrefs() {
  const d = { viewport: 'full', rotated: false, blockRules: '', keepCookies: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem('suite.webinspector.prefs')) }; } catch (e) { return d; }
}
function savePrefs() {
  try { localStorage.setItem('suite.webinspector.prefs', JSON.stringify({ viewport: state.viewport, rotated: state.rotated, blockRules: state.blockRules, keepCookies: state.keepCookies })); } catch (e) { /* storage blocked */ }
}
const data = Suite.appdata.create(APP, { onChange: () => render() });

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };
const fmtSize = (n) => (n == null || n < 0 ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`);
const hasRelay = () => data.relayConfigured();
const headerOf = (headers, name) => { const h = (headers || []).find(([k]) => k.toLowerCase() === name); return h ? h[1] : ''; };

// ---- loading pages ---------------------------------------------------------------------------------------------------------

function decodeBody(bytes, contentType) {
  let charset = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || 'utf-8';
  }
  try { return new TextDecoder(charset).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); }
}

async function request(url, accept = 'text/html,application/xhtml+xml,*/*;q=0.8', { resource = false } = {}) {
  const headers = [['Accept', accept], ['Accept-Language', Suite.i18n.language === 'de' ? 'de,en;q=0.7' : 'en,de;q=0.7']];
  if (UAS[state.ua]) headers.push(['User-Agent', UAS[state.ua]]);
  const started = Date.now();
  const rule = resource ? an.blockedBy(state.blockRules, url) : null;
  if (rule) {
    state.requests.push({ started, method: 'GET', url, requestHeaders: headers, status: 0, reason: t('wi.blocked'), blocked: rule, headers: [], body: new Uint8Array(0), timeMs: 0, finalUrl: url });
    return null;
  }
  if (state.keepCookies && hasRelay()) { const cookie = an.cookieHeader(state.jar, url); if (cookie) headers.push(['Cookie', cookie]); }
  let r;
  if (hasRelay()) {
    r = await Suite.relay.http(data.relayConfig(), { method: 'GET', url, headers, followRedirects: state.follow, timeout: 30 });
    r.via = 'relay';
  } else {
    const t0 = performance.now();
    const res = await fetch(url, { headers: Object.fromEntries(headers.filter(([k]) => k !== 'User-Agent')), redirect: state.follow ? 'follow' : 'manual' });
    r = { status: res.status, reason: res.statusText, url: res.url || url, httpVersion: '', headers: [...res.headers], body: new Uint8Array(await res.arrayBuffer()), timeMs: Math.round(performance.now() - t0), via: 'direct' };
  }
  state.requests.push({ started, method: 'GET', url, requestHeaders: headers, status: r.status, reason: r.reason, httpVersion: r.httpVersion, headers: r.headers, body: r.body, timeMs: r.timeMs, finalUrl: r.url });
  if (state.keepCookies) state.jar = an.storeCookies(state.jar, r.headers, r.url || url);
  return r;
}

async function load(url, { push = true } = {}) {
  url = url.trim();
  if (!url) return;
  if (!/^[a-z][\w+.-]*:/i.test(url)) url = `https://${url}`;
  if (push && state.page && state.page.url) state.history.push(state.page.url);
  state.url = url;
  state.loading = true;
  state.requests = [];
  render();
  try {
    const r = await request(url);
    const type = headerOf(r.headers, 'content-type');
    const finalUrl = r.url || url;
    setPage({ url: finalUrl, status: r.status, reason: r.reason, httpVersion: r.httpVersion, headers: r.headers, bytes: r.body, source: decodeBody(r.body, type), timeMs: r.timeMs, via: r.via, type });
    state.url = finalUrl;
  } catch (e) {
    Suite.shell.toast(t('wi.failed', Suite.i18n.describe(e)), 'error');
    if (!hasRelay()) Suite.shell.toast(t('wi.relayHint'), 'warning');
  } finally { state.loading = false; render(); }
}

function setPage(page) {
  state.page = page;
  state.preview = null;
  state.sourceFilter = '';
  const isHtml = !page.type || /html|xml/i.test(page.type);
  if (!isHtml) { state.sub = 'headers'; Suite.shell.toast(t('wi.notHtml', page.type), 'warning'); }
  state.analysis = isHtml ? an.structure(page.source, page.url) : null;
  state.security = page.headers ? an.securityChecks(page.headers, page.url) : null;
  render();
  if (isHtml) buildPreview();
}

async function buildPreview() {
  const page = state.page;
  state.previewing = true;
  render();
  try {
    const fetchResource = page.via === 'relay' && hasRelay() ? async (u) => {
      const r = await request(u, '*/*', { resource: true });
      return r && r.status < 400 ? { bytes: r.body, mime: headerOf(r.headers, 'content-type').split(';')[0] } : null;
    } : null;
    const result = await an.previewDocument(page.source, page.url || 'about:blank', { fetchResource });
    if (state.page === page) state.preview = result;
  } catch (e) { fail(e); } finally { state.previewing = false; render(); }
}

/** Load the preview's resources again (after the blocking rules changed). */
function reloadPreview() {
  if (!state.page) return;
  if (state.page.via === 'relay') { state.requests = state.requests.slice(0, 1); buildPreview(); } else load(state.page.url, { push: false });
}

async function openHtmlFile() {
  const picked = await Suite.files.open({ types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm', '.xhtml'] } }] }).catch(fail);
  if (!picked) return;
  const { file } = picked[0];
  const bytes = new Uint8Array(await file.arrayBuffer());
  state.requests = [];
  setPage({ url: '', status: null, headers: null, bytes, source: decodeBody(bytes, ''), timeMs: 0, via: 'file', type: 'text/html', name: file.name });
  state.url = '';
}

function previewLoaded(e) {
  const doc = e.target.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#')) return;
    ev.preventDefault();
    if (/^https?:/i.test(href)) load(href);
  });
}

// ---- HAR ------------------------------------------------------------------------------------------------------------------------

async function openHar(file) {
  try {
    const log = an.parseHar(await file.text());
    Object.assign(state, { har: { name: file.name, log }, harSel: null, harFilter: '', harType: 'all', tab: 'har' });
  } catch (e) { Suite.shell.toast(t('wi.cannotOpen', file.name, e.message), 'error'); }
  render();
}

async function pickHar() {
  const picked = await Suite.files.open({ types: [{ description: 'HAR', accept: { 'application/json': ['.har', '.json'] } }] }).catch(fail);
  if (picked) await openHar(picked[0].file);
}

function ownHar() {
  return an.toHar(state.requests, { url: state.page && state.page.url, title: state.analysis && state.analysis.title });
}

function harEntries() {
  const log = state.har.log;
  const q = state.harFilter.toLowerCase();
  let list = log.entries.map((e, i) => ({ e, i, group: an.mimeGroup(e.response && e.response.content && e.response.content.mimeType, e.request.url) }));
  if (state.harType !== 'all') list = list.filter((x) => x.group === state.harType);
  if (q) list = list.filter((x) => x.e.request.url.toLowerCase().includes(q) || String(x.e.response.status).includes(q));
  const s = state.harSort;
  if (s) {
    const key = { method: (x) => x.e.request.method, url: (x) => x.e.request.url, status: (x) => x.e.response.status, type: (x) => x.group, size: (x) => sizeOf(x.e), time: (x) => x.e.time }[s.key];
    list.sort((a, b) => { const va = key(a), vb = key(b); return (va < vb ? -1 : va > vb ? 1 : 0) * s.dir; });
  }
  return list;
}

const sizeOf = (e) => (e.response._transferSize > 0 ? e.response._transferSize : e.response.bodySize > 0 ? e.response.bodySize : (e.response.content && e.response.content.size) || 0);

// ---- UI: page ---------------------------------------------------------------------------------------------------------------------

function AddressBar() {
  return html`<form class="wi-address" onSubmit=${(e) => { e.preventDefault(); load(e.target.elements.url.value); }}>
    <button type="button" class="secondary outline" title=${t('wi.back')} data-testid="back" disabled=${!state.history.length} onClick=${() => load(state.history.pop(), { push: false })}>←</button>
    <input name="url" type="url" placeholder="https://example.org" data-testid="url" key=${state.url} defaultValue=${state.url} aria-label=${t('wi.url')} />
    <button type="submit" data-testid="go" aria-busy=${state.loading}>${t('wi.go')}</button>
    <select data-testid="ua" title=${t('wi.ua')} onChange=${(e) => { state.ua = e.target.value; }}>
      ${Object.keys(UAS).map((k) => html`<option value=${k} selected=${state.ua === k}>${t(`wi.ua${k[0].toUpperCase()}${k.slice(1)}`)}</option>`)}</select>
    <label class="wi-check"><input type="checkbox" data-testid="follow" checked=${state.follow} onChange=${(e) => { state.follow = e.target.checked; }} /> ${t('wi.follow')}</label>
    <button type="button" class="secondary outline" data-testid="open-html" onClick=${openHtmlFile}>${t('wi.openHtml')}</button>
    <button type="button" class="secondary outline" data-testid="paste" onClick=${() => { state.dialog = { kind: 'paste' }; render(); }}>${t('wi.paste')}</button>
  </form>`;
}

function Summary() {
  const p = state.page;
  const via = { relay: t('wi.viaRelay'), direct: t('wi.direct'), file: t('wi.fromFile'), paste: t('wi.pasted') }[p.via];
  return html`<div class="wi-summary" data-testid="summary">
    ${p.status != null ? html`<span class=${`wi-status s${String(p.status)[0]}`} data-testid="status">${p.status} ${p.reason || ''}</span>` : null}
    <span>${p.url || p.name || ''}</span>
    <small>${via}${p.timeMs ? ` · ${p.timeMs} ms` : ''} · ${fmtSize(p.bytes.length)}${p.type ? ` · ${p.type}` : ''}</small>
  </div>`;
}

function Preview() {
  if (state.previewing && !state.preview) return html`<p aria-busy="true"></p>`;
  if (!state.preview) return null;
  const vp = VIEWPORTS[state.viewport];
  const [w, h] = vp ? (state.rotated ? [vp[1], vp[0]] : vp) : [];
  const blocked = state.requests.filter((r) => r.blocked).length;
  return html`<div class="wi-preview-wrap">
    <div class="wi-row">
      <select data-testid="viewport" title=${t('wi.viewport')} aria-label=${t('wi.viewport')} onChange=${(e) => { state.viewport = e.target.value; savePrefs(); render(); }}>
        ${Object.keys(VIEWPORTS).map((k) => html`<option value=${k} selected=${state.viewport === k}>${t(`wi.vp.${k}`)}</option>`)}</select>
      ${vp ? html`<button class="secondary outline" data-testid="rotate" aria-pressed=${state.rotated} title=${t('wi.vp.rotate')} onClick=${() => { state.rotated = !state.rotated; savePrefs(); render(); }}>⟳</button>` : null}
      <small class="wi-note" data-testid="preview-note">${state.page.via === 'relay' ? t('wi.resources', state.preview.fetched) : t('wi.noResources')}${blocked ? ` · ${t('wi.blockedCount', blocked)}` : ''}</small>
    </div>
    <div class=${`wi-device ${vp ? 'sized' : ''}`}>
      <iframe class="wi-preview" data-testid="preview-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc=${state.preview.html} onLoad=${previewLoaded} title=${t('wi.preview')}
        style=${vp ? `width:${w}px;height:${h}px;flex:none` : ''}></iframe>
    </div>
  </div>`;
}

const STATUS_ICON = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️' };

function Headers() {
  const p = state.page;
  if (!p.headers) return html`<p class="wi-hint">—</p>`;
  return html`<div class="wi-scroll">
    <h4>${t('wi.headers')}</h4>
    <table class="wi-table" data-testid="security"><thead><tr><th></th><th>${t('wi.check')}</th><th>${t('wi.result')}</th><th>${t('wi.value')}</th></tr></thead>
      <tbody>${state.security.map((c) => html`<tr data-testid="check" data-status=${c.status}><td>${STATUS_ICON[c.status]}</td><td>${c.name}</td><td>${t(c.note, ...c.args)}</td><td class="wi-code">${c.value}</td></tr>`)}</tbody></table>
    <h4>${t('wi.responseHeaders')}</h4>
    <table class="wi-table" data-testid="response-headers"><tbody>${p.headers.map(([k, v]) => html`<tr><td class="wi-key">${k}</td><td class="wi-code">${v}</td></tr>`)}</tbody></table>
  </div>`;
}

function Source() {
  const p = state.page;
  const lines = p.source.split(/\r?\n/);
  const q = state.sourceFilter.toLowerCase();
  const shown = q ? lines.map((l, i) => [l, i]).filter(([l]) => l.toLowerCase().includes(q)) : lines.map((l, i) => [l, i]);
  const big = p.source.length > 1500000;
  return html`<div class="wi-source-wrap">
    <div class="wi-row">
      <input type="search" placeholder=${t('wi.search')} data-testid="source-search" defaultValue=${state.sourceFilter} onInput=${(e) => { state.sourceFilter = e.target.value; render(); }} />
      <button class="secondary outline" data-testid="save-source" onClick=${() => Suite.files.download(p.bytes, p.name || `${(p.url.replace(/^\w+:\/\//, '').replace(/[^\w.-]+/g, '_') || 'page').slice(0, 80)}.html`, 'text/html')}>${t('wi.saveSource')}</button>
    </div>
    <pre class="wi-source" data-testid="source">${shown.slice(0, 20000).map(([l, i]) => html`<div><span class="wi-ln">${i + 1}</span>${big ? l : html`<span dangerouslySetInnerHTML=${{ __html: an.highlightHtml(l) }}></span>`}</div>`)}</pre>
  </div>`;
}

function Structure() {
  const a = state.analysis;
  if (!a) return html`<p class="wi-hint">—</p>`;
  const list = (items, fn) => html`<ul class="wi-list">${items.slice(0, 500).map((x) => html`<li>${fn(x)}</li>`)}</ul>`;
  const ext = a.links.filter((l) => l.external).length;
  return html`<div class="wi-scroll" data-testid="structure">
    <section class="wi-hints"><h4>${t('wi.hints')}</h4>${a.hints.length ? html`<ul data-testid="hints">${a.hints.map(([k, ...args]) => html`<li data-testid="hint">${t(k, ...args)}</li>`)}</ul>` : html`<p>${t('wi.noHints')}</p>`}</section>
    <table class="wi-table"><tbody>
      <tr><td class="wi-key">${t('wi.title')}</td><td data-testid="page-title">${a.title}</td></tr>
      <tr><td class="wi-key">${t('wi.lang')}</td><td>${a.lang}</td></tr>
      <tr><td class="wi-key">${t('wi.charset')}</td><td>${a.charset}</td></tr>
      ${a.canonical ? html`<tr><td class="wi-key">${t('wi.canonical')}</td><td>${a.canonical}</td></tr>` : null}
      <tr><td class="wi-key">${t('wi.elements')}</td><td>${a.elements}</td></tr></tbody></table>
    <details open><summary>${t('wi.meta')} (${a.metas.length})</summary><table class="wi-table"><tbody>${a.metas.map((m) => html`<tr><td class="wi-key">${m.name}</td><td>${m.content}</td></tr>`)}</tbody></table></details>
    <details open><summary>${t('wi.headings')} (${a.headings.length})</summary>${list(a.headings, (h) => html`<span style=${`padding-left:${(h.level - 1) * 1}rem`} data-testid="heading">h${h.level} ${h.text}</span>`)}</details>
    <details><summary data-testid="links-summary">${t('wi.links', a.links.length, ext)}</summary>${list(a.links, (l) => html`<a href="#" onClick=${(e) => { e.preventDefault(); if (/^https?:/i.test(l.href)) { state.tab = 'page'; load(l.href); } }}>${l.text || l.href}</a> <small>${l.href}${l.external ? ' ↗' : ''}${l.nofollow ? ' (nofollow)' : ''}</small>`)}</details>
    <details><summary>${t('wi.images', a.images.length)}</summary>${list(a.images, (i) => html`<span>${i.src}</span> <small>${i.alt === null ? '⚠ alt' : `alt="${i.alt}"`}</small>`)}</details>
    <details><summary>${t('wi.scripts', a.scripts.length)}</summary>${list(a.scripts, (s) => html`<span>${s.inline ? `${t('wi.inline')} (${fmtSize(s.size)})` : s.src}</span> <small>${[s.type, s.async && 'async', s.defer && 'defer'].filter(Boolean).join(' ')}</small>`)}</details>
    <details><summary>${t('wi.styles', a.styles.length)}</summary>${list(a.styles, (s) => (s.inline ? `${t('wi.inline')} (${fmtSize(s.size)})` : s.href))}</details>
    <details><summary>${t('wi.forms', a.forms.length)}</summary>${list(a.forms, (f) => html`<span>${f.method} ${f.action || '(same page)'}</span> <small>${f.fields.join(', ')}</small>`)}</details>
    ${a.frames.length ? html`<details><summary>${t('wi.frames', a.frames.length)}</summary>${list(a.frames, (f) => f)}</details>` : null}
  </div>`;
}

function Network() {
  return html`<div class="wi-scroll">
    <div class="wi-row">
      <button class="secondary outline" data-testid="save-har" disabled=${!state.requests.length} onClick=${() => Suite.files.download(new TextEncoder().encode(JSON.stringify(ownHar(), null, 1)), 'requests.har', 'application/json')}>${t('wi.saveHar')}</button>
      <button class="secondary outline" data-testid="open-in-har" disabled=${!state.requests.length} onClick=${() => { state.har = { name: 'requests.har', log: ownHar().log }; state.harSel = null; state.tab = 'har'; render(); }}>${t('wi.openInHar')}</button>
    </div>
    <table class="wi-table" data-testid="requests"><thead><tr><th>${t('wi.status')}</th><th>URL</th><th>${t('wi.type')}</th><th>${t('wi.size')}</th><th>${t('wi.time')}</th><th></th></tr></thead>
      <tbody>${state.requests.map((r, i) => html`<tr data-testid="request" class=${r.blocked ? 'wi-blocked' : ''}><td>${r.blocked ? html`<span title=${r.blocked}>⊘ ${t('wi.blocked')}</span>` : r.status}</td><td class="wi-url" title=${r.url}>${r.url}</td>
        <td>${headerOf(r.headers, 'content-type').split(';')[0]}</td><td>${fmtSize(r.body.length)}</td><td>${r.timeMs} ms</td>
        <td>${i > 0 && !r.blocked ? html`<button class="secondary outline wi-mini" data-testid="block-host" title=${t('wi.blockHost')} onClick=${() => blockHost(r.url)}>⊘</button>` : null}</td></tr>`)}</tbody></table>
    <details class="wi-blocking" open=${!!state.blockRules}>
      <summary data-testid="blocking">${t('wi.block')}</summary>
      <small class="wi-note">${t('wi.blockHint')}</small>
      <textarea rows="4" data-testid="block-rules" key=${`br${state.blockRev || 0}`} defaultValue=${state.blockRules} placeholder=${'ads.example.com\n*.woff2'}
        onInput=${(e) => { state.blockRules = e.target.value; savePrefs(); }}></textarea>
      <button class="secondary outline" data-testid="block-apply" onClick=${reloadPreview}>${t('wi.reload')}</button>
    </details>
  </div>`;
}

function blockHost(url) {
  const host = new URL(url).hostname;
  if (!an.blockedBy(state.blockRules, url)) state.blockRules = `${state.blockRules.replace(/\s+$/, '')}${state.blockRules.trim() ? '\n' : ''}${host}`;
  state.blockRev = (state.blockRev || 0) + 1;
  savePrefs();
  reloadPreview();
}

const fmtExpires = (c) => (c.expires == null ? t('wi.session') : new Date(c.expires).toLocaleString(Suite.i18n.language));

function CookieTable({ cookies, testid, remove }) {
  if (!cookies.length) return html`<p class="wi-note" data-testid=${`${testid}-empty`}>${t('wi.noCookies')}</p>`;
  return html`<table class="wi-table" data-testid=${testid}><thead><tr><th>${t('wi.name')}</th><th>${t('wi.value')}</th><th>${t('wi.domain')}</th><th>${t('wi.path')}</th><th>${t('wi.expires')}</th><th>${t('wi.flags')}</th><th>${t('wi.setBy')}</th>${remove ? html`<th></th>` : null}</tr></thead>
    <tbody>${cookies.map((c) => html`<tr data-testid="cookie"><td class="wi-key">${c.name}</td><td class="wi-code">${c.value}</td><td>${c.hostOnly ? c.domain : `.${c.domain}`}</td><td>${c.path}</td><td>${fmtExpires(c)}</td>
      <td>${[c.secure && 'Secure', c.httpOnly && 'HttpOnly', c.sameSite && `SameSite=${c.sameSite}`].filter(Boolean).join(' ')}</td><td class="wi-url" title=${c.setBy}>${c.setBy}</td>
      ${remove ? html`<td><button class="secondary outline wi-mini" data-testid="cookie-delete" title=${t('wi.delete')} onClick=${() => remove(c)}>×</button></td>` : null}</tr>`)}</tbody></table>`;
}

function Cookies() {
  const set = [];
  for (const r of state.requests) {
    for (const [k, v] of r.headers || []) {
      if (k.toLowerCase() !== 'set-cookie') continue;
      const c = an.parseSetCookie(v, r.finalUrl || r.url);
      if (c) set.push({ ...c, setBy: r.finalUrl || r.url });
    }
  }
  const direct = state.page.via === 'direct';
  return html`<div class="wi-scroll" data-testid="cookies">
    ${direct ? html`<p class="wi-note">${t('wi.cookiesDirect')}</p>` : null}
    <h4>${t('wi.setByPage', set.length)}</h4>
    <${CookieTable} cookies=${set} testid="page-cookies" />
    <label class="wi-check" title=${t('wi.keepCookiesHint')}><input type="checkbox" data-testid="keep-cookies" checked=${state.keepCookies}
      onChange=${(e) => {
        state.keepCookies = e.target.checked;
        // start with the cookies of the page that is shown
        state.jar = state.keepCookies ? state.requests.reduce((jar, r) => an.storeCookies(jar, r.headers, r.finalUrl || r.url), []) : [];
        savePrefs(); render();
      }} /> ${t('wi.keepCookies')}</label>
    <small class="wi-note">${t('wi.keepCookiesHint')}</small>
    ${state.keepCookies ? html`<h4>${t('wi.stored', state.jar.length)} <button class="secondary outline wi-mini" data-testid="clear-cookies" disabled=${!state.jar.length} onClick=${() => { state.jar = []; render(); }}>${t('wi.clearCookies')}</button></h4>
      <${CookieTable} cookies=${state.jar} testid="jar" remove=${(c) => { state.jar = state.jar.filter((x) => x !== c); render(); }} />` : null}
    <p class="wi-note">${t('wi.storageNote')}</p>
  </div>`;
}

function PageTab() {
  const subs = ['preview', 'headers', 'source', 'structure', 'network', 'cookies'];
  return html`<section class="wi-page">
    <${AddressBar} />
    ${!hasRelay() ? html`<p class="wi-note" data-testid="relay-hint">${t('wi.relayHint')}</p>` : null}
    ${state.page ? html`
      <${Summary} />
      <nav class="wi-subtabs" role="tablist">${subs.map((s) => html`<button role="tab" class=${`secondary ${state.sub === s ? '' : 'outline'}`} data-testid=${`sub-${s}`} aria-selected=${state.sub === s} onClick=${() => { state.sub = s; render(); }}>${t(`wi.${s}`)}</button>`)}</nav>
      <div class="wi-sub">${state.sub === 'preview' ? html`<${Preview} />` : state.sub === 'headers' ? html`<${Headers} />` : state.sub === 'source' ? html`<${Source} />` : state.sub === 'structure' ? html`<${Structure} />` : state.sub === 'network' ? html`<${Network} />` : html`<${Cookies} />`}</div>`
      : html`<p class="wi-hint" data-testid="no-page">${t('wi.noPage')}</p>`}
  </section>`;
}

// ---- UI: HAR ----------------------------------------------------------------------------------------------------------------------

function HarDetail({ entry }) {
  const e = entry;
  const kv = (list) => html`<table class="wi-table"><tbody>${(list || []).map((h) => html`<tr><td class="wi-key">${h.name}</td><td class="wi-code">${h.value}</td></tr>`)}</tbody></table>`;
  const tabs = ['headers', 'query', 'body', 'cookies', 'timing'];
  let content;
  if (state.harDetail === 'headers') {
    content = html`<h4>${t('wi.general')}</h4><table class="wi-table"><tbody>
      <tr><td class="wi-key">URL</td><td class="wi-code">${e.request.url}</td></tr>
      <tr><td class="wi-key">${t('wi.method')}</td><td>${e.request.method}</td></tr>
      <tr><td class="wi-key">${t('wi.status')}</td><td>${e.response.status} ${e.response.statusText || ''}</td></tr>
      ${e.serverIPAddress ? html`<tr><td class="wi-key">IP</td><td>${e.serverIPAddress}</td></tr>` : null}
      <tr><td class="wi-key">HTTP</td><td>${e.response.httpVersion || e.request.httpVersion || ''}</td></tr></tbody></table>
      <h4>${t('wi.response')}</h4>${kv(e.response.headers)}<h4>${t('wi.request')}</h4>${kv(e.request.headers)}`;
  } else if (state.harDetail === 'query') {
    content = html`${kv(e.request.queryString)}${e.request.postData ? html`<h4>${t('wi.request')} ${t('wi.body')} <small>${e.request.postData.mimeType || ''}</small></h4><pre class="wi-pre" data-testid="post-data">${e.request.postData.text || ''}</pre>` : null}`;
  } else if (state.harDetail === 'body') {
    const b = an.bodyOf(e);
    if (!b) content = html`<p class="wi-hint">${t('wi.noBody')}</p>`;
    else if (b.bytes && /^image\//.test(b.mime)) content = html`<img class="wi-img" data-testid="body-image" src=${`data:${b.mime};base64,${e.response.content.text}`} alt="" />`;
    else {
      let text = b.text != null ? b.text : new TextDecoder().decode(b.bytes);
      if (/json/.test(b.mime)) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (err) { /* keep */ } }
      content = html`<pre class="wi-pre" data-testid="body-text">${text.slice(0, 500000)}</pre>`;
    }
  } else if (state.harDetail === 'cookies') {
    content = html`<h4>${t('wi.request')}</h4>${kv(e.request.cookies)}<h4>${t('wi.response')}</h4>${kv(e.response.cookies)}`;
  } else {
    const tm = e.timings || {};
    const parts = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'].map((k) => [k, Math.max(0, tm[k] || 0)]);
    const total = parts.reduce((s, [, v]) => s + v, 0) || 1;
    content = html`<table class="wi-table" data-testid="timings"><tbody>${parts.map(([k, v]) => html`<tr><td class="wi-key">${k}</td><td><span class=${`wi-bar ${k}`} style=${`width:${(v / total) * 100}%`}></span></td><td>${v.toFixed(1)} ms</td></tr>`)}</tbody></table>`;
  }
  return html`<section class="wi-har-detail" data-testid="har-detail">
    <div class="wi-row"><nav class="wi-subtabs">${tabs.map((k) => html`<button class=${`secondary ${state.harDetail === k ? '' : 'outline'}`} data-testid=${`har-${k}`} onClick=${() => { state.harDetail = k; render(); }}>${t(k === 'headers' ? 'wi.hdrs' : `wi.${k}`)}</button>`)}</nav>
      <button class="secondary outline" data-testid="copy-curl" onClick=${async () => { try { await navigator.clipboard.writeText(an.curl(e)); Suite.shell.toast(t('wi.copied')); } catch (err) { fail(err); } }}>${t('wi.copyCurl')}</button>
      <button class="secondary outline wi-close" onClick=${() => { state.harSel = null; render(); }}>×</button></div>
    <div class="wi-scroll">${content}</div>
  </section>`;
}

function HarTab() {
  if (!state.har) {
    return html`<section class="wi-har"><div class="wi-row"><button data-testid="open-har" onClick=${pickHar}>${t('wi.openHar')}</button></div><p class="wi-hint" data-testid="no-har">${t('wi.noHar')}</p></section>`;
  }
  const log = state.har.log;
  const list = harEntries();
  const starts = log.entries.map((e) => Date.parse(e.startedDateTime) || 0);
  const t0 = Math.min(...starts);
  const t1 = Math.max(...log.entries.map((e, i) => starts[i] + (e.time || 0)));
  const span = Math.max(1, t1 - t0);
  const total = log.entries.reduce((s, e) => s + sizeOf(e), 0);
  const sortBy = (key) => { state.harSort = state.harSort && state.harSort.key === key ? { key, dir: -state.harSort.dir } : { key, dir: 1 }; render(); };
  const sel = state.harSel != null ? log.entries[state.harSel] : null;
  const th = (key, label) => html`<th class="wi-sort" onClick=${() => sortBy(key)}>${label}${state.harSort && state.harSort.key === key ? (state.harSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  return html`<section class="wi-har">
    <div class="wi-row">
      <button class="secondary outline" data-testid="open-har" onClick=${pickHar}>${t('wi.openHar')}</button>
      <strong data-testid="har-name">${state.har.name}</strong>
      <small data-testid="har-totals">${t('wi.requests', log.entries.length)} · ${t('wi.transferred', fmtSize(total))} · ${(span / 1000).toFixed(2)} s</small>
    </div>
    <div class="wi-row">
      <input type="search" placeholder=${t('wi.search')} data-testid="har-filter" defaultValue=${state.harFilter} onInput=${(e) => { state.harFilter = e.target.value; render(); }} />
      <span class="wi-types">${['all', 'doc', 'xhr', 'js', 'css', 'img', 'font', 'media', 'other'].map((k) => html`<button class=${`secondary ${state.harType === k ? '' : 'outline'}`} data-testid=${`har-type-${k}`} onClick=${() => { state.harType = k; render(); }}>${k === 'all' ? t('wi.all') : k.toUpperCase()}</button>`)}</span>
    </div>
    <div class=${`wi-har-main ${sel ? 'with-detail' : ''}`}>
      <div class="wi-scroll"><table class="wi-table wi-har-table" data-testid="har-table">
        <thead><tr>${th('method', t('wi.method'))}${th('url', 'URL')}${th('status', t('wi.status'))}${th('type', t('wi.type'))}${th('size', t('wi.size'))}${th('time', t('wi.time'))}<th class="wi-wide">Waterfall</th></tr></thead>
        <tbody>${list.map(({ e, i, group }) => {
          let u;
          try { u = new URL(e.request.url); } catch (err) { u = { pathname: e.request.url, host: '', search: '' }; }
          return html`<tr data-testid="har-row" class=${`${state.harSel === i ? 'selected' : ''} ${e.response.status >= 400 || e.response.status === 0 ? 'error' : ''}`} onClick=${() => { state.harSel = i; render(); }}>
            <td>${e.request.method}</td><td class="wi-url" title=${e.request.url}>${(u.pathname.split('/').pop() || u.pathname) + (u.search || '')} <small>${u.host}</small></td>
            <td>${e.response.status}</td><td>${group}</td><td>${fmtSize(sizeOf(e))}</td><td>${Math.round(e.time || 0)} ms</td>
            <td class="wi-wide"><span class="wi-fall" style=${`margin-left:${((starts[i] - t0) / span) * 100}%;width:${Math.max(0.5, ((e.time || 0) / span) * 100)}%`}></span></td></tr>`;
        })}</tbody></table></div>
      ${sel ? html`<${HarDetail} entry=${sel} />` : null}
    </div>
  </section>`;
}

// ---- UI: bookmarklet -------------------------------------------------------------------------------------------------------------------

const bookmarkletSource = () => (document.getElementById('bookmarklet-src') || { textContent: '' }).textContent;

/** The bookmarklet as a javascript: URL (comments removed, whitespace collapsed). */
export function bookmarkletUrl() {
  const code = bookmarkletSource().replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  return `javascript:${encodeURIComponent(code)}`;
}

function BookmarkletTab() {
  const url = bookmarkletUrl();
  return html`<section class="wi-bm wi-scroll">
    <p>${t('wi.bmIntro')}</p>
    <p>${t('wi.bmDrag')} <a class="wi-bm-link" href=${url} data-testid="bookmarklet-link" onClick=${(e) => e.preventDefault()}>🔍 Inspector</a></p>
    <p>${t('wi.bmMobile')}</p>
    <div class="wi-row">
      <button data-testid="bookmarklet-copy" onClick=${async () => { try { await navigator.clipboard.writeText(url); Suite.shell.toast(t('wi.copied')); } catch (e) { fail(e); } }}>${t('wi.bmCopy')}</button>
      <button class="secondary outline" data-testid="bookmarklet-try" onClick=${() => { const s = document.createElement('script'); s.textContent = decodeURIComponent(url.slice(11)); document.body.appendChild(s); s.remove(); }}>${t('wi.bmTry')}</button>
    </div>
    <small>${t('wi.bmLimits')}</small>
    <textarea class="wi-bm-code" readonly data-testid="bookmarklet-code" rows="6">${url}</textarea>
  </section>`;
}

// ---- dialogs and layout --------------------------------------------------------------------------------------------------------------------

function PasteDialog() {
  if (!state.dialog) return null;
  return html`<dialog open data-testid="paste-dialog"><article class="wi-paste">
    <form onSubmit=${(e) => {
      e.preventDefault();
      const f = e.target.elements;
      const source = f.source.value;
      state.dialog = null;
      state.requests = [];
      setPage({ url: f.base.value.trim(), status: null, headers: null, bytes: new TextEncoder().encode(source), source, timeMs: 0, via: 'paste', type: 'text/html' });
      state.url = f.base.value.trim();
    }}>
      <label>${t('wi.pasteTitle')}<textarea name="source" rows="12" data-testid="paste-source" spellcheck="false" required></textarea></label>
      <label>${t('wi.baseUrl')}<input name="base" type="url" data-testid="paste-base" /></label>
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t('wi.cancel')}</button><button type="submit" data-testid="paste-ok">${t('wi.ok')}</button></footer>
    </form>
  </article></dialog>`;
}

function Toolbar() {
  return html`<nav class="wi-toolbar" role="tablist">
    ${['page', 'har', 'bookmarklet'].map((k) => html`<button role="tab" class=${`secondary ${state.tab === k ? '' : 'outline'}`} data-testid=${`tab-${k}`} aria-selected=${state.tab === k} onClick=${() => { state.tab = k; render(); }}>${t(`wi.${k}`)}</button>`)}
  </nav>`;
}

function Main() {
  return html`<div class="wi-layout">
    <div class="wi-content">${state.tab === 'page' ? html`<${PageTab} />` : state.tab === 'har' ? html`<${HarTab} />` : html`<${BookmarkletTab} />`}</div>
    <details class="wi-relay"><summary>${t('appdata.relay')}</summary><${data.RelayFields} /><${data.Bar} /></details>
    <${PasteDialog} /><${data.Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
function openLocal(f) {
  if (/\.(har|json)$/i.test(f.name)) openHar(f);
  else if (/\.x?html?$/i.test(f.name)) f.arrayBuffer().then((b) => { const bytes = new Uint8Array(b); state.tab = 'page'; state.requests = []; setPage({ url: '', status: null, headers: null, bytes, source: decodeBody(bytes, ''), timeMs: 0, via: 'file', type: 'text/html', name: f.name }); });
}
Suite.files.dropZone(document.body, (picked) => openLocal(picked[0].file));

Suite.bridge.receive((picked) => openLocal(picked.file), { app: 'webinspector' }); // files opened from other apps ("Open with…")

// for tests
window.WI = { state, an, bookmarkletUrl, load };
document.body.dataset.ready = 'true';
