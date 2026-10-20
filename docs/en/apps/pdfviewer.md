# PDF viewer

The PDF viewer (`pdfviewer.html`) displays PDF files: page navigation, zoom, rotation, search, outline and page
thumbnails, links, filling in forms, annotations (highlight, text, drawing), printing and password-protected files.

## Opening and saving

- **Open** (`Ctrl+O`) opens a PDF file; you can also drop a file onto the window.
- Password-protected files ask for the password.
- **Save** (`Ctrl+S`) saves the PDF with filled-in form fields and your annotations: directly into the opened file in
  Chrome/Edge on the desktop, as a download in Firefox and on Android (replace the original file with it).
  `Ctrl+Shift+S` saves under a new name.

## Navigating

- ‹ and › go to the previous and next page; type a page number into the page field.
- ☰ shows the sidebar: **Pages** shows thumbnails (click one to go to the page), **Outline** shows the table of contents
  of the document, if it has one.
- Links in the document work: internal links jump to the target page.

## Zoom and rotation

− and + zoom out and in. The zoom list offers **Automatic**, **Whole page**, **Page width** and fixed sizes. ⟳ rotates all
pages by 90 degrees (only the view; the file is not changed).

## Search

🔍 or `Ctrl+F` opens the search bar. The viewer highlights all matches and shows "1 of 3 matches". **Next** and
**Previous** move between the matches; **Match case** distinguishes upper and lower case.

## Forms and annotations

Form fields can be filled in directly. The **Annotate** list switches the mode:

| Mode | Function |
|---|---|
| Select / fill in forms | normal mode: select text, click links, fill in forms |
| Highlight | select text to highlight it |
| Text | click on the page to add a text box |
| Draw | draw with the mouse, pen or finger |

Save the file to keep form entries and annotations.

### Signing

**✍** opens a signature field: draw your signature with the mouse, a pen or a finger, or type your name. **Place**
closes the field; then click or tap the spot on the page where the signature should go (`Esc` or ✍ cancels). The
signature is added to the page as an image (about 6 cm wide) and can be undone like a page operation (📄 → Undo).
Save the file to keep it.

This is a visible signature, like one on paper. It is not a digital (cryptographic) signature.

## Pages: rearrange, rotate, delete, extract, merge

Tick pages in the thumbnails (☰ → Pages); without ticks the current page is meant. **📄 Pages** then offers:

| Entry | Function |
|---|---|
| Rotate left / right | turns the pages permanently (unlike ⟳, which only turns the view) |
| Move earlier / later / to position… | moves the pages as a block |
| Delete | removes the pages (one page always stays) |
| Extract as new PDF… | saves copies of the pages as a new file; the open file stays unchanged |
| Insert PDF after… / Append PDF… | inserts all pages of one or more other PDF files after the selection or at the end (merging) |
| Select all pages, Clear selection | |
| Undo | undoes the last page operation (also `Ctrl+Z`) |

Save the file to keep the changes. Password-protected PDFs can be read and filled in, but their pages cannot be
changed. Form fields, bookmarks and metadata are kept; bookmarks to deleted pages lead nowhere.

## Digital signatures

When a PDF contains digital signatures, a line above the page shows the result of the check: ✅ *signed by … – the signature
is valid*, ⚠️ *the document was changed after signing* (bytes were added after the signature, e.g. filled-in form fields or
further signatures – the signed version itself is intact) or ❌ *the signature is NOT valid* (the signed content was changed,
or the signature does not belong to the certificate). A click on the line, or ✍ in the sidebar, shows every signature with
signer, date, reason, location, the certificate (issuer, validity, self-signed or expired) and the certificate chain included
in the signature.

The check is done in the browser (RSA and ECDSA signatures, SHA-1 to SHA-512). Whether a certificate is **trustworthy** is not
decided: offline there is no store of trusted root certificates, so a valid signature only proves that the content has not
changed since it was signed with that certificate. Compare the certificate with the signer if in doubt.

## Printing

🖨 prepares all pages and opens the print dialog of the browser. Form entries and annotations are printed as well.

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
| `Ctrl+F` | Find |
| `Ctrl+Z` | Undo the last page operation |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The toolbar can be scrolled sideways, the sidebar (☰) opens over the pages and closes when you choose a page or chapter (or tap next to it). Use the zoom buttons or the zoom list for the
page size.
