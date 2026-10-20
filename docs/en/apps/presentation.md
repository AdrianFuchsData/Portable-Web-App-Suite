# Presentation

The presentation editor (`presentation.html`) creates and edits slide shows like PowerPoint or LibreOffice Impress: text boxes, shapes,
images and tables on slides, and presenting in full screen. Files are PowerPoint presentations (`.pptx`).

## Files

- **Open** (`Ctrl+O`) opens a `.pptx` file (also templates `.potx` and slide shows `.ppsx`, which are saved as a new `.pptx`); you can also drop
  the file onto the window. **New** starts an empty presentation.
- **Save** (`Ctrl+S`) writes the `.pptx` file: directly into the file in Chrome/Edge on the desktop, as a download in Firefox and on Android
  (replace the original file with it). **Save as** (`Ctrl+Shift+S`) asks for a new name.
- **Print / PDF** prints every slide on its own page; choose "Save as PDF" in the print dialog to get a PDF.

Slides from PowerPoint keep their texts, fonts, colours, positions, shapes, pictures and tables, including the formatting inherited from the
slide layouts and masters, the speaker notes, slide transitions and entrance animations. Other animation effects, charts, SmartArt and videos are
not supported. Keep the original file until you have checked the result.

**Web slides** (reveal.js presentations of the *Web slides* app, `.html`, or reveal.js Markdown, `.md`) can be opened as well: their blocks are
laid out from top to bottom on PowerPoint slides (headings, texts, lists, code, quotes, images, tables), sub-slides follow their main slide,
speaker notes, background colours, transitions and fragments (as entrance animations) are taken over, and text on dark backgrounds becomes
white. Saving then creates a `.pptx` file next to the original. In the *Web slides* app, PowerPoint files can be opened and web slides saved as
`.pptx` in the same way.

## Slides

The thumbnails on the left show all slides: click one to edit it, drag it to another position to reorder. **+ New slide** adds an empty slide
after the current one. Without a selected element, the panel on the right sets the **background** of the slide and the **slide size** (16:9 or
4:3), and duplicates, deletes or moves the slide (↑ ↓). `Page Up` and `Page Down` switch slides.

## Elements

- **Text box**, **Shape** (rectangle, rounded rectangle, ellipse, triangle, diamond, hexagon, arrow, star, line), **Image** (from a file) and
  **Table** (3 × 3) add an element in the middle of the slide.
- Click an element to select it; drag it to move it, drag the handles to resize, drag the round handle to rotate. Guides help to align it with
  the slide and other elements. Arrow keys move it by one point (`Shift`: 10 points).
- Double-click a text (or press `Enter`) to edit it; double-click a table cell to edit the cell. A click outside ends the editing.
- The panel on the right shows position, size and rotation, fill and line colours, the font, size and colour of the text, bold, italic,
  underline, horizontal and vertical alignment, and **To front**, **To back**, **Duplicate** and **Delete**. While a text is being edited, bold,
  italic, underline, font and colour apply to the selected words.
- `Ctrl+C`, `Ctrl+X`, `Ctrl+V` copy, cut and paste elements, `Ctrl+D` duplicates, `Delete` removes, `Ctrl+Z`/`Ctrl+Y` undo and redo.

## Presenting

**▶ Present** (or `F5` from the first slide, `Shift+F5` from the current slide) shows the presentation in full screen. Next slide: click,
`→`, `↓`, `Page Down`, `Space`, `Enter`, or swipe left on touch screens; previous slide: `←`, `↑`, `Page Up`, `Backspace` or swipe right. `Home` and
`End` jump to the first and last slide, `Escape` ends the presentation.

**Transitions**: with no element selected, *Transition* in the panel sets how the slide appears: fade, push, wipe, cover or
zoom, the direction (push, wipe, cover), the duration and, optionally, *Next slide after* a number of seconds (otherwise the next
slide comes on click). **Apply to all slides** copies the transition to every slide.

**Animations**: select an element and choose an *Entrance* effect (appear, fade in, fly in, zoom) and when it starts: *on click*,
*with previous* or *after previous*. In the show, the elements wait until their click; going back hides them again. With no element
selected, the panel lists the animations of the slide in playing order (↑ ↓ change the order, × removes one). Transitions and
animations are saved in the PPTX file and read from PowerPoint files (other PowerPoint effects are read as the nearest one, e.g. a
split as a wipe; emphasis and exit effects are not taken over).

**Speaker notes**: with no element selected, the panel on the right has a field *Speaker notes* for the current slide. Notes
are saved in the PPTX file and read from PowerPoint files.

**🎤 Presenter view** (`Alt+F5`) opens the slides in a second window – move it to the projector or external screen and make it
full screen there (`F11`) – and shows a console in this window: the current slide, the next slide, the notes in large print,
the time since the start (⏸ pauses, ⟲ restarts it), the clock and the slide number. The keys above work in both windows;
**End** (or `Escape`) closes the second window. If the browser blocks the second window, allow pop-ups for the page.

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
| `Ctrl+D` | Duplicate the element |
| `Delete` / `Backspace` | Delete the element |
| `Enter` / `F2` | Edit the text |
| `←` / `→` / `↑` / `↓` | Move the element by 1 (with Shift: 10) |
| `Esc` | Deselect |
| `Page Up` / `Page Down` | Previous / next slide |

### Presenting

| Keys | Function |
|---|---|
| `F5` / `Shift+F5` | Present from the start / from the current slide |
| `Alt+F5` | Presenter view (notes, timer, next slide) |
| `→` / `Space` / `Enter` / `N` | Next slide |
| `←` / `Backspace` / `P` | Previous slide |
| `Home` / `End` | First / last slide |
| `Esc` | End the show |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The thumbnails are shown below the slide; **Format** opens the panel. Presenting works with swipe gestures.
