# Diagram editor

The diagram editor (`diagram.html`) draws flowcharts and other diagrams: shapes, connectors, text, images, several pages.
It opens and saves **draw.io** files, so diagrams can be exchanged with draw.io (diagrams.net) and its desktop app, and it
imports **Excalidraw** drawings.

## Files

| Format | Open | Save |
|---|---|---|
| draw.io (`.drawio`, `.xml`), also compressed | yes, all pages | yes (**Save**, `Ctrl+S`) |
| SVG and PNG with an embedded diagram (`.drawio.svg`, `.drawio.png`) | yes | **Save** writes the image again (first page), **SVG** / **PNG** export |
| Excalidraw (`.excalidraw`) | yes (rectangles, ellipses, diamonds, text, arrows, lines, images) | – |
| Mermaid flowchart (`.mmd`, `.mermaid`) | yes, laid out automatically | – |

The SVG and PNG exports show the current page as a picture and contain the whole diagram, like draw.io's "editable" exports:
open them again in this editor (or in draw.io) to continue editing. A diagram opened from such a picture is saved as that kind
of picture again (with the first page as the picture) – this is how diagrams in presentations, documents and spreadsheets
are edited (*Insert diagram* and *Edit diagram* there). Dropping a diagram file onto the window opens it; dropping
an image inserts it.

**🖨** prints the diagram: every page on its own sheet with its name, scaled to the width of the sheet. Choose "Save as PDF" as
the printer to get a PDF.

> **Note:** draw.io has many more shapes and options. Shapes this editor does not know are shown as rectangles, and labels are plain
> text (bold or coloured parts of a label are not kept). Style settings that the editor does not use are kept when you save, so
> a round trip through this editor does not remove them. Routing points of draw.io connectors are kept and the connector is
> drawn through them; they move with the connector, not with the shapes.

## Drawing

- The shape bar on the left adds a shape in the middle of the view; you can also drag a shape onto the drawing.
- Keyboard tools: `R` rectangle, `O` ellipse, `D` decision (diamond), `N` note, `T` text, `A` connector, `V` select, `H` pan.
  With a shape tool, drag to draw the shape in any size.
- **Connectors**: point at a shape; small circles appear at the middle of each side. Drag from one of them to another shape (onto a
  circle for a fixed side, or anywhere on the shape for a floating end). Drag the end points of a selected connector to attach them
  elsewhere or to leave them free.
- **Text**: double-click a shape or connector to edit its label (`Ctrl+Enter` or a click outside finishes, `Escape` cancels).
  Double-click on an empty place to add a text. `F2` or `Enter` edits the selected item.
- **Images**: the image button inserts a picture file; pasted and dropped images work too.

### Shape libraries

Below the general shapes, further libraries open with a click on their name (the open ones are remembered):

| Library | Shapes |
|---|---|
| UML | class, package, component, actor, use case (ellipse), note |
| BPMN | task, start, intermediate and end event, exclusive gateway, pool, document, data store |
| Network | server, computer, firewall, router, cloud, database |
| Entity relationship | entity, relationship (diamond), attribute (ellipse) |

**Classes and entities** have a title compartment: the first line of the text is the title, the further lines are listed below
it, and a line with only `--` draws a separator (e.g. between fields and methods). **Connector ends** (format panel, Start/End)
include the crow's foot notation for entity relationships (`er-one`, `er-mand-one`, `er-many`, `er-one-many`, `er-zero-one`,
`er-zero-many`) and the hollow triangle and diamond of UML (`block-open` for generalisation, `diamond-open` for aggregation).
All of them are saved as the corresponding draw.io shapes and arrows.

## Selecting and arranging

- Click selects, `Shift`+click adds or removes, dragging on an empty place selects everything inside the frame, `Ctrl+A` selects all.
- Drag to move (on the grid; hold `Alt` for free positioning), drag the handles to resize (`Shift` keeps the proportions). The arrow keys
  move by one point, with `Shift` by one grid step.
- **Rotate:** drag the round handle above the selection (`Shift`: in steps of 15°; near 0°, 90°, 180° and 270° it snaps), or
  enter the angle under **Rotation** in the format panel, or use ⟲ / ⟳ there to turn by 90°. One shape turns around its centre,
  several shapes (for example a group) turn together around the centre of the selection. Connectors stay attached to the
  rotated shapes, and the handles resize a rotated shape along its own sides.
- `Delete` removes the selection (connectors of removed shapes are removed too). `Ctrl+D` duplicates, `Ctrl+C`, `Ctrl+X` and `Ctrl+V`
  copy, cut and paste — also between this editor and draw.io, because the clipboard holds draw.io XML. Pasted plain text becomes a text.
- Undo `Ctrl+Z`, redo `Ctrl+Y` (or `Ctrl+Shift+Z`).

### Groups, locking and layers

- **Group** (`Ctrl+G`, in the format panel) joins the selected shapes and connectors: a click on one of them selects the whole
  group, which then moves together; `Alt`+click selects a single member. Groups can contain groups: grouping a group together
  with further shapes (or with another group) makes a new group around them, so a hierarchy arises. **Ungroup**
  (`Ctrl+Shift+G`) dissolves the outermost selected group (its members stay in the enclosing group); a single member selected
  with `Alt`+click leaves its group.
- **Elements** (☰ above the shapes in the left sidebar) shows the page as a tree: the layers (top layer first), in them the
  groups with their members and the single shapes and connectors, the top-most first (▸ / ▾ folds a layer or group). A click
  on an entry selects it in the diagram – a group or layer stands for all its content –, `Ctrl`+click adds or removes,
  `Shift`+click adds; moving, styles, rotating and the other functions then apply to all of them. A double-click (or `F2`)
  edits the label in place: the text of a shape or connector, the name of a group or layer. `Enter` keeps it (for labels with
  several lines `Shift+Enter` adds a line), `Esc` cancels; each change can be undone. With the keyboard: `↑` `↓` move, `→` `←`
  open and close a layer or group, `Enter` selects.
- **Lock** (`Ctrl+L`) fixes the selection: locked objects cannot be selected, moved or deleted by accident (clicks go through
  them). **Unlock all** in the *Diagram* panel (nothing selected) or `Ctrl+Shift+L` releases them.
- **Layers** (in the *Diagram* panel, top layer first): ◉ chooses the layer new shapes go to, 👁 shows or hides a layer (hidden
  layers are not exported or printed either), 🔒 locks it, ▲ ▼ change the order, a double-click renames it, × deletes it (its
  content moves to the layer below), **+ Add layer** adds one. With several layers, **Move to layer** in the format panel moves
  the selection.

Groups (with their names and nesting), rotation, locks and layers are saved in the draw.io file and are understood by
draw.io; groups and angles of Excalidraw files are taken over when they are opened.

### Automatic layout and Mermaid

**Automatic layout** (in the format panel when nothing is selected – or with several shapes selected, for just those)
arranges the shapes in layers along their connectors: top to bottom, left to right, bottom to top or right to left.
Connectors pointing back against that direction are led around the side. Undo restores the previous arrangement.

**Insert Mermaid…** turns a [Mermaid](https://mermaid.js.org) flowchart into shapes and connectors and lays them out, for
example:

```
flowchart TD
  A[Start] --> B{OK?}
  B -->|yes| C([Done])
  B -- no --> D[(Database)]
  D -.-> A
```

Supported are the direction (`TD`/`TB`, `LR`, `BT`, `RL`), the node shapes `[ ]` rectangle, `( )` rounded, `([ ])` terminator,
`[( )]` cylinder, `(( ))` circle, `{ }` decision, `{{ }}` hexagon, `[/ /]` parallelogram, quoted labels and `<br>`, the links
`-->`, `---`, `-.->` (dashed), `==>` (thick), `<-->`, `--o`, `--x`, labels as `-->|text|` or `-- text -->`, chains and `A & B --> C`.
Subgraphs, styles and classes are ignored; other Mermaid diagram types (sequence, class, …) cannot be imported.

## Format panel

The panel on the right shows the settings of the selection:

| Section | Settings |
|---|---|
| Style | shape type, fill (or none), line colour (or none), line width, dashed, opacity |
| Connector | routing (straight, elbow, curved), arrow at the start and at the end (none, classic, open, diamond, oval) |
| Text | font size and colour, bold, italic, horizontal and vertical alignment |
| Position and size | X, Y, width and height of a single shape; rotation in degrees (all selected shapes), ⟲ / ⟳ by 90° |
| Arrange | to front, to back, duplicate, delete; with several shapes: align left/centre/right/top/middle/bottom, distribute |

Without a selection, the panel switches the grid and snapping on or off.

## Pages and view

The bar at the bottom shows the pages: click to switch, double-click to rename, **+** adds a page, **×** deletes the current page.
`Ctrl` + mouse wheel (or pinch) zooms, the mouse wheel scrolls, hold `Space` or use the hand tool to move the view. **Fit** (`Ctrl+0`)
shows the whole page.

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
| `Ctrl+A` | Select all |
| `Ctrl+D` | Duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `Alt+Click` | Select one member of a group |
| `Ctrl+L` / `Ctrl+Shift+L` | Lock the selection / unlock all |
| `Delete` / `Backspace` | Delete |
| `F2` / `Enter` | Edit the text |
| `←` / `→` / `↑` / `↓` | Move by 1 (with Shift: by the grid) |
| `Ctrl+]` / `Ctrl+[` | Bring forward / send backward |
| `Esc` | Deselect, back to the select tool |

### Tools

| Keys | Function |
|---|---|
| `V` / `H` | Select / hand |
| `A` / `L` | Connector |
| `T` | Text |
| `R` / `O` / `D` / `N` | Rectangle / ellipse / diamond / note |

### View

| Keys | Function |
|---|---|
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Fit to the window |
| `Space+Drag` | Move the view |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The shapes are in a bar below the drawing; tap one to add it. **Format** opens the format panel. Two fingers zoom and move the view.
