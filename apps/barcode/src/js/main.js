/*
 * Barcodes: read QR codes and other 1D/2D barcodes from the camera, image files, dropped or pasted images, and create
 * them with forms for common contents (Wi-Fi, contact, e-mail, …). ZXing-C++ as WebAssembly (zxing-wasm, vendor/zxing)
 * reads and encodes; render.js draws the symbols as SVG and PNG; content.js interprets and builds the texts.
 */
import * as zx from 'zxing-wasm';
import { parse, build, FORMS } from '@app/content.js';
import { toSvg, toCanvas } from '@app/render.js';
import * as batch from '@app/batch.js';

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'barcode';
const IMAGE_TYPES = [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'] } }];
const FORMATS_2D = ['QRCode', 'MicroQRCode', 'DataMatrix', 'Aztec', 'PDF417'];
const FORMATS_1D = ['Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar'];
const EXAMPLES = { Code128: 'Code 128', Code39: 'CODE-39', Code93: 'CODE 93', EAN13: '400638133393', EAN8: '9638507', UPCA: '03600029145', UPCE: '0123456', ITF: '12345678', Codabar: 'A123456B' };

Suite.i18n.register({
  en: {
    'app.title': 'Barcodes',
    'bc.read': 'Read', 'bc.create': 'Create', 'bc.camera': 'Camera', 'bc.stopCamera': 'Stop camera', 'bc.openImage': 'Open image…', 'bc.switchCamera': 'Switch camera',
    'bc.readHint': 'Point the camera at a code, open an image, drop one onto this window or paste it (Ctrl+V). Several codes in one image are found together.',
    'bc.noCode': 'No barcode found in “{0}”.', 'bc.noCamera': 'The camera cannot be used: {0}', 'bc.results': 'Found codes', 'bc.clear': 'Clear',
    'bc.copy': 'Copy', 'bc.copied': 'Copied.', 'bc.openLink': 'Open link', 'bc.saveContact': 'Save contact (.vcf)', 'bc.saveEvent': 'Save event (.ics)',
    'bc.useIt': 'Edit in the generator', 'bc.format': 'Format', 'bc.content': 'Content', 'bc.type.text': 'Text', 'bc.type.url': 'Link', 'bc.type.wifi': 'Wi-Fi',
    'bc.type.contact': 'Contact', 'bc.type.email': 'E-mail', 'bc.type.phone': 'Phone number', 'bc.type.sms': 'SMS', 'bc.type.geo': 'Location', 'bc.type.otp': 'One-time password setup',
    'bc.type.event': 'Calendar event', 'bc.f.text': 'Text', 'bc.f.url': 'Address (URL)', 'bc.f.ssid': 'Network name (SSID)', 'bc.f.security': 'Security',
    'bc.f.password': 'Password', 'bc.f.hidden': 'Hidden network', 'bc.f.first': 'First name', 'bc.f.last': 'Last name', 'bc.f.org': 'Organisation', 'bc.f.title': 'Job title',
    'bc.f.phone': 'Phone', 'bc.f.email': 'E-mail', 'bc.f.street': 'Street', 'bc.f.zip': 'Postal code', 'bc.f.city': 'City', 'bc.f.country': 'Country', 'bc.f.note': 'Note',
    'bc.f.to': 'To', 'bc.f.subject': 'Subject', 'bc.f.body': 'Message', 'bc.f.number': 'Number', 'bc.f.message': 'Message', 'bc.f.lat': 'Latitude', 'bc.f.lon': 'Longitude',
    'bc.f.name': 'Name', 'bc.f.issuer': 'Issuer', 'bc.f.label': 'Account', 'bc.f.secret': 'Secret', 'bc.f.summary': 'Title', 'bc.f.start': 'Start', 'bc.f.end': 'End', 'bc.f.location': 'Place',
    'bc.f.description': 'Description', 'bc.nopass': 'none', 'bc.codes2d': '2D codes', 'bc.codes1d': '1D codes (bar codes)', 'bc.ecLevel': 'Error correction',
    'bc.ec.L': 'L – 7 %', 'bc.ec.M': 'M – 15 %', 'bc.ec.Q': 'Q – 25 %', 'bc.ec.H': 'H – 30 %', 'bc.moduleSize': 'Module size (px)', 'bc.margin': 'Quiet zone (modules)',
    'bc.barHeight': 'Bar height (px)', 'bc.showText': 'Text below the bars', 'bc.showContent': 'Show the encoded text below the code', 'bc.caption': 'Caption', 'bc.captionHint': 'Text of your own with the code, e.g. a name or a price', 'bc.captionPos': 'Caption position', 'bc.below': 'Below the code', 'bc.above': 'Above the code', 'bc.foreground': 'Colour', 'bc.background': 'Background', 'bc.transparent': 'Transparent background',
    'bc.downloadSvg': 'SVG', 'bc.downloadPng': 'PNG', 'bc.copyImage': 'Copy image', 'bc.print': 'Print', 'bc.verified': '✓ readable ({0})', 'bc.notVerified': '⚠ could not be read back',
    'bc.batch': 'Batch', 'bc.batchHint': 'Many codes at once: one content per line, or a CSV file (one row per code, with columns for the content and optionally a caption and a file name).',
    'bc.batchLines': 'Contents (one code per line)', 'bc.batchOpen': 'Open a CSV or text file…', 'bc.batchRows': '{0} rows', 'bc.batchHeader': 'The first row contains the column names',
    'bc.batchContentCol': 'Content column', 'bc.batchCaptionCol': 'Caption column', 'bc.batchNameCol': 'File name column', 'bc.none': '(none)', 'bc.column': 'Column {0}',
    'bc.batchLook': 'Size, colours, text with the code and the caption (when there is no caption column) come from', 'bc.batchOutput': 'Result',
    'bc.out.pdf': 'PDF – a sheet of labels', 'bc.out.zip-png': 'ZIP with PNG pictures', 'bc.out.zip-svg': 'ZIP with SVG pictures', 'bc.page': 'Page', 'bc.cols': 'Columns', 'bc.rows': 'Rows',
    'bc.batchRun': 'Create {0} codes', 'bc.batchFirst': 'First code:', 'bc.batchEmpty': 'Enter contents or open a file.', 'bc.batchDone': '{0} codes created',
    'bc.batchErrors': '{0} could not be encoded', 'bc.batchLine': 'Line {0}',
    'bc.size': '{0} × {1} px', 'bc.error': 'This content cannot be encoded as {0}: {1}', 'bc.fileName': 'barcode', 'bc.wifiDetails': 'Network {0}, password: {1}',
  },
  de: {
    'app.title': 'Barcodes',
    'bc.read': 'Lesen', 'bc.create': 'Erstellen', 'bc.camera': 'Kamera', 'bc.stopCamera': 'Kamera beenden', 'bc.openImage': 'Bild öffnen…', 'bc.switchCamera': 'Kamera wechseln',
    'bc.readHint': 'Halten Sie die Kamera auf einen Code, öffnen Sie ein Bild, ziehen Sie es auf dieses Fenster oder fügen Sie es ein (Strg+V). Mehrere Codes in einem Bild werden gemeinsam gefunden.',
    'bc.noCode': 'In „{0}“ wurde kein Barcode gefunden.', 'bc.noCamera': 'Die Kamera kann nicht verwendet werden: {0}', 'bc.results': 'Gefundene Codes', 'bc.clear': 'Leeren',
    'bc.copy': 'Kopieren', 'bc.copied': 'Kopiert.', 'bc.openLink': 'Link öffnen', 'bc.saveContact': 'Kontakt speichern (.vcf)', 'bc.saveEvent': 'Termin speichern (.ics)',
    'bc.useIt': 'Im Generator bearbeiten', 'bc.format': 'Format', 'bc.content': 'Inhalt', 'bc.type.text': 'Text', 'bc.type.url': 'Link', 'bc.type.wifi': 'WLAN',
    'bc.type.contact': 'Kontakt', 'bc.type.email': 'E-Mail', 'bc.type.phone': 'Telefonnummer', 'bc.type.sms': 'SMS', 'bc.type.geo': 'Ort', 'bc.type.otp': 'Einrichtung eines Einmalpassworts',
    'bc.type.event': 'Termin', 'bc.f.text': 'Text', 'bc.f.url': 'Adresse (URL)', 'bc.f.ssid': 'Netzwerkname (SSID)', 'bc.f.security': 'Sicherheit',
    'bc.f.password': 'Passwort', 'bc.f.hidden': 'Verstecktes Netzwerk', 'bc.f.first': 'Vorname', 'bc.f.last': 'Nachname', 'bc.f.org': 'Organisation', 'bc.f.title': 'Position',
    'bc.f.phone': 'Telefon', 'bc.f.email': 'E-Mail', 'bc.f.street': 'Straße', 'bc.f.zip': 'Postleitzahl', 'bc.f.city': 'Ort', 'bc.f.country': 'Land', 'bc.f.note': 'Notiz',
    'bc.f.to': 'An', 'bc.f.subject': 'Betreff', 'bc.f.body': 'Nachricht', 'bc.f.number': 'Nummer', 'bc.f.message': 'Nachricht', 'bc.f.lat': 'Breite', 'bc.f.lon': 'Länge',
    'bc.f.name': 'Name', 'bc.f.issuer': 'Aussteller', 'bc.f.label': 'Konto', 'bc.f.secret': 'Geheimnis', 'bc.f.summary': 'Titel', 'bc.f.start': 'Beginn', 'bc.f.end': 'Ende', 'bc.f.location': 'Ort',
    'bc.f.description': 'Beschreibung', 'bc.nopass': 'keine', 'bc.codes2d': '2D-Codes', 'bc.codes1d': '1D-Codes (Strichcodes)', 'bc.ecLevel': 'Fehlerkorrektur',
    'bc.ec.L': 'L – 7 %', 'bc.ec.M': 'M – 15 %', 'bc.ec.Q': 'Q – 25 %', 'bc.ec.H': 'H – 30 %', 'bc.moduleSize': 'Modulgröße (px)', 'bc.margin': 'Ruhezone (Module)',
    'bc.barHeight': 'Balkenhöhe (px)', 'bc.showText': 'Text unter den Balken', 'bc.showContent': 'Den kodierten Text unter dem Code zeigen', 'bc.caption': 'Beschriftung', 'bc.captionHint': 'Eigener Text zum Code, z. B. ein Name oder ein Preis', 'bc.captionPos': 'Position der Beschriftung', 'bc.below': 'Unter dem Code', 'bc.above': 'Über dem Code', 'bc.foreground': 'Farbe', 'bc.background': 'Hintergrund', 'bc.transparent': 'Transparenter Hintergrund',
    'bc.downloadSvg': 'SVG', 'bc.downloadPng': 'PNG', 'bc.copyImage': 'Bild kopieren', 'bc.print': 'Drucken', 'bc.verified': '✓ lesbar ({0})', 'bc.notVerified': '⚠ konnte nicht zurückgelesen werden',
    'bc.batch': 'Stapel', 'bc.batchHint': 'Viele Codes auf einmal: ein Inhalt je Zeile oder eine CSV-Datei (eine Zeile je Code, mit Spalten für den Inhalt und optional eine Beschriftung und einen Dateinamen).',
    'bc.batchLines': 'Inhalte (ein Code je Zeile)', 'bc.batchOpen': 'CSV- oder Textdatei öffnen…', 'bc.batchRows': '{0} Zeilen', 'bc.batchHeader': 'Die erste Zeile enthält die Spaltennamen',
    'bc.batchContentCol': 'Spalte mit dem Inhalt', 'bc.batchCaptionCol': 'Spalte mit der Beschriftung', 'bc.batchNameCol': 'Spalte mit dem Dateinamen', 'bc.none': '(keine)', 'bc.column': 'Spalte {0}',
    'bc.batchLook': 'Größe, Farben, Text zum Code und Beschriftung (wenn es keine Beschriftungsspalte gibt) kommen aus', 'bc.batchOutput': 'Ergebnis',
    'bc.out.pdf': 'PDF – ein Etikettenbogen', 'bc.out.zip-png': 'ZIP mit PNG-Bildern', 'bc.out.zip-svg': 'ZIP mit SVG-Bildern', 'bc.page': 'Seite', 'bc.cols': 'Spalten', 'bc.rows': 'Zeilen',
    'bc.batchRun': '{0} Codes erstellen', 'bc.batchFirst': 'Erster Code:', 'bc.batchEmpty': 'Geben Sie Inhalte ein oder öffnen Sie eine Datei.', 'bc.batchDone': '{0} Codes erstellt',
    'bc.batchErrors': '{0} nicht kodierbar', 'bc.batchLine': 'Zeile {0}',
    'bc.size': '{0} × {1} px', 'bc.error': 'Dieser Inhalt kann nicht als {0} kodiert werden: {1}', 'bc.fileName': 'barcode', 'bc.wifiDetails': 'Netzwerk {0}, Passwort: {1}',
  },
});

const state = {
  tab: 'read', results: [], camera: null, image: null, busy: false,
  gen: { type: 'text', fields: { text: 'https://example.org' }, format: 'QRCode', ecLevel: 'M', scale: 6, margin: 4, barHeight: 80, showText: true, showContent: false, caption: '', captionPos: 'below', fg: '#000000', bg: '#ffffff', transparent: false },
  output: null, // { svg, symbol, error, verified }
  batch: { text: '', file: null, rows: null, header: true, contentCol: 0, captionCol: -1, nameCol: -1, output: 'pdf', page: 'A4', gridCols: 3, gridRows: 8, busy: false, progress: 0, result: null },
};

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
}
const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// ---- ZXing ----------------------------------------------------------------------------------------

let ready = null;
function zxing() {
  if (!ready) ready = Suite.embed.bytes('zxing-wasm').then((wasmBinary) => zx.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })); // ArrayBuffer
  return ready;
}

const READER = { tryHarder: true, maxNumberOfSymbols: 16, formats: [] };

// ---- reading --------------------------------------------------------------------------------------

/** Add results (new ones first, duplicates of the same format and text only once). */
function addResults(found, source) {
  let added = 0;
  for (const r of found.filter((x) => x.isValid)) {
    if (state.results.some((x) => x.format === r.format && x.text === r.text)) continue;
    state.results.unshift({ id: Math.random().toString(36).slice(2), format: r.format, text: r.text, source, time: Date.now(), parsed: parse(r.text) });
    added++;
  }
  if (added && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* not allowed */ } }
  return added;
}

/** Image element with the opened picture and the outlines of the codes found in it. */
async function readImage(blob, name) {
  state.busy = true;
  render();
  try {
    await zxing();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(name)); i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 600;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const found = await zx.readBarcodes(g.getImageData(0, 0, canvas.width, canvas.height), READER);
    if (state.image) URL.revokeObjectURL(state.image.url);
    state.image = { url, name, width: canvas.width, height: canvas.height, found: found.filter((r) => r.isValid).map((r) => r.position) };
    if (!addResults(found, name) && !found.some((r) => r.isValid)) Suite.shell.toast(t('bc.noCode', name), 'warning');
  } catch (e) { fail(e); } finally { state.busy = false; render(); }
}

async function openImage() {
  const picked = await Suite.files.open({ types: IMAGE_TYPES, multiple: true }).catch(fail);
  if (picked) for (const p of picked) await readImage(p.file, p.file.name);
}

// ---- camera ---------------------------------------------------------------------------------------

const video = document.createElement('video');
video.playsInline = true;
video.muted = true;
video.setAttribute('data-testid', 'video');
const frame = document.createElement('canvas');

async function startCamera(deviceId = null) {
  stopCamera();
  try {
    await zxing();
    const stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    state.camera = { stream, devices, deviceId: stream.getVideoTracks()[0].getSettings().deviceId || deviceId, boxes: [] };
    state.image = null;
    render();
    scan();
  } catch (e) { Suite.shell.toast(t('bc.noCamera', e.message || e.name), 'error'); }
}

function stopCamera() {
  if (!state.camera) return;
  state.camera.stream.getTracks().forEach((x) => x.stop());
  video.srcObject = null;
  state.camera = null;
  render();
}

function switchCamera() {
  const c = state.camera;
  if (!c || c.devices.length < 2) return;
  const i = c.devices.findIndex((d) => d.deviceId === c.deviceId);
  startCamera(c.devices[(i + 1) % c.devices.length].deviceId);
}

/** Read frames of the camera (about five per second) until it is stopped. */
async function scan() {
  const cam = state.camera;
  if (!cam || state.camera !== cam) return;
  if (video.videoWidth) {
    const w = Math.min(1280, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
    frame.width = w; frame.height = h;
    const g = frame.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, w, h);
    try {
      const found = (await zx.readBarcodes(g.getImageData(0, 0, w, h), READER)).filter((r) => r.isValid);
      cam.boxes = found.map((r) => r.position);
      cam.size = { w, h };
      if (addResults(found, t('bc.camera'))) render(); else drawOverlay();
    } catch (e) { console.warn(e); }
  }
  setTimeout(() => requestAnimationFrame(scan), 200);
}

function drawOverlay() {
  const c = document.querySelector('[data-testid=overlay]');
  const cam = state.camera;
  const src = cam ? { boxes: cam.boxes, w: cam.size?.w, h: cam.size?.h } : state.image ? { boxes: state.image.found, w: state.image.width, h: state.image.height } : null;
  if (!c || !src || !src.w) return;
  c.width = src.w; c.height = src.h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.lineWidth = Math.max(3, src.w / 200);
  g.strokeStyle = '#2ecc71';
  g.fillStyle = 'rgba(46, 204, 113, .18)';
  for (const p of src.boxes) {
    g.beginPath();
    g.moveTo(p.topLeft.x, p.topLeft.y); g.lineTo(p.topRight.x, p.topRight.y); g.lineTo(p.bottomRight.x, p.bottomRight.y); g.lineTo(p.bottomLeft.x, p.bottomLeft.y);
    g.closePath(); g.fill(); g.stroke();
  }
}

// ---- generating -----------------------------------------------------------------------------------

const linear = (format) => FORMATS_1D.includes(format);
const genText = () => build(state.gen.type, state.gen.fields);

/** Drawing options of the generator settings for a content (and a caption of its own, default the generator's). */
function styleOptions(g, text, caption = g.caption) {
  const lin = linear(g.format);
  return { scale: g.scale, margin: g.margin, linear: lin, barHeight: g.barHeight, text: (lin ? g.showText : g.showContent) ? text : '', caption, captionPos: g.captionPos, fg: g.fg, bg: g.transparent ? 'transparent' : g.bg };
}

let generation = 0;
async function generate() {
  const g = state.gen;
  const text = genText();
  const id = ++generation;
  try {
    await zxing();
    const options = g.format === 'QRCode' || g.format === 'MicroQRCode' ? `ecLevel=${g.ecLevel}` : '';
    const r = await zx.writeBarcode(text, { format: g.format, options });
    if (id !== generation) return;
    if (r.error) { state.output = { error: t('bc.error', g.format, r.error.replace(/\s*\(retval.*$/, '')), text }; render(); return; }
    const opts = styleOptions(g, text);
    const svg = toSvg(r.symbol, opts);
    // read the result back as a check (white background, so that light-on-dark codes are recognised as well)
    const check = toCanvas(r.symbol, { ...opts, bg: g.transparent ? '#ffffff' : opts.bg });
    const back = await zx.readBarcodes(check.getContext('2d').getImageData(0, 0, check.width, check.height), { ...READER, tryInvert: true });
    if (id !== generation) return;
    // EAN/UPC add the check digit when it is missing
    const same = (x) => x.isValid && (x.text === text || (/^(EAN|UPC)/.test(g.format) && x.text.length === text.length + 1 && x.text.startsWith(text)));
    const hit = back.find(same);
    state.output = { svg, symbol: r.symbol, opts, text, verified: hit ? hit.format : null, width: check.width, height: check.height };
  } catch (e) { state.output = { error: Suite.i18n.describe(e), text }; }
  render();
}

function setGen(changes) { Object.assign(state.gen, changes); generate(); render(); }

function setFormat(format) {
  const g = state.gen;
  // linear codes need fitting content: start from an example
  if (linear(format) && (g.type !== 'text' || !g.fields.text || /[^\x20-\x7e]/.test(g.fields.text) || g.fields.text.length > 40)) setGen({ format, type: 'text', fields: { text: EXAMPLES[format] } });
  else setGen({ format });
}

const stem = () => (genText().replace(/^[a-z]+:\/*/i, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || t('bc.fileName'));

function downloadSvg() {
  if (!state.output || !state.output.svg) return;
  Suite.files.download(new TextEncoder().encode(state.output.svg), `${stem()}.svg`, 'image/svg+xml');
}

function pngBlob() {
  const o = state.output;
  const canvas = toCanvas(o.symbol, o.opts);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function downloadPng() {
  if (!state.output || !state.output.svg) return;
  const blob = await pngBlob();
  Suite.files.download(new Uint8Array(await blob.arrayBuffer()), `${stem()}.png`, 'image/png');
}

async function copyImage() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
    Suite.shell.toast(t('bc.copied'));
  } catch (e) { fail(e); }
}

function printCode() {
  document.body.classList.add('bc-printing');
  const done = () => { document.body.classList.remove('bc-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/** Take a read result into the generator. */
function useInGenerator(r) {
  const p = r.parsed;
  const type = FORMS[p.type] ? p.type : 'text';
  const fields = type === 'text' ? { text: r.text } : { ...p.fields };
  const format = FORMATS_2D.includes(r.format) || FORMATS_1D.includes(r.format) ? r.format : 'QRCode';
  state.tab = 'create';
  setGen({ type, fields, format });
}

// ---- UI -------------------------------------------------------------------------------------------

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); Suite.shell.toast(t('bc.copied')); } catch (e) { fail(e); }
}

function ResultActions({ r }) {
  const p = r.parsed;
  const f = p.fields;
  const safeUrl = p.type === 'url' && /^https?:\/\//i.test(f.url) ? f.url : null;
  return html`<div class="bc-actions">
    <button class="secondary outline" data-testid="copy-text" onClick=${() => copyText(r.text)}>${Suite.icon('copy')} ${t('bc.copy')}</button>
    ${safeUrl ? html`<a role="button" class="secondary outline" data-testid="open-link" href=${safeUrl} target="_blank" rel="noopener noreferrer">${Suite.icon('external-link')} ${t('bc.openLink')}</a>` : null}
    ${p.type === 'wifi' && f.password ? html`<button class="secondary outline" data-testid="copy-password" onClick=${() => copyText(f.password)}>${Suite.icon('key-round')} ${t('bc.f.password')}</button>` : null}
    ${p.type === 'contact' ? html`<button class="secondary outline" data-testid="save-contact" onClick=${() => Suite.files.download(new TextEncoder().encode(/^BEGIN:VCARD/i.test(r.text.trim()) ? r.text : build('contact', f)), `${(f.name || 'contact').replace(/[^\w.-]+/g, '_')}.vcf`, 'text/vcard')}>${Suite.icon('user')} ${t('bc.saveContact')}</button>` : null}
    ${p.type === 'event' ? html`<button class="secondary outline" data-testid="save-event" onClick=${() => Suite.files.download(new TextEncoder().encode(/BEGIN:VCALENDAR/i.test(r.text) ? r.text : `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Portable Web App Suite//Barcodes//EN\r\n${r.text.trim()}\r\nEND:VCALENDAR\r\n`), 'event.ics', 'text/calendar')}>${Suite.icon('calendar')} ${t('bc.saveEvent')}</button>` : null}
    <button class="secondary outline" data-testid="use-it" onClick=${() => useInGenerator(r)}>${Suite.icon('pencil')} ${t('bc.useIt')}</button>
  </div>`;
}

function Details({ p }) {
  const entries = Object.entries(p.fields).filter(([k, v]) => v !== '' && v !== false && k !== 'text' && !(p.type === 'url'));
  if (!entries.length) return null;
  return html`<dl class="bc-details">${entries.map(([k, v]) => html`<dt>${t(`bc.f.${k}`)}</dt><dd>${v === true ? Suite.icon('check') : String(v)}</dd>`)}</dl>`;
}

function Read() {
  const cam = state.camera;
  const showStage = cam || state.image;
  return html`<section class="bc-read">
    <div class="bc-bar">
      ${cam ? html`<button data-testid="camera" onClick=${stopCamera}>${Suite.icon('square')} ${t('bc.stopCamera')}</button>
          ${cam.devices.length > 1 ? html`<button class="secondary outline" data-testid="switch-camera" onClick=${switchCamera}>${Suite.icon('refresh-cw')} ${t('bc.switchCamera')}</button>` : null}`
        : html`<button data-testid="camera" onClick=${() => startCamera()}>${Suite.icon('camera')} ${t('bc.camera')}</button>`}
      <button class="secondary" data-testid="open-image" onClick=${openImage} aria-busy=${state.busy}>${Suite.icon('image')} ${t('bc.openImage')}</button>
    </div>
    ${showStage ? html`<div class="bc-stage" data-testid="stage">
        ${cam ? html`<div class="bc-media" ref=${(el) => { if (el && video.parentElement !== el) el.prepend(video); }}></div>` : html`<img src=${state.image.url} alt=${state.image.name} data-testid="image" />`}
        <canvas class="bc-overlay" data-testid="overlay" ref=${() => requestAnimationFrame(drawOverlay)}></canvas></div>`
      : html`<p class="bc-hint" data-testid="hint">${t('bc.readHint')}</p>`}
    ${state.results.length ? html`<div class="bc-results-head"><strong>${t('bc.results')}</strong><button class="secondary outline" data-testid="clear" onClick=${() => { state.results = []; render(); }}>${t('bc.clear')}</button></div>` : null}
    <ul class="bc-results" data-testid="results">${state.results.map((r) => html`<li key=${r.id} data-testid="result">
      <div class="bc-result-head"><span class="bc-badge" data-testid="result-type">${t(`bc.type.${r.parsed.type}`)}</span><small data-testid="result-format">${r.format}</small><small>${r.source}</small></div>
      <pre class="bc-text" data-testid="result-text">${r.text}</pre>
      <${Details} p=${r.parsed} />
      <${ResultActions} r=${r} />
    </li>`)}</ul>
  </section>`;
}

function Field({ k, kind }) {
  const g = state.gen;
  const value = g.fields[k] ?? '';
  const set = (v) => { g.fields = { ...g.fields, [k]: v }; generate(); render(); };
  if (Array.isArray(kind)) return html`<label>${t(`bc.f.${k}`)}<select data-testid=${`field-${k}`} onChange=${(e) => set(e.target.value)}>${kind.map((o) => html`<option value=${o} selected=${(value || kind[0]) === o}>${o === 'nopass' ? t('bc.nopass') : o}</option>`)}</select></label>`;
  if (kind === 'checkbox') return html`<label class="bc-check"><input type="checkbox" data-testid=${`field-${k}`} checked=${!!value} onChange=${(e) => set(e.target.checked)} /> ${t(`bc.f.${k}`)}</label>`;
  if (kind === 'textarea') return html`<label>${t(`bc.f.${k}`)}<textarea rows=${k === 'text' ? 4 : 2} data-testid=${`field-${k}`} value=${value} onInput=${(e) => set(e.target.value)}></textarea></label>`;
  return html`<label>${t(`bc.f.${k}`)}<input type=${kind} step="any" data-testid=${`field-${k}`} value=${value} onInput=${(e) => set(e.target.value)} /></label>`;
}

function Create() {
  const g = state.gen;
  const o = state.output;
  const lin = linear(g.format);
  return html`<section class="bc-create">
    <div class="bc-form">
      <label>${t('bc.content')}<select data-testid="content-type" onChange=${(e) => { const type = e.target.value; setGen({ type, fields: type === 'wifi' ? { security: 'WPA' } : type === 'text' ? { text: genText() } : {} }); }}>
        ${Object.keys(FORMS).map((k) => html`<option value=${k} selected=${g.type === k}>${t(`bc.type.${k}`)}</option>`)}</select></label>
      ${FORMS[g.type].map(([k, kind]) => html`<${Field} k=${k} kind=${kind} key=${`${g.type}-${k}`} />`)}
      <label>${t('bc.format')}<select data-testid="format" onChange=${(e) => setFormat(e.target.value)}>
        <optgroup label=${t('bc.codes2d')}>${FORMATS_2D.map((f) => html`<option value=${f} selected=${g.format === f}>${zx.formatToLabel ? zx.formatToLabel(f) : f}</option>`)}</optgroup>
        <optgroup label=${t('bc.codes1d')}>${FORMATS_1D.map((f) => html`<option value=${f} selected=${g.format === f}>${zx.formatToLabel ? zx.formatToLabel(f) : f}</option>`)}</optgroup></select></label>
      ${g.format === 'QRCode' || g.format === 'MicroQRCode' ? html`<label>${t('bc.ecLevel')}<select data-testid="ec-level" onChange=${(e) => setGen({ ecLevel: e.target.value })}>
        ${['L', 'M', 'Q', 'H'].map((l) => html`<option value=${l} selected=${g.ecLevel === l}>${t(`bc.ec.${l}`)}</option>`)}</select></label>` : null}
      <div class="bc-grid">
        <label>${t('bc.moduleSize')}<input type="number" min="1" max="40" data-testid="scale" value=${g.scale} onInput=${(e) => setGen({ scale: Math.max(1, Math.min(40, +e.target.value || 1)) })} /></label>
        <label>${t('bc.margin')}<input type="number" min="0" max="20" data-testid="margin" value=${g.margin} onInput=${(e) => setGen({ margin: Math.max(0, Math.min(20, +e.target.value || 0)) })} /></label>
        ${lin ? html`<label>${t('bc.barHeight')}<input type="number" min="10" max="600" data-testid="bar-height" value=${g.barHeight} onInput=${(e) => setGen({ barHeight: Math.max(10, +e.target.value || 10) })} /></label>` : null}
        <label>${t('bc.foreground')}<input type="color" data-testid="fg" value=${g.fg} onInput=${(e) => setGen({ fg: e.target.value })} /></label>
        <label>${t('bc.background')}<input type="color" data-testid="bg" value=${g.bg} disabled=${g.transparent} onInput=${(e) => setGen({ bg: e.target.value })} /></label>
      </div>
      <label class="bc-check"><input type="checkbox" data-testid="show-text" checked=${lin ? g.showText : g.showContent} onChange=${(e) => setGen(lin ? { showText: e.target.checked } : { showContent: e.target.checked })} /> ${t(lin ? 'bc.showText' : 'bc.showContent')}</label>
      <label>${t('bc.caption')}<textarea rows="2" data-testid="caption" value=${g.caption} placeholder=${t('bc.captionHint')} onInput=${(e) => setGen({ caption: e.target.value })}></textarea></label>
      ${g.caption ? html`<label>${t('bc.captionPos')}<select data-testid="caption-pos" onChange=${(e) => setGen({ captionPos: e.target.value })}>
        <option value="below" selected=${g.captionPos === 'below'}>${t('bc.below')}</option><option value="above" selected=${g.captionPos === 'above'}>${t('bc.above')}</option></select></label>` : null}
      <label class="bc-check"><input type="checkbox" data-testid="transparent" checked=${g.transparent} onChange=${(e) => setGen({ transparent: e.target.checked })} /> ${t('bc.transparent')}</label>
    </div>
    <div class="bc-output" data-testid="output">
      ${o && o.error ? html`<p class="bc-error" data-testid="gen-error">${o.error}</p>` : null}
      ${o && o.svg ? html`<div class="bc-preview" id="bc-print" data-testid="preview" dangerouslySetInnerHTML=${{ __html: o.svg }}></div>
        <p class="bc-meta"><span data-testid="verified" class=${o.verified ? 'bc-ok' : 'bc-error'}>${o.verified ? t('bc.verified', o.verified) : t('bc.notVerified')}</span> · <span data-testid="size">${t('bc.size', o.width, o.height)}</span></p>
        <div class="bc-actions">
          <button data-testid="download-svg" onClick=${downloadSvg}>${Suite.icon('download')} ${t('bc.downloadSvg')}</button>
          <button data-testid="download-png" onClick=${downloadPng}>${Suite.icon('download')} ${t('bc.downloadPng')}</button>
          <button class="secondary outline" data-testid="copy-image" onClick=${copyImage}>${Suite.icon('copy')} ${t('bc.copyImage')}</button>
          <button class="secondary outline" data-testid="print" onClick=${printCode}>${Suite.icon('printer')} ${t('bc.print')}</button>
        </div>
        <details><summary>${t('bc.content')}</summary><pre class="bc-text" data-testid="gen-text">${o.text}</pre></details>` : null}
    </div>
  </section>`;
}

// ---- batch ----------------------------------------------------------------------------------------

function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
}

async function openBatchFile() {
  try {
    const picked = await Suite.files.open({ types: [{ description: 'CSV / Text', accept: { 'text/plain': ['.csv', '.txt', '.tsv'] } }] });
    if (!picked) return;
    const text = decodeText(new Uint8Array(await picked[0].file.arrayBuffer()));
    const rows = Suite.csv.parse(text);
    const b = state.batch;
    if (rows.every((r) => r.length === 1)) Object.assign(b, { text, file: null, rows: null }); // (a list: one code per line)
    else Object.assign(b, { file: picked[0].file.name, rows, header: true, contentCol: 0, captionCol: -1, nameCol: -1 });
    b.result = null;
    render();
  } catch (e) { fail(e); }
}

const batchItems = () => { const b = state.batch; return batch.items(b.rows ? { rows: b.rows, header: b.header, contentCol: b.contentCol, captionCol: b.captionCol, nameCol: b.nameCol } : { text: b.text }); };

async function encodeFor(format, ecLevel) {
  await zxing();
  const options = format === 'QRCode' || format === 'MicroQRCode' ? `ecLevel=${ecLevel}` : '';
  return async (content) => {
    const r = await zx.writeBarcode(content, { format, options });
    if (r.error) throw new Error(r.error.replace(/\s*\(retval.*$/, ''));
    return r.symbol;
  };
}

async function runBatch() {
  const b = state.batch;
  const list = batchItems();
  if (!list.length || b.busy) return;
  const g = state.gen;
  b.busy = true; b.progress = 0; b.result = null;
  render();
  try {
    const encode = await encodeFor(g.format, g.ecLevel);
    const draw = (symbol, it) => {
      const opts = styleOptions(g, it.content, it.caption != null ? it.caption : g.caption);
      return { svg: toSvg(symbol, opts), canvas: () => toCanvas(symbol, opts) };
    };
    const r = await batch.run(list, { encode, draw, output: b.output, page: b.page, cols: b.gridCols, rows: b.gridRows, onProgress: (i, n) => { b.progress = n ? i / n : 1; render(); } });
    b.result = { done: r.done, errors: r.errors };
    if (r.done) {
      const name = `${batch.fileStem(b.file ? b.file.replace(/\.[^.]+$/, '') : t('bc.fileName'))}-${g.format}.${r.ext}`;
      const saved = await Suite.files.saveAs(r.bytes, { suggestedName: name, types: [{ description: r.ext.toUpperCase(), accept: { [r.type]: [`.${r.ext}`] } }], type: r.type });
      if (saved) { if (saved.mode === 'downloaded') Suite.shell.banner(saved.message); else Suite.shell.toast(saved.message); }
    }
  } catch (e) { fail(e); } finally { b.busy = false; render(); }
}

function Batch() {
  const b = state.batch;
  const g = state.gen;
  const list = batchItems();
  const header = b.rows ? (b.header ? b.rows[0] : b.rows[0].map((_, i) => t('bc.column', i + 1))) : [];
  const colSelect = (key, testid, allowNone) => html`<select data-testid=${testid} onChange=${(e) => { b[key] = +e.target.value; b.result = null; render(); }}>
    ${allowNone ? html`<option value="-1" selected=${b[key] < 0}>${t('bc.none')}</option>` : null}
    ${header.map((h, i) => html`<option value=${i} selected=${b[key] === i}>${h || t('bc.column', i + 1)}</option>`)}</select>`;
  const first = list[0];
  return html`<section class="bc-create bc-batch">
    <div class="bc-form">
      <p><small>${t('bc.batchHint')}</small></p>
      ${b.rows ? html`<p class="bc-file" data-testid="batch-file">${Suite.icon('file')} ${b.file} · ${t('bc.batchRows', b.rows.length)}
          <button type="button" class="secondary outline" onClick=${() => { Object.assign(b, { file: null, rows: null, result: null }); render(); }}>×</button></p>
          <label class="bc-check"><input type="checkbox" data-testid="batch-header" checked=${b.header} onChange=${(e) => { b.header = e.target.checked; render(); }} /> ${t('bc.batchHeader')}</label>
          <label>${t('bc.batchContentCol')}${colSelect('contentCol', 'batch-content-col', false)}</label>
          <label>${t('bc.batchCaptionCol')}${colSelect('captionCol', 'batch-caption-col', true)}</label>
          <label>${t('bc.batchNameCol')}${colSelect('nameCol', 'batch-name-col', true)}</label>`
        : html`<label>${t('bc.batchLines')}<textarea rows="8" data-testid="batch-text" value=${b.text} placeholder=${'https://example.org/1\nhttps://example.org/2'} onInput=${(e) => { b.text = e.target.value; b.result = null; render(); }}></textarea></label>`}
      <button type="button" class="secondary outline" data-testid="batch-open" onClick=${openBatchFile}>${Suite.icon('folder-open')} ${t('bc.batchOpen')}</button>
      <label>${t('bc.format')}<select data-testid="batch-format" onChange=${(e) => { setGen({ format: e.target.value }); state.batch.result = null; }}>
        <optgroup label=${t('bc.codes2d')}>${FORMATS_2D.map((f) => html`<option value=${f} selected=${g.format === f}>${zx.formatToLabel ? zx.formatToLabel(f) : f}</option>`)}</optgroup>
        <optgroup label=${t('bc.codes1d')}>${FORMATS_1D.map((f) => html`<option value=${f} selected=${g.format === f}>${zx.formatToLabel ? zx.formatToLabel(f) : f}</option>`)}</optgroup></select></label>
      <p><small>${t('bc.batchLook')} <a href="#" onClick=${(e) => { e.preventDefault(); state.tab = 'create'; render(); }}>${t('bc.create')}</a></small></p>
      <label>${t('bc.batchOutput')}<select data-testid="batch-output" onChange=${(e) => { b.output = e.target.value; render(); }}>
        ${['pdf', 'zip-png', 'zip-svg'].map((o) => html`<option value=${o} selected=${b.output === o}>${t(`bc.out.${o}`)}</option>`)}</select></label>
      ${b.output === 'pdf' ? html`<div class="bc-grid">
        <label>${t('bc.page')}<select data-testid="batch-page" onChange=${(e) => { b.page = e.target.value; render(); }}>${Object.keys(batch.PAGES).map((k) => html`<option selected=${b.page === k}>${k}</option>`)}</select></label>
        <label>${t('bc.cols')}<input type="number" min="1" max="10" data-testid="batch-cols" value=${b.gridCols} onInput=${(e) => { b.gridCols = Math.max(1, Math.min(10, +e.target.value || 1)); render(); }} /></label>
        <label>${t('bc.rows')}<input type="number" min="1" max="20" data-testid="batch-rows" value=${b.gridRows} onInput=${(e) => { b.gridRows = Math.max(1, Math.min(20, +e.target.value || 1)); render(); }} /></label>
      </div>` : null}
      <button type="button" data-testid="batch-run" disabled=${!list.length || b.busy} aria-busy=${b.busy} onClick=${runBatch}>${t('bc.batchRun', list.length)}</button>
      ${b.busy ? html`<progress value=${b.progress} max="1"></progress>` : null}
    </div>
    <div class="bc-output" data-testid="batch-output-panel">
      ${first ? html`<p><small>${t('bc.batchFirst')}</small></p><pre class="bc-text" data-testid="batch-first">${first.content}${first.caption ? `\n— ${first.caption}` : ''}</pre>` : html`<p class="bc-meta">${t('bc.batchEmpty')}</p>`}
      ${b.result ? html`<p data-testid="batch-result" class=${b.result.errors.length ? 'bc-error' : 'bc-ok'}>${t('bc.batchDone', b.result.done)}${b.result.errors.length ? ` · ${t('bc.batchErrors', b.result.errors.length)}` : ''}</p>
        ${b.result.errors.length ? html`<ul class="bc-errors" data-testid="batch-errors">${b.result.errors.slice(0, 50).map((e) => html`<li>${t('bc.batchLine', e.line)}: <code>${e.content}</code> – ${e.message}</li>`)}</ul>` : null}` : null}
    </div>
  </section>`;
}

function Toolbar() {
  return html`<nav class="bc-toolbar" role="tablist">
    ${['read', 'create', 'batch'].map((k) => html`<button role="tab" class=${state.tab === k ? '' : 'secondary outline'} aria-selected=${state.tab === k} data-testid=${`tab-${k}`}
      onClick=${() => { state.tab = k; if (k !== 'read') stopCamera(); if (k !== 'read' && !state.output) generate(); render(); }}>${k === 'read' ? Suite.icon('camera') : k === 'create' ? Suite.icon('qr-code') : Suite.icon('files')} ${t(`bc.${k}`)}</button>`)}
  </nav>`;
}

function Main() {
  return html`<div class="bc-main">${state.tab === 'read' ? html`<${Read} />` : state.tab === 'batch' ? html`<${Batch} />` : html`<${Create} />`}</div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, async (picked) => { state.tab = 'read'; stopCamera(); for (const p of picked) await readImage(p.file, p.file.name); });
document.addEventListener('paste', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const file = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
  if (file) { e.preventDefault(); state.tab = 'read'; stopCamera(); readImage(file.getAsFile(), 'clipboard'); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); state.tab = 'read'; render(); openImage(); }
});
Suite.bridge.receive((picked) => { state.tab = 'read'; readImage(picked.file, picked.file.name); }, { app: APP }); // images opened from other apps
zxing().catch(fail);

// for tests
window.BC = { state, runBatch, batch, readImage, generate, setGen, parse, build, zxing, get zx() { return zx; } };
document.body.dataset.ready = 'true';
