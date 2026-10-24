# Spreadsheet

The spreadsheet (`spreadsheet.html`) edits workbooks like Excel or LibreOffice Calc: cells with values and formulas (more than 400
functions), formatting, several sheets, sorting, filters, merged cells, frozen rows and columns, find and replace. The editing component is
Univer Sheets.

## Files

| Format | Open | Save | Notes |
|---|---|---|---|
| Excel (`.xlsx`) | yes | yes | values, formulas, styles, number formats, merged cells, column widths, row heights, frozen panes, tab colours, hidden sheets, conditional formatting, data validation, pictures |
| Excel with macros (`.xlsm`) | yes | as `.xlsx` | macros cannot be kept |
| OpenDocument (`.ods`) | yes | yes | values, formulas, merged cells (no formatting) |
| Excel 97–2003 (`.xls`) | yes | yes | values and formulas (no formatting) |
| CSV, TSV (`.csv`, `.tsv`, `.txt`) | yes, with options | `.csv` | only the values of the first sheet |
| Numbers, flat ODS | yes | – | |

- **Open** (`Ctrl+O`) opens a file; you can also drop it onto the window. **New** starts an empty workbook.
- **Save** (`Ctrl+S`) saves in the file's format: directly into the file in Chrome/Edge on the desktop, as a download in Firefox and on
  Android (replace the original file with it). **Save as** (`Ctrl+Shift+S`) asks for the name and the format.
- The file name in the toolbar shows • while there are unsaved changes.

### Importing CSV and text files

Opening a `.csv`, `.tsv` or `.txt` file shows the import options with a preview of the first rows:

- **Encoding**: recognised automatically (UTF-8 with or without BOM, UTF-16 with BOM, otherwise Windows-1252); choose
  another one when umlauts look wrong.
- **Separator**: comma, semicolon, tab or vertical bar; the most likely one is preselected.
- **Values**: *Recognise numbers and dates* converts numbers (with the chosen **decimal separator**, `1,234.5` or
  `1.234,5`, also with `%`), dates (`2026-10-16`, `16.10.2026`, with or without time) and `TRUE`/`FALSE`. Numbers with
  leading zeros (postcodes, phone numbers) stay text. *Everything as text* keeps every cell exactly as in the file.

Quoted fields may contain separators, quotes (`""`) and line breaks. **Save** writes the CSV again with the separator
it was imported with.

## Editing

The ribbon above the table has the tabs **Start** (clipboard, font, colours, borders, alignment, merge, number formats), **Formulas** and
**View**. Type into a cell and confirm with `Enter`; formulas start with `=`, e.g. `=SUM(B2:B10)`. The formula bar shows and edits the content
of the selected cell. The bar at the bottom adds (+) and switches sheets; right-click a sheet tab to rename, colour, hide or delete it. The zoom
is at the bottom right. Right-clicking cells, rows and columns opens further commands (insert, delete, sort, …).

**Pictures** float above the cells: insert one from the ribbon (**Insert** → image), drag it to move it, drag its handles to resize it. In
`.xlsx` files they keep their cell, offset and size (also pictures from other programs, including files written by Python's openpyxl).

**📐 Diagram** in the toolbar opens an empty diagram in the diagram editor (a new window or tab); its first **Save** puts the diagram as a
picture at the selected cell, later saves update it. When a diagram picture is selected (a click on it), **📐 Edit diagram** opens it in
the diagram editor again; an updated picture keeps its place and scale. The diagram travels inside the picture (a PNG with the draw.io
file), so it stays editable in the `.xlsx` file; Excel shows the picture.

The common keyboard shortcuts work: `Ctrl+C/X/V`, `Ctrl+Z/Y`, `Ctrl+B/I/U`, arrow keys, `Tab`, `F2` to edit a cell.

The language of the editing component follows the suite's language switch, and it follows the dark theme too.

Undo and redo are the first two buttons of the editor toolbar (also `Ctrl+Z` and `Ctrl+Y`).

### Conditional formatting and data validation

**Conditional formatting** (tab *Data*, second menu) colours cells by their value: highlight cells
(greater/less than, between, text contains/begins/ends with, dates, top/bottom values, above/below average, duplicates, own
formula), colour scales and data bars. **Data validation** (tab *Data*, first menu) restricts what may be entered: a list with a drop-down,
whole or decimal numbers, dates, text length or an own formula, with an input message and an error message.

Both are read from and written to Excel files. Icon sets are not taken over from Excel files; "duplicates" and "unique values"
are saved as formula rules, and lists that are ranges of the workbook stay references.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline |
| `F2` | Edit the cell |
| `Enter` / `Tab` | Store and move down / right |
| `Delete` | Clear the cells |
| `Ctrl+F` | Find and replace |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The table can be viewed, scrolled and edited; the ribbon can be scrolled sideways. For larger changes a bigger screen is more comfortable.
