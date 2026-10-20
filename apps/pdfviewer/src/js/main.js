/*
 * PDF viewer: PDF.js with its viewer components (pages, text layer, links, forms, annotation editor, search),
 * thumbnails, outline, printing, password-protected files, page operations (rotate, move, delete, extract, insert other
 * PDFs; pages.js with pdf-lib) with undo. Runs in the shared app shell.
 */
import * as pdfjsLib from "pdfjs-dist";
import * as pages from "@app/pages.js";
import { verifySignatures } from "@app/signatures.js";

globalThis.pdfjsLib = pdfjsLib; // pdf_viewer.mjs reads the library from this global
const { EventBus, PDFViewer, PDFLinkService, PDFFindController } = await import("pdfjs-dist/web/pdf_viewer");

const { html } = Suite.shell;
const t = Suite.t;
const APP = "pdfviewer";
const { AnnotationEditorType, AnnotationMode, PasswordResponses } = pdfjsLib;

Suite.i18n.register({
  en: {
    'pv.zoom': 'Zoom',
    "app.title": "PDF viewer",
    "pv.open": "Open", "pv.save": "Save", "pv.saveAs": "Save as", "pv.print": "Print", "pv.sidebar": "Sidebar",
    "pv.signatures": "Signatures", "pv.sigValid": "Signed by {0} – the signature is valid", "pv.sigInvalid": "Signed by {0} – the signature is NOT valid",
    "pv.sigChanged": "Signed by {0} – the document was changed after signing", "pv.sigCount": "{0} signatures", "pv.sigDetails": "Details",
    "pv.sigIntegrity": "Document unchanged since signing", "pv.sigIntegrityBad": "The signed content was changed", "pv.sigSignatureOk": "Signature matches the certificate",
    "pv.sigSignatureBad": "Signature does not match the certificate", "pv.sigCoversAll": "Covers the whole file", "pv.sigAppended": "{0} bytes were added after signing (later changes, e.g. form data or further signatures)",
    "pv.sigSigner": "Signer", "pv.sigIssuer": "Issued by", "pv.sigValidity": "Certificate valid", "pv.sigSelfSigned": "self-signed certificate", "pv.sigExpired": "the certificate has expired",
    "pv.sigReason": "Reason", "pv.sigLocation": "Location", "pv.sigDate": "Signed on", "pv.sigChain": "Certificate chain", "pv.sigTrust": "Whether the certificate is trustworthy is not checked: there is no store of trusted root certificates offline. Compare the certificate with the signer if in doubt.",
    "pv.sigError": "The signature cannot be checked: {0}", "pv.sigLinkOk": "signature of the issuer verified", "pv.sigLinkBad": "issuer signature NOT valid", "pv.sigLinkMissing": "issuer certificate not included",
    "pv.previous": "Previous page", "pv.next": "Next page", "pv.page": "Page", "pv.of": "of {0}",
    "pv.zoomIn": "Zoom in", "pv.zoomOut": "Zoom out", "pv.auto": "Automatic", "pv.pageFit": "Whole page", "pv.pageWidth": "Page width",
    "pv.rotate": "Rotate", "pv.find": "Find", "pv.findNext": "Next", "pv.findPrevious": "Previous", "pv.matchCase": "Match case",
    "pv.matches": "{0} of {1} matches", "pv.noMatches": "No matches",
    "pv.thumbnails": "Pages", "pv.outline": "Outline", "pv.noOutline": "This document has no outline.",
    "pv.sign": "Sign", "pv.signTitle": "Signature", "pv.signDraw": "Draw your signature in the field.", "pv.signType": "or type your name",
    "pv.signClear": "Clear", "pv.signPlace": "Place", "pv.signCancel": "Cancel", "pv.signWhere": "Click or tap where the signature should go (Esc cancels).",
    "pv.signEmpty": "Draw or type a signature first.", "pv.signed": "The signature was added to page {0}.",
    "pv.edit": "Annotate", "pv.editNone": "Select / fill in forms", "pv.editHighlight": "Highlight", "pv.editText": "Text", "pv.editInk": "Draw",
    "pv.passwordTitle": "Password required", "pv.passwordPrompt": "“{0}” is protected. Please enter the password.",
    "pv.passwordWrong": "Wrong password, please try again.", "pv.empty": "Open a PDF file or drop it here.",
    "pv.openFailed": "The PDF file could not be opened: {0}", "pv.preparingPrint": "Preparing the pages for printing…",
    "pv.pages": "Pages", "pv.pagesHint": "Selected pages ({0})", "pv.rotateLeft": "Rotate left", "pv.rotateRight": "Rotate right",
    "pv.moveUp": "Move earlier", "pv.moveDown": "Move later", "pv.moveTo": "Move to position…", "pv.deletePages": "Delete",
    "pv.extract": "Extract as new PDF…", "pv.insertPdf": "Insert PDF after…", "pv.appendPdf": "Append PDF…", "pv.undo": "Undo",
    "pv.selectAll": "Select all pages", "pv.selectNone": "Clear selection", "pv.selectPage": "Select page {0}",
    "pv.position": "New position of the first selected page", "pv.encrypted": "Pages of a protected PDF cannot be changed.",
    "pv.pagesFailed": "The pages could not be changed: {0}", "pv.deleted": "{0} page(s) deleted", "pv.inserted": "{0} page(s) inserted",
  },
  de: {
    'pv.zoom': 'Zoom',
    "app.title": "PDF-Betrachter",
    "pv.open": "Öffnen", "pv.save": "Speichern", "pv.saveAs": "Speichern unter", "pv.print": "Drucken", "pv.sidebar": "Seitenleiste",
    "pv.signatures": "Signaturen", "pv.sigValid": "Signiert von {0} – die Signatur ist gültig", "pv.sigInvalid": "Signiert von {0} – die Signatur ist NICHT gültig",
    "pv.sigChanged": "Signiert von {0} – das Dokument wurde nach dem Signieren geändert", "pv.sigCount": "{0} Signaturen", "pv.sigDetails": "Details",
    "pv.sigIntegrity": "Dokument seit dem Signieren unverändert", "pv.sigIntegrityBad": "Der signierte Inhalt wurde verändert", "pv.sigSignatureOk": "Signatur passt zum Zertifikat",
    "pv.sigSignatureBad": "Signatur passt nicht zum Zertifikat", "pv.sigCoversAll": "Umfasst die ganze Datei", "pv.sigAppended": "Nach dem Signieren wurden {0} Byte hinzugefügt (spätere Änderungen, z. B. Formulardaten oder weitere Signaturen)",
    "pv.sigSigner": "Unterzeichner", "pv.sigIssuer": "Ausgestellt von", "pv.sigValidity": "Zertifikat gültig", "pv.sigSelfSigned": "selbst signiertes Zertifikat", "pv.sigExpired": "das Zertifikat ist abgelaufen",
    "pv.sigReason": "Grund", "pv.sigLocation": "Ort", "pv.sigDate": "Signiert am", "pv.sigChain": "Zertifikatskette", "pv.sigTrust": "Ob das Zertifikat vertrauenswürdig ist, wird nicht geprüft: offline gibt es keinen Speicher vertrauenswürdiger Stammzertifikate. Vergleichen Sie im Zweifel das Zertifikat mit dem Unterzeichner.",
    "pv.sigError": "Die Signatur kann nicht geprüft werden: {0}", "pv.sigLinkOk": "Signatur des Ausstellers geprüft", "pv.sigLinkBad": "Signatur des Ausstellers NICHT gültig", "pv.sigLinkMissing": "Zertifikat des Ausstellers nicht enthalten",
    "pv.previous": "Vorherige Seite", "pv.next": "Nächste Seite", "pv.page": "Seite", "pv.of": "von {0}",
    "pv.zoomIn": "Vergrößern", "pv.zoomOut": "Verkleinern", "pv.auto": "Automatisch", "pv.pageFit": "Ganze Seite", "pv.pageWidth": "Seitenbreite",
    "pv.rotate": "Drehen", "pv.find": "Suchen", "pv.findNext": "Weiter", "pv.findPrevious": "Zurück", "pv.matchCase": "Groß-/Kleinschreibung",
    "pv.matches": "{0} von {1} Treffern", "pv.noMatches": "Keine Treffer",
    "pv.thumbnails": "Seiten", "pv.outline": "Inhalt", "pv.noOutline": "Dieses Dokument hat kein Inhaltsverzeichnis.",
    "pv.sign": "Unterschreiben", "pv.signTitle": "Unterschrift", "pv.signDraw": "Zeichnen Sie Ihre Unterschrift in das Feld.", "pv.signType": "oder tippen Sie Ihren Namen",
    "pv.signClear": "Löschen", "pv.signPlace": "Platzieren", "pv.signCancel": "Abbrechen", "pv.signWhere": "Klicken oder tippen Sie dorthin, wo die Unterschrift hin soll (Esc bricht ab).",
    "pv.signEmpty": "Zeichnen oder tippen Sie zuerst eine Unterschrift.", "pv.signed": "Die Unterschrift wurde auf Seite {0} eingefügt.",
    "pv.edit": "Kommentieren", "pv.editNone": "Auswählen / Formulare ausfüllen", "pv.editHighlight": "Markieren", "pv.editText": "Text", "pv.editInk": "Zeichnen",
    "pv.passwordTitle": "Passwort erforderlich", "pv.passwordPrompt": "„{0}“ ist geschützt. Bitte geben Sie das Passwort ein.",
    "pv.passwordWrong": "Falsches Passwort, bitte erneut versuchen.", "pv.empty": "Öffnen Sie eine PDF-Datei oder legen Sie sie hier ab.",
    "pv.openFailed": "Die PDF-Datei konnte nicht geöffnet werden: {0}", "pv.preparingPrint": "Die Seiten werden für den Druck vorbereitet…",
    "pv.pages": "Seiten", "pv.pagesHint": "Ausgewählte Seiten ({0})", "pv.rotateLeft": "Nach links drehen", "pv.rotateRight": "Nach rechts drehen",
    "pv.moveUp": "Nach vorne", "pv.moveDown": "Nach hinten", "pv.moveTo": "An Position verschieben…", "pv.deletePages": "Löschen",
    "pv.extract": "Als neues PDF extrahieren…", "pv.insertPdf": "PDF dahinter einfügen…", "pv.appendPdf": "PDF anhängen…", "pv.undo": "Rückgängig",
    "pv.selectAll": "Alle Seiten auswählen", "pv.selectNone": "Auswahl aufheben", "pv.selectPage": "Seite {0} auswählen",
    "pv.position": "Neue Position der ersten ausgewählten Seite", "pv.encrypted": "Die Seiten eines geschützten PDF können nicht geändert werden.",
    "pv.pagesFailed": "Die Seiten konnten nicht geändert werden: {0}", "pv.deleted": "{0} Seite(n) gelöscht", "pv.inserted": "{0} Seite(n) eingefügt",
  },
});

// ---- PDF.js setup -------------------------------------------------------------------------------

pdfjsLib.GlobalWorkerOptions.workerPort = Suite.embed.worker("pdf-worker");

/** Serves CMaps, standard fonts and WebAssembly decoders from the embedded bundle (no fetch on file://). */
class EmbeddedDataFactory {
  constructor() { this.dirs = { cMapUrl: "cmaps/", standardFontDataUrl: "standard_fonts/", wasmUrl: "wasm/" }; }

  async fetch({ kind, filename }) {
    const { files } = await Suite.embed.bundle();
    const blob = files[this.dirs[kind] + filename];
    if (!blob) throw new Error(`not embedded: ${this.dirs[kind]}${filename}`);
    return new Uint8Array(await blob.arrayBuffer());
  }
}

const container = document.createElement("div");
container.className = "pv-container";
container.tabIndex = 0;
const viewerElement = document.createElement("div");
viewerElement.className = "pdfViewer";
container.append(viewerElement);

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const findController = new PDFFindController({ eventBus, linkService });
const viewer = new PDFViewer({
  container, viewer: viewerElement, eventBus, linkService, findController,
  annotationMode: AnnotationMode.ENABLE_FORMS, annotationEditorMode: AnnotationEditorType.NONE,
});
linkService.setViewer(viewer);

const state = {
  doc: null, name: "", handle: null, bytes: null, page: 1, pages: 0, scaleValue: "auto", scale: 1, rotation: 0,
  sidebar: window.innerWidth > 800, sidebarTab: "thumbnails", outline: null,
  findOpen: false, query: "", caseSensitive: false, matches: { current: 0, total: 0 },
  editMode: AnnotationEditorType.NONE, password: null, dirty: false,
  modified: false, history: [], selected: new Set(), version: 0, dialog: null, busy: false,
  signing: null, // { typed } while the signature dialog is open
  placing: null, // { png, ratio } while waiting for the click that places the signature
  signatures: [], // digital signatures of the opened file (signatures.js)
};

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
}

eventBus.on("pagesinit", () => { viewer.currentScaleValue = state.scaleValue; });
eventBus.on("pagechanging", (e) => { state.page = e.pageNumber; render(); });
eventBus.on("scalechanging", (e) => { state.scale = e.scale; state.scaleValue = e.presetValue || String(e.scale); render(); });
eventBus.on("updatefindmatchescount", (e) => { state.matches = e.matchesCount; render(); });
eventBus.on("updatefindcontrolstate", (e) => { state.matches = e.matchesCount || state.matches; render(); });
eventBus.on("annotationeditorstateschanged", () => markDirty());
eventBus.on("switchannotationeditormode", (e) => { state.editMode = e.mode; render(); });

function markDirty() {
  const dirty = state.modified || (!!state.doc && state.doc.annotationStorage.size > 0);
  if (dirty !== state.dirty) { state.dirty = dirty; Suite.shell.setDirty(dirty); render(); }
}
container.addEventListener("input", () => setTimeout(markDirty, 0));
container.addEventListener("change", () => setTimeout(markDirty, 0));

// ---- opening ------------------------------------------------------------------------------------

async function openBytes(name, bytes, handle = null, { keep = false, page = 1 } = {}) {
  if (state.doc) {
    viewer.setDocument(null);
    linkService.setDocument(null);
    const old = state.doc;
    await (old.loadingTask ? old.loadingTask.destroy() : old.destroy && old.destroy()); // pdf.js 5: through the loading task
    state.doc = null;
  }
  Object.assign(state, { name, handle, bytes, page: 1, pages: 0, outline: null, dirty: false, password: null, matches: { current: 0, total: 0 }, version: state.version + 1 });
  if (!keep) Object.assign(state, { modified: false, history: [], selected: new Set() });
  Suite.shell.setDirty(state.modified);
  state.dirty = state.modified;
  const task = pdfjsLib.getDocument({
    data: bytes.slice(), // PDF.js transfers the buffer to the worker
    cMapUrl: "cmaps/", cMapPacked: true, standardFontDataUrl: "standard_fonts/", wasmUrl: "wasm/",
    useWorkerFetch: false, BinaryDataFactory: EmbeddedDataFactory, isEvalSupported: false,
    useSystemFonts: false, // the system font path would load standard fonts by URL (not possible on file://)
  });
  task.onPassword = (update, reason) => {
    state.password = { update, wrong: reason === PasswordResponses.INCORRECT_PASSWORD };
    render();
  };
  try {
    const doc = await task.promise;
    state.doc = doc;
    state.password = null;
    state.pages = doc.numPages;
    viewer.setDocument(doc);
    linkService.setDocument(doc, null);
    if (page > 1) eventBus.on("pagesinit", function go() { eventBus.off("pagesinit", go); goto(page); });
    doc.getOutline().then((outline) => { state.outline = outline || []; render(); });
    state.signatures = [];
    const version = state.version;
    verifySignatures(bytes).then((list) => { if (state.version === version) { state.signatures = list; render(); } }).catch((e) => console.warn(e));
    doc.getMetadata().then(({ info }) => { document.title = `${info && info.Title ? info.Title : name} – ${t("app.title")}`; }).catch(() => {});
    render();
  } catch (e) {
    state.password = null;
    if (e && e.name === "PasswordException") return;
    Suite.shell.toast(t("pv.openFailed", e.message || e), "error");
    render();
  }
}

async function openPicked(picked) {
  if (!picked || !picked.length) return;
  if (state.dirty && !(await Suite.shell.confirm(t("shell.unsaved")))) return;
  const { file, handle } = picked[0];
  await openBytes(file.name, new Uint8Array(await file.arrayBuffer()), handle);
  if (handle) Suite.files.remember(APP, handle);
}

async function openFile() {
  try { await openPicked(await Suite.files.open({ types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] })); } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

// ---- saving and printing ------------------------------------------------------------------------

async function documentBytes() {
  return state.doc.annotationStorage.size > 0 ? state.doc.saveDocument() : state.doc.getData();
}

// recovery copies of unsaved work (shared/js/autosave.js): the PDF with form entries, annotations and page changes
Suite.autosave.register({
  app: APP,
  save: async () => (state.doc && state.dirty ? { name: state.name, handle: state.handle, bytes: await documentBytes() } : null),
  restore: async (s) => { state.modified = true; await openBytes(s.name, s.bytes, s.handle || null, { keep: true }); markDirty(); render(); },
});

function report(result) {
  if (result.mode === "downloaded") Suite.shell.banner(result.message); else Suite.shell.toast(result.message);
}

async function save(as = false) {
  if (!state.doc) return;
  try {
    const bytes = await documentBytes();
    const result = as || !state.name ? await Suite.files.saveAs(bytes, { suggestedName: state.name || "document.pdf", type: "application/pdf" })
      : await Suite.files.save({ name: state.name, handle: state.handle }, bytes, { type: "application/pdf" });
    if (!result) return;
    report(result);
    if (result.handle) state.handle = result.handle;
    state.name = result.name;
    state.dirty = false;
    state.modified = false;
    Suite.shell.setDirty(false);
    render();
  } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), "error"); }
}

async function print() {
  if (!state.doc) return;
  Suite.shell.toast(t("pv.preparingPrint"));
  const area = document.createElement("div");
  area.id = "pv-print";
  for (let n = 1; n <= state.doc.numPages; n++) {
    const page = await state.doc.getPage(n);
    const viewport = page.getViewport({ scale: 2, rotation: (page.rotate + state.rotation) % 360 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, annotationMode: AnnotationMode.ENABLE_STORAGE, printAnnotationStorage: state.doc.annotationStorage }).promise;
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    area.append(img);
  }
  document.body.append(area);
  const cleanup = () => { area.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// ---- page operations (pages.js) -----------------------------------------------------------------

/** Pages an operation applies to (0-based): the selected thumbnails, otherwise the current page. */
const targetPages = () => (state.selected.size ? [...state.selected].sort((a, b) => a - b).map((n) => n - 1) : [state.page - 1]);

/** Run an operation on the current bytes (with filled-in forms and annotations); the result replaces the document. */
async function changePages(fn, { page = null, selected = null, message = null } = {}) {
  if (!state.doc || state.busy) return;
  state.busy = true;
  render();
  try {
    const before = await documentBytes();
    const after = await fn(before);
    state.history.push({ bytes: before, page: state.page });
    if (state.history.length > 30) state.history.shift();
    state.modified = true;
    state.selected = new Set(selected || []);
    await openBytes(state.name, after, state.handle, { keep: true, page: page || state.page });
    if (message) Suite.shell.toast(message);
  } catch (e) {
    console.warn(e);
    Suite.shell.toast(e instanceof pages.EncryptedError ? t("pv.encrypted") : t("pv.pagesFailed", e.message || e), "error");
  } finally { state.busy = false; render(); }
}

async function undoPages() {
  const last = state.history.pop();
  if (!last) return;
  state.selected = new Set();
  state.modified = state.history.length > 0;
  await openBytes(state.name, last.bytes, state.handle, { keep: true, page: last.page });
}

function movePages(options) {
  const sel = targetPages();
  const order = pages.moved(state.pages, sel, options);
  const first = order.indexOf(sel[0]);
  changePages((b) => pages.reorder(b, order), { page: first + 1, selected: sel.map((_, i) => first + i + 1) });
}

async function pickPdfs() {
  const picked = await Suite.files.open({ types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }], multiple: true });
  return picked ? Promise.all(picked.map((p) => p.file.arrayBuffer().then((b) => new Uint8Array(b)))) : null;
}

async function pageAction(action) {
  const sel = targetPages();
  if (action === "rotateLeft" || action === "rotateRight") changePages((b) => pages.rotate(b, sel, action === "rotateLeft" ? -90 : 90), { selected: [...state.selected] });
  if (action === "moveUp") movePages({ step: -1 });
  if (action === "moveDown") movePages({ step: 1 });
  if (action === "moveTo") { state.dialog = { kind: "moveTo", value: sel[0] + 1 }; render(); }
  if (action === "deletePages") {
    if (!(await Suite.shell.confirm(t("pv.deleted", sel.length) + "?"))) return;
    changePages((b) => pages.remove(b, sel), { page: Math.min(sel[0] + 1, state.pages - sel.length), message: t("pv.deleted", sel.length) });
  }
  if (action === "extract") {
    try {
      const bytes = await pages.extract(await documentBytes(), sel);
      const stem = (state.name || "document.pdf").replace(/\.pdf$/i, "");
      const result = await Suite.files.saveAs(bytes, { suggestedName: `${stem} (${sel.map((i) => i + 1).join(", ").slice(0, 40)}).pdf`, type: "application/pdf" });
      if (result) report(result);
    } catch (e) { Suite.shell.toast(e instanceof pages.EncryptedError ? t("pv.encrypted") : t("pv.pagesFailed", e.message || e), "error"); }
  }
  if (action === "insertPdf" || action === "appendPdf") {
    const others = await pickPdfs().catch((e) => { Suite.shell.toast(Suite.i18n.describe(e), "error"); return null; });
    if (!others || !others.length) return;
    const at = action === "appendPdf" ? state.pages : sel[sel.length - 1] + 1;
    const counts = await Promise.all(others.map((o) => pdfjsLib.getDocument({ data: o.slice(), isEvalSupported: false }).promise.then((d) => { const n = d.numPages; d.destroy(); return n; }).catch(() => 0)));
    const n = counts.reduce((a, b) => a + b, 0);
    changePages((b) => pages.insert(b, at, others), { page: at + 1, message: t("pv.inserted", n) });
  }
  if (action === "undo") undoPages();
  if (action === "selectAll") { state.selected = new Set(Array.from({ length: state.pages }, (_, i) => i + 1)); render(); }
  if (action === "selectNone") { state.selected = new Set(); render(); }
}

function toggleSelected(n) {
  if (state.selected.has(n)) state.selected.delete(n); else state.selected.add(n);
  render();
}

// ---- navigation, zoom, search, editing -----------------------------------------------------------

function goto(n) { if (state.doc) viewer.currentPageNumber = Math.max(1, Math.min(state.pages, n)); }

function setScale(value) { state.scaleValue = value; if (state.doc) viewer.currentScaleValue = value; render(); }

function zoom(factor) {
  if (!state.doc) return;
  viewer.currentScale = Math.max(0.25, Math.min(8, Math.round(viewer.currentScale * factor * 100) / 100));
}

function rotate() {
  state.rotation = (state.rotation + 90) % 360;
  viewer.pagesRotation = state.rotation;
}

function find(again = false, previous = false) {
  eventBus.dispatch("find", { source: null, type: again ? "again" : "", query: state.query, caseSensitive: state.caseSensitive, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
}

function setEditMode(mode) {
  state.editMode = mode;
  viewer.annotationEditorMode = { mode };
  render();
}

// ---- signing ---------------------------------------------------------------------------------------

const pad = { canvas: null, strokes: [], drawing: null };

function padPoint(e) {
  const r = pad.canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (pad.canvas.width / r.width), (e.clientY - r.top) * (pad.canvas.height / r.height)];
}

function drawPad() {
  const c = pad.canvas;
  if (!c) return;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = "#0b1f66";
  g.lineWidth = 3;
  g.lineCap = g.lineJoin = "round";
  for (const s of pad.strokes) {
    g.beginPath();
    s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (s.length === 1) g.lineTo(s[0][0] + 0.1, s[0][1]);
    g.stroke();
  }
  const typed = state.signing && state.signing.typed.trim();
  if (typed && !pad.strokes.length) {
    g.fillStyle = "#0b1f66";
    g.font = `italic 56px "Segoe Script", "Brush Script MT", "URW Chancery L", cursive`;
    g.textBaseline = "middle";
    g.fillText(typed, 16, c.height / 2, c.width - 32);
  }
}

/** The signature as a PNG cropped to the ink, or null when empty. */
async function signaturePng() {
  const c = pad.canvas;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (data[(y * c.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const m = 4;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((r) => out.toBlob(r, "image/png"));
  return { png: new Uint8Array(await blob.arrayBuffer()), ratio: out.height / out.width };
}

async function startPlacing() {
  const sig = await signaturePng();
  if (!sig) { Suite.shell.toast(t("pv.signEmpty"), "warning"); return; }
  state.signing = null;
  state.placing = sig;
  setEditMode(AnnotationEditorType.NONE);
  container.classList.add("pv-placing");
  Suite.shell.toast(t("pv.signWhere"));
  render();
}

function stopPlacing() { state.placing = null; container.classList.remove("pv-placing"); render(); }

/** Place the signature at a point of a page (CSS pixels relative to the page's canvas). */
function placeSignature(pageNumber, px, py) {
  const sig = state.placing;
  stopPlacing();
  const view = viewer.getPageView(pageNumber - 1);
  const [x, y] = view.viewport.convertToPdfPoint(px, py);
  const width = Math.min(180, view.viewport.viewBox[2] - view.viewport.viewBox[0]) ;
  const height = width * sig.ratio;
  // the click is the centre of the signature's left half: x a little left, y above
  changePages((b) => pages.stamp(b, pageNumber - 1, sig.png, { x: x - width * 0.1, y: y + height / 2, width, height }), { message: t("pv.signed", pageNumber) });
}

container.addEventListener("click", (e) => {
  if (!state.placing) return;
  const page = e.target.closest(".page");
  if (!page) return;
  e.preventDefault();
  e.stopPropagation();
  const box = (page.querySelector(".canvasWrapper") || page).getBoundingClientRect();
  placeSignature(+page.dataset.pageNumber, e.clientX - box.left, e.clientY - box.top);
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.placing) stopPlacing(); });

function SignDialog() {
  const s = state.signing;
  if (!s) return null;
  const ref = (el) => { if (el && pad.canvas !== el) { pad.canvas = el; drawPad(); } };
  const down = (e) => { e.preventDefault(); e.target.setPointerCapture(e.pointerId); pad.drawing = [padPoint(e)]; pad.strokes.push(pad.drawing); drawPad(); };
  const move = (e) => { if (!pad.drawing) return; pad.drawing.push(padPoint(e)); drawPad(); };
  const up = () => { pad.drawing = null; };
  return html`<dialog open data-testid="sign-dialog"><article class="pv-sign">
    <header><strong>${t("pv.signTitle")}</strong></header>
    <small>${t("pv.signDraw")}</small>
    <canvas class="pv-sign-pad" width="600" height="200" data-testid="sign-pad" ref=${ref} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}></canvas>
    <input data-testid="sign-typed" placeholder=${t("pv.signType")} value=${s.typed} onInput=${(e) => { s.typed = e.target.value; pad.strokes = []; drawPad(); }} />
    <footer>
      <button class="secondary outline" data-testid="sign-clear" onClick=${() => { pad.strokes = []; s.typed = ""; render(); drawPad(); }}>${t("pv.signClear")}</button>
      <button class="secondary" data-testid="sign-cancel" onClick=${() => { state.signing = null; render(); }}>${t("pv.signCancel")}</button>
      <button data-testid="sign-place" onClick=${startPlacing}>${t("pv.signPlace")}</button>
    </footer>
  </article></dialog>`;
}

// ---- thumbnails ----------------------------------------------------------------------------------

const thumbnailObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting || entry.target.dataset.rendered || !state.doc) continue;
    const canvas = entry.target;
    canvas.dataset.rendered = "1";
    const doc = state.doc;
    doc.getPage(+canvas.dataset.page).then((page) => {
      const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + state.rotation) % 360 });
      const scale = 140 / viewport.width;
      const vp = page.getViewport({ scale, rotation: (page.rotate + state.rotation) % 360 });
      canvas.width = vp.width;
      canvas.height = vp.height;
      return page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    }).catch(() => { delete canvas.dataset.rendered; });
  }
});

// on phones the sidebar is a drawer over the page: choosing a page closes it
const phone = () => window.matchMedia("(max-width: 760px)").matches;
const pick = (fn) => { if (phone()) state.sidebar = false; fn(); render(); };

function Thumbnails() {
  const ref = (el) => { if (el) el.querySelectorAll("canvas:not([data-observed])").forEach((c) => { c.dataset.observed = "1"; thumbnailObserver.observe(c); }); };
  const items = [];
  for (let n = 1; n <= state.pages; n++) {
    items.push(html`<div class=${`pv-thumb-box${state.selected.has(n) ? " selected" : ""}`} key=${`${state.version}-${n}-${state.rotation}`}>
      <button class=${`pv-thumb${n === state.page ? " active" : ""}`} data-testid="thumbnail" onClick=${() => pick(() => goto(n))}>
        <canvas data-page=${n} width="140" height="180"></canvas><span>${n}</span></button>
      <input type="checkbox" class="pv-thumb-check" data-testid="page-select" aria-label=${t("pv.selectPage", n)} checked=${state.selected.has(n)} onChange=${() => toggleSelected(n)} /></div>`);
  }
  return html`<div class="pv-thumbs" ref=${ref}>${items}</div>`;
}

function OutlineItems({ items }) {
  return html`<ul>${items.map((item) => html`<li>
    <a href="#" data-testid="outline-item" onClick=${(e) => { e.preventDefault(); pick(() => { if (item.dest) linkService.goToDestination(item.dest); else if (item.url) window.open(item.url, "_blank", "noopener"); }); }}>${item.title}</a>
    ${item.items && item.items.length ? html`<${OutlineItems} items=${item.items} />` : null}</li>`)}</ul>`;
}

const sigOk = (s) => s.integrity && s.signature && !s.error;
const fmtDate = (d) => (d ? new Date(d).toLocaleString(Suite.i18n.language === "de" ? "de-AT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

/** One line above the page: the state of the (last) signature; a click opens the details. */
function SignatureBar() {
  const list = state.signatures;
  if (!list.length || !state.doc) return null;
  const last = list[list.length - 1];
  const bad = list.some((s) => !sigOk(s));
  const changed = !bad && !last.coversAll;
  const who = list.length > 1 ? `${last.name} (${t("pv.sigCount", list.length)})` : last.name;
  return html`<button class=${`pv-sigbar ${bad ? "bad" : changed ? "warn" : "ok"}`} data-testid="signature-bar" data-state=${bad ? "bad" : changed ? "changed" : "ok"}
      onClick=${() => { state.sidebar = true; state.sidebarTab = "signatures"; render(); }}>
    ${bad ? "❌" : changed ? "⚠️" : "✅"} ${t(bad ? "pv.sigInvalid" : changed ? "pv.sigChanged" : "pv.sigValid", who)} <small>${t("pv.sigDetails")} ›</small></button>`;
}

function Signatures() {
  const row = (ok, good, badText) => html`<li class=${ok ? "ok" : "bad"}>${ok ? "✅" : "❌"} ${ok ? good : badText}</li>`;
  return html`<div class="pv-signatures" data-testid="signatures">${state.signatures.map((s) => html`<section data-testid="signature" data-valid=${sigOk(s) ? "true" : "false"}>
    <strong>✍ ${s.name}</strong>
    ${s.error ? html`<p class="pv-sig-error">❌ ${t("pv.sigError", s.error)}</p>` : html`<ul>
      ${row(s.integrity, t("pv.sigIntegrity"), t("pv.sigIntegrityBad"))}
      ${row(s.signature, t("pv.sigSignatureOk"), t("pv.sigSignatureBad"))}
      <li class=${s.coversAll ? "ok" : "warn"} data-testid="signature-coverage">${s.coversAll ? "✅" : "⚠️"} ${s.coversAll ? t("pv.sigCoversAll") : t("pv.sigAppended", s.appended)}</li></ul>`}
    <dl>
      ${s.date ? html`<dt>${t("pv.sigDate")}</dt><dd>${fmtDate(s.date)}</dd>` : null}
      ${s.reason ? html`<dt>${t("pv.sigReason")}</dt><dd data-testid="signature-reason">${s.reason}</dd>` : null}
      ${s.location ? html`<dt>${t("pv.sigLocation")}</dt><dd>${s.location}</dd>` : null}
      ${s.certificate ? html`<dt>${t("pv.sigSigner")}</dt><dd data-testid="signature-subject">${s.certificate.subject}</dd>
        <dt>${t("pv.sigIssuer")}</dt><dd>${s.certificate.issuer}${s.certificate.selfSigned ? html` <em>(${t("pv.sigSelfSigned")})</em>` : null}</dd>
        <dt>${t("pv.sigValidity")}</dt><dd>${fmtDate(s.certificate.notBefore)} – ${fmtDate(s.certificate.notAfter)}${s.certificate.expired ? html` <em>(${t("pv.sigExpired")})</em>` : null}</dd>` : null}
      ${s.chain.length > 1 || (s.chain[0] && !s.chain[0].root) ? html`<dt>${t("pv.sigChain")}</dt><dd><ol>${s.chain.map((c) => html`<li>${c.subject} <small>${c.verified === true ? t("pv.sigLinkOk") : c.verified === false ? t("pv.sigLinkBad") : t("pv.sigLinkMissing")}</small></li>`)}</ol></dd>` : null}
    </dl>
  </section>`)}
    <p class="pv-sig-note">${t("pv.sigTrust")}</p>
  </div>`;
}

function Sidebar() {
  if (!state.sidebar || !state.doc) return null;
  return html`<aside class="pv-sidebar suite-drawer" data-testid="sidebar">
    <div class="pv-tabs">
      <button class=${state.sidebarTab === "thumbnails" ? "" : "secondary outline"} onClick=${() => { state.sidebarTab = "thumbnails"; render(); }}>${t("pv.thumbnails")}</button>
      <button class=${state.sidebarTab === "outline" ? "" : "secondary outline"} data-testid="outline-tab" onClick=${() => { state.sidebarTab = "outline"; render(); }}>${t("pv.outline")}</button>
      ${state.signatures.length ? html`<button class=${state.sidebarTab === "signatures" ? "" : "secondary outline"} data-testid="signatures-tab" onClick=${() => { state.sidebarTab = "signatures"; render(); }}>✍</button>` : null}
    </div>
    ${state.sidebarTab === "signatures" && state.signatures.length ? html`<${Signatures} />` : state.sidebarTab === "thumbnails" ? html`<${Thumbnails} />`
      : html`<nav class="pv-outline">${state.outline && state.outline.length ? html`<${OutlineItems} items=${state.outline} />` : html`<p>${t("pv.noOutline")}</p>`}</nav>`}
  </aside>`;
}

// ---- UI ------------------------------------------------------------------------------------------

const SCALES = [["auto", "pv.auto"], ["page-fit", "pv.pageFit"], ["page-width", "pv.pageWidth"], ["0.5", "50 %"], ["0.75", "75 %"], ["1", "100 %"], ["1.25", "125 %"], ["1.5", "150 %"], ["2", "200 %"], ["3", "300 %"], ["4", "400 %"]];

function Toolbar() {
  const has = !!state.doc;
  const scaleKnown = SCALES.some(([v]) => v === state.scaleValue);
  return html`<nav class="pv-toolbar" role="toolbar">
    <button class="secondary outline" data-testid="sidebar-toggle" title=${t("pv.sidebar")} disabled=${!has} onClick=${() => { state.sidebar = !state.sidebar; render(); }}>☰</button>
    <button class="secondary" data-testid="open" title="${t("pv.open")} (Ctrl+O)" onClick=${openFile}>${t("pv.open")}</button>
    <${Suite.shell.Recent} app=${APP} onOpen=${(p) => openPicked([p])} />
    <button class=${state.dirty ? "" : "secondary"} data-testid="save" disabled=${!has} title="${t("pv.save")} (Ctrl+S)" onClick=${() => save(false)}>${t("pv.save")}</button>
    <button class="secondary outline" data-testid="print" disabled=${!has} title=${t("pv.print")} onClick=${print}>🖨</button>
    <span class="pv-group">
      <button class="secondary outline" data-testid="prev" disabled=${!has || state.page <= 1} title=${t("pv.previous")} onClick=${() => goto(state.page - 1)}>‹</button>
      <input class="pv-page" data-testid="page" aria-label=${t("pv.page")} inputmode="numeric" value=${has ? state.page : ""} disabled=${!has}
             onChange=${(e) => goto(parseInt(e.target.value, 10) || 1)} />
      <span data-testid="pages">${has ? t("pv.of", state.pages) : ""}</span>
      <button class="secondary outline" data-testid="next" disabled=${!has || state.page >= state.pages} title=${t("pv.next")} onClick=${() => goto(state.page + 1)}>›</button>
    </span>
    <span class="pv-group">
      <button class="secondary outline" data-testid="zoom-out" disabled=${!has} title=${t("pv.zoomOut")} onClick=${() => zoom(1 / 1.25)}>−</button>
      <select data-testid="scale" aria-label=${t('pv.zoom')} disabled=${!has} onChange=${(e) => setScale(e.target.value)}>
        ${SCALES.map(([v, label]) => html`<option value=${v} selected=${v === state.scaleValue}>${label.startsWith("pv.") ? t(label) : label}</option>`)}
        ${!scaleKnown ? html`<option value=${state.scaleValue} selected>${Math.round(state.scale * 100)} %</option>` : null}
      </select>
      <button class="secondary outline" data-testid="zoom-in" disabled=${!has} title=${t("pv.zoomIn")} onClick=${() => zoom(1.25)}>+</button>
    </span>
    <button class="secondary outline" data-testid="rotate" disabled=${!has} title=${t("pv.rotate")} onClick=${rotate}>⟳</button>
    <select data-testid="pages-menu" aria-label=${t("pv.pages")} disabled=${!has || state.busy} aria-busy=${state.busy}
        onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v) pageAction(v); }}>
      <option value="">📄 ${t("pv.pages")}${state.selected.size ? ` (${state.selected.size})` : ""}</option>
      <optgroup label=${state.selected.size ? t("pv.pagesHint", state.selected.size) : `${t("pv.page")} ${state.page}`}>
        ${["rotateLeft", "rotateRight", "moveUp", "moveDown", "moveTo", "deletePages", "extract", "insertPdf"].map((a) => html`<option value=${a}>${t(`pv.${a}`)}</option>`)}
      </optgroup>
      <option value="appendPdf">${t("pv.appendPdf")}</option>
      <option value="selectAll">${t("pv.selectAll")}</option>
      ${state.selected.size ? html`<option value="selectNone">${t("pv.selectNone")}</option>` : null}
      ${state.history.length ? html`<option value="undo">↶ ${t("pv.undo")}</option>` : null}
    </select>
    <button class=${state.findOpen ? "" : "secondary outline"} data-testid="find" disabled=${!has} title="${t("pv.find")} (Ctrl+F)" onClick=${() => { state.findOpen = !state.findOpen; render(); setTimeout(() => { const i = document.querySelector("[data-testid=find-input]"); if (i) i.focus(); }); }}>🔍</button>
    <select data-testid="edit-mode" aria-label=${t("pv.edit")} disabled=${!has} onChange=${(e) => setEditMode(+e.target.value)}>
      ${[[AnnotationEditorType.NONE, "pv.editNone"], [AnnotationEditorType.HIGHLIGHT, "pv.editHighlight"], [AnnotationEditorType.FREETEXT, "pv.editText"], [AnnotationEditorType.INK, "pv.editInk"]]
        .map(([mode, label]) => html`<option value=${mode} selected=${mode === state.editMode}>${t(label)}</option>`)}
    </select>
    <button class=${state.placing ? "" : "secondary outline"} data-testid="sign" disabled=${!has || state.busy} title=${t("pv.sign")}
      onClick=${() => { if (state.placing) { stopPlacing(); return; } pad.strokes = []; state.signing = { typed: "" }; render(); }}>✍</button>
  </nav>`;
}

function FindBar() {
  if (!state.findOpen || !state.doc) return null;
  const m = state.matches;
  return html`<form class="pv-findbar" data-testid="find-bar" onSubmit=${(e) => { e.preventDefault(); find(true, false); }}>
    <input data-testid="find-input" value=${state.query} placeholder=${t("pv.find")} onInput=${(e) => { state.query = e.target.value; find(false); }} />
    <button type="button" class="secondary" data-testid="find-prev" onClick=${() => find(true, true)}>${t("pv.findPrevious")}</button>
    <button type="submit" data-testid="find-next">${t("pv.findNext")}</button>
    <label><input type="checkbox" checked=${state.caseSensitive} onChange=${(e) => { state.caseSensitive = e.target.checked; find(false); }} /> ${t("pv.matchCase")}</label>
    <span data-testid="matches">${state.query ? (m.total ? t("pv.matches", m.current, m.total) : t("pv.noMatches")) : ""}</span>
  </form>`;
}

function PasswordDialog() {
  const p = state.password;
  if (!p) return null;
  return html`<dialog open data-testid="password-dialog"><article>
    <header><strong>${t("pv.passwordTitle")}</strong></header>
    <form onSubmit=${(e) => { e.preventDefault(); const value = e.target.elements.password.value; state.password = null; render(); p.update(value); }}>
      <p>${t("pv.passwordPrompt", state.name)}</p>
      ${p.wrong ? html`<p class="pv-error" data-testid="password-wrong">${t("pv.passwordWrong")}</p>` : null}
      <input type="password" name="password" data-testid="password" autocomplete="off" autofocus />
      <footer><button type="submit" data-testid="password-ok">${t("common.ok")}</button></footer>
    </form>
  </article></dialog>`;
}

function MoveDialog() {
  const d = state.dialog;
  if (!d || d.kind !== "moveTo") return null;
  return html`<dialog open data-testid="move-dialog"><article>
    <form onSubmit=${(e) => { e.preventDefault(); const to = Math.round(+e.target.elements.position.value) - 1; state.dialog = null; render(); movePages({ to }); }}>
      <label>${t("pv.position")}<input type="number" name="position" data-testid="move-position" min="1" max=${state.pages} defaultValue=${d.value} required autofocus /></label>
      <footer><button type="button" class="secondary" onClick=${() => { state.dialog = null; render(); }}>${t("common.cancel")}</button>
        <button type="submit" data-testid="move-ok">${t("common.ok")}</button></footer>
    </form></article></dialog>`;
}

function ViewerHost() {
  const ref = (el) => { if (el && container.parentNode !== el) el.append(container); };
  return html`<div class="pv-host" ref=${ref}>${state.doc ? null : html`<p class="pv-empty" data-testid="empty">${t("pv.empty")}</p>`}</div>`;
}

function Main() {
  return html`<div class="pv-layout"><${FindBar} /><${SignatureBar} /><div class="pv-body"><${Sidebar} />${state.sidebar && state.doc ? Suite.shell.backdrop(() => { state.sidebar = false; render(); }) : null}<${ViewerHost} /></div><${PasswordDialog} /><${MoveDialog} /><${SignDialog} /></div>`;
}

Suite.shell.mount({ id: APP, title: "app.title", version: "%%BUILD_VERSION%%", toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });
Suite.files.dropZone(document.body, openPicked);
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "o") { e.preventDefault(); openFile(); }
  if (k === "s") { e.preventDefault(); save(e.shiftKey); }
  // undo of page operations (the annotation editor has its own undo while it is active)
  if (k === "z" && !e.shiftKey && state.history.length && state.editMode === AnnotationEditorType.NONE && !e.target.closest("input, textarea")) { e.preventDefault(); undoPages(); }
  if (k === "f" && state.doc) { e.preventDefault(); state.findOpen = true; render(); setTimeout(() => { const i = document.querySelector("[data-testid=find-input]"); if (i) i.focus(); }); }
});
window.addEventListener("resize", () => { if (state.doc && ["auto", "page-fit", "page-width"].includes(state.scaleValue)) viewer.currentScaleValue = state.scaleValue; });

Suite.bridge.receive((picked) => openPicked(picked), { app: 'pdfviewer' }); // files opened from other apps ("Open with…")

// for tests
window.PV_SIG = { verifySignatures };
window.PV = { state, viewer, eventBus, openBytes, save, goto, setEditMode, find, pageAction, pages, documentBytes };
document.body.dataset.ready = "true";
