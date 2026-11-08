# Presentation

The presentation editor (`presentation.html`) creates and edits slide shows like PowerPoint or LibreOffice Impress: text boxes, shapes,
images and tables on slides, and presenting in full screen. Files are PowerPoint presentations (`.pptx`).

## Files

- **Open** (`Ctrl+O`) opens a PowerPoint file `.pptx` (also templates `.potx` and slide shows `.ppsx`, which are saved as a new `.pptx`) or an
  OpenDocument presentation `.odp` of LibreOffice Impress (also templates `.otp`); you can also drop the file onto the window. **New** starts an
  empty presentation.
- **Save** (`Ctrl+S`) writes the file in its format: directly into the file in Chrome/Edge on the desktop, as a download in Firefox and on
  Android (replace the original file with it). **Save as** (`Ctrl+Shift+S`) asks for a new name and the format – PowerPoint (`.pptx`) or
  OpenDocument (`.odp`).
- **Print / PDF** prints every slide on its own page; choose "Save as PDF" in the print dialog to get a PDF.

Slides from PowerPoint keep their texts, fonts, colours, positions, shapes, pictures and tables, including the formatting inherited from the
slide layouts and masters, the speaker notes, slide transitions and entrance animations. Other animation effects, charts, SmartArt and videos are
not supported. Keep the original file until you have checked the result.

OpenDocument presentations keep slides with their size, background and hidden state, texts with their formatting and lists, text boxes,
shapes (rectangle, rounded rectangle, ellipse, triangles, diamond, parallelogram, trapezoid, pentagon, hexagon, arrows, star, line), pictures
(also the picture LibreOffice stores for a chart or another embedded object), tables, groups, rotation and speaker notes, in both directions;
the master's own shapes and background appear (locked) on its slides. Transitions, animations, gradients and free-form shapes are not
read or written.

**Web slides** (reveal.js presentations of the *Web slides* app, `.html`, or reveal.js Markdown, `.md`) can be opened as well: their blocks are
laid out from top to bottom on PowerPoint slides (headings, texts, lists, code, quotes, images, tables), sub-slides follow their main slide,
speaker notes, background colours, transitions and fragments (as entrance animations) are taken over, and text on dark backgrounds becomes
white. Saving then creates a `.pptx` file next to the original. In the *Web slides* app, PowerPoint files can be opened and web slides saved as
`.pptx` in the same way.

## Slides

The thumbnails on the left show all slides: click one to edit it, drag it to another position to reorder. **+ New slide** adds an empty slide
after the current one. Without a selected element, the panel on the right sets the **background** of the slide and the **slide size** (16:9 or
4:3), and duplicates, deletes or moves the slide (↑ ↓). `Page Up` and `Page Down` switch slides.

The menu **▤** next to *New slide* adds a slide with a **layout**: *Title slide* (title and subtitle), *Title and content* (title and a
bulleted text), *Two contents*, *Section header*, *Title only* or *Blank*. Its boxes sit where PowerPoint's built-in layouts put them; replace
their texts (double-click, `Ctrl+A`, type).

## Elements

- **Text box**, **Shape** (rectangle, rounded rectangle, ellipse, triangle, diamond, hexagon, arrow, star, line), **Image** (from a file) and
  **Table** (3 × 3) add an element in the middle of the slide.
- Click an element to select it; drag it to move it, drag the handles to resize, drag the round handle to rotate. Guides help to align it with
  the slide and other elements. Arrow keys move it by one point (`Shift`: 10 points).
- **📐 Diagram** opens an empty diagram in the diagram editor (a new window or tab); every **Save** there puts the diagram on the
  slide as a picture (the first save inserts it, later saves update it). A diagram picture shows **📐 Edit diagram** in the panel,
  and a double-click on it opens it in the diagram editor again; the new picture keeps position and width. The diagram travels
  inside the picture (a PNG with the draw.io file, like draw.io's "editable PNG"), so it stays editable in the `.pptx` file;
  PowerPoint shows the picture. The diagram editor (`diagram.html`) must be in the same folder, or start the presentation from
  the overview.
- Double-click a text (or press `Enter`) to edit it; double-click a table cell to edit the cell. A click outside ends the editing.
- The panel on the right shows position, size and rotation, fill and line colours, the font, size and colour of the text, bold, italic,
  underline, horizontal and vertical alignment, and **To front**, **To back**, **Duplicate** and **Delete**. While a text is being edited, bold,
  italic, underline, font and colour apply to the selected words.
- `Ctrl+C`, `Ctrl+X`, `Ctrl+V` copy, cut and paste elements, `Ctrl+D` duplicates, `Delete` removes, `Ctrl+Z`/`Ctrl+Y` undo and redo.

### Video, audio and cropped pictures

**🎬 Video/audio** puts a video (`.mp4`, `.webm`, `.ogv`, `.mov`) or a sound (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`) on the slide. A video
shows its first frame (also in PowerPoint), a sound a speaker symbol; in the show both have play controls. They are saved in PowerPoint and
OpenDocument files and read from them (PowerPoint's videos and sounds of the file itself; linked files are not). Which formats play depends on
the browser – MP4 (H.264) for example not in every Chromium build; the file stays in the presentation anyway.

**Crop (%)** in the panel of a selected picture cuts off parts of it on the left, top, right and bottom; the picture keeps its scale, and
**No cropping** shows all of it again. PowerPoint files keep the cropping (and PowerPoint's cropped pictures come with theirs); OpenDocument
files get the cropped part as the picture.

### Charts

**📊 Chart** opens the chart dialog with example data: choose the type (column, bar, line, area, pie, doughnut, scatter), title, legend,
stacked and values on the chart, and enter the categories, series and values; **OK** puts the chart on the slide. A double-click on it
(or **📊 Edit chart** in the panel) opens the dialog again. The chart is a picture that carries its data: PowerPoint shows the picture,
and the suite edits it again. Charts of PowerPoint files are shown as such pictures with the data of the file and saved as pictures.

### Lists

The list buttons of the panel make **bulleted** (•≡) and **numbered** (1.≡) lists and change the **list level** (⇠ ⇢). While a text is
being edited they apply to the paragraphs of the selection (or the paragraph of the cursor); otherwise to all paragraphs of the selected
elements. A second click on the same kind of list ends it. While editing, `Tab` and `Shift+Tab` change the level, `Enter` continues the
list, and `Enter` on an empty list paragraph moves it up a level or ends the list. Each level is numbered on its own. Lists are kept in
PowerPoint files (also those made in PowerPoint, with their bullet characters and numbering styles).

### Several elements: align, distribute, group

- **Select several elements:** `Shift`+click (or `Ctrl`+click) adds an element to the selection or removes it; dragging on an empty part of
  the slide draws a frame and selects the elements inside it; `Ctrl+A` selects all. They are then moved and resized together (drag anywhere
  inside their frame, or with the arrow keys), and copied, duplicated, deleted, brought to the front or sent to the back together; fill, line
  and text formats of the panel apply to all of them. A click inside the frame selects only the element under the pointer.
- The buttons at the top of the panel **align** the selected elements to each other – left, centre, right, top, middle, bottom – or, when only
  one element or one group is selected, to the slide. **Distribute** (three or more) gives them equal gaps horizontally or vertically; the outer
  ones stay where they are.
- **Group** (`Ctrl+G`) joins the selected elements: a click selects the whole group, and it is moved, aligned and arranged as one.
  **Ungroup** (`Ctrl+Shift+G`) separates them again. Groups are kept in PowerPoint files (also groups made in PowerPoint; a group inside a
  group becomes part of the outer one).

## Spelling

With a language chosen in the **ABC** selector of the header, unknown words are underlined in the text being edited and in the speaker
notes (right-click for suggestions, see *Spelling* in the user guide). **ABC✓** (`F7`) opens the spelling panel, which checks all slides
at once – text boxes, shapes, tables and the speaker notes: a click on a word goes to its slide and selects the element (click again: the
next occurrence), a suggestion replaces **all** occurrences (one undo step; a word formatted in parts takes the format of its first
part), **Ignore** and **Add to dictionary** work as in the document editor, and dictionaries are loaded and chosen there as well.

## Header & footer, slide numbers

**# Header & footer** in the toolbar puts the date, a footer text and the slide number at the bottom of the slides:

- **Date**: *Update automatically* shows today's date (in the language of the application) whenever the presentation is shown or
  opened; *Fixed* shows the text you type.
- **Slide number**: the number of each slide; it follows when slides are moved, added or deleted.
- **Footer**: a text, e.g. the title of the talk.
- **Not on the title slide**: leaves the first slide without them.

**Apply to all slides** or **Apply to this slide**. The dialog shows the settings of the current slide; unticking an entry removes it
from the slides it is applied to. The three are ordinary text boxes at the bottom (date left, footer centred, number right): they can be
moved and formatted, and applying again keeps their place and look. Slide numbers and automatic dates are saved as fields in the PPTX
file, so PowerPoint numbers the slides too; those of PowerPoint files work the same way.

## Presenting

**▶ Present** (or `F5` from the first slide, `Shift+F5` from the current slide) shows the presentation in full screen. Next slide: click,
`→`, `↓`, `Page Down`, `Space`, `Enter`, or swipe left on touch screens; previous slide: `←`, `↑`, `Page Up`, `Backspace` or swipe right. `Home` and
`End` jump to the first and last slide, `Escape` ends the presentation.

**Hidden slides**: *Hide in the show* in the panel of a slide (no element selected) leaves it out of the show; its thumbnail is pale and
its number crossed out. Starting the show from a hidden slide (`Shift+F5`) shows it, as in PowerPoint. Hidden slides are kept in
PPTX files.

**During the show**, moving the mouse shows the tools at the bottom left (on touch screens they are always there): ◀ ▶, **✎ pen**
(`Ctrl+P`) – draw on the slide with the mouse, a pen or a finger; **● laser pointer** (`Ctrl+L`) – a red dot follows the pointer;
**⌫** (`E`) erases the drawing of the slide; **■ black screen** (`B` or `.`; `W` or `,` gives a white one) – the same key, a click or any
other key returns; **✕** ends the show. A click on the active tool, `Ctrl+A` or `Esc` switches the pen or laser pointer off; while one is
on, clicks do not change the slide. The drawings stay on their slides until the show ends; they are not saved.

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
| `F7` | Spelling panel |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+D` | Duplicate the element |
| `Shift`+click / `Ctrl`+click | Add to or remove from the selection |
| `Ctrl+A` | Select all elements of the slide |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `Delete` / `Backspace` | Delete the element |
| `Enter` / `F2` | Edit the text |
| `Tab` / `Shift+Tab` | While editing: list level down / up |
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
| `Esc` | End the show (with the pen or laser pointer on: switch it off) |
| `Ctrl+P` / `Ctrl+L` / `Ctrl+A` | Pen / laser pointer / back to the arrow |
| `E` | Erase the drawing of the slide |
| `B` / `W` | Black / white screen (again: back) |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The thumbnails are shown below the slide; **Format** opens the panel. Presenting works with swipe gestures.
