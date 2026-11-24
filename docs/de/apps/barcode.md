# Barcodes

Die Barcode-Anwendung (`barcode.html`) liest QR-Codes und andere Barcodes mit der Kamera oder aus Bildern und erstellt
sie – für Links, WLAN-Zugänge, Kontakte, E-Mails und beliebigen Text. Alles läuft im Browser; Bilder und Inhalte werden
nirgendwohin gesendet.

Unterstützte Codes: **QR-Code**, Micro-QR-Code, **Data Matrix**, **Aztec**, **PDF417** (2D) sowie **Code 128**, Code 39,
Code 93, **EAN-13**, EAN-8, UPC-A, UPC-E, ITF und Codabar (1D-Strichcodes). Beim Lesen werden weitere Formate erkannt
(etwa DataBar, MaxiCode, rMQR).

## Lesen

- **📷 Kamera** startet die Kamera (der Browser fragt nach der Erlaubnis); Codes im Bild werden grün markiert und
  aufgelistet, sobald sie erkannt sind. **🔄 Kamera wechseln** wechselt zwischen den Kameras des Geräts; **⏹ Kamera beenden**
  beendet sie.
- **🖼 Bild öffnen…** (`Strg+O`) liest Codes aus Bilddateien (PNG, JPEG, GIF, WebP, BMP, SVG, AVIF). Sie können Bilder auch
  auf das Fenster ziehen oder aus der Zwischenablage einfügen (`Strg+V`), etwa ein Bildschirmfoto. Mehrere Codes in einem
  Bild werden gemeinsam gefunden.
- Jeder Code erscheint einmal in der Liste mit seinem Format und seiner **Inhaltsart**: Link, WLAN, Kontakt
  (vCard/MeCard), E-Mail, Telefonnummer, SMS, Ort, Einrichtung eines Einmalpassworts (`otpauth://`), Termin oder Text. Die
  Details (etwa Netzwerkname und Passwort) stehen unter dem Text.
- Aktionen: **Kopieren** des Textes, **Link öffnen** (nur `http`/`https`, in einem neuen Tab), WLAN-Passwort kopieren,
  **Kontakt speichern (.vcf)**, **Termin speichern (.ics)** und **Im Generator bearbeiten**, das den Inhalt in den Reiter
  *Erstellen* übernimmt.

> **Hinweis:** Prüfen Sie Links, bevor Sie sie öffnen – ein QR-Code kann überallhin führen. Die Anwendung öffnet Links nie
> von selbst.

## Erstellen

1. Wählen Sie den **Inhalt**: Text, Link, WLAN, Kontakt, E-Mail, Telefonnummer, SMS oder Ort, und füllen Sie die Felder
   aus. Daraus entsteht der Text des Codes (etwa `WIFI:T:WPA;S:Home;P:geheim;;` oder eine vCard); *Inhalt* unter der
   Vorschau zeigt ihn.
2. Wählen Sie das **Format**. Bei QR-Codes legt die **Fehlerkorrektur** fest, wie viel des Codes beschädigt oder verdeckt
   sein darf (L 7 %, M 15 %, Q 25 %, H 30 %). 1D-Codes nehmen nur bestimmte Zeichen an (EAN/UPC: Ziffern, die Prüfziffer
   wird berechnet) – beim Wechsel wird ein Beispiel eingetragen; eine Fehlermeldung erklärt ungültige Inhalte.
3. Stellen Sie die **Modulgröße** (Pixel je Quadrat bzw. Balken), die **Ruhezone** (weißer Rand in Modulen; Scanner brauchen
   ihn), bei 1D-Codes die **Balkenhöhe** sowie die **Farben** oder einen transparenten Hintergrund ein. Dunkle Codes auf hellem
   Grund mit genug Kontrast sind am sichersten.
4. Text zum Code: 1D-Codes zeigen ihre Ziffern unter den Balken (**Text unter den Balken**); bei 2D-Codes fügt **Den kodierten Text
   unter dem Code zeigen** den Inhalt hinzu, umbrochen auf die Breite des Codes (lange Inhalte werden nach 12 Zeilen gekürzt). Eine
   eigene **Beschriftung** – ein Name, ein Preis, „Scannen Sie mich“ – steht unter oder über dem Code (*Position der Beschriftung*).
   Der Text ist Teil von SVG und PNG, so ist ein Etikett fertig zum Drucken.

Die Vorschau wird automatisch zurückgelesen: **✓ lesbar** bestätigt, dass der Code gescannt werden kann. **⬇ SVG**
(skalierbar, für den Druck) und **⬇ PNG** laden den Code herunter, **Bild kopieren** legt ihn in die Zwischenablage,
**🖨 Drucken** druckt nur den Code.

## Stapel: viele Codes auf einmal

**📑 Stapel** erstellt viele Codes in einem Durchgang – etwa Etiketten für ein Regal, Eintrittskarten oder Inventarnummern:

- Tippen oder fügen Sie die Inhalte ein, **ein Code je Zeile**, oder **öffnen Sie eine CSV- oder Textdatei**. Bei einer CSV-Datei (Komma,
  Strichpunkt oder Tabulator) wählen Sie die Spalte mit dem **Inhalt** und auf Wunsch eine Spalte mit der **Beschriftung** (wird zu jedem Code
  gedruckt) und eine mit dem **Dateinamen**; geben Sie an, ob die erste Zeile die Spaltennamen enthält. Eine Datei mit nur einer Spalte gilt
  als Liste.
- Das **Format** lässt sich hier wählen; Größe, Farben, Text zum Code und Beschriftung (wenn es keine Beschriftungsspalte gibt) sind die unter
  **▦ Erstellen** eingestellten.
- **Ergebnis**: ein **PDF**-Etikettenbogen (A4 oder Letter, Spalten × Zeilen je Seite, die Codes in ihren Feldern zentriert) oder ein **ZIP**
  mit einem **PNG**- oder **SVG**-Bild je Code (benannt nach der Dateinamensspalte, sonst nummeriert nach dem Inhalt).

Inhalte, die das Format nicht kodieren kann (etwa Buchstaben bei EAN-13), werden übersprungen und mit ihrer Zeilennummer aufgelistet; ein ZIP
enthält sie zusätzlich in `errors.txt`.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Bilder öffnen und ihre Codes lesen |
| `Strg+V` | Code eines eingefügten Bildes lesen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Zuerst wird die rückseitige Kamera verwendet; *Kamera wechseln* schaltet auf die Frontkamera. Der Generator zeigt den Code
über dem Formular. Heruntergeladene Bilder landen im Download-Ordner des Browsers.
