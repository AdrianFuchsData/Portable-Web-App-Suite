# Examples

Example files for every application of the Portable Web App Suite. Open a file with the application named by its folder
(drag it onto the window or use Open). Many of them are also built into the applications: press F1 and choose one under
**Examples**. Passwords of the examples: **example**.

The notebooks run in the suite and in a regular Jupyter installation; those that use the network need the relay, sockets and
SSH the notebook served by the relay (`relay.py --serve`).

## texteditor

- `program.py` – Python program
- `query.sql` – SQL to format
- `notes.md` – Markdown with a table
- `data.json` – JSON on one line (Tools → Format JSON)

## hexeditor

- `image.png` – A small PNG image (signature, chunks)

## archive

- `folders.zip` – ZIP archive with folders
- `packed.tar.xz` – TAR.XZ
- `encrypted.zip` – AES-encrypted ZIP (password: example)

## mediaplayer

- `chord.wav` – Sound: a chord in three steps
- `scale.wav` – Sound: a scale
- `playlist.m3u8` – Playlist (open the sounds together with it)

## audioeditor

- `scale.wav` – A scale to cut and add effects to

## videoeditor

- `test-pattern.webm` – A 4-second clip with sound

## imageeditor

- `picture.png` – PNG with transparency
- `layers.ora` – Image with two layers (OpenRaster)

## diagram

- `process.drawio` – Process with groups, layers and connectors (draw.io)
- `sketch.excalidraw` – Hand-drawn sketch (Excalidraw)

## keepass

- `passwords.kdbx` – KeePass database (password: example; with a TOTP code)

## spreadsheet

- `sales.xlsx` – Formulas, filter, conditional formatting, validation
- `expenses.csv` – CSV (the import dialog detects the format)

## document

- `report.docx` – Headings, table, picture, lists (Word)

## presentation

- `slides.pptx` – Three slides with notes and a picture (PowerPoint)

## reveal

- `slides.md` – Markdown slides with fragments, code and maths

## pdfviewer

- `report.pdf` – The example report as PDF (search, outline, print)

## calendar

- `events.ics` – Events: weekly series, all-day event

## mail

- `message.eml` – E-mail with HTML and an attachment
- `contact.vcf` – Contact (vCard)

## dbtool

- `shop.sqlite` – SQLite database with a foreign key and a view (ER diagram)

## ftp

- `ftp-connections.json` – Connections file (Connections: Open…)

## ssh

- `ssh-connections.json` – Connections file (Connections: Open…)

## http

- `requests.postman_collection.json` – Postman collection against httpbin.org (needs the relay)

## webinspector

- `recording.har` – Network recording (HAR) with an error

## barcode

- `ean13.png` – EAN-13 barcode (4006381333931) to read

## notebook

- `01-data-analysis.ipynb` – Data analysis: pandas, seaborn, SciPy, scikit-learn (offline)
- `02-widgets.ipynb` – Interactive widgets (offline)
- `03-archive.ipynb` – Files in a mounted archive
- `04-web-requests.ipynb` – requests through the relay
- `05-mail-and-ftp.ipynb` – smtplib and ftplib (served by the relay)
- `06-ssh.ipynb` – SSH and SFTP, Fabric-compatible (served by the relay)
- `07-interrupt.ipynb` – Stopping a running cell
- `08-reports.ipynb` – Reports: Word, Excel and PDF files (offline)
- `09-shell.ipynb` – The shell in cells and the Terminal (offline)
- `report.sh` – Shell script: a report from CSV data (Terminal: sh report.sh)
- `backup.sh` – Shell script: back up a folder (sh backup.sh FOLDER)
- `example-data.zip` – Data for the archive notebook (open it in the archive manager)

## overview

- `office.suite.zip` – Workspace with a text, a document, a spreadsheet and a diagram (F1 → Workspace → Open workspace…, in the overview)
