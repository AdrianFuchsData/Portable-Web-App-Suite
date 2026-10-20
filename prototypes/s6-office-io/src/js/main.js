import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import enUS from "@univerjs/preset-sheets-core/locales/en-US";
import deDE from "@univerjs/preset-sheets-core/locales/de-DE";

const $ = (id) => document.getElementById(id);
const status = (text) => { $("status").textContent = text; };
const german = (navigator.language || "").startsWith("de");
const { univerAPI } = createUniver({
  locale: german ? LocaleType.DE_DE : LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(enUS), [LocaleType.DE_DE]: mergeLocales(deDE) },
  presets: [UniverSheetsCorePreset({ container: "app" })],
});
// the open workbook; kept as a reference because the "active" workbook switches asynchronously
let workbook = univerAPI.createWorkbook({ name: "Untitled" });
let fileName = "Untitled";

/** Replace the open workbook with the given IWorkbookData. */
function load(data) {
  const previous = workbook;
  workbook = univerAPI.createWorkbook(data);
  if (previous) univerAPI.disposeUnit(previous.getId());
  return workbook;
}

async function openFile(file) {
  status(`opening ${file.name}…`);
  const data = await Suite.univerXlsx.importFile(await file.arrayBuffer(), file.name);
  load(data);
  fileName = file.name.replace(/\.[^.]+$/, "");
  status(file.name);
}

async function save(format) {
  const bytes = await Suite.univerXlsx.exportFile(workbook.save(), format);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes]));
  a.download = `${fileName}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

$("open").onchange = (e) => e.target.files[0] && openFile(e.target.files[0]).catch((err) => status(`error: ${err.message}`));
for (const format of ["xlsx", "ods", "csv"]) $(`export-${format}`).onclick = () => save(format).catch((err) => status(`error: ${err.message}`));

// for tests
window.S6 = {
  univerAPI, load,
  async importBase64(b64, name) { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); load(await Suite.univerXlsx.importFile(bin.buffer, name)); },
  async exportBase64(format) {
    const bytes = await Suite.univerXlsx.exportFile(workbook.save(), format);
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
};
status("ready");
document.body.dataset.ready = "true";
