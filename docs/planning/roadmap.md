# Roadmap

Planned features after version 1.2.0, agreed 2026-11-06. Effort: **S** = up to a day, **M** = a few days, **L** = a week or
more (as in [feature-ideas.md](feature-ideas.md)). Before an item is built, check what already exists – some of the starting
points below come from the documentation, not from the code.

## How each feature is built

1. Develop the feature (single HTML files, `file://`, Chromium and Firefox, phones; no node).
2. Document it in English and German, Markdown and Confluence (`tools/build_docs.py`).
3. Test it: the tests of the affected applications on the desktop and with `--mobile` (one test run at a time).
4. Commit it – one feature per commit.

Before a release, the **whole test suite** runs on the desktop and with `--mobile`. A release gets release notes
(`docs/release-notes/vX.Y.Z.md`), a tag, and one commit in the public GitHub repository (`tools/publish_release.py`).

## 1.3.0 – Office

Small items first, then the larger ones in this order:

| # | Application | Feature | Effort |
|---|---|---|---|
| 1 | Spreadsheet | Hyperlinks in cells (Univer hyperlink plugin, read and written in `.xlsx`) | S |
| 2 | Document | Insert and edit hyperlinks | S |
| 3 | Spreadsheet | Freeze panes and grouping in the ribbon, find in all sheets | S |
| 4 | Spreadsheet | Comments/notes on cells (`xl/comments*.xml`) | S–M |
| 5 | Spreadsheet | Remove duplicates, text to columns | S–M |
| 6 | Document | Page number field in header and footer, page setup (orientation, margins) | S–M |
| 7 | Document | Special characters (symbol picker), date and time | S |
| 8 | Document | Export as Markdown | S |
| 9 | Presentation | Slide number, footer and date | S |
| 10 | Presentation | Hide slide; pen, laser pointer and black screen while presenting | S |
| 11 | Presentation | Spelling | S |
| 12 | Spreadsheet | Print / PDF (selection or sheet, fit to width, repeated header row) | M |
| 13 | Document | Comments (`word/comments.xml`, ODT) | M |
| 14 | Presentation | Select several elements, align and distribute, group | M |
| 15 | Presentation | Bullet and numbered lists in text boxes | M |
| 16 | Spreadsheet, presentation | Charts with one shared renderer (picture plus own data first) | L |
| 17 | Presentation | OpenDocument presentations (`.odp`) | M–L |
| 18 | Presentation | Built-in layouts, video and audio on slides, crop images | M |
| 19 | Presentation | **Spike:** editing slide masters and layouts (findings only) | – |

Not planned: pivot tables (the notebook covers them). Not decided: tracked changes, text columns and text boxes in documents,
templates, version comparison, mail merge.

## 1.4.0 – Image, audio and video editors

**Image editor** (the foundations first, because the later items build on them):

| # | Feature | Effort |
|---|---|---|
| 1 | Selection as an alpha mask (partly selected pixels) like GIMP; every tool works through it; feather, grow, shrink, border | M–L |
| 2 | Quick mask (`Shift+Q`): edit the selection with the painting tools | M |
| 3 | Brush tips: dab-based brushes (size, spacing, hardness, angle, pen pressure), built-in shapes, own tips from GIMP `.gbr`/`.vbr` and images | M |
| 4 | Text layers: editable as long as they are pure text, rasterize into a normal layer (ORA keeps them, PSD gets pixels) | M–L |
| 5 | Rotate by any angle / straighten, crop tool with aspect ratios, adjustments (colour balance, vibrance, threshold, posterize, unsharp mask, median, vignette), EXIF orientation and removing metadata, export selection or layer, save GIF and ICO | S each |
| 6 | Free transform, layer masks, batch processing into a ZIP | M each |

**Audio editor:** loudness normalisation (LUFS), truncate silence, noise gate, tags on export, export per label or clip as ZIP,
plot spectrum (S–M each); click removal and de-esser, auto-duck, parametric equaliser (M each).

**Video editor:** picture effects, freeze frame, export a range or only the audio, markers, audio cross-fade and clip
normalisation (S–M each); automatic transitions between neighbouring clips, keyframes, chroma key, GIF export, project ZIP with
media, “Edit in audio editor” (M each).

## 1.5.0 – Other applications

| Application | Features |
|---|---|
| Text editor | Markdown preview; format and validate code (JSON, XML, YAML, …); line tools; bookmarks |
| Hex editor | Structure templates (PNG, ZIP, ELF/PE, BMP, WAV, …); bookmarks; coloured ranges; entropy and byte histogram |
| Archive manager | Search and filter; full-text search in the files (also with regular expressions); compare; split archives |
| Media player | A-B loop; screenshot of a frame; audio visualisation |
| PDF viewer | Select and copy text; redaction (removes the content); export pages as images; compress |
| Diagram editor | Templates for commonly used groups; PlantUML diagrams |
| KeePass | CSV import and export (with a warning that the passwords are not encrypted); entry history; OTP secrets; exchanging them by QR code (scan an `otpauth://` code into an entry, show an entry's secret as a code for another device) |
| Barcode | Batch creation from a CSV or text file, saved as PDF or ZIP; images with the code and the encoded text |
| Calendar | Tasks/to-dos; CSV import and export; CalDAV through the relay |
| Mail | Search across folders and accounts; export and import folders (mbox) |
| Database tool | CSV and spreadsheet import and export; SQL autocomplete; MySQL/MariaDB through the relay |
| FTP/SFTP | Edit a remote file; change permissions; preview; open a remote file in another application |
| SSH | Saved commands and snippets; port forwarding through the relay; proxy; jump hosts |
| HTTP analyzer | Collection runner; code generation; GraphQL |
| Web inspector | Accessibility check (axe-core) |
| Web slides | Export as PDF; theme editor |
| Authenticator | Integrate the existing web authenticator (separate repository `web-authenticator`, read only) into the suite as its own application |
