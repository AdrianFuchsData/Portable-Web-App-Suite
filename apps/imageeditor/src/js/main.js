/*
 * Image editor: layers, painting and selection tools, adjustments, transformations, clipboard, zoom/pan, PNG/JPEG/WebP/BMP
 * and OpenRaster (layered) files. Document model in doc.js, tools in tools.js, filters in filters.js.
 */
import * as brushes from '@app/brushes.js';
import { BUILTIN_TIPS, tipById, tipPreview, tipFromFile, loadOwnTips, saveOwnTips } from '@app/brushes.js';
import { textBounds, textFont, masksChanged } from '@app/doc.js';
import { readMetadata, stripMetadata, formatOfBytes } from '@app/meta.js';
import { ICO_SIZES } from '@app/gif.js';
import { DEFAULT_STEPS, runBatch } from '@app/batch.js';
import { ImageDoc, BLEND_MODES, SAVE_FORMATS, formatOfName, openFile, encode, decodeImage, canvas, selectionPath, selectionOutline, maskSelection, modifySelection, invertedSelection } from '@app/doc.js';
import { TOOLS, CROP_RATIOS, clampSelection } from '@app/tools.js';
import { snapPoint, snapRect, drawRuler } from '@app/guides.js';
import { ADJUSTMENTS, cssFilter, applyCssFilter, convolve, KERNELS, autoLevels, histogram, levelsLut, curveLut, channelLuts, lutCanvas, applyLuts, PIXEL_ADJUSTMENTS, pixelDefaults, pixelAdjustCanvas, applyPixelAdjust } from '@app/filters.js';
import 'app/spell-dom'; // spelling selector in the header, marks in text fields (shared/js/spell-dom.js)

const { html } = Suite.shell;
const t = Suite.t;
const APP = 'imageeditor';
const OPEN_TYPES = [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.svg', '.avif', '.ora', '.psd'], 'image/vnd.adobe.photoshop': ['.psd'] } }];

Suite.i18n.register({
  en: {
    'app.title': 'Image editor',
    'ie.file': 'File', 'ie.edit': 'Edit', 'ie.image': 'Image', 'ie.layer': 'Layer', 'ie.filters': 'Filters', 'ie.view': 'View',
    'ie.new': 'New…', 'ie.open': 'Open…', 'ie.openLayer': 'Open as layer…', 'ie.save': 'Save', 'ie.saveAs': 'Save as…',
    'ie.undo': 'Undo', 'ie.redo': 'Redo', 'ie.cut': 'Cut', 'ie.copy': 'Copy', 'ie.paste': 'Paste as new layer', 'ie.selectAll': 'Select all',
    'ie.deselect': 'Deselect', 'ie.clear': 'Clear selection', 'ie.fillSel': 'Fill with foreground colour',
    'ie.resize': 'Image size…', 'ie.canvasSize': 'Canvas size…', 'ie.crop': 'Crop to selection', 'ie.rotateCw': 'Rotate 90° clockwise',
    'ie.rotateCcw': 'Rotate 90° counter-clockwise', 'ie.rotate180': 'Rotate 180°', 'ie.flipH': 'Flip horizontally', 'ie.flipV': 'Flip vertically', 'ie.flatten': 'Flatten image',
    'ie.newLayer': 'New layer', 'ie.duplicate': 'Duplicate layer', 'ie.deleteLayer': 'Delete layer', 'ie.mergeDown': 'Merge down',
    'ie.flipLayerH': 'Flip layer horizontally', 'ie.flipLayerV': 'Flip layer vertically',
    'ie.brightnessContrast': 'Brightness/contrast…', 'ie.hueSaturation': 'Hue/saturation…', 'ie.blur': 'Blur…', 'ie.sharpen': 'Sharpen',
    'ie.levels': 'Levels…', 'ie.curves': 'Curves…', 'ie.channel': 'Channel', 'ie.chRgb': 'RGB', 'ie.chR': 'Red', 'ie.chG': 'Green', 'ie.chB': 'Blue',
    'ie.inputLevels': 'Input levels (black, mid-tones, white)', 'ie.outputLevels': 'Output levels', 'ie.reset': 'Reset',
    'ie.curvesHint': 'Drag the points; click on the line adds a point, a double-click removes it.',
    'ie.grayscale': 'Grayscale', 'ie.sepia': 'Sepia', 'ie.invert': 'Invert colours', 'ie.autoLevels': 'Auto levels', 'ie.emboss': 'Emboss', 'ie.edges': 'Find edges',
    'ie.zoomIn': 'Zoom in', 'ie.zoomOut': 'Zoom out', 'ie.fit': 'Fit to window', 'ie.actual': 'Actual size (100 %)',
    'ie.brightness': 'Brightness', 'ie.contrast': 'Contrast', 'ie.hue': 'Hue', 'ie.saturation': 'Saturation', 'ie.lightness': 'Lightness', 'ie.radius': 'Radius',
    'ie.apply': 'Apply', 'ie.cancel': 'Cancel', 'ie.ok': 'OK', 'ie.width': 'Width', 'ie.height': 'Height', 'ie.keepRatio': 'Keep aspect ratio',
    'ie.smooth': 'Smooth (otherwise pixelated)', 'ie.anchor': 'Anchor', 'ie.background': 'Background', 'ie.white': 'White', 'ie.transparent': 'Transparent',
    'ie.foreground': 'Foreground colour', 'ie.bgColor': 'Background colour', 'ie.swap': 'Swap colours (X)', 'ie.size': 'Size', 'ie.opacity': 'Opacity',
    'ie.fillShape': 'Fill with background colour', 'ie.tolerance': 'Tolerance', 'ie.contiguous': 'Contiguous', 'ie.layers': 'Layers', 'ie.blend': 'Blend mode',
    'ie.text': 'Text', 'ie.font': 'Font', 'ie.fontSize': 'Font size', 'ie.bold': 'Bold', 'ie.italic': 'Italic', 'ie.fileName': 'File name', 'ie.format': 'Format',
    'ie.quality': 'Quality', 'ie.panels': 'Panels', 'ie.merged': 'The layers were merged into one image. Save as OpenRaster (.ora) or Photoshop (.psd) to keep them.',
    'ie.noClipboard': 'The clipboard contains no image.', 'ie.discard': 'Discard the unsaved changes?', 'ie.untitled': 'image',
    'ie.cannotOpen': '“{0}” cannot be opened as an image.', 'ie.colors': 'Colours', 'ie.toolOptions': 'Tool options',
    'tool.clone': 'Clone stamp (S)', 'tool.heal': 'Healing brush (J)', 'tool.smudge': 'Smudge (U)', 'tool.blur': 'Blur / sharpen (K)',
    'ie.sourceHint': 'Alt+click (or ⊕ and a tap) sets the source, then paint.', 'ie.sourceSet': 'Source set: paint to copy from it (Alt+click sets a new one).',
    'ie.pickSource': 'Set source', 'ie.aligned': 'Aligned (the source moves with every stroke)', 'ie.blurMode': 'Mode', 'ie.blurMode.blur': 'Blur', 'ie.blurMode.sharpen': 'Sharpen',
    'ie.strengthHint': 'The opacity sets the strength.',
    'ie.adj.colorBalance': 'Colour balance…', 'ie.adj.vibrance': 'Vibrance…', 'ie.adj.threshold': 'Threshold…', 'ie.adj.posterize': 'Posterize…', 'ie.adj.unsharpMask': 'Unsharp mask…', 'ie.adj.median': 'Median (remove noise)…', 'ie.adj.vignette': 'Vignette…',
    'ie.p.range': 'Tone range', 'ie.p.shadows': 'Shadows', 'ie.p.midtones': 'Midtones', 'ie.p.highlights': 'Highlights', 'ie.p.cyanRed': 'Cyan – red', 'ie.p.magentaGreen': 'Magenta – green', 'ie.p.yellowBlue': 'Yellow – blue', 'ie.p.preserve': 'Preserve luminosity',
    'ie.p.vibrance': 'Vibrance', 'ie.p.level': 'Threshold', 'ie.p.levels': 'Levels per channel', 'ie.p.radius': 'Radius', 'ie.p.amount': 'Amount', 'ie.p.threshold': 'Threshold', 'ie.p.size': 'Size', 'ie.p.softness': 'Softness',
    'ie.info': 'Image information…', 'ie.metaNone': 'The file contains no metadata (camera, location, author, comments).', 'ie.metaUnknown': 'Metadata is shown for JPEG, PNG and WebP files opened from a file.',
    'ie.metaGps': 'The picture contains the place where it was taken.', 'ie.metaSaveHint': 'Saving from the image editor writes the image without any of this metadata.', 'ie.metaStrip': 'Save a copy without metadata (unchanged image)',
    'ie.metaCannot': 'This file cannot be saved without its metadata.', 'ie.metaSuffix': '-clean', 'ie.meta.present': 'present', 'ie.meta.kept': 'kept', 'ie.meta.comment': 'Comment', 'ie.meta.icc': 'Colour profile',
    'ie.meta.make': 'Camera maker', 'ie.meta.model': 'Camera', 'ie.meta.lens': 'Lens', 'ie.meta.serialNumber': 'Serial number', 'ie.meta.dateTimeOriginal': 'Taken', 'ie.meta.dateTime': 'Changed', 'ie.meta.exposureTime': 'Exposure', 'ie.meta.fNumber': 'Aperture',
    'ie.meta.iso': 'ISO', 'ie.meta.focalLength': 'Focal length', 'ie.meta.orientation': 'Orientation', 'ie.meta.software': 'Software', 'ie.meta.artist': 'Author', 'ie.meta.owner': 'Owner', 'ie.meta.copyright': 'Copyright', 'ie.meta.description': 'Description', 'ie.meta.gps': 'Location',
    'ie.dither': 'Dithering (smoother colour transitions)', 'ie.icoSizes': 'Icon sizes (pixels)', 'ie.exportSelection': 'Export selection…', 'ie.exportLayer': 'Export layer…', 'ie.selectionWord': 'selection',
    'ie.exportSelHint': 'Saves the selected part of the active layer as its own file; the image stays open as it is.', 'ie.exportLayerHint': 'Saves the active layer on its own; the image stays open as it is.',
    'ie.batch': 'Batch processing…', 'ie.batchPick': 'Choose images…', 'ie.batchCount': '{0} images', 'ie.batchClear': 'clear', 'ie.batchNoFiles': 'Choose the images first.',
    'ie.batchResize': 'Fit into a size (keeps the proportions)', 'ie.batchEnlarge': 'Enlarge smaller images too', 'ie.batchRotate': 'Rotate', 'ie.batchFlip': 'Flip horizontally', 'ie.batchWatermark': 'Text watermark',
    'ie.batchWmSize': 'Size (% of the image)', 'ie.batchWmPos': 'Place', 'ie.pos.br': 'Bottom right', 'ie.pos.bl': 'Bottom left', 'ie.pos.bc': 'Bottom centre', 'ie.pos.tr': 'Top right', 'ie.pos.tl': 'Top left', 'ie.pos.mc': 'Centre',
    'ie.batchOutput': 'Output', 'ie.batchPattern': 'File names', 'ie.batchPatternHint': '{name}: original name, {n}: number, {w} × {h}: new size. All images go into one ZIP, without metadata.',
    'ie.batchRunning': 'Image {0} of {1}…', 'ie.batchRun': 'Process and save as ZIP', 'ie.batchZip': 'images.zip', 'ie.batchDone': '{0} images processed, {1} could not be read (listed in errors.txt).',
    'ie.textColor': 'Colour', 'ie.align': 'Alignment', 'ie.align.left': 'Left', 'ie.align.center': 'Centred', 'ie.align.right': 'Right', 'ie.editText': 'Edit text…', 'ie.rasterize': 'Rasterize text layer', 'ie.notText': 'The active layer is not a text layer.', 'ie.textLayerHint': 'The text becomes a text layer: click it with the text tool to edit it.',
    'ie.brushTip': 'Brush tip', 'ie.hardness': 'Hardness', 'ie.spacing': 'Spacing', 'ie.angle': 'Angle', 'ie.pressureSize': 'Pen pressure: size', 'ie.pressureOpacity': 'Pen pressure: opacity',
    'ie.loadTips': 'Load brush tips (GIMP .gbr / .vbr, images)…', 'ie.removeTip': 'Remove this tip', 'ie.brushFiles': 'Brush tips', 'ie.brushUnreadable': 'not a brush tip that can be read',
    'ie.brushNotStored': 'The tips could not be stored in the browser (too large); they are available until the page is closed.',
    'ie.tip.round': 'Round', 'ie.tip.soft': 'Soft round', 'ie.tip.square': 'Square', 'ie.tip.diamond': 'Diamond', 'ie.tip.star': 'Star', 'ie.tip.calligraphy': 'Calligraphy', 'ie.tip.scatter': 'Scatter',
    'tool.select-lasso': 'Lasso (F)', 'tool.select-polygon': 'Polygon lasso (P)', 'tool.select-wand': 'Magic wand (W)', 'ie.invertSel': 'Invert selection', 'ie.feather': 'Feather selection…', 'ie.grow': 'Grow selection…', 'ie.shrink': 'Shrink selection…', 'ie.border': 'Border selection…', 'ie.noSelection': 'Select something first.', 'ie.selectionGone': 'Nothing is left of the selection.', 'ie.quickMask': 'Quick mask', 'ie.quickMaskOn': 'Quick mask: paint white to select, black to deselect',
    'ie.selOp': 'Selection', 'ie.selOp.new': 'New', 'ie.selOp.add': 'Add (Shift)', 'ie.selOp.subtract': 'Subtract (Alt)', 'ie.selOp.intersect': 'Intersect',
    'ie.selOpHint': 'Shift adds to the selection, Alt subtracts from it.', 'ie.polygonHint': 'Click the corners; double-click, Enter or a click on the first point closes, Backspace removes the last corner.',
    'tool.move': 'Move (V)', 'tool.select-rect': 'Rectangle selection (M)', 'tool.select-ellipse': 'Ellipse selection (Q)', 'tool.brush': 'Brush (B)',
    'tool.pencil': 'Pencil (N)', 'tool.eraser': 'Eraser (E)', 'tool.fill': 'Fill (G)', 'tool.gradient': 'Gradient (D)', 'tool.picker': 'Colour picker (I)',
    'tool.line': 'Line (L)', 'tool.rect': 'Rectangle (R)', 'tool.ellipse': 'Ellipse (O)', 'tool.text': 'Text (T)', 'tool.hand': 'Hand (H, or hold Space)', 'tool.crop': 'Crop (C)', 'ie.addMask': 'Add layer mask', 'ie.addMaskSel': 'Add layer mask from selection', 'ie.editMaskToggle': 'Edit layer mask', 'ie.disableMask': 'Disable layer mask', 'ie.applyMask': 'Apply layer mask', 'ie.deleteMask': 'Delete layer mask',
    'ie.noMask': 'The active layer has no mask.', 'ie.editMask': 'Edit the mask (white shows, black hides)', 'ie.editLayer': 'Edit the layer', 'ie.editingMask': 'Mask', 'tool.transform': 'Free transform (Ctrl+T)', 'ie.nothingToTransform': 'The active layer is empty: nothing to transform.',
    'ie.transformHint': 'Choose this tool with a selection or a layer with content.', 'ie.transformKeys': 'Drag a handle to scale (Shift: keep proportions), the round handle or outside to rotate (Shift: 15° steps), inside to move. Enter applies, Esc cancels.', 'tool.straighten': 'Straighten',
    'ie.cropRatio': 'Aspect ratio', 'ie.ratio.free': 'Free', 'ie.ratio.original': 'Original', 'ie.cropHint': 'Drag the area to keep; Enter crops, Esc cancels.', 'ie.cropApply': 'Crop',
    'ie.rotateAngle': 'Rotate by angle…', 'ie.straighten': 'Straighten…', 'ie.straightenHint': 'Draw a line along something that should be level (or upright).', 'ie.angleDeg': 'Angle (degrees, clockwise)',
    'ie.rotateHint': 'Negative angles turn counter-clockwise.', 'ie.rotate.crop': 'Crop to the image (no empty corners)', 'ie.rotate.expand': 'Enlarge the canvas (whole image)', 'ie.rotate.keep': 'Keep the size (corners transparent)',
    'ie.selectCoords': 'Selection by coordinates…', 'ie.rulers': 'Rulers', 'ie.guides': 'Guides', 'ie.snapGuides': 'Snap to guides', 'ie.grid': 'Grid',
    'ie.snapGrid': 'Snap to grid', 'ie.snapEdges': 'Snap to image edges', 'ie.guideSettings': 'Guides and grid…', 'ie.newGuide': 'New guide…', 'ie.clearGuides': 'Remove all guides',
    'ie.gridSize': 'Grid spacing (px)', 'ie.snapDistance': 'Snap distance (screen px)', 'ie.orientation': 'Orientation', 'ie.horizontal': 'Horizontal', 'ie.vertical': 'Vertical',
    'ie.position': 'Position (px)', 'ie.selMode': 'Mode', 'ie.selFree': 'Free', 'ie.selRatio': 'Fixed aspect ratio', 'ie.selSize': 'Fixed size', 'ie.shape': 'Shape',
    'ie.rectangle': 'Rectangle', 'ie.ellipseShape': 'Ellipse', 'ie.select': 'Select', 'ie.guideHint': 'Drag from a ruler to add a guide; drag it back to remove it (with the move or hand tool).',
  },
  de: {
    'app.title': 'Bildbearbeitung',
    'ie.file': 'Datei', 'ie.edit': 'Bearbeiten', 'ie.image': 'Bild', 'ie.layer': 'Ebene', 'ie.filters': 'Filter', 'ie.view': 'Ansicht',
    'ie.new': 'Neu…', 'ie.open': 'Öffnen…', 'ie.openLayer': 'Als Ebene öffnen…', 'ie.save': 'Speichern', 'ie.saveAs': 'Speichern unter…',
    'ie.undo': 'Rückgängig', 'ie.redo': 'Wiederholen', 'ie.cut': 'Ausschneiden', 'ie.copy': 'Kopieren', 'ie.paste': 'Als neue Ebene einfügen', 'ie.selectAll': 'Alles auswählen',
    'ie.deselect': 'Auswahl aufheben', 'ie.clear': 'Auswahl löschen', 'ie.fillSel': 'Mit Vordergrundfarbe füllen',
    'ie.resize': 'Bildgröße…', 'ie.canvasSize': 'Leinwandgröße…', 'ie.crop': 'Auf Auswahl zuschneiden', 'ie.rotateCw': '90° im Uhrzeigersinn drehen',
    'ie.rotateCcw': '90° gegen den Uhrzeigersinn drehen', 'ie.rotate180': '180° drehen', 'ie.flipH': 'Horizontal spiegeln', 'ie.flipV': 'Vertikal spiegeln', 'ie.flatten': 'Auf eine Ebene reduzieren',
    'ie.newLayer': 'Neue Ebene', 'ie.duplicate': 'Ebene duplizieren', 'ie.deleteLayer': 'Ebene löschen', 'ie.mergeDown': 'Nach unten vereinen',
    'ie.flipLayerH': 'Ebene horizontal spiegeln', 'ie.flipLayerV': 'Ebene vertikal spiegeln',
    'ie.brightnessContrast': 'Helligkeit/Kontrast…', 'ie.hueSaturation': 'Farbton/Sättigung…', 'ie.blur': 'Weichzeichnen…', 'ie.sharpen': 'Schärfen',
    'ie.levels': 'Tonwerte…', 'ie.curves': 'Gradationskurven…', 'ie.channel': 'Kanal', 'ie.chRgb': 'RGB', 'ie.chR': 'Rot', 'ie.chG': 'Grün', 'ie.chB': 'Blau',
    'ie.inputLevels': 'Eingabe (Schwarz, Mitteltöne, Weiß)', 'ie.outputLevels': 'Ausgabe', 'ie.reset': 'Zurücksetzen',
    'ie.curvesHint': 'Ziehen Sie die Punkte; ein Klick auf die Linie fügt einen Punkt hinzu, ein Doppelklick entfernt ihn.',
    'ie.grayscale': 'Graustufen', 'ie.sepia': 'Sepia', 'ie.invert': 'Farben umkehren', 'ie.autoLevels': 'Tonwerte automatisch', 'ie.emboss': 'Relief', 'ie.edges': 'Kanten finden',
    'ie.zoomIn': 'Vergrößern', 'ie.zoomOut': 'Verkleinern', 'ie.fit': 'An Fenster anpassen', 'ie.actual': 'Originalgröße (100 %)',
    'ie.brightness': 'Helligkeit', 'ie.contrast': 'Kontrast', 'ie.hue': 'Farbton', 'ie.saturation': 'Sättigung', 'ie.lightness': 'Helligkeit', 'ie.radius': 'Radius',
    'ie.apply': 'Anwenden', 'ie.cancel': 'Abbrechen', 'ie.ok': 'OK', 'ie.width': 'Breite', 'ie.height': 'Höhe', 'ie.keepRatio': 'Seitenverhältnis beibehalten',
    'ie.smooth': 'Glätten (sonst pixelig)', 'ie.anchor': 'Anker', 'ie.background': 'Hintergrund', 'ie.white': 'Weiß', 'ie.transparent': 'Transparent',
    'ie.foreground': 'Vordergrundfarbe', 'ie.bgColor': 'Hintergrundfarbe', 'ie.swap': 'Farben tauschen (X)', 'ie.size': 'Größe', 'ie.opacity': 'Deckkraft',
    'ie.fillShape': 'Mit Hintergrundfarbe füllen', 'ie.tolerance': 'Toleranz', 'ie.contiguous': 'Zusammenhängend', 'ie.layers': 'Ebenen', 'ie.blend': 'Modus',
    'ie.text': 'Text', 'ie.font': 'Schrift', 'ie.fontSize': 'Schriftgröße', 'ie.bold': 'Fett', 'ie.italic': 'Kursiv', 'ie.fileName': 'Dateiname', 'ie.format': 'Format',
    'ie.quality': 'Qualität', 'ie.panels': 'Bereiche', 'ie.merged': 'Die Ebenen wurden zu einem Bild vereint. Speichern Sie als OpenRaster (.ora) oder Photoshop (.psd), um sie zu behalten.',
    'ie.noClipboard': 'Die Zwischenablage enthält kein Bild.', 'ie.discard': 'Die ungespeicherten Änderungen verwerfen?', 'ie.untitled': 'bild',
    'ie.cannotOpen': '„{0}“ kann nicht als Bild geöffnet werden.', 'ie.colors': 'Farben', 'ie.toolOptions': 'Werkzeugoptionen',
    'tool.clone': 'Kopierstempel (S)', 'tool.heal': 'Reparaturpinsel (J)', 'tool.smudge': 'Wischfinger (U)', 'tool.blur': 'Weichzeichnen / Schärfen (K)',
    'ie.sourceHint': 'Alt+Klick (oder ⊕ und Tippen) legt die Quelle fest, dann malen.', 'ie.sourceSet': 'Quelle gesetzt: malen kopiert von dort (Alt+Klick setzt eine neue).',
    'ie.pickSource': 'Quelle setzen', 'ie.aligned': 'Ausgerichtet (die Quelle wandert mit jedem Strich mit)', 'ie.blurMode': 'Modus', 'ie.blurMode.blur': 'Weichzeichnen', 'ie.blurMode.sharpen': 'Schärfen',
    'ie.strengthHint': 'Die Deckkraft bestimmt die Stärke.',
    'ie.adj.colorBalance': 'Farbbalance…', 'ie.adj.vibrance': 'Dynamik…', 'ie.adj.threshold': 'Schwellwert…', 'ie.adj.posterize': 'Tontrennung…', 'ie.adj.unsharpMask': 'Unscharf maskieren…', 'ie.adj.median': 'Median (Rauschen entfernen)…', 'ie.adj.vignette': 'Vignette…',
    'ie.p.range': 'Tonbereich', 'ie.p.shadows': 'Schatten', 'ie.p.midtones': 'Mitteltöne', 'ie.p.highlights': 'Lichter', 'ie.p.cyanRed': 'Cyan – Rot', 'ie.p.magentaGreen': 'Magenta – Grün', 'ie.p.yellowBlue': 'Gelb – Blau', 'ie.p.preserve': 'Helligkeit erhalten',
    'ie.p.vibrance': 'Dynamik', 'ie.p.level': 'Schwellwert', 'ie.p.levels': 'Stufen je Kanal', 'ie.p.radius': 'Radius', 'ie.p.amount': 'Stärke', 'ie.p.threshold': 'Schwellwert', 'ie.p.size': 'Größe', 'ie.p.softness': 'Weichheit',
    'ie.info': 'Bildinformationen…', 'ie.metaNone': 'Die Datei enthält keine Metadaten (Kamera, Ort, Urheber, Kommentare).', 'ie.metaUnknown': 'Metadaten werden für JPEG-, PNG- und WebP-Dateien gezeigt, die aus einer Datei geöffnet wurden.',
    'ie.metaGps': 'Das Bild enthält den Ort, an dem es aufgenommen wurde.', 'ie.metaSaveHint': 'Speichern aus der Bildbearbeitung schreibt das Bild ohne diese Metadaten.', 'ie.metaStrip': 'Kopie ohne Metadaten speichern (Bild unverändert)',
    'ie.metaCannot': 'Diese Datei kann nicht ohne ihre Metadaten gespeichert werden.', 'ie.metaSuffix': '-bereinigt', 'ie.meta.present': 'vorhanden', 'ie.meta.kept': 'bleibt', 'ie.meta.comment': 'Kommentar', 'ie.meta.icc': 'Farbprofil',
    'ie.meta.make': 'Kamerahersteller', 'ie.meta.model': 'Kamera', 'ie.meta.lens': 'Objektiv', 'ie.meta.serialNumber': 'Seriennummer', 'ie.meta.dateTimeOriginal': 'Aufgenommen', 'ie.meta.dateTime': 'Geändert', 'ie.meta.exposureTime': 'Belichtung', 'ie.meta.fNumber': 'Blende',
    'ie.meta.iso': 'ISO', 'ie.meta.focalLength': 'Brennweite', 'ie.meta.orientation': 'Ausrichtung', 'ie.meta.software': 'Software', 'ie.meta.artist': 'Urheber', 'ie.meta.owner': 'Eigentümer', 'ie.meta.copyright': 'Copyright', 'ie.meta.description': 'Beschreibung', 'ie.meta.gps': 'Ort',
    'ie.dither': 'Rastern (weichere Farbübergänge)', 'ie.icoSizes': 'Symbolgrößen (Pixel)', 'ie.exportSelection': 'Auswahl exportieren…', 'ie.exportLayer': 'Ebene exportieren…', 'ie.selectionWord': 'Auswahl',
    'ie.exportSelHint': 'Speichert den ausgewählten Teil der aktiven Ebene als eigene Datei; das Bild bleibt unverändert offen.', 'ie.exportLayerHint': 'Speichert die aktive Ebene allein; das Bild bleibt unverändert offen.',
    'ie.batch': 'Stapelverarbeitung…', 'ie.batchPick': 'Bilder wählen…', 'ie.batchCount': '{0} Bilder', 'ie.batchClear': 'leeren', 'ie.batchNoFiles': 'Wählen Sie zuerst die Bilder.',
    'ie.batchResize': 'In eine Größe einpassen (Seitenverhältnis bleibt)', 'ie.batchEnlarge': 'Kleinere Bilder auch vergrößern', 'ie.batchRotate': 'Drehen', 'ie.batchFlip': 'Horizontal spiegeln', 'ie.batchWatermark': 'Text-Wasserzeichen',
    'ie.batchWmSize': 'Größe (% des Bildes)', 'ie.batchWmPos': 'Ort', 'ie.pos.br': 'Unten rechts', 'ie.pos.bl': 'Unten links', 'ie.pos.bc': 'Unten Mitte', 'ie.pos.tr': 'Oben rechts', 'ie.pos.tl': 'Oben links', 'ie.pos.mc': 'Mitte',
    'ie.batchOutput': 'Ausgabe', 'ie.batchPattern': 'Dateinamen', 'ie.batchPatternHint': '{name}: ursprünglicher Name, {n}: Nummer, {w} × {h}: neue Größe. Alle Bilder kommen in ein ZIP, ohne Metadaten.',
    'ie.batchRunning': 'Bild {0} von {1}…', 'ie.batchRun': 'Bearbeiten und als ZIP speichern', 'ie.batchZip': 'bilder.zip', 'ie.batchDone': '{0} Bilder bearbeitet, {1} konnten nicht gelesen werden (in errors.txt aufgeführt).',
    'ie.textColor': 'Farbe', 'ie.align': 'Ausrichtung', 'ie.align.left': 'Links', 'ie.align.center': 'Zentriert', 'ie.align.right': 'Rechts', 'ie.editText': 'Text bearbeiten…', 'ie.rasterize': 'Textebene in Pixel umwandeln', 'ie.notText': 'Die aktive Ebene ist keine Textebene.', 'ie.textLayerHint': 'Der Text wird eine Textebene: Klicken Sie ihn mit dem Textwerkzeug an, um ihn zu bearbeiten.',
    'ie.brushTip': 'Pinselspitze', 'ie.hardness': 'Härte', 'ie.spacing': 'Abstand', 'ie.angle': 'Winkel', 'ie.pressureSize': 'Stiftdruck: Größe', 'ie.pressureOpacity': 'Stiftdruck: Deckkraft',
    'ie.loadTips': 'Pinselspitzen laden (GIMP .gbr / .vbr, Bilder)…', 'ie.removeTip': 'Diese Spitze entfernen', 'ie.brushFiles': 'Pinselspitzen', 'ie.brushUnreadable': 'keine lesbare Pinselspitze',
    'ie.brushNotStored': 'Die Spitzen konnten nicht im Browser gespeichert werden (zu groß); sie bleiben bis zum Schließen der Seite verfügbar.',
    'ie.tip.round': 'Rund', 'ie.tip.soft': 'Weich rund', 'ie.tip.square': 'Quadrat', 'ie.tip.diamond': 'Raute', 'ie.tip.star': 'Stern', 'ie.tip.calligraphy': 'Kalligrafie', 'ie.tip.scatter': 'Streuung',
    'tool.select-lasso': 'Lasso (F)', 'tool.select-polygon': 'Polygon-Lasso (P)', 'tool.select-wand': 'Zauberstab (W)', 'ie.invertSel': 'Auswahl umkehren', 'ie.feather': 'Auswahl ausblenden…', 'ie.grow': 'Auswahl vergrößern…', 'ie.shrink': 'Auswahl verkleinern…', 'ie.border': 'Auswahlrand…', 'ie.noSelection': 'Wählen Sie zuerst etwas aus.', 'ie.selectionGone': 'Von der Auswahl ist nichts übrig.', 'ie.quickMask': 'Schnellmaske', 'ie.quickMaskOn': 'Schnellmaske: weiß malen wählt aus, schwarz wählt ab',
    'ie.selOp': 'Auswahl', 'ie.selOp.new': 'Neu', 'ie.selOp.add': 'Hinzufügen (Umschalt)', 'ie.selOp.subtract': 'Abziehen (Alt)', 'ie.selOp.intersect': 'Schnittmenge',
    'ie.selOpHint': 'Umschalt fügt der Auswahl hinzu, Alt zieht davon ab.', 'ie.polygonHint': 'Klicken Sie die Ecken an; Doppelklick, Eingabe oder ein Klick auf den ersten Punkt schließt, Rücktaste entfernt die letzte Ecke.',
    'tool.move': 'Verschieben (V)', 'tool.select-rect': 'Rechteckauswahl (M)', 'tool.select-ellipse': 'Ellipsenauswahl (Q)', 'tool.brush': 'Pinsel (B)',
    'tool.pencil': 'Stift (N)', 'tool.eraser': 'Radierer (E)', 'tool.fill': 'Füllen (G)', 'tool.gradient': 'Verlauf (D)', 'tool.picker': 'Farbpipette (I)',
    'tool.line': 'Linie (L)', 'tool.rect': 'Rechteck (R)', 'tool.ellipse': 'Ellipse (O)', 'tool.text': 'Text (T)', 'tool.hand': 'Hand (H oder Leertaste halten)', 'tool.crop': 'Zuschneiden (C)', 'ie.addMask': 'Ebenenmaske hinzufügen', 'ie.addMaskSel': 'Ebenenmaske aus Auswahl', 'ie.editMaskToggle': 'Ebenenmaske bearbeiten', 'ie.disableMask': 'Ebenenmaske deaktivieren', 'ie.applyMask': 'Ebenenmaske anwenden', 'ie.deleteMask': 'Ebenenmaske löschen',
    'ie.noMask': 'Die aktive Ebene hat keine Maske.', 'ie.editMask': 'Die Maske bearbeiten (weiß zeigt, schwarz verbirgt)', 'ie.editLayer': 'Die Ebene bearbeiten', 'ie.editingMask': 'Maske', 'tool.transform': 'Frei transformieren (Strg+T)', 'ie.nothingToTransform': 'Die aktive Ebene ist leer: Es gibt nichts zu transformieren.',
    'ie.transformHint': 'Wählen Sie dieses Werkzeug mit einer Auswahl oder einer Ebene mit Inhalt.', 'ie.transformKeys': 'Einen Griff ziehen skaliert (Umschalt: Seitenverhältnis bleibt), der runde Griff oder außerhalb dreht (Umschalt: 15°-Schritte), innen verschiebt. Eingabe übernimmt, Esc bricht ab.', 'tool.straighten': 'Ausrichten',
    'ie.cropRatio': 'Seitenverhältnis', 'ie.ratio.free': 'Frei', 'ie.ratio.original': 'Original', 'ie.cropHint': 'Den Bereich aufziehen, der bleiben soll; Eingabe schneidet zu, Esc bricht ab.', 'ie.cropApply': 'Zuschneiden',
    'ie.rotateAngle': 'Um Winkel drehen…', 'ie.straighten': 'Ausrichten…', 'ie.straightenHint': 'Ziehen Sie eine Linie entlang etwas, das waagrecht (oder senkrecht) sein soll.', 'ie.angleDeg': 'Winkel (Grad, im Uhrzeigersinn)',
    'ie.rotateHint': 'Negative Winkel drehen gegen den Uhrzeigersinn.', 'ie.rotate.crop': 'Auf das Bild zuschneiden (keine leeren Ecken)', 'ie.rotate.expand': 'Arbeitsfläche vergrößern (ganzes Bild)', 'ie.rotate.keep': 'Größe behalten (Ecken durchsichtig)',
    'ie.selectCoords': 'Auswahl nach Koordinaten…', 'ie.rulers': 'Lineale', 'ie.guides': 'Hilfslinien', 'ie.snapGuides': 'An Hilfslinien einrasten', 'ie.grid': 'Raster',
    'ie.snapGrid': 'Am Raster einrasten', 'ie.snapEdges': 'An Bildrändern einrasten', 'ie.guideSettings': 'Hilfslinien und Raster…', 'ie.newGuide': 'Neue Hilfslinie…', 'ie.clearGuides': 'Alle Hilfslinien entfernen',
    'ie.gridSize': 'Rasterabstand (px)', 'ie.snapDistance': 'Einrastabstand (Bildschirm-px)', 'ie.orientation': 'Ausrichtung', 'ie.horizontal': 'Waagrecht', 'ie.vertical': 'Senkrecht',
    'ie.position': 'Position (px)', 'ie.selMode': 'Modus', 'ie.selFree': 'Frei', 'ie.selRatio': 'Festes Seitenverhältnis', 'ie.selSize': 'Feste Größe', 'ie.shape': 'Form',
    'ie.rectangle': 'Rechteck', 'ie.ellipseShape': 'Ellipse', 'ie.select': 'Auswählen', 'ie.guideHint': 'Ziehen Sie aus einem Lineal, um eine Hilfslinie anzulegen; ziehen Sie sie zurück, um sie zu entfernen (mit dem Verschiebe- oder Handwerkzeug).',
  },
});

// ---- editor state --------------------------------------------------------------------------------------

const ed = {
  doc: new ImageDoc(800, 600, { background: '#ffffff' }),
  name: '', handle: null, format: 'png',
  tool: TOOLS.find((x) => x.id === 'brush'),
  opts: { size: 8, opacity: 1, cropRatio: 'free', rotateMode: 'crop', brush: { tip: 'round', hardness: 100, spacing: 10, angle: 0, pressureSize: true, pressureOpacity: false }, fillShape: false, tolerance: 32, contiguous: true, selMode: 'free', selRatioW: 16, selRatioH: 9, selW: 100, selH: 100, aligned: true, pickSource: false, blurMode: 'blur' },
  colors: { primary: '#000000', secondary: '#ffffff' },
  view: { zoom: 1, x: 0, y: 0 },
  preview: null, adjust: null, dialog: null, panels: false, cursor: null, renamingLayer: null, clip: null,
  render: () => draw(), refresh: () => refresh(), changed, toImage, textAt, applyCrop: () => applyCrop(), straightened: (a) => straightened(a), cropRect: null,
  guides: [], selecting: false,
};

// ---- view preferences: rulers, guides, grid, snapping (remembered in the browser) -----------------------------------

const PREFS_KEY = 'suite.imageeditor.view';
const prefs = Object.assign(
  { rulers: !window.matchMedia('(max-width: 760px)').matches, guides: true, snapGuides: true, snapEdges: false, grid: false, snapGrid: false, gridSize: 16, snapDistance: 8 },
  (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } })(),
);
ed.prefs = prefs;
function setPref(key, value) {
  prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
  stage.classList.toggle('with-rulers', !!prefs.rulers);
  draw();
  refresh();
}
const snapContext = () => ({ guides: prefs.guides ? ed.guides : [], width: ed.doc.width, height: ed.doc.height, prefs, zoom: ed.view.zoom });
ed.snap = (p) => snapPoint(p, snapContext());
ed.snapRect = (r) => snapRect(r, snapContext());
let nextGuide = 1;
function addGuide(axis, pos) { const g = { id: nextGuide++, axis, pos: Math.round(pos) }; ed.guides.push(g); if (!prefs.guides) setPref('guides', true); draw(); return g; }
ed.name = `${t('ie.untitled')}.png`;

let uiQueued = false;
function refresh() {
  if (uiQueued) return;
  uiQueued = true;
  requestAnimationFrame(() => { uiQueued = false; Suite.shell.refresh(); });
}

function changed() {
  masksChanged();
  ed.doc.dirty = true;
  Suite.shell.setDirty(true);
  thumbsVersion++;
  draw();
  refresh();
}

const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

// ---- view canvas -----------------------------------------------------------------------------------------

const view = document.createElement('canvas');
view.className = 'ie-view';
view.dataset.testid = 'canvas';
view.setAttribute('touch-action', 'none');
// stage: corner, rulers and the canvas box (built once, outside of Preact)
const stage = document.createElement('div');
stage.className = 'ie-stage-grid';
const corner = document.createElement('div');
corner.className = 'ie-ruler-corner';
const rulerH = document.createElement('canvas');
rulerH.className = 'ie-ruler ie-ruler-h';
rulerH.dataset.testid = 'ruler-h';
const rulerV = document.createElement('canvas');
rulerV.className = 'ie-ruler ie-ruler-v';
rulerV.dataset.testid = 'ruler-v';
const canvasBox = document.createElement('div');
canvasBox.className = 'ie-canvas-box';
canvasBox.append(view);
stage.append(corner, rulerH, rulerV, canvasBox);
stage.classList.toggle('with-rulers', !!prefs.rulers);
const vctx = view.getContext('2d');
let viewW = 0, viewH = 0;
const dpr = () => window.devicePixelRatio || 1;

const checker = (() => {
  const c = canvas(16, 16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#ccc'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8);
  return vctx.createPattern(c, 'repeat');
})();

let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; paint(); });
}

function paint() {
  const { zoom, x, y } = ed.view;
  const doc = ed.doc;
  const ratio = dpr();
  vctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  vctx.clearRect(0, 0, viewW, viewH);
  // checkerboard (screen space) behind the image
  vctx.save();
  vctx.beginPath();
  vctx.rect(x, y, doc.width * zoom, doc.height * zoom);
  vctx.clip();
  vctx.fillStyle = checker;
  vctx.fillRect(x, y, doc.width * zoom, doc.height * zoom);
  vctx.translate(x, y);
  vctx.scale(zoom, zoom);
  vctx.imageSmoothingEnabled = zoom < 2;
  doc.drawLayers(vctx, { override: ed.preview, filterLayer: ed.adjust ? doc.layer : null, filter: ed.adjust ? ed.adjust.filter : 'none' });
  if (doc.quickMask) vctx.drawImage(quickMaskOverlay(ed.preview && ed.preview.layer === doc.quickMask ? ed.preview.canvas : doc.quickMask.canvas), 0, 0);
  vctx.restore();
  vctx.save();
  vctx.translate(x, y);
  vctx.scale(zoom, zoom);
  if (ed.tool.overlay) ed.tool.overlay(vctx, zoom, ed);
  // selection outline (black/white dashes) and brush cursor
  if (doc.selection) {
    vctx.lineWidth = 1 / zoom;
    vctx.beginPath();
    selectionOutline(vctx, doc.selection);
    vctx.setLineDash([]);
    vctx.strokeStyle = '#000';
    vctx.stroke();
    vctx.setLineDash([4 / zoom, 4 / zoom]);
    vctx.strokeStyle = '#fff';
    vctx.stroke();
  }
  if (ed.cursor && ['brush', 'pencil', 'eraser', 'clone', 'heal', 'smudge', 'blur'].includes(ed.tool.id)) {
    vctx.setLineDash([]);
    vctx.lineWidth = 1 / zoom;
    vctx.strokeStyle = 'rgba(128,128,128,.9)';
    vctx.beginPath();
    vctx.arc(ed.cursor.x, ed.cursor.y, Math.max(0.5, ed.opts.size / 2), 0, Math.PI * 2);
    vctx.stroke();
  }
  vctx.restore();
  vctx.strokeStyle = 'rgba(0,0,0,.4)';
  vctx.lineWidth = 1;
  vctx.strokeRect(x - 0.5, y - 0.5, doc.width * zoom + 1, doc.height * zoom + 1);
  paintGuides();
  paintRulers();
  syncSelectionInfo();
}

/** Grid (over the image), guides (across the view) and the size of a selection being drawn. */
function paintGuides() {
  const { zoom, x, y } = ed.view;
  const doc = ed.doc;
  if (prefs.grid && prefs.gridSize * zoom >= 4) {
    vctx.save();
    vctx.beginPath();
    for (let gx = prefs.gridSize; gx < doc.width; gx += prefs.gridSize) { const sx = Math.round(x + gx * zoom) + 0.5; vctx.moveTo(sx, y); vctx.lineTo(sx, y + doc.height * zoom); }
    for (let gy = prefs.gridSize; gy < doc.height; gy += prefs.gridSize) { const sy = Math.round(y + gy * zoom) + 0.5; vctx.moveTo(x, sy); vctx.lineTo(x + doc.width * zoom, sy); }
    vctx.strokeStyle = 'rgba(0,0,0,.28)';
    vctx.lineWidth = 1;
    vctx.stroke();
    vctx.restore();
  }
  if (prefs.guides) {
    for (const g of ed.guides) {
      const s = Math.round((g.axis === 'v' ? x : y) + g.pos * zoom) + 0.5;
      vctx.beginPath();
      if (g.axis === 'v') { vctx.moveTo(s, 0); vctx.lineTo(s, viewH); } else { vctx.moveTo(0, s); vctx.lineTo(viewW, s); }
      vctx.lineWidth = 1;
      vctx.setLineDash([]);
      vctx.strokeStyle = guideDrag && guideDrag.guide === g ? 'rgba(255,90,0,.95)' : 'rgba(0,150,255,.95)';
      vctx.stroke();
    }
  }
  const sel = doc.selection;
  if (ed.selecting && sel) {
    const label = `${sel.w} × ${sel.h}`;
    vctx.font = '12px system-ui, sans-serif';
    const tw = vctx.measureText(label).width + 8;
    const lx = Math.min(viewW - tw - 2, x + (sel.x + sel.w) * zoom + 6), ly = Math.min(viewH - 20, y + (sel.y + sel.h) * zoom + 6);
    vctx.fillStyle = 'rgba(0,0,0,.7)';
    vctx.fillRect(lx, ly, tw, 18);
    vctx.fillStyle = '#fff';
    vctx.textBaseline = 'middle';
    vctx.fillText(label, lx + 4, ly + 9);
  }
}

function paintRulers() {
  if (!prefs.rulers) return;
  const style = getComputedStyle(document.documentElement);
  const color = (name, fallback) => (style.getPropertyValue(name) || '').trim() || fallback;
  const colors = {
    bg: color('--pico-card-sectioning-background-color', '#f4f4f4'), image: color('--pico-card-background-color', '#fff'),
    fg: color('--pico-muted-color', '#666'), tick: color('--pico-muted-border-color', '#bbb'), mark: 'rgba(255,90,0,.95)', guide: 'rgba(0,150,255,.95)',
  };
  const c = ed.cursor;
  const guides = prefs.guides ? ed.guides : [];
  drawRuler(rulerH, { horizontal: true, offset: ed.view.x, zoom: ed.view.zoom, cursor: c ? c.x : null, guides: guides.filter((g) => g.axis === 'v').map((g) => g.pos), size: ed.doc.width, colors });
  drawRuler(rulerV, { horizontal: false, offset: ed.view.y, zoom: ed.view.zoom, cursor: c ? c.y : null, guides: guides.filter((g) => g.axis === 'h').map((g) => g.pos), size: ed.doc.height, colors });
}

/** Selection position and size in the status bar and in the selection fields of the tool options (unless edited). */
function syncSelectionInfo() {
  const sel = ed.doc.selection;
  const info = document.querySelector('[data-testid=selection-info]');
  if (info) info.textContent = sel ? `⬚ ${sel.x}, ${sel.y} · ${sel.w} × ${sel.h}` : '';
  for (const key of ['x', 'y', 'w', 'h']) {
    const el = document.querySelector(`[data-testid=sel-${key}]`);
    if (el && el !== document.activeElement) el.value = sel ? sel[key] : '';
  }
}

function resizeView() {
  const box = view.parentElement;
  if (!box) return;
  const r = box.getBoundingClientRect();
  viewW = r.width; viewH = r.height;
  view.width = Math.round(r.width * dpr());
  view.height = Math.round(r.height * dpr());
  view.style.width = `${r.width}px`;
  view.style.height = `${r.height}px`;
  if (!ed.fitted && viewW > 0) { fit(); ed.fitted = true; }
  draw();
}
const resizeObserver = new ResizeObserver(resizeView);

function fit() {
  const pad = 24;
  const zoom = Math.min(1, (viewW - pad * 2) / ed.doc.width, (viewH - pad * 2) / ed.doc.height);
  setZoom(Math.max(0.01, zoom), null, true);
}

function setZoom(zoom, at = null, center = false) {
  zoom = Math.min(64, Math.max(0.01, zoom));
  const v = ed.view;
  if (center) {
    v.x = Math.round((viewW - ed.doc.width * zoom) / 2);
    v.y = Math.round((viewH - ed.doc.height * zoom) / 2);
  } else {
    const p = at || { x: viewW / 2, y: viewH / 2 };
    v.x = p.x - ((p.x - v.x) * zoom) / v.zoom;
    v.y = p.y - ((p.y - v.y) * zoom) / v.zoom;
  }
  v.zoom = zoom;
  draw();
  refresh();
}
const zoomStep = (dir, at) => setZoom(ed.view.zoom * (dir > 0 ? 1.25 : 0.8), at);

function toImage(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left - ed.view.x) / ed.view.zoom, y: (e.clientY - r.top - ed.view.y) / ed.view.zoom };
}

// pointer input: tools, panning (hand, Space, middle button), two-finger pinch/pan and guides
const pointers = new Map();
let pan = null, pinch = null, toolActive = false, spaceDown = false, guideDrag = null;

/** Tool coordinates: snapped to guides, grid and image edges for the tools that use it. */
const toolPoint = (e) => (ed.tool.snaps ? ed.snap(toImage(e)) : toImage(e));

/** The guide within 4 screen pixels of the pointer (move and hand tools), or null. */
function guideAt(e) {
  if (!prefs.guides || !['move', 'hand'].includes(ed.tool.id)) return null;
  const r = view.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  return ed.guides.find((g) => Math.abs((g.axis === 'v' ? ed.view.x + g.pos * ed.view.zoom - sx : ed.view.y + g.pos * ed.view.zoom - sy)) <= 4) || null;
}
function moveGuide(e) {
  const p = toImage(e);
  const g = guideDrag.guide;
  g.pos = Math.round(g.axis === 'v' ? p.x : p.y);
  ed.cursor = p;
  draw();
}
/** Dropping a guide outside of the canvas or outside of the image removes it. */
function endGuide(e) {
  const r = view.getBoundingClientRect();
  const g = guideDrag.guide;
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside || g.pos < 0 || g.pos > (g.axis === 'v' ? ed.doc.width : ed.doc.height)) ed.guides = ed.guides.filter((x) => x !== g);
  guideDrag = null;
  draw();
  refresh();
}
for (const [ruler, axis] of [[rulerH, 'h'], [rulerV, 'v']]) {
  ruler.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ruler.setPointerCapture(e.pointerId);
    guideDrag = { guide: addGuide(axis, -1) };
    moveGuide(e);
  });
  ruler.addEventListener('pointermove', (e) => { if (guideDrag) moveGuide(e); });
  ruler.addEventListener('pointerup', (e) => { if (guideDrag) endGuide(e); });
  ruler.addEventListener('pointercancel', () => { if (guideDrag) { ed.guides = ed.guides.filter((x) => x !== guideDrag.guide); guideDrag = null; draw(); } });
}

view.addEventListener('pointerdown', (e) => {
  view.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenus();
  if (pointers.size === 2) {
    if (toolActive && ed.tool.cancel) { ed.tool.cancel(ed); if (ed.doc.undoStack.length) ed.doc.undo(); ed.doc.redoStack.pop(); }
    toolActive = false;
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: ed.view.zoom, vx: ed.view.x, vy: ed.view.y };
    draw();
    return;
  }
  const guide = e.button === 0 && !spaceDown ? guideAt(e) : null;
  if (guide) { guideDrag = { guide }; draw(); return; }
  if (e.button === 1 || ed.tool.id === 'hand' || spaceDown) {
    pan = { x: e.clientX, y: e.clientY, vx: ed.view.x, vy: ed.view.y };
    return;
  }
  if (e.button !== 0 && !(e.button === 2 && ['fill', 'picker'].includes(ed.tool.id))) return;
  if (ed.tool.down) { toolActive = true; ed.tool.down(toolPoint(e), e, ed); draw(); }
});

view.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const r = view.getBoundingClientRect();
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = Math.min(64, Math.max(0.01, pinch.zoom * (dist / pinch.dist)));
    const px = pinch.mid.x - r.left, py = pinch.mid.y - r.top;
    ed.view.zoom = zoom;
    ed.view.x = px - ((px - pinch.vx) * zoom) / pinch.zoom + (mid.x - pinch.mid.x);
    ed.view.y = py - ((py - pinch.vy) * zoom) / pinch.zoom + (mid.y - pinch.mid.y);
    draw();
    refresh();
    return;
  }
  if (guideDrag) { moveGuide(e); return; }
  if (pan) {
    ed.view.x = pan.vx + e.clientX - pan.x;
    ed.view.y = pan.vy + e.clientY - pan.y;
    draw();
    return;
  }
  const p = toImage(e);
  ed.cursor = e.pointerType === 'touch' ? null : p;
  if ((toolActive || ed.tool.id === 'select-polygon') && ed.tool.move) ed.tool.move(toolPoint(e), e, ed); // the polygon lasso follows the pointer between clicks
  else if (!toolActive) { const g = guideAt(e); view.style.cursor = g ? (g.axis === 'v' ? 'col-resize' : 'row-resize') : toolCursor(); }
  draw();
  setStatusPos(p);
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (guideDrag) { endGuide(e); return; }
  if (pan) { pan = null; refresh(); return; }
  if (toolActive) {
    toolActive = false;
    if (ed.tool.up) ed.tool.up(toolPoint(e), e, ed);
    draw();
    refresh();
  }
}
view.addEventListener('pointerup', endPointer);
view.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  if (toolActive && ed.tool.cancel) ed.tool.cancel(ed);
  toolActive = false; pan = null; pinch = null;
  draw();
});
view.addEventListener('pointerleave', () => { if (!guideDrag) { ed.cursor = null; draw(); } });
view.addEventListener('contextmenu', (e) => e.preventDefault());
view.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = view.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) setZoom(ed.view.zoom * Math.exp(-e.deltaY * 0.0025), { x: e.clientX - r.left, y: e.clientY - r.top });
  else { ed.view.x -= e.shiftKey ? e.deltaY : e.deltaX; ed.view.y -= e.shiftKey ? 0 : e.deltaY; draw(); }
}, { passive: false });

let statusEl = null;
function setStatusPos(p) {
  if (!statusEl) statusEl = document.querySelector('[data-testid=position]');
  if (statusEl) statusEl.textContent = p && p.x >= 0 && p.y >= 0 && p.x < ed.doc.width && p.y < ed.doc.height ? `${Math.floor(p.x)}, ${Math.floor(p.y)}` : '';
}

// ---- documents and files --------------------------------------------------------------------------------

// recovery copies of unsaved work (shared/js/autosave.js): the layers as OpenRaster
Suite.autosave.register({
  app: APP,
  save: async () => (ed.doc.dirty ? { name: ed.name, handle: ed.handle, ora: await encode(ed.doc, 'ora') } : null),
  restore: async (s) => { setDoc(await openFile(s.ora, 'recovered.ora'), s.name, s.handle || null); changed(); },
});

function setDoc(doc, name, handle = null) {
  if (ed.tool.cancel) ed.tool.cancel(ed);
  ed.original = null;
  if (ed.doc && ed.doc.quickMask) ed.doc.leaveQuickMask();
  ed.doc = doc;
  ed.name = name;
  ed.handle = handle;
  ed.format = formatOfName(name);
  ed.preview = null;
  ed.adjust = null;
  ed.guides = [];
  doc.dirty = false;
  Suite.shell.setDirty(false);
  thumbsVersion++;
  fit();
  refresh();
}

async function confirmDiscard() { return !ed.doc.dirty || Suite.shell.confirm(t('ie.discard')); }

async function openPicked({ file, handle }) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setDoc(await openFile(bytes, file.name), file.name, handle);
    ed.original = formatOfBytes(bytes) ? { bytes, name: file.name } : null; // (for "Image information": metadata, a copy without it)
    if (handle) Suite.files.remember(APP, handle);
  } catch (e) { console.warn(e); Suite.shell.toast(t('ie.cannotOpen', file.name), 'error'); }
}

async function openImage() {
  if (!(await confirmDiscard())) return;
  const picked = await Suite.files.open({ types: OPEN_TYPES }).catch(fail);
  if (picked) await openPicked(picked[0]);
}

async function addImageLayer(blob, name) {
  try {
    const img = await decodeImage(blob);
    ed.doc.addLayer(name.replace(/\.[^.]+$/, ''), { source: img, index: ed.doc.active + 1 });
    selectTool('move');
    changed();
  } catch (e) { Suite.shell.toast(t('ie.cannotOpen', name), 'error'); }
}

async function openAsLayer() {
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true }).catch(fail);
  if (picked) for (const p of picked) await addImageLayer(p.file, p.file.name);
}

function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

/** Export the selection's pixels (of the active layer) or the active layer on its own as a file; the open image stays as it is. */
async function exportPart(d, name, opts) {
  try {
    let c;
    if (d.export === 'selection') {
      const sel = selectionCanvas();
      if (!sel) return;
      c = sel.canvas;
    } else c = ed.doc.layers[ed.doc.active].canvas;
    const tmp = new ImageDoc(c.width, c.height);
    tmp.layers[0].canvas = c;
    const fmt = ['ora', 'psd'].includes(d.format) ? 'png' : d.format;
    const bytes = await encode(tmp, fmt, opts);
    const info = SAVE_FORMATS[fmt];
    const result = await Suite.files.saveAs(bytes, { suggestedName: name.replace(/\.[^.]+$/, info.ext), types: [{ description: info.label, accept: { [info.mime]: [info.ext] } }], type: info.mime });
    if (result) report(result);
  } catch (e) { fail(e); }
}

async function save({ as = false, name = ed.name, format = ed.format, quality = 0.92, dither = true, icoSizes } = {}) {
  try {
    if (ed.preview && ed.tool.cancel) ed.tool.cancel(ed);
    const bytes = await encode(ed.doc, format, { quality, dither, icoSizes });
    const info = SAVE_FORMATS[format];
    const types = [{ description: info.label, accept: { [info.mime]: [info.ext] } }];
    const result = as || !ed.handle ? await Suite.files.saveAs(bytes, { suggestedName: name, types, type: info.mime }) : await Suite.files.save({ name, handle: ed.handle }, bytes, { type: info.mime });
    if (!result) return;
    report(result);
    if (result.handle) ed.handle = result.handle;
    ed.name = result.name || name;
    ed.format = format;
    ed.doc.dirty = false;
    Suite.shell.setDirty(false);
    if (format !== 'ora' && format !== 'psd' && ed.doc.layers.length > 1) Suite.shell.toast(t('ie.merged'), 'warning');
    refresh();
  } catch (e) { fail(e); }
}

function openSaveAs(exportWhat = null) {
  const stem = ed.name.replace(/\.[^.]+$/, '') || t('ie.untitled');
  const format = exportWhat ? (['jpeg', 'webp', 'bmp', 'gif', 'ico'].includes(ed.format) ? ed.format : 'png') : ed.format;
  ed.dialog = { kind: 'saveAs', stem: exportWhat === 'layer' ? `${stem}-${ed.doc.layers[ed.doc.active].name}` : exportWhat ? `${stem}-${t('ie.selectionWord')}` : stem,
    format, quality: 92, dither: true, icoSizes: [16, 32, 48, 256], export: exportWhat };
  refresh();
}

// ---- quick mask ----------------------------------------------------------------------------------------------

let overlayCanvas = null;
/** Red over what is not selected (half opaque where nothing is selected, like GIMP), from the grey mask. */
function quickMaskOverlay(mask) {
  const { width: w, height: h } = mask;
  if (!overlayCanvas || overlayCanvas.width !== w || overlayCanvas.height !== h) overlayCanvas = canvas(w, h);
  const d = mask.getContext('2d').getImageData(0, 0, w, h).data;
  const octx = overlayCanvas.getContext('2d');
  const out = octx.createImageData(w, h);
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const amount = ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * d[i + 3]) / 255;
    o[i] = 255; o[i + 3] = (255 - amount) * 0.5;
  }
  octx.putImageData(out, 0, 0);
  return overlayCanvas;
}

/** Quick mask (Shift+Q): the selection becomes a grey image to paint on; switched off, the painting is the selection. */
function toggleQuickMask() {
  if (ed.tool.cancel) ed.tool.cancel(ed);
  ed.preview = null;
  if (ed.doc.quickMask) ed.doc.leaveQuickMask(); else ed.doc.enterQuickMask();
  thumbsVersion++;
  draw();
  refresh();
}

/** Before operations on the image or its layers: the quick mask ends (its painting becomes the selection). */
function endQuickMask() { if (ed.doc.quickMask) toggleQuickMask(); }

// ---- edit operations ----------------------------------------------------------------------------------------

/** Pixels of the selection (or the whole layer) of the active layer as a canvas of the selection's bounds. */
function selectionCanvas() {
  const doc = ed.doc;
  const b = doc.selectionBounds();
  if (b.w < 1 || b.h < 1) return null;
  const c = canvas(b.w, b.h);
  const ctx = c.getContext('2d');
  ctx.translate(-b.x, -b.y);
  if (doc.softSelection) {
    // partly selected pixels are copied partly (their alpha)
    ctx.drawImage(doc.layer.canvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(doc.maskCanvas(), 0, 0);
    return { canvas: c, x: b.x, y: b.y };
  }
  doc.clip(ctx);
  ctx.drawImage(doc.layer.canvas, 0, 0);
  return { canvas: c, x: b.x, y: b.y };
}

async function copy() {
  const sel = selectionCanvas();
  if (!sel) return;
  ed.clip = sel;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = await new Promise((r) => sel.canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  } catch (e) { /* the internal clipboard still works */ }
}

function clearSelection() {
  const doc = ed.doc;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  doc.paintThrough(ctx, (c) => c.clearRect(0, 0, doc.width, doc.height));
  changed();
}

async function cut() { await copy(); clearSelection(); }

function pasteCanvas(source, x = 0, y = 0) {
  const doc = ed.doc;
  const layer = doc.addLayer(t('ie.paste').replace(/ .*/, ''), { index: doc.active + 1 });
  layer.canvas.getContext('2d').drawImage(source, x, y);
  doc.selection = { type: 'rect', x, y, w: source.width, h: source.height };
  selectTool('move');
  changed();
}

async function paste() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith('image/'));
        if (type) { const img = await decodeImage(await item.getType(type)); pasteCanvas(img, ed.clip && ed.clip.canvas.width === img.width && ed.clip.canvas.height === img.height ? ed.clip.x : 0, ed.clip && ed.clip.canvas.width === img.width ? ed.clip.y : 0); return; }
      }
    }
  } catch (e) { /* permission denied or not supported: fall back to the internal clipboard */ }
  if (ed.clip) pasteCanvas(ed.clip.canvas, ed.clip.x, ed.clip.y);
  else Suite.shell.toast(t('ie.noClipboard'), 'warning');
}

document.addEventListener('paste', async (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault();
  try { pasteCanvas(await decodeImage(file)); } catch (err) { fail(err); }
});

function fillSelection() {
  const doc = ed.doc;
  doc.record('layer');
  const ctx = doc.layer.canvas.getContext('2d');
  doc.paintThrough(ctx, (c) => { c.globalAlpha = ed.opts.opacity; c.fillStyle = ed.colors.primary; c.fillRect(0, 0, doc.width, doc.height); });
  changed();
}

function undo() { if (ed.tool.cancel) ed.tool.cancel(ed); if (ed.doc.undo()) { thumbsVersion++; changed(); } }
function redo() { if (ed.doc.redo()) { thumbsVersion++; changed(); } }

function docOp(fn) { return () => { endQuickMask(); fn(ed.doc); thumbsVersion++; changed(); if (ed.view.zoom) fit(); }; }

const toolCursor = () => ({ hand: 'grab', move: 'move', text: 'text', picker: 'copy' }[ed.tool.id] || 'crosshair');

/** Select everything that is not selected (nothing selected: nothing changes). */
function invertSelection() {
  if (!ed.doc.selection) return;
  ed.doc.selection = invertedSelection(ed.doc);
  draw();
}

function selectTool(id) {
  if (ed.tool.leave) ed.tool.leave(ed); else if (ed.tool.cancel) ed.tool.cancel(ed); // (a pending free transform is applied)
  ed.tool = TOOLS.find((x) => x.id === id) || ed.tool;
  if (ed.tool.activate && !ed.tool.activate(ed)) Suite.shell.toast(t('ie.nothingToTransform'), 'warning');
  view.style.cursor = toolCursor();
  draw();
  refresh();
}

/**
 * The text tool: a click on the text of a text layer edits it (the active layer first, then from the top), elsewhere a new
 * text layer starts there.
 */
// ---- batch processing (batch.js) ------------------------------------------------------------------------------------------

const BATCH_KEY = 'suite.imageeditor.batch';
function openBatch() {
  let steps = structuredClone(DEFAULT_STEPS);
  try { const saved = JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); if (saved) for (const k of Object.keys(steps)) Object.assign(steps[k], saved[k] || {}); } catch (e) { /* defaults */ }
  ed.dialog = { kind: 'batch', files: [], steps, running: false, progress: 0 };
  refresh();
}

async function pickBatchFiles(d) {
  const picked = await Suite.files.open({ types: OPEN_TYPES, multiple: true });
  if (!picked) return;
  for (const p of picked) d.files.push({ name: p.file.name, bytes: new Uint8Array(await p.file.arrayBuffer()) });
  refresh();
}

async function runBatchDialog(d) {
  if (!d.files.length) { Suite.shell.toast(t('ie.batchNoFiles'), 'warning'); ed.dialog = d; refresh(); return; }
  try { localStorage.setItem(BATCH_KEY, JSON.stringify(d.steps)); } catch (e) { /* not remembered */ }
  d.running = true;
  ed.dialog = d;
  refresh();
  const result = await runBatch(d.files, d.steps, { onProgress: (i, n) => { d.progress = i; d.total = n; refresh(); }, cancelled: () => ed.dialog !== d });
  if (ed.dialog !== d) return; // (cancelled)
  ed.dialog = null;
  refresh();
  const saved = await Suite.files.saveAs(result.zip, { suggestedName: t('ie.batchZip'), types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }], type: 'application/zip' });
  if (saved) report(saved);
  Suite.shell.toast(t('ie.batchDone', result.done, result.errors.length), result.errors.length ? 'warning' : 'success');
}

function batchBody(d) {
  const st = d.steps;
  const check = (step, label) => html`<label><input type="checkbox" checked=${st[step].on} data-testid=${`batch-${step}`} onChange=${(e) => { st[step].on = e.target.checked; refresh(); }} /> ${label}</label>`;
  const num = (step, key, label, min, max) => html`<label>${label}<input type="number" min=${min} max=${max} value=${st[step][key]} data-testid=${`batch-${step}-${key}`}
    onInput=${(e) => { st[step][key] = Math.max(min, Math.min(max, Math.round(+e.target.value || min))); }} /></label>`;
  if (d.running) return html`<h3>${t('ie.batch').replace('…', '')}</h3><p data-testid="batch-progress">${t('ie.batchRunning', Math.min(d.progress + 1, d.total || 1), d.total || d.files.length)}</p>
    <progress value=${d.progress} max=${d.total || d.files.length}></progress>`;
  return html`<h3>${t('ie.batch').replace('…', '')}</h3>
    <p><button type="button" class="secondary" data-testid="batch-files" onClick=${() => pickBatchFiles(d).catch(fail)}>${t('ie.batchPick')}</button>
      <span data-testid="batch-count"> ${t('ie.batchCount', d.files.length)}</span>
      ${d.files.length ? html` <a href="#" data-testid="batch-clear" onClick=${(e) => { e.preventDefault(); d.files = []; refresh(); }}>${t('ie.batchClear')}</a>` : null}</p>
    ${check('resize', t('ie.batchResize'))}
    ${st.resize.on ? html`<div class="ie-row">${num('resize', 'width', t('ie.width'), 1, 20000)}${num('resize', 'height', t('ie.height'), 1, 20000)}</div>
      <label><input type="checkbox" checked=${st.resize.enlarge} onChange=${(e) => { st.resize.enlarge = e.target.checked; }} /> ${t('ie.batchEnlarge')}</label>` : null}
    ${check('rotate', t('ie.batchRotate'))}
    ${st.rotate.on ? html`<select data-testid="batch-rotate-degrees" onChange=${(e) => { st.rotate.degrees = +e.target.value; }}>${[90, 180, 270].map((v) => html`<option value=${v} selected=${st.rotate.degrees === v}>${v}°</option>`)}</select>` : null}
    ${check('flip', t('ie.batchFlip'))}
    ${check('autoLevels', t('ie.autoLevels'))}${check('grayscale', t('ie.grayscale'))}${check('sharpen', t('ie.sharpen'))}
    ${check('watermark', t('ie.batchWatermark'))}
    ${st.watermark.on ? html`<label>${t('ie.text')}<input value=${st.watermark.text} data-testid="batch-watermark-text" onInput=${(e) => { st.watermark.text = e.target.value; }} /></label>
      <div class="ie-row">${num('watermark', 'size', t('ie.batchWmSize'), 1, 30)}${num('watermark', 'opacity', t('ie.opacity'), 5, 100)}</div>
      <label>${t('ie.batchWmPos')}<select onChange=${(e) => { st.watermark.position = e.target.value; }}>${['br', 'bl', 'bc', 'tr', 'tl', 'mc'].map((v) => html`<option value=${v} selected=${st.watermark.position === v}>${t(`ie.pos.${v}`)}</option>`)}</select></label>` : null}
    <fieldset><legend>${t('ie.batchOutput')}</legend>
      <div class="ie-row"><label>${t('ie.format')}<select data-testid="batch-format" onChange=${(e) => { st.output.format = e.target.value; refresh(); }}>
        ${Object.entries(SAVE_FORMATS).filter(([k]) => !['ora', 'psd'].includes(k)).map(([k, f]) => html`<option value=${k} selected=${st.output.format === k}>${f.label}</option>`)}</select></label>
      ${SAVE_FORMATS[st.output.format].quality ? num('output', 'quality', t('ie.quality'), 10, 100) : null}</div>
      <label>${t('ie.batchPattern')}<input value=${st.output.pattern} data-testid="batch-pattern" onInput=${(e) => { st.output.pattern = e.target.value; }} /></label>
      <small class="ie-hint">${t('ie.batchPatternHint')}</small></fieldset>`;
}

// ---- image information and metadata (meta.js) -----------------------------------------------------------------------------

function openInfo() {
  ed.dialog = { kind: 'info', meta: ed.original ? readMetadata(ed.original.bytes) : null };
  refresh();
}

/** Save a copy of the opened file without its metadata (no re-encoding: the image data stays as it is). */
async function saveWithoutMetadata() {
  const o = ed.original;
  const clean = o && stripMetadata(o.bytes);
  if (!clean) { Suite.shell.toast(t('ie.metaCannot'), 'warning'); return; }
  const fmt = formatOfBytes(clean);
  const info = SAVE_FORMATS[fmt];
  const name = o.name.replace(/(\.[^.]+)?$/, (ext) => `${t('ie.metaSuffix')}${ext || info.ext}`);
  const result = await Suite.files.saveAs(clean, { suggestedName: name, types: [{ description: info.label, accept: { [info.mime]: [info.ext] } }], type: info.mime });
  if (result) report(result);
}

const META_ROWS = ['make', 'model', 'lens', 'serialNumber', 'dateTimeOriginal', 'dateTime', 'exposureTime', 'fNumber', 'iso', 'focalLength', 'orientation', 'software', 'artist', 'owner', 'copyright', 'description'];
function metaValue(key, v) {
  if (key === 'exposureTime' && typeof v === 'number') return v < 1 ? `1/${Math.round(1 / v)} s` : `${v} s`;
  if (key === 'fNumber' && typeof v === 'number') return `f/${Math.round(v * 10) / 10}`;
  if (key === 'focalLength' && typeof v === 'number') return `${Math.round(v * 10) / 10} mm`;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function infoBody(d) {
  const doc = ed.doc;
  const m = d.meta;
  const e = (m && m.exif) || {};
  const rows = META_ROWS.filter((k) => e[k] !== undefined && e[k] !== '').map((k) => [t(`ie.meta.${k}`), metaValue(k, e[k])]);
  if (e.gps) rows.push([t('ie.meta.gps'), `${e.gps.lat !== undefined ? e.gps.lat.toFixed(6) : '?'}, ${e.gps.lon !== undefined ? e.gps.lon.toFixed(6) : '?'}${e.gps.alt !== undefined ? ` (${Math.round(e.gps.alt)} m)` : ''}`]);
  if (m) {
    if (m.xmp) rows.push(['XMP', t('ie.meta.present')]);
    if (m.iptc) rows.push(['IPTC', t('ie.meta.present')]);
    for (const c of m.comments) rows.push([t('ie.meta.comment'), c.slice(0, 200)]);
    for (const x of m.texts) rows.push([x.key, x.value]);
    if (m.icc) rows.push([t('ie.meta.icc'), t('ie.meta.kept')]);
  }
  return html`<h3>${t('ie.info').replace('…', '')}</h3>
    <p data-testid="info-size">${ed.name} · ${doc.width} × ${doc.height} px · ${doc.layers.length} ${t('ie.layers')}</p>
    ${rows.length ? html`<table class="ie-meta" data-testid="meta-table"><tbody>${rows.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</tbody></table>`
      : html`<p data-testid="meta-none">${t(m ? 'ie.metaNone' : 'ie.metaUnknown')}</p>`}
    ${e.gps ? html`<p class="ie-warn" data-testid="meta-gps">⚠ ${t('ie.metaGps')}</p>` : null}
    <small class="ie-hint">${t('ie.metaSaveHint')}</small>
    ${m && m.kinds.length ? html`<p><button type="button" class="secondary" data-testid="meta-strip" onClick=${() => saveWithoutMetadata().catch(fail)}>${t('ie.metaStrip')}</button></p>` : null}`;
}

// ---- crop tool, rotate by an angle, straighten ---------------------------------------------------------------------------

function applyCrop() {
  const r = ed.cropRect;
  if (!r) return;
  ed.cropRect = null;
  docOp((d) => d.crop(r))();
}

function openRotate(angle) {
  ed.dialog = { kind: 'rotateAngle', angle: Math.round(angle * 100) / 100, mode: ed.opts.rotateMode };
  refresh();
}

let straightenFrom = null;
function startStraighten() {
  straightenFrom = ed.tool.id === 'straighten' ? straightenFrom : ed.tool.id;
  selectTool('straighten');
  Suite.shell.toast(t('ie.straightenHint'));
}

function straightened(angle) {
  selectTool(straightenFrom || 'move');
  straightenFrom = null;
  openRotate(angle);
}

function textAt(p) {
  const doc = ed.doc;
  const hit = (layer) => { if (!layer || !layer.text || !layer.visible) return false; const b = textBounds(layer.text); return p.x >= b.x - 4 && p.y >= b.y - 4 && p.x <= b.x + b.w + 4 && p.y <= b.y + b.h + 4; };
  const index = hit(doc.layers[doc.active]) ? doc.active : doc.layers.map((l, i) => i).reverse().find((i) => hit(doc.layers[i]));
  if (index !== undefined && index >= 0) { editText(index); return; }
  ed.dialog = { kind: 'text', point: { x: Math.round(p.x), y: Math.round(p.y) }, text: '', font: ed.opts.font || 'sans-serif', fontSize: ed.opts.fontSize || 32, bold: false, italic: false,
    color: ed.colors.primary, align: 'left' };
  refresh();
}

/** Edit the text layer at index (dialog). */
function editText(index = ed.doc.active) {
  const layer = ed.doc.layers[index];
  if (!layer || !layer.text) return;
  if (ed.doc.quickMask) endQuickMask();
  ed.dialog = { kind: 'text', layerId: layer.id, point: { x: layer.text.x, y: layer.text.y }, ...layer.text };
  refresh();
}

function startAdjust(kind) {
  if (ADJUSTMENTS[kind]) {
    const values = Object.fromEntries(ADJUSTMENTS[kind].params.map(([k, , , def]) => [k, def]));
    ed.adjust = { kind, values, filter: cssFilter(kind, values) };
    ed.dialog = { kind: 'adjust' };
    draw();
    refresh();
  } else {
    applyCssFilter(ed.doc, cssFilter(kind, {}));
    changed();
  }
}

// ---- menus ------------------------------------------------------------------------------------------------------

function closeMenus() { for (const d of document.querySelectorAll('details.ie-menu[open]')) d.open = false; }

const MENUS = () => [
  ['ie.file', [
    ['ie.new', () => confirmDiscard().then((ok) => { if (ok) { ed.dialog = { kind: 'new', width: 800, height: 600, background: 'white' }; refresh(); } }), 'Ctrl+N'],
    ['ie.open', openImage, 'Ctrl+O'], ['ie.openLayer', openAsLayer], ['ie.save', () => save(), 'Ctrl+S'], ['ie.saveAs', openSaveAs, 'Ctrl+Shift+S'], null,
    ['ie.exportSelection', () => { if (ed.doc.selection) openSaveAs('selection'); else Suite.shell.toast(t('ie.noSelection'), 'warning'); }],
    ['ie.exportLayer', () => openSaveAs('layer')], null,
    ['ie.info', openInfo], ['ie.batch', openBatch],
  ]],
  ['ie.edit', [
    ['ie.undo', undo, 'Ctrl+Z'], ['ie.redo', redo, 'Ctrl+Y'], null, ['ie.cut', cut, 'Ctrl+X'], ['ie.copy', copy, 'Ctrl+C'], ['ie.paste', paste, 'Ctrl+V'], null,
    ['ie.selectAll', () => { ed.doc.selection = { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }; draw(); }, 'Ctrl+A'],
    ['ie.deselect', () => { ed.doc.selection = null; draw(); }, 'Ctrl+D'], ['ie.invertSel', invertSelection, 'Ctrl+Shift+I'], ['ie.clear', clearSelection, 'Del'], ['ie.fillSel', fillSelection], null,
    ['ie.selectCoords', openSelectionDialog], ['ie.quickMask', toggleQuickMask, 'Shift+Q', !!(ed.doc && ed.doc.quickMask)],
    ['ie.feather', () => openModifySelection('feather')], ['ie.grow', () => openModifySelection('grow')], ['ie.shrink', () => openModifySelection('shrink')], ['ie.border', () => openModifySelection('border')],
  ]],
  ['ie.image', [
    ['ie.resize', () => { ed.dialog = { kind: 'resize', width: ed.doc.width, height: ed.doc.height, keep: true, smooth: true }; refresh(); }],
    ['ie.canvasSize', () => { ed.dialog = { kind: 'canvasSize', width: ed.doc.width, height: ed.doc.height, ax: 0.5, ay: 0.5 }; refresh(); }],
    ['ie.crop', () => { if (ed.doc.selection) docOp((d) => d.crop(d.selectionBounds()))(); }], null,
    ['ie.rotateAngle', () => openRotate(0)], ['ie.straighten', startStraighten],
    ['ie.rotateCw', docOp((d) => d.rotate(90))], ['ie.rotateCcw', docOp((d) => d.rotate(270))], ['ie.rotate180', docOp((d) => d.rotate(180))],
    ['ie.flipH', docOp((d) => d.flip(true))], ['ie.flipV', docOp((d) => d.flip(false))], null, ['ie.flatten', docOp((d) => d.flatten())],
  ]],
  ['ie.layer', [
    ['ie.newLayer', () => { ed.doc.addLayer(null, { index: ed.doc.active + 1 }); changed(); }, 'Ctrl+Shift+N'],
    ['ie.duplicate', () => { ed.doc.duplicateLayer(); changed(); }], ['ie.deleteLayer', () => { ed.doc.deleteLayer(); changed(); }],
    ['ie.mergeDown', () => { ed.doc.mergeDown(); changed(); }, 'Ctrl+E'], null,
    ['ie.editText', () => { if (ed.doc.layers[ed.doc.active].text) editText(); else Suite.shell.toast(t('ie.notText'), 'warning'); }],
    ['ie.rasterize', () => { if (ed.doc.layers[ed.doc.active].text) { ed.doc.rasterize(); thumbsVersion++; changed(); } else Suite.shell.toast(t('ie.notText'), 'warning'); }], null,
    ['ie.addMask', maskCommand((doc) => doc.addMask('white'))], ['ie.addMaskSel', maskCommand((doc) => { if (doc.selection) doc.addMask('selection'); else Suite.shell.toast(t('ie.noSelection'), 'warning'); })],
    ['ie.editMaskToggle', maskCommand(needMask((doc) => { doc.editMask = !doc.editMask; })), '', !!(ed.doc && ed.doc.editMask && ed.doc.layers[ed.doc.active].mask)],
    ['ie.disableMask', maskCommand(needMask((doc, layer) => { doc.setLayerProps(doc.active, { maskDisabled: !layer.maskDisabled }); })), '', !!(ed.doc && (ed.doc.layers[ed.doc.active] || {}).maskDisabled)],
    ['ie.applyMask', maskCommand(needMask((doc) => doc.removeMask('apply')))], ['ie.deleteMask', maskCommand(needMask((doc) => doc.removeMask('delete')))], null,
    ['ie.flipLayerH', () => { ed.doc.flip(true, true); changed(); }], ['ie.flipLayerV', () => { ed.doc.flip(false, true); changed(); }],
  ]],
  ['ie.filters', [
    ['ie.brightnessContrast', () => startAdjust('brightnessContrast')], ['ie.hueSaturation', () => startAdjust('hueSaturation')],
    ['ie.levels', () => startTones('levels')], ['ie.curves', () => startTones('curves')],
    ['ie.autoLevels', () => { autoLevels(ed.doc); changed(); }], null,
    ['ie.blur', () => startAdjust('blur')], ['ie.sharpen', () => { convolve(ed.doc, KERNELS.sharpen); changed(); }], null,
    ['ie.grayscale', () => startAdjust('grayscale')], ['ie.sepia', () => startAdjust('sepia')], ['ie.invert', () => startAdjust('invert')], null,
    ['ie.emboss', () => { convolve(ed.doc, KERNELS.emboss); changed(); }], ['ie.edges', () => { convolve(ed.doc, KERNELS.edges); changed(); }], null,
    ...Object.keys(PIXEL_ADJUSTMENTS).map((k) => [`ie.adj.${k}`, () => startPixelAdjust(k)]),
  ]],
  ['ie.view', [
    ['ie.zoomIn', () => zoomStep(1), '+'], ['ie.zoomOut', () => zoomStep(-1), '−'], ['ie.fit', fit, '0'], ['ie.actual', () => setZoom(1, null, true), '1'], null,
    ['ie.rulers', () => setPref('rulers', !prefs.rulers), '', prefs.rulers], ['ie.guides', () => setPref('guides', !prefs.guides), '', prefs.guides],
    ['ie.snapGuides', () => setPref('snapGuides', !prefs.snapGuides), '', prefs.snapGuides], ['ie.grid', () => setPref('grid', !prefs.grid), '', prefs.grid],
    ['ie.snapGrid', () => setPref('snapGrid', !prefs.snapGrid), '', prefs.snapGrid], ['ie.snapEdges', () => setPref('snapEdges', !prefs.snapEdges), '', prefs.snapEdges], null,
    ['ie.newGuide', () => { ed.dialog = { kind: 'guide', axis: 'h', pos: Math.round(ed.doc.height / 2) }; refresh(); }],
    ['ie.clearGuides', () => { ed.guides = []; draw(); }],
    ['ie.guideSettings', () => { ed.dialog = { kind: 'guideSettings', gridSize: prefs.gridSize, snapDistance: prefs.snapDistance }; refresh(); }],
  ]],
];

function Menus() {
  return html`<nav class="ie-menus">${MENUS().map(([title, items]) => html`<details class="ie-menu dropdown" data-testid=${`menu-${title.slice(3)}`}
      onToggle=${(e) => { if (e.target.open) for (const d of document.querySelectorAll('details.ie-menu[open]')) if (d !== e.target) d.open = false; }}>
    <summary>${t(title)}</summary>
    <ul role="menu">${items.map((item) => (item ? html`<li role="none"><a href="#" data-testid=${`cmd-${item[0].slice(3)}`} role=${item[3] === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked=${item[3] === undefined ? undefined : String(!!item[3])}
      onClick=${(e) => { e.preventDefault(); closeMenus(); Promise.resolve(item[1]()).catch(fail); }}>
      <span>${item[3] === undefined ? '' : item[3] ? '✓ ' : html`<span class="ie-check-space">✓ </span>`}${t(item[0])}</span>${item[2] ? html`<kbd>${item[2]}</kbd>` : null}</a></li>` : html`<li role="separator"><hr /></li>`))}</ul>
  </details>`)}
    <${Suite.shell.Recent} app=${APP} before=${confirmDiscard} onOpen=${(p) => openPicked(p)} />
    <button class="secondary outline ie-panels-toggle" data-testid="toggle-panels" onClick=${() => { ed.panels = !ed.panels; refresh(); }}>☰ ${t('ie.panels')}</button>
  </nav>`;
}

// ---- side panels --------------------------------------------------------------------------------------------------

function ToolPalette() {
  return html`<div class="ie-tools" role="toolbar" data-testid="tools">${TOOLS.filter((tool) => !tool.hidden).map((tool) => html`<button class=${ed.tool === tool ? 'active' : 'secondary outline'}
    title=${t(`tool.${tool.id}`)} aria-label=${t(`tool.${tool.id}`)} aria-pressed=${ed.tool === tool} data-testid=${`tool-${tool.id}`} onClick=${() => selectTool(tool.id)}>${tool.icon}</button>`)}
    <div class="ie-swatches" title=${t('ie.colors')}>
      <input type="color" value=${ed.colors.primary} data-testid="color-primary" title=${t('ie.foreground')} onInput=${(e) => { ed.colors.primary = e.target.value; refresh(); }} />
      <input type="color" value=${ed.colors.secondary} data-testid="color-secondary" title=${t('ie.bgColor')} onInput=${(e) => { ed.colors.secondary = e.target.value; refresh(); }} />
      <button class="secondary outline" title=${t('ie.swap')} data-testid="swap-colors" onClick=${swapColors}>⇄</button>
    </div>
  </div>`;
}

function swapColors() { [ed.colors.primary, ed.colors.secondary] = [ed.colors.secondary, ed.colors.primary]; refresh(); }

function ToolOptions() {
  const id = ed.tool.id;
  const o = ed.opts;
  const sized = ['brush', 'pencil', 'eraser', 'line', 'rect', 'ellipse', 'clone', 'heal', 'smudge', 'blur'].includes(id);
  const opaque = !['move', 'select-rect', 'select-ellipse', 'select-lasso', 'select-polygon', 'select-wand', 'picker', 'hand'].includes(id);
  const selecting = id === 'select-rect' || id === 'select-ellipse';
  const anySelect = id.startsWith('select-');
  return html`<section class="ie-options" data-testid="tool-options">
    <strong>${t(`tool.${id}`).replace(/ \(.*/, '')}${ed.doc.editMask && ed.doc.layers[ed.doc.active].mask && !ed.doc.quickMask ? html` <span class="ie-mask-badge" data-testid="editing-mask">${t('ie.editingMask')}</span>` : null}</strong>
    ${anySelect ? html`<label>${t('ie.selOp')}<select data-testid="opt-sel-op" onChange=${(e) => { o.selOp = e.target.value; refresh(); }}>
      ${['new', 'add', 'subtract', 'intersect'].map((v) => html`<option value=${v} selected=${(o.selOp || 'new') === v}>${t(`ie.selOp.${v}`)}</option>`)}</select></label>
      <small class="ie-hint">${t(id === 'select-polygon' ? 'ie.polygonHint' : 'ie.selOpHint')}</small>` : null}
    ${selecting ? html`<${SelectionOptions} />` : null}
    ${id === 'move' || id === 'hand' ? html`<small class="ie-hint">${t('ie.guideHint')}</small>` : null}
    ${sized ? html`<label>${t('ie.size')}: ${o.size} px<input type="range" min="1" max="200" value=${o.size} data-testid="opt-size" onInput=${(e) => { o.size = +e.target.value; refresh(); }} /></label>` : null}
    ${id === 'brush' || id === 'eraser' ? html`<${BrushOptions} />` : null}
    ${id === 'transform' ? html`<${TransformOptions} />` : null}
    ${id === 'crop' ? html`<label>${t('ie.cropRatio')}<select data-testid="opt-crop-ratio" onChange=${(e) => { o.cropRatio = e.target.value; refresh(); }}>
        ${CROP_RATIOS.map((r) => html`<option value=${r} selected=${o.cropRatio === r}>${r === 'free' || r === 'original' ? t(`ie.ratio.${r}`) : r}</option>`)}</select></label>
      <small class="ie-hint" data-testid="crop-info">${ed.cropRect ? `${ed.cropRect.w} × ${ed.cropRect.h}` : t('ie.cropHint')}</small>
      <button type="button" data-testid="crop-apply" disabled=${!ed.cropRect} onClick=${applyCrop}>⛶ ${t('ie.cropApply')}</button>` : null}
    ${opaque ? html`<label>${t('ie.opacity')}: ${Math.round(o.opacity * 100)} %<input type="range" min="1" max="100" value=${Math.round(o.opacity * 100)} data-testid="opt-opacity" onInput=${(e) => { o.opacity = +e.target.value / 100; refresh(); }} /></label>` : null}
    ${id === 'clone' || id === 'heal' ? html`<small class="ie-hint" data-testid="source-hint">${t(ed.tool.source ? 'ie.sourceSet' : 'ie.sourceHint')}</small>
      <button type="button" class=${o.pickSource ? '' : 'secondary outline'} data-testid="opt-pick-source" aria-pressed=${o.pickSource} onClick=${() => { o.pickSource = !o.pickSource; refresh(); }}>⊕ ${t('ie.pickSource')}</button>
      <label><input type="checkbox" checked=${o.aligned} data-testid="opt-aligned" onChange=${(e) => { o.aligned = e.target.checked; refresh(); }} /> ${t('ie.aligned')}</label>` : null}
    ${id === 'blur' ? html`<label>${t('ie.blurMode')}<select data-testid="opt-blur-mode" onChange=${(e) => { o.blurMode = e.target.value; refresh(); }}>
      ${['blur', 'sharpen'].map((v) => html`<option value=${v} selected=${o.blurMode === v}>${t(`ie.blurMode.${v}`)}</option>`)}</select></label>` : null}
    ${id === 'smudge' || id === 'blur' ? html`<small class="ie-hint">${t('ie.strengthHint')}</small>` : null}
    ${id === 'rect' || id === 'ellipse' ? html`<label><input type="checkbox" checked=${o.fillShape} data-testid="opt-fill" onChange=${(e) => { o.fillShape = e.target.checked; refresh(); }} /> ${t('ie.fillShape')}</label>` : null}
    ${id === 'fill' || id === 'select-wand' ? html`<label>${t('ie.tolerance')}: ${o.tolerance}<input type="range" min="0" max="100" value=${o.tolerance} data-testid="opt-tolerance" onInput=${(e) => { o.tolerance = +e.target.value; refresh(); }} /></label>
      <label><input type="checkbox" checked=${o.contiguous} data-testid="opt-contiguous" onChange=${(e) => { o.contiguous = e.target.checked; refresh(); }} /> ${t('ie.contiguous')}</label>` : null}
  </section>`;
}

// ---- brush tips (brushes.js) ----------------------------------------------------------------------------------------

let ownTips = loadOwnTips();
const tipImages = new Map(); // id -> data URL of the preview
function tipImage(tip) {
  if (!tipImages.has(tip.id)) { try { tipImages.set(tip.id, tipPreview(tipById(tip.id, ownTips)).toDataURL()); } catch (e) { tipImages.set(tip.id, ''); } }
  return tipImages.get(tip.id);
}

function chooseTip(tip) {
  const b = ed.opts.brush;
  const def = tipById(tip.id, ownTips);
  b.tip = tip.id;
  if (!def.mask) b.hardness = Math.round((def.hardness ?? 1) * 100);
  if (tip.spacing) b.spacing = Math.max(1, Math.min(200, Math.round(tip.spacing)));
  refresh();
}

/** Own tips from files: GIMP brushes (.gbr), parametric brushes (.vbr) and images (dark = paint), also from archives. */
async function loadTips() {
  const picked = await Suite.files.open({ multiple: true, types: [{ description: t('ie.brushFiles'), accept: { 'image/*': ['.gbr', '.vbr', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'] } }] });
  if (!picked) return;
  let added = null;
  for (const p of picked) {
    try {
      const tip = await tipFromFile(p.file.name, new Uint8Array(await p.file.arrayBuffer()), decodeImage);
      ownTips = [...ownTips, tip];
      added = tip;
    } catch (e) { Suite.shell.toast(`${p.file.name}: ${t('ie.brushUnreadable')}`, 'error'); }
  }
  if (!saveOwnTips(ownTips)) Suite.shell.toast(t('ie.brushNotStored'), 'warning');
  if (added) chooseTip(added); else refresh();
}

function removeTip(id) {
  ownTips = ownTips.filter((x) => x.id !== id);
  saveOwnTips(ownTips);
  if (ed.opts.brush.tip === id) ed.opts.brush.tip = 'round';
  refresh();
}

function BrushOptions() {
  const b = ed.opts.brush;
  const tip = tipById(b.tip, ownTips);
  const range = (key, label, min, max, unit = '') => html`<label>${label}: ${b[key]}${unit}<input type="range" min=${min} max=${max} value=${b[key]}
    data-testid=${`opt-brush-${key}`} onInput=${(e) => { b[key] = +e.target.value; refresh(); }} /></label>`;
  const button = (x, own) => html`<span class="ie-tip-wrap"><button type="button" class=${b.tip === x.id ? 'ie-tip active' : 'ie-tip secondary outline'}
      title=${own ? x.name : t(`ie.tip.${x.id}`)} aria-label=${own ? x.name : t(`ie.tip.${x.id}`)} aria-pressed=${String(b.tip === x.id)} data-testid=${`tip-${own ? 'own' : x.id}`}
      onClick=${() => chooseTip(x)}><img src=${tipImage(x)} alt="" /></button>${own ? html`<button type="button" class="ie-tip-remove secondary outline"
      title=${t('ie.removeTip')} aria-label=${t('ie.removeTip')} data-testid="tip-remove" onClick=${() => removeTip(x.id)}>×</button>` : null}</span>`;
  return html`<div class="ie-brush" data-testid="brush-options">
    <span class="ie-label">${t('ie.brushTip')}</span>
    <div class="ie-tips">${BUILTIN_TIPS.map((x) => button(x, false))}${ownTips.map((x) => button(x, true))}
      <button type="button" class="ie-tip secondary outline" title=${t('ie.loadTips')} aria-label=${t('ie.loadTips')} data-testid="tip-load" onClick=${() => loadTips().catch(fail)}>+</button></div>
    ${tip.mask ? null : range('hardness', t('ie.hardness'), 0, 100, ' %')}
    ${range('spacing', t('ie.spacing'), 1, 200, ' %')}
    ${range('angle', t('ie.angle'), -180, 180, '°')}
    <label><input type="checkbox" checked=${b.pressureSize} data-testid="opt-pressure-size" onChange=${(e) => { b.pressureSize = e.target.checked; refresh(); }} /> ${t('ie.pressureSize')}</label>
    <label><input type="checkbox" checked=${b.pressureOpacity} data-testid="opt-pressure-opacity" onChange=${(e) => { b.pressureOpacity = e.target.checked; refresh(); }} /> ${t('ie.pressureOpacity')}</label>
  </div>`;
}

/** Position, size and angle of a free transform (typed values), flip, apply and cancel. */
function TransformOptions() {
  const tr = ed.transform;
  if (!tr) return html`<small class="ie-hint" data-testid="transform-hint">${t('ie.transformHint')}</small>`;
  const tool = ed.tool;
  const field = (key, label, value) => html`<label>${label}<input type="number" step="any" data-testid=${`tr-${key}`} value=${Math.round(value * 10) / 10}
    onChange=${(e) => { const v = +e.target.value; if (Number.isFinite(v)) { tool.set(ed, { [key]: v }); refresh(); } }} /></label>`;
  return html`<div class="ie-sel-options" data-testid="transform-options">
    <div class="ie-row">${field('x', 'X', tr.cx - tr.w / 2)}${field('y', 'Y', tr.cy - tr.h / 2)}</div>
    <div class="ie-row">${field('w', t('ie.width'), tr.w)}${field('h', t('ie.height'), tr.h)}</div>
    ${field('angle', t('ie.angle'), ((tr.angle * 180) / Math.PI))}
    <div class="ie-row">
      <button type="button" class="secondary outline" data-testid="tr-flip-x" onClick=${() => { tool.set(ed, { flipX: true }); refresh(); }}>⇋</button>
      <button type="button" class="secondary outline" data-testid="tr-flip-y" onClick=${() => { tool.set(ed, { flipY: true }); refresh(); }}>⇵</button>
    </div>
    <small class="ie-hint">${t('ie.transformKeys')}</small>
    <div class="ie-row">
      <button type="button" data-testid="tr-apply" onClick=${() => tool.apply(ed)}>${t('ie.apply')}</button>
      <button type="button" class="secondary" data-testid="tr-cancel" onClick=${() => { tool.cancel(ed); draw(); refresh(); }}>${t('ie.cancel')}</button>
    </div>
  </div>`;
}

/** Selection mode and coordinates of the selection tools (the fields are kept up to date by syncSelectionInfo). */
function SelectionOptions() {
  const o = ed.opts;
  const num = (testid, key, label) => html`<label>${label}<input type="number" min="1" step="1" data-testid=${testid} value=${o[key]}
    onInput=${(e) => { const v = Math.max(1, Math.round(+e.target.value || 1)); o[key] = v; }} /></label>`;
  const field = (key, label) => html`<label>${label}<input type="number" step="1" inputmode="numeric" data-testid=${`sel-${key}`}
    onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); applySelectionFields(); } }} onChange=${applySelectionFields} /></label>`;
  return html`<div class="ie-sel-options">
    <label>${t('ie.selMode')}<select data-testid="opt-sel-mode" onChange=${(e) => { o.selMode = e.target.value; refresh(); }}>
      ${[['free', 'ie.selFree'], ['ratio', 'ie.selRatio'], ['size', 'ie.selSize']].map(([v, l]) => html`<option value=${v} selected=${o.selMode === v}>${t(l)}</option>`)}</select></label>
    ${o.selMode === 'ratio' ? html`<div class="ie-row">${num('opt-ratio-w', 'selRatioW', '↔')}${num('opt-ratio-h', 'selRatioH', '↕')}</div>` : null}
    ${o.selMode === 'size' ? html`<div class="ie-row">${num('opt-sel-w', 'selW', t('ie.width'))}${num('opt-sel-h', 'selH', t('ie.height'))}</div>` : null}
    <div class="ie-row ie-sel-fields">${field('x', 'X')}${field('y', 'Y')}</div>
    <div class="ie-row ie-sel-fields">${field('w', t('ie.width'))}${field('h', t('ie.height'))}</div>
    <button type="button" class="secondary outline" data-testid="sel-apply" onClick=${applySelectionFields}>${t('ie.select')}</button>
  </div>`;
}

/** Feather, grow, shrink or border the selection by a radius in pixels (a dialog; the last radius per change is kept). */
const modifyRadius = { feather: 10, grow: 5, shrink: 5, border: 5 };
function openModifySelection(op) {
  if (!ed.doc.selection) { Suite.shell.toast(t('ie.noSelection'), 'warning'); return; }
  ed.dialog = { kind: 'selModify', op, radius: modifyRadius[op] };
  refresh();
}

/** Select the rectangle typed into the selection fields (shape of the current tool). */
function applySelectionFields() {
  const v = (key) => Math.round(+(document.querySelector(`[data-testid=sel-${key}]`) || {}).value);
  const [x, y, w, h] = ['x', 'y', 'w', 'h'].map(v);
  if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1) return;
  const type = ed.tool.type || (ed.doc.selection && ed.doc.selection.type === 'ellipse' ? 'ellipse' : 'rect');
  ed.doc.selection = clampSelection(ed.doc, type, x, y, x + w, y + h);
  draw();
}

function openSelectionDialog() {
  const s = ed.doc.selection || { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height };
  ed.dialog = { kind: 'selection', type: s.type === 'ellipse' ? 'ellipse' : 'rect', x: s.x, y: s.y, w: s.w, h: s.h };
  refresh();
}

let thumbsVersion = 0;
function Thumb({ layer, source = layer.canvas, extra = '' }) {
  return html`<canvas class=${`ie-thumb ${extra}`} width="40" height="30" ref=${(c) => {
    if (!c || (c._v === thumbsVersion && c._layer === source)) return;
    c._v = thumbsVersion; c._layer = source;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 40, 30);
    const s = Math.min(40 / ed.doc.width, 30 / ed.doc.height);
    if (extra) { ctx.fillStyle = '#fff'; ctx.fillRect((40 - ed.doc.width * s) / 2, (30 - ed.doc.height * s) / 2, ed.doc.width * s, ed.doc.height * s); } // (a mask: transparent is white)
    ctx.drawImage(source, (40 - ed.doc.width * s) / 2, (30 - ed.doc.height * s) / 2, ed.doc.width * s, ed.doc.height * s);
  }}></canvas>`;
}

// ---- layer masks ----------------------------------------------------------------------------------------------------------

function maskCommand(fn) {
  return () => {
    endQuickMask();
    if (ed.tool.leave) ed.tool.leave(ed); else if (ed.tool.cancel) ed.tool.cancel(ed);
    fn(ed.doc, ed.doc.layers[ed.doc.active]);
    thumbsVersion++;
    changed();
  };
}
const needMask = (fn) => (doc, layer) => { if (layer.mask) fn(doc, layer); else Suite.shell.toast(t('ie.noMask'), 'warning'); };

function Layers() {
  const doc = ed.doc;
  const active = doc.layers[doc.active];
  return html`<section class="ie-layers" data-testid="layers">
    <strong>${t('ie.layers')}</strong>
    <ul>${doc.layers.map((layer, i) => ({ layer, i })).reverse().map(({ layer, i }) => html`<li key=${layer.id} class=${i === doc.active ? 'active' : ''} data-testid="layer"
        onClick=${() => { if (ed.tool.leave) ed.tool.leave(ed); doc.active = i; doc.editMask = false; refresh(); }}>
      <input type="checkbox" checked=${layer.visible} title="👁" data-testid="layer-visible" onClick=${(e) => e.stopPropagation()}
        onChange=${(e) => { doc.setLayerProps(i, { visible: e.target.checked }); changed(); }} />
      <span class=${i === doc.active && !doc.editMask && layer.mask ? 'ie-thumb-wrap editing' : 'ie-thumb-wrap'} title=${t('ie.editLayer')}><${Thumb} layer=${layer} /></span>
      ${layer.mask ? html`<button type="button" class=${`ie-mask-thumb ${i === doc.active && doc.editMask ? 'editing' : ''} ${layer.maskDisabled ? 'disabled' : ''}`} title=${t('ie.editMask')}
        aria-label=${t('ie.editMask')} aria-pressed=${String(i === doc.active && !!doc.editMask)} data-testid="layer-mask"
        onClick=${(e) => { e.stopPropagation(); if (ed.tool.leave) ed.tool.leave(ed); doc.active = i; doc.editMask = true; refresh(); }}><${Thumb} layer=${layer} source=${layer.mask} extra="mask" /></button>` : null}
      ${ed.renamingLayer === layer.id
        ? html`<input class="ie-layer-name" defaultValue=${layer.name} data-testid="layer-name-input" autofocus onClick=${(e) => e.stopPropagation()}
            onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { ed.renamingLayer = null; refresh(); } }}
            onBlur=${(e) => { if (ed.renamingLayer !== layer.id) return; ed.renamingLayer = null; if (e.target.value && e.target.value !== layer.name) { doc.setLayerProps(i, { name: e.target.value }); changed(); } else refresh(); }} />`
        : html`<span class="ie-layer-name" data-testid="layer-name" onDblClick=${() => { ed.renamingLayer = layer.id; refresh(); }}>${layer.name}</span>`}
      ${layer.text ? html`<button class="ie-text-badge secondary outline" title=${t('ie.editText')} aria-label=${t('ie.editText')} data-testid="layer-text"
        onClick=${(e) => { e.stopPropagation(); editText(i); }}>T</button>` : null}
    </li>`)}</ul>
    <label>${t('ie.opacity')}: ${Math.round(active.opacity * 100)} %<input type="range" min="0" max="100" value=${Math.round(active.opacity * 100)} data-testid="layer-opacity"
      onInput=${(e) => { doc.setLayerProps(doc.active, { opacity: +e.target.value / 100 }); changed(); }} /></label>
    <label>${t('ie.blend')}<select data-testid="layer-blend" onChange=${(e) => { doc.setLayerProps(doc.active, { blend: e.target.value }); changed(); }}>
      ${BLEND_MODES.map((m) => html`<option value=${m} selected=${active.blend === m}>${m}</option>`)}</select></label>
    <div class="ie-layer-buttons">
      <button class="secondary outline" title=${t('ie.newLayer')} data-testid="layer-add" onClick=${() => { doc.addLayer(null, { index: doc.active + 1 }); changed(); }}>＋</button>
      <button class="secondary outline" title=${t('ie.duplicate')} data-testid="layer-duplicate" onClick=${() => { doc.duplicateLayer(); changed(); }}>⧉</button>
      <button class="secondary outline" title="↑" data-testid="layer-up" onClick=${() => { doc.moveLayer(doc.active, doc.active + 1); changed(); }}>↑</button>
      <button class="secondary outline" title="↓" data-testid="layer-down" onClick=${() => { doc.moveLayer(doc.active, doc.active - 1); changed(); }}>↓</button>
      <button class="secondary outline" title=${t('ie.mergeDown')} data-testid="layer-merge" disabled=${doc.active === 0} onClick=${() => { doc.mergeDown(); changed(); }}>⤓</button>
      <button class="secondary outline" title=${t('ie.deleteLayer')} data-testid="layer-delete" disabled=${doc.layers.length < 2} onClick=${() => { doc.deleteLayer(); changed(); }}>🗑</button>
    </div>
  </section>`;
}

// ---- dialogs -----------------------------------------------------------------------------------------------------

// ---- levels and curves -------------------------------------------------------------------------------------------

const CHANNELS = ['rgb', 'r', 'g', 'b'];
const LEVELS = { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 };

// ---- pixel adjustments: colour balance, vibrance, threshold, posterize, unsharp mask, median, vignette -----------------------

function startPixelAdjust(kind) {
  if (ed.tool.cancel) ed.tool.cancel(ed);
  ed.dialog = { kind: 'pixelAdjust', adjust: kind, values: pixelDefaults(kind) };
  refresh();
  updatePixelAdjust();
}

let pixelTimer = null;
/** The preview of the adjustment (computed a moment after the last change: some are slow on big images). */
function updatePixelAdjust() {
  clearTimeout(pixelTimer);
  pixelTimer = setTimeout(() => {
    const d = ed.dialog;
    if (!d || d.kind !== 'pixelAdjust') return;
    ed.preview = { layer: ed.doc.layer, canvas: pixelAdjustCanvas(ed.doc, d.adjust, d.values) };
    draw();
  }, 60);
}

function pixelAdjustBody(d) {
  const def = PIXEL_ADJUSTMENTS[d.adjust];
  const v = d.values;
  const target = (key) => (def.perRange && def.perRange.includes(key) ? v[v.range] : v);
  const set = (key, value) => { target(key)[key] = value; refresh(); updatePixelAdjust(); };
  return html`<h3>${t(`ie.adj.${d.adjust}`).replace('…', '')}</h3>${def.params.map((p) => {
    if (Array.isArray(p)) {
      const [key, min, max, , step = 1] = p;
      const value = target(key)[key];
      return html`<label>${t(`ie.p.${key}`)}: ${value}<input type="range" min=${min} max=${max} step=${step} value=${value} data-testid=${`padj-${key}`}
        onInput=${(e) => set(key, +e.target.value)} /></label>`;
    }
    if (p.check) return html`<label><input type="checkbox" checked=${v[p.key]} data-testid=${`padj-${p.key}`} onChange=${(e) => set(p.key, e.target.checked)} /> ${t(`ie.p.${p.key}`)}</label>`;
    return html`<label>${t(`ie.p.${p.key}`)}<select data-testid=${`padj-${p.key}`} onChange=${(e) => set(p.key, e.target.value)}>
      ${p.options.map((o) => html`<option value=${o} selected=${v[p.key] === o}>${t(`ie.p.${o}`)}</option>`)}</select></label>`;
  })}`;
}

function startTones(kind) {
  const per = (make) => Object.fromEntries(CHANNELS.map((c) => [c, make()]));
  ed.dialog = { kind, channel: 'rgb', hist: histogram(ed.doc),
    levels: per(() => ({ ...LEVELS })), points: per(() => [[0, 0], [255, 255]]) };
  refresh();
  updateTones();
}

function tonesLuts(d) {
  if (d.kind === 'levels') return channelLuts(levelsLut(d.levels.rgb), { r: levelsLut(d.levels.r), g: levelsLut(d.levels.g), b: levelsLut(d.levels.b) });
  return channelLuts(curveLut(d.points.rgb), { r: curveLut(d.points.r), g: curveLut(d.points.g), b: curveLut(d.points.b) });
}

let tonesQueued = false;
/** Show the result on the canvas (throttled to animation frames). */
function updateTones() {
  if (tonesQueued) return;
  tonesQueued = true;
  requestAnimationFrame(() => {
    tonesQueued = false;
    const d = ed.dialog;
    if (!d || (d.kind !== 'levels' && d.kind !== 'curves')) return;
    ed.preview = { layer: ed.doc.layer, canvas: lutCanvas(ed.doc, tonesLuts(d)) };
    draw();
  });
}

function drawHistogram(el, hist, lut = null) {
  if (!el) return;
  const g = el.getContext('2d');
  const w = el.width, h = el.height;
  g.clearRect(0, 0, w, h);
  const sorted = [...hist].sort((a, b) => a - b);
  const top = Math.max(1, sorted[Math.floor(sorted.length * 0.995)]);
  g.fillStyle = 'rgba(128,128,128,.55)';
  for (let v = 0; v < 256; v++) { const bh = Math.min(1, hist[v] / top) * h; g.fillRect((v / 256) * w, h - bh, w / 256 + 0.5, bh); }
  if (lut) {
    g.strokeStyle = getComputedStyle(document.body).getPropertyValue('--pico-primary').trim() || '#1e88e5';
    g.lineWidth = 2;
    g.beginPath();
    for (let v = 0; v < 256; v++) { const x = (v / 255) * w, y = h - (lut[v] / 255) * h; if (v) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
}

function CurveEditor({ d }) {
  const pts = d.points[d.channel];
  const lut = curveLut(pts);
  const toValue = (e, el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255))), Math.round(Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255)))];
  };
  const down = (e) => {
    const el = e.currentTarget;
    const [x, y] = toValue(e, el);
    let i = pts.findIndex(([px, py]) => Math.abs(px - x) <= 8 && Math.abs(py - y) <= 12);
    if (i < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); i = pts.findIndex((p) => p[0] === x && p[1] === y); }
    el.setPointerCapture(e.pointerId);
    const end = i === 0 || i === pts.length - 1;
    const move = (ev) => {
      const [nx, ny] = toValue(ev, el);
      const lo = i > 0 ? pts[i - 1][0] + 1 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : 255;
      pts[i] = [end && (i === 0 || i === pts.length - 1) ? Math.max(lo, Math.min(hi, nx)) : Math.max(lo, Math.min(hi, nx)), ny];
      refresh(); updateTones();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    refresh(); updateTones();
  };
  const dbl = (e) => {
    const [x, y] = toValue(e, e.currentTarget);
    const i = pts.findIndex(([px, py]) => Math.abs(px - x) <= 8 && Math.abs(py - y) <= 12);
    if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); refresh(); updateTones(); }
  };
  return html`<div class="ie-curve">
    <canvas width="256" height="256" ref=${(el) => drawHistogram(el, d.hist[d.channel], lut)}></canvas>
    <svg viewBox="0 0 255 255" data-testid="curve" onPointerDown=${down} onDblClick=${dbl}>
      ${pts.map(([x, y]) => html`<circle cx=${x} cy=${255 - y} r="5" data-testid="curve-point" />`)}
    </svg>
  </div>`;
}

function tonesBody(d) {
  const channel = html`<label>${t('ie.channel')}<select data-testid="dlg-channel" onChange=${(e) => { d.channel = e.target.value; refresh(); }}>
    ${CHANNELS.map((c) => html`<option value=${c} selected=${d.channel === c}>${t(`ie.ch${c === 'rgb' ? 'Rgb' : c.toUpperCase()}`)}</option>`)}</select></label>`;
  const reset = html`<button type="button" class="secondary outline" data-testid="dlg-reset" onClick=${() => {
    if (d.kind === 'levels') d.levels[d.channel] = { ...LEVELS }; else d.points[d.channel] = [[0, 0], [255, 255]];
    refresh(); updateTones(); }}>${t('ie.reset')}</button>`;
  if (d.kind === 'curves') return html`${channel}<small>${t('ie.curvesHint')}</small><${CurveEditor} d=${d} />${reset}`;
  const lv = d.levels[d.channel];
  const field = (key, min, max, step = 1) => html`<input type="number" min=${min} max=${max} step=${step} value=${lv[key]} data-testid=${`lv-${key}`}
    onInput=${(e) => { const v = +e.target.value; if (!Number.isFinite(v)) return; lv[key] = Math.max(min, Math.min(max, v)); refresh(); updateTones(); }} />`;
  return html`${channel}
    <canvas class="ie-histogram" width="256" height="90" data-testid="histogram" data-channel=${d.channel} ref=${(el) => drawHistogram(el, d.hist[d.channel])}></canvas>
    <label>${t('ie.inputLevels')}</label><div class="ie-row ie-levels">${field('black', 0, 254)}${field('gamma', 0.1, 9.99, 0.05)}${field('white', 1, 255)}</div>
    <label>${t('ie.outputLevels')}</label><div class="ie-row ie-levels">${field('outBlack', 0, 255)}${field('outWhite', 0, 255)}</div>${reset}`;
}

function closeDialog() {
  if (ed.adjust) { ed.adjust = null; draw(); }
  if (ed.dialog && ['levels', 'curves', 'pixelAdjust'].includes(ed.dialog.kind)) { ed.preview = null; draw(); }
  ed.dialog = null;
  refresh();
}

function Dialog() {
  const d = ed.dialog;
  if (!d) return null;
  const num = (key, label, extra = {}) => html`<label>${t(label)}<input type="number" min="1" max="20000" value=${d[key]} data-testid=${`dlg-${key}`} ...${extra}
    onInput=${(e) => { const v = Math.max(1, Math.round(+e.target.value || 1)); if (d.keep && (key === 'width' || key === 'height')) { const r = ed.doc.width / ed.doc.height; if (key === 'width') { d.width = v; d.height = Math.max(1, Math.round(v / r)); } else { d.height = v; d.width = Math.max(1, Math.round(v * r)); } } else d[key] = v; refresh(); }} /></label>`;
  let body, onOk;
  if (d.kind === 'new') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label>${t('ie.background')}<select data-testid="dlg-background" onChange=${(e) => { d.background = e.target.value; }}>
        <option value="white">${t('ie.white')}</option><option value="transparent">${t('ie.transparent')}</option><option value="secondary">${t('ie.bgColor')}</option></select></label>`;
    onOk = () => {
      const bg = d.background === 'white' ? '#ffffff' : d.background === 'secondary' ? ed.colors.secondary : 'transparent';
      setDoc(new ImageDoc(d.width, d.height, { background: bg }), `${t('ie.untitled')}.png`);
    };
  } else if (d.kind === 'resize') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label><input type="checkbox" checked=${d.keep} onChange=${(e) => { d.keep = e.target.checked; refresh(); }} /> ${t('ie.keepRatio')}</label>
      <label><input type="checkbox" checked=${d.smooth} onChange=${(e) => { d.smooth = e.target.checked; }} /> ${t('ie.smooth')}</label>`;
    onOk = docOp((doc) => doc.resize(d.width, d.height, d.smooth));
  } else if (d.kind === 'canvasSize') {
    body = html`${num('width', 'ie.width')}${num('height', 'ie.height')}
      <label>${t('ie.anchor')}</label><div class="ie-anchor">${[0, 0.5, 1].map((ay) => [0, 0.5, 1].map((ax) => html`<button type="button" class=${d.ax === ax && d.ay === ay ? '' : 'secondary outline'}
        onClick=${() => { d.ax = ax; d.ay = ay; refresh(); }}>${d.ax === ax && d.ay === ay ? '●' : '·'}</button>`))}</div>`;
    onOk = docOp((doc) => doc.resizeCanvas(d.width, d.height, d.ax, d.ay));
  } else if (d.kind === 'adjust') {
    const a = ed.adjust;
    body = html`${ADJUSTMENTS[a.kind].params.map(([k, min, max]) => html`<label>${t(`ie.${k}`)}: ${a.values[k]}
      <input type="range" min=${min} max=${max} value=${a.values[k]} data-testid=${`adj-${k}`} onInput=${(e) => { a.values[k] = +e.target.value; a.filter = cssFilter(a.kind, a.values); draw(); refresh(); }} /></label>`)}`;
    onOk = () => { const f = a.filter; ed.adjust = null; applyCssFilter(ed.doc, f); changed(); };
  } else if (d.kind === 'pixelAdjust') {
    body = pixelAdjustBody(d);
    onOk = () => { ed.preview = null; applyPixelAdjust(ed.doc, d.adjust, d.values); changed(); };
  } else if (d.kind === 'levels' || d.kind === 'curves') {
    body = tonesBody(d);
    onOk = () => { ed.preview = null; applyLuts(ed.doc, tonesLuts(d)); changed(); };
  } else if (d.kind === 'text') {
    body = html`<label>${t('ie.text')}<textarea rows="3" data-testid="dlg-text" autofocus onInput=${(e) => { d.text = e.target.value; }}>${d.text}</textarea></label>
      <div class="ie-row">
        <label>${t('ie.font')}<select data-testid="dlg-text-font" onChange=${(e) => { d.font = e.target.value; }}>${[...['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui'].map((f) => [f, f]),
          ...(Suite.fonts ? Suite.fonts.families().map((f) => [`"${f.name}"`, f.name]) : [])].map(([value, label]) => html`<option value=${value} selected=${d.font === value}>${label}</option>`)}</select></label>
        ${num('fontSize', 'ie.fontSize')}
      </div>
      <div class="ie-row">
        <label>${t('ie.textColor')}<input type="color" value=${d.color} data-testid="dlg-text-color" onInput=${(e) => { d.color = e.target.value; }} /></label>
        <label>${t('ie.align')}<select data-testid="dlg-text-align" onChange=${(e) => { d.align = e.target.value; }}>
          ${['left', 'center', 'right'].map((a) => html`<option value=${a} selected=${d.align === a}>${t(`ie.align.${a}`)}</option>`)}</select></label>
      </div>
      <label><input type="checkbox" checked=${d.bold} data-testid="dlg-text-bold" onChange=${(e) => { d.bold = e.target.checked; }} /> ${t('ie.bold')}</label>
      <label><input type="checkbox" checked=${d.italic} data-testid="dlg-text-italic" onChange=${(e) => { d.italic = e.target.checked; }} /> ${t('ie.italic')}</label>
      ${d.layerId ? null : html`<small class="ie-hint">${t('ie.textLayerHint')}</small>`}`;
    onOk = async () => {
      ed.opts.font = d.font; ed.opts.fontSize = d.fontSize;
      const text = { text: d.text, x: d.point.x, y: d.point.y, font: d.font, fontSize: d.fontSize, bold: !!d.bold, italic: !!d.italic, color: d.color, align: d.align || 'left' };
      // (a canvas draws with a font only once it is loaded)
      try { await document.fonts.load(textFont(text), d.text || 'A'); } catch (e) { /* the browser's fallback */ }
      const doc = ed.doc;
      const index = d.layerId ? doc.layers.findIndex((l) => l.id === d.layerId) : -1;
      if (index >= 0) {
        if (d.text) doc.setText(index, text);
        else { doc.active = index; doc.deleteLayer(); } // (an emptied text layer goes away)
      } else if (d.text) doc.addTextLayer(text);
      else return;
      thumbsVersion++;
      changed();
    };
  } else if (d.kind === 'selection') {
    const coord = (key, label) => html`<label>${label}<input type="number" step="1" value=${d[key]} data-testid=${`dlg-sel-${key}`} onInput=${(e) => { d[key] = Math.round(+e.target.value || 0); }} /></label>`;
    body = html`<label>${t('ie.shape')}<select data-testid="dlg-sel-type" onChange=${(e) => { d.type = e.target.value; }}>
        <option value="rect" selected=${d.type === 'rect'}>${t('ie.rectangle')}</option><option value="ellipse" selected=${d.type === 'ellipse'}>${t('ie.ellipseShape')}</option></select></label>
      <div class="ie-row">${coord('x', 'X')}${coord('y', 'Y')}</div><div class="ie-row">${coord('w', t('ie.width'))}${coord('h', t('ie.height'))}</div>`;
    onOk = () => { ed.doc.selection = clampSelection(ed.doc, d.type, d.x, d.y, d.x + Math.max(1, d.w), d.y + Math.max(1, d.h)); draw(); };
  } else if (d.kind === 'batch') {
    body = batchBody(d);
    onOk = () => (d.running ? undefined : runBatchDialog(d));
  } else if (d.kind === 'info') {
    body = infoBody(d);
    onOk = () => {};
  } else if (d.kind === 'rotateAngle') {
    body = html`<h3>${t('ie.rotateAngle').replace('…', '')}</h3>
      <label>${t('ie.angleDeg')}<input type="number" min="-360" max="360" step="any" value=${d.angle} data-testid="dlg-rotate-angle" autofocus
        onInput=${(e) => { d.angle = Math.max(-360, Math.min(360, +e.target.value || 0)); }} /></label>
      <small class="ie-hint">${t('ie.rotateHint')}</small>
      ${['crop', 'expand', 'keep'].map((m) => html`<label><input type="radio" name="rotate-mode" value=${m} checked=${d.mode === m} data-testid=${`dlg-rotate-${m}`}
        onChange=${() => { d.mode = m; }} /> ${t(`ie.rotate.${m}`)}</label>`)}`;
    onOk = () => { ed.opts.rotateMode = d.mode; if (d.angle) docOp((doc) => doc.rotateBy(d.angle, d.mode))(); };
  } else if (d.kind === 'selModify') {
    body = html`<h3>${t(`ie.${d.op}`).replace('…', '')}</h3>
      <label>${t('ie.radius')}<input type="number" min="0" max="500" step="1" value=${d.radius} data-testid="dlg-sel-radius" autofocus onInput=${(e) => { d.radius = Math.max(0, Math.min(500, Math.round(+e.target.value || 0))); }} /></label>`;
    onOk = () => {
      modifyRadius[d.op] = d.radius;
      ed.doc.selection = modifySelection(ed.doc, d.op, d.radius);
      if (!ed.doc.selection) Suite.shell.toast(t('ie.selectionGone'), 'warning');
      draw();
    };
  } else if (d.kind === 'guide') {
    body = html`<label>${t('ie.orientation')}<select data-testid="dlg-guide-axis" onChange=${(e) => { d.axis = e.target.value; }}>
        <option value="h" selected=${d.axis === 'h'}>${t('ie.horizontal')}</option><option value="v" selected=${d.axis === 'v'}>${t('ie.vertical')}</option></select></label>
      <label>${t('ie.position')}<input type="number" step="1" value=${d.pos} data-testid="dlg-guide-pos" onInput=${(e) => { d.pos = Math.round(+e.target.value || 0); }} /></label>`;
    onOk = () => { addGuide(d.axis, d.pos); refresh(); };
  } else if (d.kind === 'guideSettings') {
    const check = (key) => html`<label><input type="checkbox" checked=${prefs[key]} data-testid=${`dlg-${key}`} onChange=${(e) => setPref(key, e.target.checked)} /> ${t(`ie.${key}`)}</label>`;
    body = html`${check('rulers')}${check('guides')}${check('snapGuides')}${check('grid')}${check('snapGrid')}${check('snapEdges')}
      <div class="ie-row">
        <label>${t('ie.gridSize')}<input type="number" min="1" max="10000" value=${d.gridSize} data-testid="dlg-gridSize" onInput=${(e) => { d.gridSize = Math.max(1, Math.round(+e.target.value || 1)); }} /></label>
        <label>${t('ie.snapDistance')}<input type="number" min="1" max="50" value=${d.snapDistance} data-testid="dlg-snapDistance" onInput=${(e) => { d.snapDistance = Math.max(1, Math.round(+e.target.value || 1)); }} /></label>
      </div>`;
    onOk = () => { setPref('gridSize', d.gridSize); setPref('snapDistance', d.snapDistance); };
  } else if (d.kind === 'saveAs') {
    const fmt = SAVE_FORMATS[d.format];
    body = html`<label>${t('ie.fileName')}<input value=${d.stem} data-testid="dlg-name" onInput=${(e) => { d.stem = e.target.value; }} /></label>
      <label>${t('ie.format')}<select data-testid="dlg-format" onChange=${(e) => { d.format = e.target.value; refresh(); }}>
        ${Object.entries(SAVE_FORMATS).map(([k, f]) => html`<option value=${k} selected=${d.format === k}>${f.label} (${f.ext})</option>`)}</select></label>
      ${fmt.quality ? html`<label>${t('ie.quality')}: ${d.quality} %<input type="range" min="10" max="100" value=${d.quality} onInput=${(e) => { d.quality = +e.target.value; refresh(); }} /></label>` : null}
      ${d.format === 'gif' ? html`<label><input type="checkbox" checked=${d.dither} data-testid="dlg-dither" onChange=${(e) => { d.dither = e.target.checked; }} /> ${t('ie.dither')}</label>` : null}
      ${d.format === 'ico' ? html`<fieldset><legend>${t('ie.icoSizes')}</legend><div class="ie-ico-sizes">${ICO_SIZES.map((n) => html`<label><input type="checkbox" checked=${d.icoSizes.includes(n)}
        data-testid=${`dlg-ico-${n}`} onChange=${(e) => { d.icoSizes = e.target.checked ? [...d.icoSizes, n] : d.icoSizes.filter((x) => x !== n); refresh(); }} /> ${n}</label>`)}</div></fieldset>` : null}
      ${d.export ? html`<small class="ie-hint">${t(d.export === 'selection' ? 'ie.exportSelHint' : 'ie.exportLayerHint')}</small>` : null}`;
    const opts = { quality: d.quality / 100, dither: d.dither, icoSizes: d.icoSizes.length ? d.icoSizes : [32] };
    onOk = () => (d.export ? exportPart(d, `${d.stem}${fmt.ext}`, opts) : save({ as: true, name: `${d.stem}${fmt.ext}`, format: d.format, ...opts }));
  }
  const live = ['adjust', 'levels', 'curves', 'pixelAdjust'].includes(d.kind); // the image stays visible for the live preview
  return html`<dialog open data-testid="dialog" class=${live ? 'ie-live' : ''}><article>
    <form onSubmit=${(e) => { e.preventDefault(); ed.dialog = null; Promise.resolve(onOk()).catch(fail); refresh(); }}>
      ${body}
      <footer>
        <button type="button" class="secondary" data-testid="dlg-cancel" onClick=${closeDialog}>${t('ie.cancel')}</button>
        ${d.running ? null : html`<button type="submit" data-testid="dlg-ok">${['adjust', 'levels', 'curves'].includes(d.kind) ? t('ie.apply') : d.kind === 'batch' ? t('ie.batchRun') : t('ie.ok')}</button>`}
      </footer>
    </form>
  </article></dialog>`;
}

// ---- layout ------------------------------------------------------------------------------------------------------

function Main() {
  const doc = ed.doc;
  Suite.shell.setFileName(`${ed.name}${doc.dirty ? ' •' : ''}`);
  return html`<div class=${`ie-layout ${ed.panels ? 'panels-open' : ''}`}>
    <${ToolPalette} />
    <div class="ie-stage" ref=${(el) => { if (el && stage.parentElement !== el) { el.appendChild(stage); resizeObserver.observe(canvasBox); } }}></div>
    <aside class="ie-side suite-drawer" data-testid="side"><${ToolOptions} /><${Layers} /></aside>${ed.panels ? Suite.shell.backdrop(() => { ed.panels = false; refresh(); }) : null}
    <footer class="ie-status" data-testid="status">
      <span data-testid="image-size">${doc.width} × ${doc.height}</span>
      <span data-testid="position"></span>
      <span data-testid="selection-info"></span>
      <button class=${doc.quickMask ? 'ie-qm active' : 'ie-qm secondary outline'} data-testid="quick-mask" aria-pressed=${String(!!doc.quickMask)}
        title=${`${t('ie.quickMask')} (Shift+Q)`} onClick=${toggleQuickMask}>◐${doc.quickMask ? html`<span class="ie-qm-label"> ${t('ie.quickMaskOn')}</span>` : ''}</button>
      <span class="ie-zoom">
        <button class="secondary outline" data-testid="zoom-out" onClick=${() => zoomStep(-1)}>−</button>
        <span data-testid="zoom">${Math.round(ed.view.zoom * 100)} %</span>
        <button class="secondary outline" data-testid="zoom-in" onClick=${() => zoomStep(1)}>+</button>
        <button class="secondary outline" data-testid="zoom-fit" onClick=${fit}>⤢</button>
      </span>
    </footer>
    <${Dialog} />
  </div>`;
}

Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Menus} />`, main: () => html`<${Main} />` });

Suite.files.dropZone(document.body, async (picked) => {
  if (!picked.length) return;
  const images = picked.filter((p) => /^image\//.test(p.file.type) || /\.(ora|psd|png|jpe?g|webp|gif|bmp|ico|svg|avif)$/i.test(p.file.name));
  if (!images.length) return;
  if (!ed.doc.dirty && ed.doc.undoStack.length === 0) {
    await openPicked(images[0]);
    for (const p of images.slice(1)) await addImageLayer(p.file, p.file.name);
  } else for (const p of images) await addImageLayer(p.file, p.file.name);
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !['range', 'checkbox', 'color'].includes(document.activeElement.type)) return;
  if (ed.dialog) { if (e.key === 'Escape') closeDialog(); return; }
  if (ed.tool.onKey && ed.tool.onKey(e, ed)) { e.preventDefault(); draw(); return; }
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const run = (fn) => { e.preventDefault(); Promise.resolve(fn()).catch(fail); };
  if (mod) {
    const map = {
      z: e.shiftKey ? redo : undo, y: redo, s: e.shiftKey ? openSaveAs : () => save(), o: openImage, c: copy, x: cut, v: paste, e: () => { ed.doc.mergeDown(); changed(); },
      a: () => { ed.doc.selection = { type: 'rect', x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }; draw(); },
      d: () => { ed.doc.selection = null; draw(); },
      ...(e.shiftKey ? { i: invertSelection } : {}),
      n: e.shiftKey ? () => { ed.doc.addLayer(null, { index: ed.doc.active + 1 }); changed(); } : () => MENUS()[0][1][0][1](),
      t: () => selectTool('transform'),
      '0': fit, '+': () => zoomStep(1), '=': () => zoomStep(1), '-': () => zoomStep(-1),
    };
    if (map[k]) run(map[k]);
    return;
  }
  if (e.key === ' ' && !spaceDown) { spaceDown = true; view.style.cursor = 'grab'; e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { run(clearSelection); return; }
  if (e.key === 'Escape') { if (toolActive && ed.tool.cancel) { ed.tool.cancel(ed); toolActive = false; } ed.doc.selection = null; draw(); return; }
  if (e.key === '+' || e.key === '=') { run(() => zoomStep(1)); return; }
  if (e.key === '-') { run(() => zoomStep(-1)); return; }
  if (e.key === '0') { run(fit); return; }
  if (e.key === '1') { run(() => setZoom(1, null, true)); return; }
  if (e.key === '[') { ed.opts.size = Math.max(1, Math.round(ed.opts.size / 1.25)); draw(); refresh(); return; }
  if (e.key === ']') { ed.opts.size = Math.min(200, Math.round(ed.opts.size * 1.25) || 2); draw(); refresh(); return; }
  if (k === 'x') { swapColors(); return; }
  if (k === 'q' && e.shiftKey) { e.preventDefault(); toggleQuickMask(); return; }
  const tool = TOOLS.find((x) => x.key === k);
  if (tool) selectTool(tool.id);
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; selectTool(ed.tool.id); } });

Suite.files.recent(APP);
selectTool('brush');

Suite.bridge.receive((picked) => openPicked(picked), { app: 'imageeditor' }); // files opened from other apps ("Open with…")

// the open file(s) for "Create an archive from the open files" (about dialog)
Suite.openFiles.register(async () => (ed.doc && (ed.doc.dirty || ed.name !== `${t('ie.untitled')}.png`)
  ? [{ name: ed.name, bytes: await encode(ed.doc, ed.format, { quality: 0.92 }), dirty: !!ed.doc.dirty }] : []));

// for tests
window.IE = { prefs, setPref, addGuide, ed, setDoc, openFile, encode, ImageDoc, save, brushes };
document.body.dataset.ready = 'true';
