# Beispiele

Beispieldateien für jede Anwendung der Portable Web App Suite. Öffnen Sie eine Datei mit der Anwendung, nach der ihr Ordner
benannt ist (auf das Fenster ziehen oder Öffnen). Viele davon sind auch in die Anwendungen eingebaut: Drücken Sie F1 und wählen Sie
eines unter **Beispiele**. Passwörter der Beispiele: **example**.

Die Notebooks laufen in der Suite und in einer gewöhnlichen Jupyter-Installation; die mit Netzwerkzugriff brauchen das Relay, Sockets
und SSH das vom Relay bereitgestellte Notebook (`relay.py --serve`).

## texteditor

- `programm.py` – Python-Programm
- `abfrage.sql` – SQL zum Formatieren
- `notizen.md` – Markdown mit Tabelle
- `daten.json` – JSON in einer Zeile (Werkzeuge → JSON formatieren)

## hexeditor

- `bild.png` – Ein kleines PNG-Bild (Signatur, Chunks)

## archive

- `ordner.zip` – ZIP-Archiv mit Ordnern
- `gepackt.tar.xz` – TAR.XZ
- `verschluesselt.zip` – AES-verschlüsseltes ZIP (Passwort: example)

## mediaplayer

- `akkord.wav` – Klang: ein Akkord in drei Schritten
- `tonleiter.wav` – Klang: eine Tonleiter
- `wiedergabeliste.m3u8` – Wiedergabeliste (die Klänge mit öffnen)

## audioeditor

- `tonleiter.wav` – Eine Tonleiter zum Schneiden und für Effekte

## videoeditor

- `testbild.webm` – Ein Clip von 4 Sekunden mit Ton

## imageeditor

- `bild.png` – PNG mit Transparenz
- `ebenen.ora` – Bild mit zwei Ebenen (OpenRaster)

## diagram

- `ablauf.drawio` – Ablauf mit Gruppen, Ebenen und Verbindern (draw.io)
- `skizze.excalidraw` – Handskizze (Excalidraw)

## keepass

- `passwoerter.kdbx` – KeePass-Datenbank (Passwort: example; mit TOTP-Code)

## spreadsheet

- `umsatz.xlsx` – Formeln, Filter, bedingte Formatierung, Überprüfung
- `ausgaben.csv` – CSV (der Importdialog erkennt das Format)

## document

- `bericht.docx` – Überschriften, Tabelle, Bild, Listen (Word)

## presentation

- `folien.pptx` – Drei Folien mit Notizen und Bild (PowerPoint)

## reveal

- `folien.md` – Markdown-Folien mit Fragmenten, Code und Mathematik

## pdfviewer

- `bericht.pdf` – Der Beispielbericht als PDF (Suche, Gliederung, Drucken)

## calendar

- `termine.ics` – Termine: wöchentliche Serie, ganztägiger Termin

## mail

- `nachricht.eml` – E-Mail mit HTML und Anhang
- `kontakt.vcf` – Kontakt (vCard)

## dbtool

- `laden.sqlite` – SQLite-Datenbank mit Fremdschlüssel und Sicht (ER-Diagramm)

## ftp

- `ftp-verbindungen.json` – Verbindungsdatei (Verbindungen: Öffnen…)

## ssh

- `ssh-verbindungen.json` – Verbindungsdatei (Verbindungen: Öffnen…)

## http

- `anfragen.postman_collection.json` – Postman-Sammlung für httpbin.org (braucht das Relay)

## webinspector

- `aufzeichnung.har` – Netzwerkaufzeichnung (HAR) mit einem Fehler

## barcode

- `ean13.png` – EAN-13-Strichcode (4006381333931) zum Lesen

## notebook

- `01-datenanalyse.ipynb` – Datenanalyse: pandas, seaborn, SciPy, scikit-learn (offline)
- `02-widgets.ipynb` – Interaktive Widgets (offline)
- `03-archiv.ipynb` – Dateien in einem eingebundenen Archiv
- `04-webanfragen.ipynb` – requests über das Relay
- `05-mail-und-ftp.ipynb` – smtplib und ftplib (vom Relay bereitgestellt)
- `06-ssh.ipynb` – SSH und SFTP, Fabric-kompatibel (vom Relay bereitgestellt)
- `07-unterbrechen.ipynb` – Eine laufende Zelle anhalten
- `08-berichte.ipynb` – Berichte: Word-, Excel- und PDF-Dateien (offline)
- `09-shell.ipynb` – Die Shell in Zellen und im Terminal (offline)
- `bericht.sh` – Shell-Skript: ein Bericht aus CSV-Daten (Terminal: sh bericht.sh)
- `sicherung.sh` – Shell-Skript: einen Ordner sichern (sh sicherung.sh ORDNER)
- `example-data.zip` – Daten für das Archiv-Notebook (im Archivmanager öffnen)
