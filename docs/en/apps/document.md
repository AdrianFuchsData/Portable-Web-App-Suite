# Document

The document editor (`document.html`) writes and edits text documents like Word or LibreOffice Writer: paragraphs and headings, fonts and
colours, alignment and spacing, bullet and numbered lists, tables, images, headers and footers, find and replace. The editing component is
Univer Docs.

## Files

| Format | Open | Save | Notes |
|---|---|---|---|
| Word (`.docx`) | yes | yes | page size and margins, styles, headings, text formatting, lists, tables, images, hyperlinks, headers and footers |
| OpenDocument (`.odt`, LibreOffice Writer) | yes (also templates `.ott`) | yes | the same as for Word; footnotes and endnotes are placed at the end of the document |
| Word with macros (`.docm`), templates (`.dotx`) | yes | as `.docx` | macros are not kept; a template becomes a new document |
| Text (`.txt`, `.md`) | yes | yes (`.txt`) | only the text; formatting, tables and images are lost |
| Web page (`.html`) | no | yes | text, formatting, lists, tables, images and links; no page layout |
| PDF | no | via **🖨** | see *Printing and PDF* |

- **Open** (`Ctrl+O`) opens a file; you can also drop it onto the window. **New** starts an empty document.
- **Save** (`Ctrl+S`) saves in the file's format: directly into the file in Chrome/Edge on the desktop, as a download in Firefox and on
  Android (replace the original file with it). **Save as** (`Ctrl+Shift+S`) asks for the name and the format.
- The file name in the toolbar shows • while there are unsaved changes.

### Printing and PDF

**🖨** (`Ctrl+P`) prints the document with its page size and margins; choose *Save as PDF* (Chrome, Edge, Android) or *Print to file*
(Firefox) as the printer to get a PDF. The header and footer of the document repeat on every page. The page breaks are made by the
browser, so they can differ from the editor's pages; inserted page breaks are kept. Links stay clickable in the PDF, including the
entries of a table of contents.

Documents from Word and LibreOffice are converted when they are opened; very complex layouts (text boxes, columns, tracked changes,
comments) may look simpler. Keep the original file until you have checked the result.

## Editing

The ribbon has the tabs **Start** (clipboard, bold/italic/underline/strike, sub- and superscript, paragraph style, size, font, colours,
alignment, lists, checklists) and **Insert** (tables, images, page breaks, headers and footers). The usual shortcuts work: `Ctrl+B/I/U`,
`Ctrl+Z/Y`, `Ctrl+C/X/V`, `Ctrl+F` to find. The status bar shows the word count and the zoom.

The language of the editing component follows the suite's language switch, and it follows the dark theme too.

Undo and redo are the first two buttons of the editor toolbar (also `Ctrl+Z` and `Ctrl+Y`).

### Table of contents and footnotes

**📑 Contents** inserts a table of contents at the paragraph of the cursor: the headings (paragraph styles *Heading 1* to *Heading 5*),
indented by level. After changing headings, click it again to update the table in place. In saved Word and OpenDocument files the
entries are links to the headings (Ctrl+click in Word, click in LibreOffice); the table has no page numbers (the editor does not know
them) – Word and LibreOffice can add a real index with page numbers if needed.

### Spelling

**ABC✓** (`F7`) opens the spelling panel beside the document (below it on a phone). It lists the unknown words of the document text
(headers and footers are not checked); words with digits, words in capitals (abbreviations), web and mail addresses are skipped.

- Click a word to select it in the document; click again to go to its next occurrence. The panel shows suggestions: a suggestion
  replaces **all** occurrences of the word.
- **Ignore** skips the word until the editor is closed; **Add to dictionary** keeps it in the browser for good (for all dictionaries).
- **↻ Check again** after editing the text.

English (US) and German (Germany) are built in. For other languages, **Load dictionary…** takes a Hunspell dictionary: either the
`.aff` and the `.dic` file together (for example from a LibreOffice installation), or a LibreOffice dictionary extension (`.oxt`, for
example from extensions.libreoffice.org). Loaded dictionaries stay in the browser and are chosen in the list; 🗑 removes the selected
one. The dictionary, the added words and the ignored words are the same as in the **ABC** selector in the header and in the other
applications (see *Spelling* in the user guide); the panel works whether that selector is on or off, because the page of this
editor is drawn as an image and cannot show underlines.

**Footnotes and endnotes** of Word and LibreOffice files are shown with their number in superscript; their texts are placed at the end
of the document after a line, because the editor has no footnote area. Page number fields in headers and footers show the number that
was stored in the file.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+P` | Print / PDF |
| `F7` | Spelling panel |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline |
| `Ctrl+A` | Select all |
| `/` | Command menu (at the start of an empty paragraph) |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

Documents can be read and edited; the ribbon can be scrolled sideways. For longer texts a bigger screen and a keyboard are more comfortable.
