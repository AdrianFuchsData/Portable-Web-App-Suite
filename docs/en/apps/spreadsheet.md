# Spreadsheet

The spreadsheet (`spreadsheet.html`) edits workbooks like Excel or LibreOffice Calc: cells with values and formulas (more than 400
functions), formatting, several sheets, sorting, filters, merged cells, frozen rows and columns, find and replace. The editing component is
Univer Sheets.

## Files

| Format | Open | Save | Notes |
|---|---|---|---|
| Excel (`.xlsx`) | yes | yes | values, formulas, styles, number formats, merged cells, column widths, row heights, frozen panes, row and column groups, tab colours, hidden sheets, conditional formatting, data validation, filters, hyperlinks, notes, pictures |
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

### Find and replace

`Ctrl+F` opens the search box at the top right: type the text, ‹ › (or `Enter`) go to the previous and next match, and the box shows
which match of how many is selected. **Advanced Searching & Replace** (or `Ctrl+H`) adds the replacement and the options: **Find Range**
*Current Sheet* or *Workbook* (all sheets: the matches of the other sheets are visited in turn, switching the sheet), the direction (by
rows or by columns), **Find By** value or formula, *Case Sensitive* and *Match the Whole Cell*. **Replace** replaces the current match,
**Replace All** every match in the range, after a question.

### Freezing rows and columns

**View → Freeze** (the first button of the tab) keeps rows or columns in place while the rest scrolls: *Freeze first row*, *Freeze first
column*, up to the row or the column of the selected cell, or both (*Freeze to active cell*); the same menu cancels it. The right-click
menus of the row and column headers have the same entries. Frozen panes are kept in Excel files.

### Removing duplicates and splitting text

**Data → Clean up** (on a phone in the tab's ⋮ menu) has two tools:

- **Remove duplicates…** works on the selected range, or, if a single cell is selected, on the table around it. If the first row contains
  only text, it counts as headers (switch it off in the dialog). Tick the columns to compare: a row is a duplicate if its values in these
  columns equal those of an earlier row – upper and lower case and spaces at the start or end do not count. The duplicates are removed and
  the rows below them move up within the range (cells outside the range stay where they are); a message says how many rows were removed.
- **Text to columns…** splits the selected cells of one column (or, for one cell, the column from there down) at a separator: comma,
  semicolon, tab, space or another character; the most likely one is preselected and the preview shows the result. Text in quotes may
  contain the separator. As in the CSV import, numbers (with the chosen decimal separator) and dates are recognised, or everything stays
  text. *Treat consecutive separators as one* skips empty fields, e.g. for text aligned with several spaces. The parts go into the cells
  to the right; if these are not empty, the application asks before replacing them.

Both can be undone in one step (`Ctrl+Z`).

### Grouping rows and columns

**Data → Group** groups the selected rows or columns, like Excel's outline (on a phone, the button is in the tab's ⋮ menu):

- **Group rows** / **Group columns** put the selected rows (columns) into a group, or one level deeper if they already are in one (up
  to seven levels); **Ungroup rows** / **Ungroup columns** take them out one level.
- **Hide details** hides the group at the selected cell (the selection moves to the row below it or the column right of it), **Show
  details** shows it again – also from that row or column, where the selection is after hiding.
- **Remove all groups of the sheet** removes the groups and shows their rows and columns.

The row and column headers show the groups: `│` for every level in front of a grouped row or column, ⊟ at the row below a group (the
column right of it) while it is shown and ⊞ while it is hidden. The buttons are only marks: use the menu to hide and show. Groups move
along when rows or columns are inserted or deleted, can be undone (`Ctrl+Z`) and are kept in Excel files (Excel's outline levels and
hidden rows); LibreOffice shows them as groups.

### Notes

Right-click a cell and choose **Add Note** to attach a note (a comment) to it; type the text into the box and click elsewhere. A cell
with a note has a small mark in its top right corner, and pointing at the cell shows the note. The context menu of such a cell edits it
(**Show/Hide Note** keeps it open, **Delete Note** removes it). Notes move along with their cells and can be undone.

Notes are Excel's notes (in older Excel versions: comments; LibreOffice: comments): they are read from and written to Excel files, also
on empty cells, with their text (the formatting of the text and the size of the box are not kept, notes are saved hidden). In `.ods`
files, the notes of cells with content are kept. Excel's newer threaded comments are not shown.

### Hyperlinks

**Insert → 🔗** (or `Ctrl+K`) adds a link to the selected cell: the **label** (the text the cell shows), an optional **screen tip**,
and the **type** – a web or e-mail address (`https://…`, `mailto:…`), a **range** or a **worksheet** of the workbook, or a **defined
name**. Pointing at (or tapping) a cell with a link shows a small box to open, copy, edit or remove the link. Web addresses open in a new tab;
links into the workbook select the target.

Links are read from and written to Excel files (also links to cells of other sheets, which LibreOffice and Excel follow), and in
`.ods` files the web and e-mail links are kept. A link to a defined name is saved as a link to the name's range. Excel keeps one link
per cell: if a cell has several links, the first one is saved. Cells with a link are saved in Excel's link colour (blue, underlined)
unless they have their own font colour.

### Sorting and filtering

On the tab *Data*, the **filter** button switches an auto filter on for the selected range (or the table around the selected
cell) and off again. The first row gets filter buttons: a column is filtered **by values** (a list with checkboxes and a search
field) or **by condition** (equals, does not equal, greater/less than, contains, begins/ends with, …). Rows that do not match are
hidden until the filter is changed or switched off.

The **sort** menu next to it sorts the selected range by its first column (**Ascending**, **Descending**); **Expand ascending** and
**Expand descending** sort the whole table around the selection, so that rows stay together. **Custom sort** sorts by several
columns one after the other, each ascending or descending, with or without a header row. The context menu of a cell has the same
*Sort* entries.

Filters are read from and written to Excel files with their criteria (filters by values and by conditions; Excel's colour, top-10 and
date filters are not taken over), and LibreOffice and Excel show them as filters. ODS and CSV keep only the values.

## Charts

Select a table (names in the first row and column, numbers below; a single cell stands for the table around it) and click **📊 Chart**:
a column chart of it appears next to the table. Click the chart and then **📊 Edit chart** to change it in the chart dialog:

- **Type** (column, bar, line, area, pie, doughnut, scatter), **title**, **legend** (right, bottom, none), **stacked**, **values on the chart**;
- the **data** – names, categories, values and the colour of each series –, with rows and series to add or remove; the preview follows
  every change;
- **Update from cells** takes the current values of the cells the chart was made from (type, title and colours stay).

A chart is a picture that carries its data: it is saved in the `.xlsx` file as a picture (Excel and LibreOffice show it) and stays
editable when the file is opened here again. Charts of Excel and LibreOffice files are shown as such pictures at their place – with the
data of the file – and saved as pictures (not as charts of Excel).

## Printing and PDF

**🖨 Print / PDF** (`Ctrl+P`) prints the cells with their formats, borders, merged cells, column widths and row heights:

- **Print:** the selection (when more than one cell is selected), this sheet or all sheets (each starts on a new page; hidden
  sheets, rows and columns are left out). A sheet prints the cells that have content or a background or border.
- **Paper** (A4 or Letter) and **orientation** (portrait or landscape).
- **Size:** actual size, **all columns on one page** (the default: wider tables are made smaller) or the **sheet on one page**.
- **Rows repeated at the top of each page:** the first rows of the sheet, for example the header row. Frozen rows are suggested.
- **Gridlines** between all cells.

The browser's print dialog follows: choose a printer, or **Save as PDF** for a PDF file. Paper, orientation, size and gridlines are
remembered. Pictures and diagrams on the sheet and the colours of conditional formatting are not printed; the settings are not
saved in the file.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+P` | Print / PDF |

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
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and replace |
| `Ctrl+K` | Insert a link |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The table can be viewed, scrolled and edited; the ribbon can be scrolled sideways. For larger changes a bigger screen is more comfortable.
