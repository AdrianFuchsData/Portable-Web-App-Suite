# Image editor

The image editor (`imageeditor.html`) edits raster images with layers: painting, shapes, text, gradients, selections,
adjustments and filters, resizing, cropping, rotating, and the clipboard.

## Files

| Format | Open | Save |
|---|---|---|
| PNG, JPEG, WebP | yes | yes (JPEG and WebP with a quality setting) |
| BMP | yes | yes (24 bit) |
| GIF | yes (first frame) | yes (up to 256 colours, transparency, optional dithering) |
| ICO | yes | yes (sizes 16 to 256 pixels in one file) |
| SVG, AVIF | yes (SVG is converted to pixels) | – |
| OpenRaster (`.ora`) | yes, with layers | yes, with layers, opacity, blend modes and visibility |
| Photoshop (`.psd`) | yes, with layers | yes, with layers, opacity, blend modes and visibility |

OpenRaster is the layered format of GIMP, Krita and MyPaint; Photoshop files are understood by most image programs as well. In
PSD files, layer groups are opened as their single layers (hidden groups stay hidden), layer masks are applied to the layers,
and text, shape and adjustment layers keep the pixels Photoshop stored for them (they cannot be edited as text or shapes).
Saving in any other format merges the layers into one image; the application points this out. JPEG and BMP have no transparency; transparent areas become white.

- **File → New** (`Ctrl+N`) asks for the size and the background (white, transparent or the background colour).
- **File → Open** (`Ctrl+O`) opens an image; **Open as layer** adds images as new layers. Dropping image files onto the window opens
  them (or adds them as layers when you have already started working).
- **File → Save** (`Ctrl+S`) and **Save as** (`Ctrl+Shift+S`, with format and quality): directly into the file in Chrome/Edge on the
  desktop, as a download in Firefox and on Android.
- **File → Export selection…** saves the selected part of the active layer, **Export layer…** the active layer on its own, as a
  file of its own (any of the single-image formats); the open image stays as it is.
- **File → Batch processing…** changes many images the same way: choose the images (also from an archive), tick the steps –
  fit into a size, rotate, flip, auto levels, grayscale, sharpen, a text watermark – and the output format, quality and file
  names (`{name}`, `{n}`, `{w}`, `{h}`). **Process and save as ZIP** writes all results into one ZIP (without metadata); images
  that cannot be read are listed in `errors.txt`. The steps are remembered.
- Photos open **upright**: the orientation a camera or phone stored in the file (EXIF) is applied in every browser.
- **File → Image information…** shows the size and the **metadata** of the opened JPEG, PNG or WebP file: camera, lens, exposure,
  date, author, copyright, comments, XMP/IPTC and the **location** where the picture was taken (with a warning). **Save a copy
  without metadata** writes the file again without all of this – the image itself is not re-compressed and stays exactly as it
  was; only the colour profile and the orientation are kept. Saving from the image editor never writes metadata.

## Tools

| Tool | Key | Use |
|---|---|---|
| ✥ Move | `V` | moves the active layer; with a selection, the selected pixels |
| ⬚ Rectangle selection, ◌ Ellipse selection | `M`, `Q` | drag to select (the size is shown while dragging); a click removes the selection; `Shift` for squares/circles; tool options: mode (free, fixed aspect ratio, fixed size – a click places it) and the position and size as numbers |
| ➰ Lasso | `F` | drag around an area to select it freehand |
| ⬠ Polygon lasso | `P` | click the corners; a double-click, `Enter` or a click on the first corner closes the shape, `Backspace` removes the last corner, `Esc` cancels |
| 🪄 Magic wand | `W` | selects pixels of similar colour (tolerance; contiguous or all similar pixels of the layer) |
| 🖌 Brush | `B` | soft-edged painting; the pen pressure of graphics tablets and styluses changes the size |
| ✏ Pencil | `N` | hard pixels without smoothing (pixel art) |
| ⌫ Eraser | `E` | makes pixels transparent |
| ⎘ Clone stamp | `S` | `Alt`+click sets the source (on touch screens: **⊕ Set source**, then tap), then paint: the pixels at the source are copied. **Aligned**: the source keeps its distance to the brush for every stroke; otherwise every stroke starts at the source. A cross shows the source |
| 🩹 Healing brush | `J` | like the clone stamp, but the copied texture takes the colour and brightness of the place it is painted on – removes spots, scratches and blemishes without visible patches |
| 👆 Smudge | `U` | drags colours along the stroke like a wet finger; the opacity sets the strength |
| ◍ Blur / sharpen | `K` | paints a blurred or sharpened (mode) version of the layer; the size sets the radius, the opacity the strength |
| 🪣 Fill | `G` | fills an area of similar colour (tolerance, contiguous or all similar pixels); right-click uses the background colour |
| ▤ Gradient | `D` | drag: linear gradient from foreground to background colour |
| 💧 Colour picker | `I` | takes the colour under the pointer as foreground colour (right-click or `Alt`: background colour) |
| ╱ Line, ▭ Rectangle, ◯ Ellipse | `L`, `R`, `O` | drag; `Shift` for 45° lines, squares and circles; optionally filled with the background colour |
| T Text | `T` | click where the text should start; enter text, font, size, colour, alignment, bold, italic – it becomes a **text layer**; a click on existing text edits it |
| ⛶ Crop | `C` | drag the area to keep – free or with an aspect ratio (original, 1:1, 4:3, 3:2, 16:9, 5:4; upright when dragged taller than wide); the rest is darkened, with thirds; `Enter` or **Crop** crops, `Esc` cancels |
| ⤡ Free transform | `Ctrl+T` | the selected pixels (or the whole layer) in a box: drag a handle to scale (`Shift` keeps the proportions), the round handle or outside the box to rotate (`Shift`: 15° steps), inside to move; position, size and angle can be typed, ⇋ / ⇵ flip; `Enter`, **Apply** or another tool applies, `Esc` cancels; the selection follows |
| ✋ Hand | `H` or hold `Space` | moves the view |

The tool options (size, opacity, filling, tolerance) are on the right. `[` and `]` change the size, `X` swaps foreground and
background colour. All painting tools work only inside the selection, if there is one.

### Brush tips

The brush and the eraser paint with a **brush tip** (tool options): round, soft round, square, diamond, star, calligraphy
(a flat tip at an angle) and scatter. **Hardness** makes the edge of generated tips sharp or soft, **Spacing** sets the distance
between the imprints of the tip (in % of the size: small values give a smooth line, large values a row of separate imprints),
**Angle** turns the tip. With a pen, **Pen pressure: size** (on by default) and **Pen pressure: opacity** follow how hard you press.

**+** loads your own tips, also from an archive: GIMP brushes (`.gbr`, grey or colour – the colour brushes paint in the
foreground colour), GIMP parametric brushes (`.vbr`) and pictures (PNG, JPEG, WebP, … – dark pixels paint, light and transparent
ones do not). Own tips are kept in the browser and travel with exported settings (also in a workspace with settings); **×**
removes one.

### Combining selections

With any selection tool, hold `Shift` to **add** to the existing selection and `Alt` to **subtract** from it; the tool option
**Selection** (New, Add, Subtract, Intersect) does the same without keys, e.g. on a phone. **Edit → Invert selection**
(`Ctrl+Shift+I`) selects everything else. Combined and magic-wand selections follow the pixels exactly; the move tool moves
them like any selection.

### Soft selections: feather, grow, shrink, border

A selection can select pixels **partly**, like in GIMP: a partly selected pixel changes only that much when you paint, fill,
clear, apply a filter or an adjustment, copy (the copy is partly transparent there) or move it (that much of it moves, the rest
stays). In the **Edit** menu:

- **Feather selection…** gives the selection a soft edge over the radius (in pixels).
- **Grow selection…** and **Shrink selection…** move the edge outwards or inwards by the radius; corners become round.
- **Border selection…** selects a band of the radius on both sides of the edge, e.g. to paint a soft outline.

The marching ants show where pixels are selected at least half. **Invert selection** keeps the soft edge. Combining a soft
selection with another one (`Shift`, `Alt`) adds or subtracts the amounts.

### Quick mask

**Quick mask** (`Shift+Q`, **Edit → Quick mask** or the **◐** button in the status bar) shows the selection as an image: what
is not selected is covered in red. Now every painting tool, filter and selection change works on this mask instead of the
image: paint **white** to select, **black** to deselect, **grey** to select partly (e.g. the brush with a soft edge, the
gradient, or **Filters → Blur** for a soft edge). Switch the quick mask off again and the painting is the selection. Changes of the
mask are not part of the image's undo history; image operations (size, rotation, cropping) end the quick mask first.

### Selections by coordinates

The status bar shows the position and size of the selection (`⬚ x, y · width × height`). With a selection tool, the tool options
contain the fields **X**, **Y**, **Width** and **Height**: type values and press `Enter` (or **Select**) to select exactly that
area. **Edit → Selection by coordinates…** does the same in a dialog (rectangle or ellipse), also on phones.

### Rulers, guides and grid

Rulers along the top and left edge show image pixels and the pointer position (**View → Rulers**). Drag from a ruler into the
image to create a **guide** (from the top ruler a horizontal one, from the left ruler a vertical one); with the move or hand
tool, drag a guide to move it, or back onto a ruler (or out of the image) to remove it. **View → New guide…** places a guide at
an exact position, **Remove all guides** removes them.

**Snapping**: selections, shapes, lines, gradients, text and moved selections stick to guides and – if
switched on – to the image edges and the **grid** (View menu: Snap to guides, Grid, Snap to grid, Snap to image edges). **View → Guides and grid…**
sets the grid spacing and how close the pointer must come (in screen pixels). Snapped edges lie exactly on the guide, so a
selection between two guides covers exactly the pixels between them. These settings are remembered in the browser; guides
belong to the open image and are not saved in the file.

## Layers

The layer list on the right shows the layers from top to bottom. Click a layer to make it active; the checkbox shows or hides it,
a double-click on the name renames it. Below the list: **opacity** and **blend mode** (multiply, screen, overlay, …) of the active
layer, and buttons to add, duplicate, move up/down, merge down and delete layers. The **Layer** menu also flips a single layer.

**Layer masks** hide parts of a layer without erasing them: **Layer → Add layer mask** (everything visible) or **Add layer mask
from selection** (visible where selected). The mask appears next to the layer in the list; click it to paint on the mask – white
shows, black hides, grey shows partly (all tools and filters work on it, e.g. a gradient for a soft transition) – and click the layer
thumbnail or name to paint on the layer again. **Disable layer mask** shows the layer without it, **Apply layer mask** makes the
hidden parts transparent for good, **Delete layer mask** removes it. Photoshop files keep layer masks (also those made in
Photoshop stay editable); OpenRaster files keep them for the suite, other programs show the masked result.

**Text layers** (marked **T** in the list) stay editable: click the text with the text tool, the **T** button or **Layer → Edit
text…** to change the text, font, size, colour or alignment; an emptied text removes the layer. Moving the whole layer with the
move tool, cropping and changing the canvas size keep it a text layer. As soon as its pixels change otherwise (painting, filters,
flipping, rotating or scaling the image, merging) it becomes a normal layer – undo makes it a text layer again; **Layer →
Rasterize text layer** does this on purpose. OpenRaster files (`.ora`) keep text layers (other programs show their pixels),
PSD files get their pixels.

## Edit, image and filters

- **Edit**: undo (`Ctrl+Z`) and redo (`Ctrl+Y`) up to 50 steps; cut, copy and paste (`Ctrl+X/C/V`, also with other programs
  through the system clipboard; pasted images become a new layer); select all (`Ctrl+A`), deselect (`Ctrl+D`), clear the selection
  (`Del`), fill the selection with the foreground colour.
- **Image**: image size (with or without smoothing), canvas size (with anchor), crop to selection, rotate by 90° or 180°,
  **rotate by angle…** (any angle; crop to the image so that no empty corners remain, enlarge the canvas, or keep the size),
  **straighten…** (draw a line along something that should be level or upright, e.g. the horizon; the rotate dialog opens with
  the angle), flip, flatten.
- **Filters**: brightness/contrast, hue/saturation (with live preview), levels, curves, auto levels, blur, sharpen, grayscale,
  sepia, invert, emboss, find edges; with a live preview: **colour balance** (cyan–red, magenta–green, yellow–blue for
  shadows, midtones and highlights, optionally preserving the brightness), **vibrance** (more saturation for dull colours, little
  for already strong ones), **threshold** (black and white), **posterize** (fewer levels per colour), **unsharp mask** (radius,
  amount, threshold), **median** (removes noise and dust) and **vignette** (darker – or, negative, lighter – towards the
  corners). Filters change the active layer (inside the selection; partly selected pixels partly).

**Levels…** shows the histogram of the active layer (inside the selection) and sets the input black point, mid-tones (gamma)
and white point, and the output range – for all colours (RGB) or for red, green or blue alone. **Curves…** maps brightness
values with a curve: drag the points, click on the line to add one, double-click a point to remove it; an S-shaped curve
increases the contrast. Both show the result on the image while the dialog is open; **Reset** restores the channel,
**Apply** changes the layer (undo with `Ctrl+Z`).

## View

`Ctrl` + mouse wheel or a pinch gesture on the touchpad zooms at the pointer, the mouse wheel scrolls. `+`, `−`, `0` (fit to window)
and `1` (100 %) work as well; the buttons are at the bottom right. Zoomed in, pixels are shown sharply.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+N` | New image |
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` | Cut, copy, paste |
| `Ctrl+A` / `Ctrl+D` | Select all / deselect |
| `Ctrl+Shift+I` | Invert the selection |
| `Shift+Q` | Quick mask on/off |
| `Delete` / `Backspace` | Clear the selection |
| `Esc` | Cancel / deselect |
| `Ctrl+Shift+N` | New layer |
| `Ctrl+E` | Merge down |
| `[` / `]` | Smaller / larger brush |
| `X` | Swap the colours |

### Tools

| Keys | Function |
|---|---|
| `V` / `H` | Move / hand |
| `M` / `Q` | Rectangle / ellipse selection |
| `F` / `P` / `W` | Lasso / polygon lasso / magic wand |
| `B` / `N` / `E` | Brush / pencil / eraser |
| `S` / `J` / `U` / `K` | Clone stamp / healing brush / smudge / blur and sharpen |
| `G` / `D` | Fill / gradient |
| `I` | Colour picker |
| `L` / `R` / `O` / `T` | Line / rectangle / ellipse / text |
| `C` | Crop tool (`Enter` crops, `Esc` cancels) |
| `Ctrl+T` | Free transform (`Enter` applies, `Esc` cancels) |

### View

| Keys | Function |
|---|---|
| `+` / `-` / `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `0` / `Ctrl+0` | Fit to the window |
| `1` | 100 % |
| `Space+Drag` | Move the view |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

The tools are in a bar below the image. **Panels** opens the tool options and layers. One finger paints, two fingers zoom and move the
view. The menus can be scrolled sideways.
