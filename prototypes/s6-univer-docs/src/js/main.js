import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import { UniverDocsDrawingPreset } from "@univerjs/preset-docs-drawing";
import drawingEnUS from "@univerjs/preset-docs-drawing/locales/en-US";
import drawingDeDE from "@univerjs/preset-docs-drawing/locales/de-DE";
import enUS from "@univerjs/preset-docs-core/locales/en-US";
import deDE from "@univerjs/preset-docs-core/locales/de-DE";
import { importDocx, importDocxViaHtml, exportDocx } from "app/univer-docx";
import { convertClipboardHtmlToDocumentData } from "@univerjs/docs-ui";

const $ = (id) => document.getElementById(id);
const status = (text) => { $("status").textContent = text; };
const german = (navigator.language || "").startsWith("de");
const { univerAPI } = createUniver({
  locale: german ? LocaleType.DE_DE : LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(enUS, drawingEnUS), [LocaleType.DE_DE]: mergeLocales(deDE, drawingDeDE) },
  presets: [UniverDocsCorePreset({ container: "app" }), UniverDocsDrawingPreset()],
});
// the open document; kept as a reference because the "active" document switches asynchronously
let doc = univerAPI.createDocument({ documentStyle: { autoHyphenation: 0 } });
let fileName = "Untitled";

function load(data) {
  const previous = doc;
  doc = univerAPI.createDocument(data);
  if (previous) univerAPI.disposeUnit(previous.getId());
  return doc;
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

$("open").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    load((await importDocx(await file.arrayBuffer())).data);
    fileName = file.name.replace(/\.[^.]+$/, "");
    status(file.name);
  } catch (err) { status(`error: ${err.message}`); }
};
$("export-docx").onclick = async () => {
  const bytes = await exportDocx(doc.save());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes]));
  a.download = `${fileName}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};

// for tests
window.S6D = {
  univerAPI, load, convertHtml: convertClipboardHtmlToDocumentData,
  async importBase64(b64, viaHtml = false) {
    const r = await (viaHtml ? importDocxViaHtml : importDocx)(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    load(r.data);
    return { html: r.html, messages: r.messages };
  },
  async exportBase64() { return toBase64(await exportDocx(doc.save())); },
};
status("ready");
document.body.dataset.ready = "true";
