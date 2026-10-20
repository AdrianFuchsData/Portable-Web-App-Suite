import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import enUS from "@univerjs/preset-sheets-core/locales/en-US";
import deDE from "@univerjs/preset-sheets-core/locales/de-DE";

const german = (navigator.language || "").startsWith("de");
const { univerAPI } = createUniver({
  locale: german ? LocaleType.DE_DE : LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(enUS), [LocaleType.DE_DE]: mergeLocales(deDE) },
  presets: [UniverSheetsCorePreset({ container: "app" })],
});

univerAPI.createWorkbook({
  name: "Demo",
  sheets: {
    sheet1: {
      id: "sheet1", name: "Sheet1",
      cellData: {
        0: { 0: { v: "Item" }, 1: { v: "Amount" } },
        1: { 0: { v: "Apples" }, 1: { v: 3 } },
        2: { 0: { v: "Pears" }, 1: { v: 4.5 } },
        3: { 0: { v: "Total" }, 1: { f: "=SUM(B2:B3)" } },
      },
    },
  },
});

window.S2 = { univerAPI };
document.getElementById("status").textContent = "ready";
document.body.dataset.ready = "true";
