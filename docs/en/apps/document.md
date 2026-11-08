# Document

The document editor (`document.html`) writes and edits text documents like Word or LibreOffice Writer: paragraphs and headings, fonts and
colours, alignment and spacing, bullet and numbered lists, tables, images, headers and footers, find and replace. The editing component is
Univer Docs.

## Files

| Format | Open | Save | Notes |
|---|---|---|---|
| Word (`.docx`) | yes | yes | page size and margins, styles, headings, text formatting, lists, tables, images, hyperlinks, headers and footers with page numbers |
| OpenDocument (`.odt`, LibreOffice Writer) | yes (also templates `.ott`) | yes | the same as for Word; footnotes and endnotes are placed at the end of the document |
| Word with macros (`.docm`), templates (`.dotx`) | yes | as `.docx` | macros are not kept; a template becomes a new document |
| Text (`.txt`, `.md`) | yes | yes (`.txt`) | only the text; formatting, tables and images are lost; a Markdown file opens as its text and is saved unchanged |
| Markdown (`.md`) | as text | yes | headings, bold, italic, strikethrough, links, bullet, numbered and check lists, tables and images (embedded); no colours, fonts, alignment, page layout, headers and footers |
| Web page (`.html`) | no | yes | text, formatting, lists, tables, images and links; no page layout |
| PDF | no | via **🖨** | see *Printing and PDF* |

- **Open** (`Ctrl+O`) opens a file; you can also drop it onto the window. **New** starts an empty document.
- **Save** (`Ctrl+S`) saves in the file's format: directly into the file in Chrome/Edge on the desktop, as a download in Firefox and on
  Android (replace the original file with it). **Save as** (`Ctrl+Shift+S`) asks for the name and the format.
- The file name in the toolbar shows • while there are unsaved changes.

### Printing and PDF

**🖨** (`Ctrl+P`) prints the document with its page size and margins; choose *Save as PDF* (Chrome, Edge, Android) or *Print to file*
(Firefox) as the printer to get a PDF. The header and footer of the document repeat on every page: in Chrome and Edge as text (pictures in
them are left out) with the right page numbers, in Firefox with empty page numbers (Firefox cannot number pages there). The page breaks are made by the
browser, so they can differ from the editor's pages; inserted page breaks are kept. Links stay clickable in the PDF, including the
entries of a table of contents.

Documents from Word and LibreOffice are converted when they are opened; very complex layouts (text boxes, columns, tracked changes,
comments) may look simpler. Keep the original file until you have checked the result.
A "word" of more than 20,000 characters without a space (such as pasted base64 data) gets an invisible break point (U+200B)
every 1,000 characters so that it can be shown; they are saved with the document.

## Editing

The ribbon has the tabs **Start** (clipboard, bold/italic/underline/strike, sub- and superscript, paragraph style, size, font, colours,
alignment, lists, checklists) and **Insert** (tables, images, links, horizontal line, emoji, symbols, header and footer, date and time). The usual shortcuts work: `Ctrl+B/I/U`,
`Ctrl+Z/Y`, `Ctrl+C/X/V`, `Ctrl+F` to find. The status bar shows the word count and the zoom.

**📐 Diagram** in the toolbar opens an empty diagram in the diagram editor (a new window or tab); its first **Save** inserts
the diagram as a picture at the cursor, later saves update it. When a diagram picture is selected (a click on it), **📐 Edit
diagram** opens it in the diagram editor again. An updated picture keeps its place and scale (at most the width of the text);
`Ctrl+Z` undoes it. The diagram travels inside the picture (a PNG with the draw.io file), so it stays editable in the `.docx`
file; Word shows the picture.

The language of the editing component follows the suite's language switch, and it follows the dark theme too.

Undo and redo are the first two buttons of the editor toolbar (also `Ctrl+Z` and `Ctrl+Y`).

### Links

Select a text and press `Ctrl+K` (or **Insert → 🔗**, or 🔗 in the small toolbar above the selection) and enter the address:
`https://…`, `mailto:…` or an e-mail address (it becomes a `mailto:` link); an address without a scheme gets `https://`. Pointing at (or tapping)
a linked text shows the address with buttons to copy, edit or remove the link; `Ctrl+K` on a linked text changes it as well. Links
are saved in Word, OpenDocument and HTML files and stay clickable in a PDF printed from the editor.

### Table of contents and footnotes

**📑 Contents** inserts a table of contents at the paragraph of the cursor: the headings (paragraph styles *Heading 1* to *Heading 5*),
indented by level. After changing headings, click it again to update the table in place. In saved Word and OpenDocument files the
entries are links to the headings (Ctrl+click in Word, click in LibreOffice); the table has no page numbers (the editor does not know
them) – Word and LibreOffice can add a real index with page numbers if needed.

### Comments

Select text and press `Ctrl+Alt+M` (or the comment button of the small toolbar above a selection) to comment on it; the first time, the
editor asks for your name, which stands with your comments (change it in the settings: `F1` → **⚙ Settings** → *Your name*). The
commented text is marked; **💬 Comments** shows the comment panel: every comment with its replies, where you answer, edit or delete your
own comments, mark a thread as resolved (✓) and filter by resolved or open threads. Clicking a comment selects its text.

Comments are kept in Word files (`word/comments.xml`; replies and the *resolved* state as Word 2013 and later writes them) and in
OpenDocument files (`office:annotation`, with LibreOffice's replies and *resolved* state); comments of a Word or LibreOffice file show
their authors. Web pages, Markdown, text files and printouts leave the comments out.

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
of the document after a line, because the editor has no footnote area.

### Symbols, emoji, date and time

**Insert → Ω** opens a picker of symbols (mathematics, Greek letters and common symbols), **Insert → ☺** one of emoji with a
search; a click inserts the character at the cursor. The suite's symbol picker (see the user guide) works here as well.

**Insert → Date & time** inserts today's date or the current time as text at the cursor: *Date* and *Date (long)* in the format of
your region (e.g. 31/01/2026 and 31 January 2026, or 31.01.2026 and 31. Januar 2026), *Date (ISO)* as 2026-01-31, *Time*, or
*Date and time*. It is ordinary text and does not change later; in headers and footers, the Header & Footer tab inserts a date
that can be updated.

### Page setup

The page setup button on the **Start** tab (at the right end, on a phone in the ⋮ menu) sets:

- **Layout**: **Pages** like in Word, or **No pages** – continuous text without page edges (as text files open).
- **Paper size** (A3, A4, A5, Letter, Legal or a custom width and height) and **Orientation** (portrait or landscape).
- **Margins** at the top, bottom, left and right, in centimetres.

**Apply** changes the document (undo with `Ctrl+Z`). Page size, orientation and margins are kept in Word and OpenDocument files and
are used for printing.

### Headers, footers and page numbers

Headers and footers need a document with pages (one from Word or LibreOffice, or after choosing *Pages* in the page setup). **Insert → Header & footer**
→ **Edit header** or **Edit footer** (or a double-click into the top or bottom margin of a page) opens it for editing and shows the tab
**Header & Footer**:

- **Page number** → *Current page* or *Total pages* inserts the number at the cursor, e.g. "Page 3 of 12"; each page shows its own
  number. **Date & time** inserts the date or time. *Refresh fields* updates them.
- **Go to header** / **Go to footer** switch between them; **Different first page** and **Different odd and even pages** give these pages
  their own header and footer; the distances of header and footer from the page edge are set at the right.
- **×** (or `Esc`, or a double-click into the text) returns to the text.

On a phone, the buttons that do not fit are in the tab's ⋮ menu.

Page numbers are kept as page number fields in Word (`PAGE`, `NUMPAGES`) and OpenDocument files (`text:page-number`, `text:page-count`),
so Word and LibreOffice number the pages too; page number fields of opened files work the same way. Other fields of Word and LibreOffice
files keep the text they showed.

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
| `Ctrl+Alt+M` | Comment on the selected text |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline |
| `Ctrl+A` | Select all |
| `Ctrl+K` | Insert or edit a link |
| `/` | Command menu (at the start of an empty paragraph) |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

Documents can be read and edited; the ribbon can be scrolled sideways. For longer texts a bigger screen and a keyboard are more comfortable.
