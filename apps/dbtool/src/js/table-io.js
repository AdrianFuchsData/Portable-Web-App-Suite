/*
 * Tables in and out of the database tool: CSV (Suite.csv) and spreadsheets (.xlsx, written and read with fflate – the first
 * worksheet, shared and inline strings, numbers, booleans; dates stay serial numbers unless the cell has a date format).
 *
 *   writeXlsx(name, header, rows) -> bytes          readTable(bytes, fileName) -> rows (arrays of strings, numbers, booleans, null)
 *   columnTypes(rows) -> ['integer' | 'real' | 'text' …]
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); // (not allowed in XML)

function colName(i) { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
function colIndex(ref) { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); } return n - 1; }

/** An .xlsx file with one worksheet: a bold header row and the rows (numbers as numbers, everything else as text). */
export function writeXlsx(sheet, header, rows) {
  const cell = (v, r, c, style = 0) => {
    const ref = `${colName(c)}${r}`;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const sheetRows = [`<row r="1">${header.map((h, c) => cell(h, 1, c, 1)).join('')}</row>`, ...rows.map((row, i) => `<row r="${i + 2}">${row.map((v, c) => cell(v, i + 2, c)).join('')}</row>`)];
  const widths = header.map((h, c) => Math.min(60, Math.max(8, String(h).length + 2, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 1))));
  const name = esc(String(sheet || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet1');
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows.join('')}</sheetData>${header.length ? `<autoFilter ref="A1:${colName(header.length - 1)}${rows.length + 1}"/>` : ''}</worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xmlOf = (bytes) => new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
const byTag = (el, tag) => [...el.getElementsByTagNameNS(NS, tag)];
const textOf = (el) => byTag(el, 't').map((x) => x.textContent).join('');

/** The first worksheet of an .xlsx file as rows. */
export function readXlsx(bytes) {
  const zip = unzipSync(bytes);
  const shared = zip['xl/sharedStrings.xml'] ? byTag(xmlOf(zip['xl/sharedStrings.xml']).documentElement, 'si').map(textOf) : [];
  // the first sheet of the workbook (by its relationship), not just sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (zip['xl/workbook.xml'] && zip['xl/_rels/workbook.xml.rels']) {
    const first = byTag(xmlOf(zip['xl/workbook.xml']).documentElement, 'sheet')[0];
    const id = first && first.getAttributeNS(RNS, 'id');
    const rel = id && [...xmlOf(zip['xl/_rels/workbook.xml.rels']).documentElement.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === id);
    if (rel) { const target = rel.getAttribute('Target'); sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`; }
  }
  if (!zip[sheetPath]) throw new Error('no worksheet found');
  // date formats: built-in 14–22 and custom formats with d/m/y
  const dateStyles = new Set();
  if (zip['xl/styles.xml']) {
    const st = xmlOf(zip['xl/styles.xml']).documentElement;
    const custom = new Map(byTag(st, 'numFmt').map((f) => [+f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '']));
    const xfs = byTag(st, 'cellXfs')[0];
    (xfs ? byTag(xfs, 'xf') : []).forEach((xf, i) => {
      const id = +(xf.getAttribute('numFmtId') || 0);
      if ((id >= 14 && id <= 22) || (custom.has(id) && /[dmy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')))) dateStyles.add(i);
    });
  }
  const rows = [];
  for (const row of byTag(xmlOf(zip[sheetPath]).documentElement, 'row')) {
    const r = (+row.getAttribute('r') || rows.length + 1) - 1;
    const out = [];
    let next = 0;
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r');
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0];
      let value = null;
      if (type === 's') value = v ? shared[+v.textContent] ?? '' : '';
      else if (type === 'inlineStr') value = textOf(c);
      else if (type === 'b') value = v ? v.textContent === '1' : null;
      else if (type === 'str' || type === 'e') value = v ? v.textContent : '';
      else if (v) {
        const n = Number(v.textContent);
        if (dateStyles.has(+(c.getAttribute('s') || 0)) && Number.isFinite(n)) {
          const d = new Date(Math.round((n - 25569) * 86400000));
          value = n % 1 ? d.toISOString().slice(0, 19).replace('T', ' ') : d.toISOString().slice(0, 10);
        } else value = n;
      }
      out[ci] = value;
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
    while (rows.length < r) rows.push([]);
    rows[r] = out;
  }
  return rows.filter((r) => r && r.some((v) => v !== null && v !== ''));
}

/** Rows of a CSV/TSV/TXT or XLSX file. */
export function readTable(bytes, name) {
  if (/\.xlsx$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return readXlsx(bytes);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { text = new TextDecoder('windows-1252').decode(bytes); }
  return Suite.csv.parse(text, /\.tsv$/i.test(name) ? '\t' : null);
}

/** A type per column guessed from the values: integer, real or text (empty cells are ignored). */
export function columnTypes(rows) {
  const n = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: n }, (_, i) => {
    let type = null;
    for (const r of rows) {
      const v = r[i];
      if (v === null || v === undefined || v === '') continue;
      const s = typeof v === 'number' ? String(v) : String(v).trim();
      const kind = /^[+-]?\d{1,15}$/.test(s) ? 'integer' : /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? 'real' : 'text';
      if (kind === 'text') return 'text';
      if (kind === 'real' || type === 'real') type = 'real'; else type = 'integer';
    }
    return type || 'text';
  });
}
