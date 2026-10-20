# Web slides

`reveal.html` creates presentations with [reveal.js](https://revealjs.com), the HTML presentation framework (also used by
Jupyter's slide export). Presentations are saved as **one HTML file** that plays in any browser – offline, without
installing anything – and can be edited again.

## Slides

The list on the left shows the slides. reveal.js arranges them in two dimensions: main slides from left to right, and
**sub-slides** below a main slide (indented in the list, numbered 2.1, 2.2, …).

| Button | Function |
|---|---|
| + Slide | inserts a slide after the current one: title, title and list, section, image, code, quote, blank, Markdown or HTML |
| + Sub-slide | inserts a sub-slide below the current slide |
| ↑ ↓ | move the slide (within its level) |
| ⇥ ⇤ | make a main slide a sub-slide of the previous slide, or a sub-slide a main slide |
| ⧉ 🗑 | duplicate or delete the slide |

With a mouse, slides can also be **dragged** in the list: dropping on a slide puts the dragged slide before it (at the
same level); dropping on the right half of a main slide makes it that slide's last sub-slide. A main slide takes its
sub-slides along.

## Editing a slide

The middle shows the slide as reveal.js displays it. **Click** an element to select it, **double-click** a text (or press
`Enter`) to edit it right there; the bar above offers bold, italic, underline, strikethrough, code, link, colour and
removing formatting. `Esc` or **Done** ends editing.

**+ Element** adds a heading, text, list, image, code, quote, table, diagram or HTML block after the selected element. The
**Element** tab of the inspector on the right edits the selected element:

- heading level and “fit text to the slide”, numbered lists, images (file, alternative text, width, fill the remaining height),
  code (language with syntax highlighting, line numbers and highlighted steps such as `1|2-3|5`), table rows and columns, HTML;
- **appearance (fragment)**: the element appears on click with an effect (fade in, fade up, grow, shrink, highlight, …);
  lists can show their points one by one; the order decides which comes first;
- **auto-animate ID**: elements with the same ID on consecutive auto-animate slides move smoothly from one to the other;
- alignment, size and colour; move, duplicate and delete.

A slide can also be written in **Markdown** or **HTML** (Slide tab, Content); Markdown supports the reveal.js notation,
for example `<!-- .element: class="fragment" -->`.

### Diagrams

A **diagram** block draws a Mermaid flowchart, typed in the inspector, for example
`flowchart LR` and lines like `A[Idea] --> B{Good?}` and `B -->|yes| C([Slides])`. Boxes, rounded boxes, decisions,
terminals, databases, hexagons and circles are laid out automatically, like *Mermaid import* in the diagram editor;
other Mermaid diagram types show an error. The drawing is stored in the presentation as SVG, so it needs no Mermaid
library and works offline; it takes the text colour of the theme. Saving as PowerPoint leaves diagrams out.

### Formulas

Mathematical formulas are written in TeX (LaTeX notation) in any text, Markdown or HTML: `$$ … $$` or `\[ … \]` for a
formula on its own line, `\( … \)` inside a sentence, for example `$$\int_0^1 x^2\,dx = \tfrac13$$` or
`Pythagoras: \(a^2 + b^2 = c^2\)`. A single `$` stays an ordinary dollar sign. The formulas are typeset with KaTeX in the
preview and in the saved presentation, also offline; only presentations that contain formulas include KaTeX (about
0.6 MB). When you edit a text with a formula, you edit its TeX source.

## Slide and presentation settings

- **Slide** tab: background (colour, CSS gradient, image with size and opacity), transition and speed, auto-animate,
  visibility (hidden or not counted), vertical position, automatic advance, **speaker notes**, CSS class.
- **Presentation** tab: title, theme (14 reveal.js themes), code colours, transitions, slide size (e.g. 16:9), arrow
  controls, progress bar, slide numbers, vertical centring, loop, slide number in the address, navigation mode, scrolling
  page view, automatic advance, language and custom CSS.

## Presenting

**▶ Present** (`F5`) shows the presentation from the current slide in full screen. Keys: arrows or `Space` to move, `O` or
`Esc` overview, `S` speaker view with notes and timer, `F` full screen. **↗** presents in a new window (useful with a second
screen), **🖨** opens the print view to save a PDF (choose “Save as PDF” in the print dialog) – with *Print / PDF with speaker notes*
each slide is followed by a page with its notes.

## Files

| Format | Open | Save |
|---|---|---|
| reveal.js presentation (`.html`) | yes – own files completely, other reveal.js presentations with their slides as HTML | yes (Save, `Ctrl+S`) |
| Markdown (`.md`) | yes – `---` separates slides, `--` sub-slides, `Note:` starts speaker notes | Save as → Markdown (texts only) |
| Jupyter notebook (`.ipynb`) | yes – the slide types of the cells (slide, sub-slide, fragment, skip, notes) like `jupyter nbconvert --to slides` | – |
| PowerPoint (`.pptx`) | yes – converted into blocks: titles, texts with formatting, lists, pictures, tables, notes, backgrounds, transitions, entrance animations as fragments | Save as → PowerPoint (blocks laid out top to bottom) |

Markdown files and notebooks are converted; saving creates a new HTML presentation. In the Python notebook, **Slideshow**
shows a slide type for each cell and **🎞️ Slides** opens the notebook here. Undo and redo (`Ctrl+Z`, `Ctrl+Y`) cover all
changes.

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
| `Enter` | Edit the selected element |
| `Esc` | Stop editing |
| `Delete` / `Backspace` | Delete the selected element |

### Presenting

| Keys | Function |
|---|---|
| `F5` | Present |
| `→` / `←` / `Space` | Next / previous step |
| `↑` / `↓` | Vertical slides |
| `S` | Speaker view with notes |
| `O` / `Esc` | Overview of all slides |
| `F` | Fullscreen |
| `B` | Black screen (pause) |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The preview uses the full width; ‹ and › change the slide, **Slides** opens the slide list and **Panels** the inspector.
Double-tap a text to edit it.
