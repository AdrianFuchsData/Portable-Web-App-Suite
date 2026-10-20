# PDF-Betrachter

Der PDF-Betrachter (`pdfviewer.html`) zeigt PDF-Dateien an: Blättern, Zoom, Drehen, Suche, Inhaltsverzeichnis und
Seitenvorschau, Links, Formulare ausfüllen, Kommentare (Markieren, Text, Zeichnen), Drucken und passwortgeschützte
Dateien.

## Öffnen und speichern

- **Öffnen** (`Strg+O`) öffnet eine PDF-Datei; Sie können eine Datei auch in das Fenster ziehen.
- Bei passwortgeschützten Dateien werden Sie nach dem Passwort gefragt.
- **Speichern** (`Strg+S`) speichert das PDF mit ausgefüllten Formularfeldern und Ihren Kommentaren: in Chrome/Edge am
  Desktop direkt in die geöffnete Datei, in Firefox und unter Android als Download (ersetzen Sie die ursprüngliche Datei
  damit). `Strg+Umschalt+S` speichert unter einem neuen Namen.

## Blättern

- ‹ und › blättern zur vorherigen und nächsten Seite; im Seitenfeld können Sie eine Seitenzahl eingeben.
- ☰ zeigt die Seitenleiste: **Seiten** zeigt eine Vorschau der Seiten (ein Klick springt zur Seite), **Inhalt** zeigt das
  Inhaltsverzeichnis des Dokuments, falls es eines hat.
- Links im Dokument funktionieren: interne Links springen zur Zielseite.

## Zoom und Drehen

− und + verkleinern und vergrößern. Die Zoom-Liste bietet **Automatisch**, **Ganze Seite**, **Seitenbreite** und feste
Größen. ⟳ dreht alle Seiten um 90 Grad (nur die Ansicht; die Datei bleibt unverändert).

## Suchen

🔍 oder `Strg+F` öffnet die Suchleiste. Der Betrachter hebt alle Treffer hervor und zeigt „1 von 3 Treffern“. **Weiter**
und **Zurück** wechseln zwischen den Treffern; **Groß-/Kleinschreibung** unterscheidet Groß- und Kleinbuchstaben.

## Formulare und Kommentare

Formularfelder lassen sich direkt ausfüllen. Die Liste **Kommentieren** wechselt den Modus:

| Modus | Funktion |
|---|---|
| Auswählen / Formulare ausfüllen | normaler Modus: Text auswählen, Links anklicken, Formulare ausfüllen |
| Markieren | Text auswählen, um ihn hervorzuheben |
| Text | auf die Seite klicken, um ein Textfeld hinzuzufügen |
| Zeichnen | mit Maus, Stift oder Finger zeichnen |

Speichern Sie die Datei, damit Formulareingaben und Kommentare erhalten bleiben.

### Unterschreiben

**✍** öffnet ein Unterschriftsfeld: Zeichnen Sie Ihre Unterschrift mit Maus, Stift oder Finger oder tippen Sie Ihren Namen.
**Platzieren** schließt das Feld; klicken oder tippen Sie dann auf die Stelle der Seite, an die die Unterschrift soll (`Esc`
oder ✍ bricht ab). Die Unterschrift wird als Bild (etwa 6 cm breit) in die Seite eingefügt und lässt sich wie eine
Seitenoperation rückgängig machen (📄 → Rückgängig). Speichern Sie die Datei, um sie zu behalten.

Das ist eine sichtbare Unterschrift wie auf Papier, keine digitale (kryptografische) Signatur.

## Seiten: umordnen, drehen, löschen, extrahieren, zusammenfügen

Haken Sie Seiten in der Seitenvorschau an (☰ → Seiten); ohne Haken ist die aktuelle Seite gemeint. **📄 Seiten** bietet dann:

| Eintrag | Funktion |
|---|---|
| Nach links / rechts drehen | dreht die Seiten dauerhaft (anders als ⟳, das nur die Ansicht dreht) |
| Nach vorne / Nach hinten / An Position verschieben… | verschiebt die Seiten als Block |
| Löschen | entfernt die Seiten (eine Seite bleibt immer) |
| Als neues PDF extrahieren… | speichert Kopien der Seiten als neue Datei; die geöffnete Datei bleibt unverändert |
| PDF dahinter einfügen… / PDF anhängen… | fügt alle Seiten einer oder mehrerer anderer PDF-Dateien hinter der Auswahl oder am Ende ein (Zusammenfügen) |
| Alle Seiten auswählen, Auswahl aufheben | |
| Rückgängig | macht den letzten Seitenschritt rückgängig (auch `Strg+Z`) |

Speichern Sie die Datei, damit die Änderungen erhalten bleiben. Passwortgeschützte PDFs lassen sich lesen und ausfüllen,
ihre Seiten aber nicht ändern. Formularfelder, Lesezeichen und Metadaten bleiben erhalten; Lesezeichen auf gelöschte Seiten
führen ins Leere.

## Digitale Signaturen

Enthält eine PDF-Datei digitale Signaturen, zeigt eine Zeile über der Seite das Ergebnis der Prüfung: ✅ *signiert von … – die Signatur ist
gültig*, ⚠️ *das Dokument wurde nach dem Signieren geändert* (nach der Signatur wurden Daten angefügt, z. B. ausgefüllte Formularfelder oder
weitere Signaturen – die signierte Fassung selbst ist unverändert) oder ❌ *die Signatur ist NICHT gültig* (der signierte Inhalt wurde
verändert oder die Signatur gehört nicht zum Zertifikat). Ein Klick auf die Zeile oder ✍ in der Seitenleiste zeigt jede Signatur mit
Unterzeichner, Datum, Grund, Ort, dem Zertifikat (Aussteller, Gültigkeit, selbst signiert oder abgelaufen) und der in der Signatur
enthaltenen Zertifikatskette.

Die Prüfung läuft im Browser (RSA- und ECDSA-Signaturen, SHA-1 bis SHA-512). Ob ein Zertifikat **vertrauenswürdig** ist, wird nicht
entschieden: offline gibt es keinen Speicher vertrauenswürdiger Stammzertifikate, eine gültige Signatur belegt also nur, dass der Inhalt
seit dem Signieren mit diesem Zertifikat unverändert ist. Vergleichen Sie im Zweifel das Zertifikat mit dem Unterzeichner.

## Drucken

🖨 bereitet alle Seiten vor und öffnet den Druckdialog des Browsers. Formulareingaben und Kommentare werden mitgedruckt.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Öffnen |
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+F` | Suchen |
| `Strg+Z` | Letzten Seitenschritt rückgängig machen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Werkzeugleiste lässt sich seitlich verschieben, die Seitenleiste (☰) öffnet sich über den Seiten und schließt sich, sobald Sie eine Seite oder ein Kapitel wählen (oder daneben tippen). Mit den Zoom-Schaltflächen
oder der Zoom-Liste stellen Sie die Seitengröße ein.
