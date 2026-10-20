# E-Mail

Der E-Mail-Client (`mail.html`) liest und schreibt E-Mails wie Thunderbird oder Outlook: IMAP-Ordner und Nachrichten,
Senden über SMTP, Entwürfe, ein Adressbuch und Kalendereinladungen. Ohne E-Mail-Konto öffnet und schreibt er `.eml`- und
`.mbox`-Dateien.

Verbindungen zu Mailservern brauchen das [Relay](../benutzerhandbuch.md#netzwerkfunktionen-und-das-relay). Alles andere
(Dateien, Schreiben, Kontakte) funktioniert ohne.

## Konten

1. Öffnen Sie **Relay** in der Seitenleiste und tragen Sie Adresse und Token des Relays ein.
2. Klicken Sie **+ Konto** und geben Sie Ihre E-Mail-Adresse ein. Servernamen (`imap.<domain>`, `smtp.<domain>`) und
   Benutzername werden vorgeschlagen; korrigieren Sie sie mit den Angaben Ihres Anbieters.
3. Wählen Sie die Sicherheit jedes Servers: **SSL/TLS** (Ports 993 und 465), **STARTTLS** (Ports 143 und 587) oder keine.
   Braucht der SMTP-Server eine andere Anmeldung, entfernen Sie das Häkchen bei „Gleicher Benutzername und gleiches Passwort
   wie IMAP“.
4. **Speichern und verbinden**.

Das Passwort wird nur mit dem Konto gespeichert, wenn Sie **Passwort mit dem Konto speichern** wählen; sonst fragt der
Client beim Verbinden danach. Konten und Kontakte stehen in der Verbindungsdatei: **Speichern** Sie sie als verschlüsselte
KeePass-Datenbank (empfohlen) oder als JSON-Datei und öffnen Sie sie beim nächsten Mal mit **Öffnen…** (siehe
Benutzerhandbuch).

### Mehrere Konten und alle Posteingänge

Ein Klick auf weitere Konten in der Liste verbindet auch diese: jedes verbundene Konto bleibt verbunden (● vor dem Namen, mit der
Zahl der ungelesenen Nachrichten im Posteingang), und ein Klick darauf zeigt wieder seine Ordner, ohne sich neu anzumelden. ⏏ trennt
ein Konto.

Bei zwei oder mehr verbundenen Konten erscheint über den Konten **📥 Alle Posteingänge**: die neuesten Nachrichten aller Posteingänge in
einer Liste, die neueste zuerst, jede mit dem Namen ihres Kontos. Dort lassen sich Nachrichten lesen, markieren, als gelesen oder
ungelesen kennzeichnen und löschen (in den Papierkorb ihres Kontos); **Antworten**, **Allen antworten** und **Weiterleiten** schreiben
vom Konto, zu dem die Nachricht gehört (Signatur, Absender, sein Ordner *Gesendet*). Das Suchfeld filtert die gemeinsame Liste; ⟳ lädt
sie neu, und sie wird auch aktualisiert, wenn neue Mails eintreffen. Zum Verschieben in Ordner öffnen Sie das Konto.

„Nicht vertrauenswürdige Zertifikate akzeptieren“ ist nur für Server mit selbst signierten Zertifikaten im eigenen Netz
gedacht.

## Lesen

- Klicken Sie einen Ordner in der Seitenleiste; die Zahl zeigt ungelesene Nachrichten. Die neuesten 50 Nachrichten werden
  geladen, **Ältere Nachrichten laden** lädt weitere. Neue Post wird jede Minute und mit **⟳** abgerufen.
- Ein Klick auf eine Nachricht zeigt sie an. Formatierte (HTML-)Nachrichten werden ohne Skripte, Formulare und **externe
  Bilder** (oft zur Nachverfolgung benutzt) angezeigt; **Nur Text** zeigt die Textfassung. Links öffnen in einem neuen Tab.
- Anhänge stehen über dem Text: Ein Klick speichert sie.
- **Suchen** durchsucht Betreff, Absender und Text des aktuellen Ordners am Server (Eingabetaste; Feld leeren, um zum Ordner
  zurückzukehren).
- **🧵** gruppiert die Liste nach **Unterhaltungen** (standardmäßig an): eine Nachricht und ihre Antworten bilden eine Zeile mit der
  Anzahl der Nachrichten (▸ 4), sortiert nach der neuesten Nachricht; ein Klick auf die Zahl zeigt die Antworten eingerückt
  untereinander. Antworten werden über ihre Verweise erkannt (wie in Thunderbird) und bei Programmen, die diese weglassen, über
  den Betreff („Re:“, „AW:“, „Fwd:“ …). Gruppiert werden nur die geladenen Nachrichten; **Ältere Nachrichten laden** kann frühere
  ergänzen.
- `Strg`+Klick wählt mehrere Nachrichten, `Umschalt`+Klick einen Bereich.

## Ordnen

| Schaltfläche | Taste | Funktion |
|---|---|---|
| 🗑 Löschen | `Entf` | verschiebt in den Papierkorb; im Papierkorb endgültig löschen |
| ✉̸ | `u` | als gelesen/ungelesen markieren |
| ★ | `s` | markieren/Markierung entfernen |
| 📁 | | in einen anderen Ordner verschieben (oder die Nachrichten auf einen Ordner in der Seitenleiste ziehen) |
| Als .eml speichern | | speichert die Nachricht als Datei |
| | `↑` `↓` / `j` `k` | vorherige/nächste Nachricht |

Bei verbundenem Konto legt **＋** über den Ordnern einen Ordner an; ✎ und × benennen den gewählten Ordner um bzw. löschen
ihn (nicht die Standardordner).

### Regeln

Unter **Regeln** in den Kontoeinstellungen (✎ neben dem Konto) lassen sich Nachrichten automatisch einsortieren: Eine Regel
prüft, ob **Von**, **An** oder der **Betreff** einen Text enthält (Groß-/Kleinschreibung egal), und **verschiebt** die
Nachricht dann in einen Ordner, **markiert** sie, **markiert sie als gelesen** oder **löscht** sie. Die erste passende Regel
zählt.

Regeln gelten für neue, ungelesene Nachrichten im Posteingang, solange der Mail-Client geöffnet ist (beim Öffnen des
Posteingangs und wenn neue Post eintrifft); sie laufen nicht auf dem Server. **⚙** neben der Suche wendet die Regeln auf
alle Nachrichten des aktuellen Ordners an.

## Schreiben

**✉ Neue Nachricht** (`n`), **Antworten** (`r`), **Allen antworten** (`a`) und **Weiterleiten** (`f`) öffnen den Editor:

- Adressen werden mit Kommas getrennt. Beim Tippen werden passende Kontakte vorgeschlagen (Auswahl mit ↑ ↓ und Eingabe).
  **Bcc** fügt ein Feld für Blindkopien hinzu.
- **Formatiert (HTML)** wechselt zu formatiertem Text mit fett, kursiv, unterstrichen, Listen, Zitaten und Links; eingefügte
  Bilder werden eingebettet. Sonst ist die Nachricht reiner Text. Die Signatur des Kontos wird angefügt.
- **📎 Anhängen…** oder Ziehen von Dateien auf den Editor fügt Anhänge hinzu; beim Weiterleiten bleiben die Anhänge des
  Originals erhalten.
- **Senden** sendet die Nachricht über SMTP und legt eine Kopie im Ordner „Gesendet“ ab. Beantwortete Nachrichten werden mit
  ↩ markiert.
- **Entwurf speichern** legt die Nachricht im Ordner „Entwürfe“ ab; öffnen Sie den Entwurf dort und klicken Sie **Entwurf
  bearbeiten**, um weiterzuschreiben. Ohne Konto wird der Entwurf als `.eml`-Datei gespeichert.
- **Als .eml speichern** speichert die Nachricht als Datei (zum erneuten Öffnen oder Senden mit einem anderen Programm).
- **Als Vorlage speichern** legt Betreff und Text beim Konto ab (benannt nach dem Betreff). Sobald es Vorlagen gibt, beginnt
  **📋 Vorlagen** neben **✉ Neue Nachricht** eine neue Nachricht aus einer Vorlage; entfernt werden sie in den
  Kontoeinstellungen.

**Rechtschreibung:** Ist im Auswahlfeld **ABC** der Kopfzeile eine Sprache gewählt, werden Betreff und Text (einfach oder
formatiert) beim Schreiben geprüft; ein Rechtsklick auf ein unterstrichenes Wort zeigt Vorschläge ([Rechtschreibung](../benutzerhandbuch.md#rechtschreibung)).

## Kontakte

**👤 Kontakte** öffnet das Adressbuch: suchen, hinzufügen (**+ Kontakt**), bearbeiten (Klick auf den Namen), löschen und an
einen Kontakt schreiben (✉). **.vcf importieren** liest vCard-Dateien (aus Outlook, Thunderbird, Android, …), **.vcf
exportieren** speichert die (gefilterte) Liste als vCard-Datei. In einer Nachricht fügt **＋👤** neben dem Absender diesen zu
den Kontakten hinzu. Kontakte werden mit der Verbindungsdatei gespeichert.

## Kalendereinladungen

Einladungen (iCalendar) zeigen einen Kasten mit Titel, Zeit, Ort und Organisator. **Zusagen**, **Vielleicht** und
**Absagen** senden die Antwort an den Organisator (braucht ein verbundenes Konto). **.ics speichern** speichert den Termin;
öffnen Sie ihn im [Kalender](calendar.md), um ihn in Ihre Kalenderdatei zu übernehmen.

## Dateien ohne Konto

**📂 .eml/.mbox öffnen** (oder Ziehen von Dateien auf das Fenster) öffnet einzelne Nachrichten und Postfachdateien (z. B.
aus Thunderbird exportiert). Sie erscheinen unter „Geöffnete Dateien“ in der Seitenleiste; Sie können sie lesen, durchsuchen,
beantworten, weiterleiten und speichern. Bei verbundenem Konto kopiert 📁 sie in einen IMAP-Ordner.

↗ neben einem Anhang (**Öffnen mit…**) öffnet ihn in einer anderen Anwendung der Suite: Anhänge empfangener Nachrichten als Kopie, Anhänge einer Nachricht in Bearbeitung so, dass Speichern den Anhang ersetzt.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Nachrichten

| Tasten | Funktion |
|---|---|
| `N` | Neue Nachricht |
| `R` / `A` | Antworten / allen antworten |
| `F` | Weiterleiten |
| `Entf` | Löschen |
| `U` | Als gelesen / ungelesen markieren |
| `S` | Markieren (Flagge) |
| `↓` / `J` | Nächste Nachricht |
| `↑` / `K` | Vorherige Nachricht |

### Schreiben

| Tasten | Funktion |
|---|---|
| `↑` / `↓` / `Eingabe` / `Tab` | Adressvorschlag wählen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Es wird jeweils eine Spalte gezeigt: ☰ zeigt die Ordner, eine Nachricht öffnet sich im Vollbild und ← führt zur Liste
zurück. Eine geöffnete `.eml`-Datei wird sofort angezeigt. Zum Verschieben in einen anderen Ordner öffnen Sie die Nachricht
und tippen auf 📁 (Ziehen auf einen Ordner braucht die breite Ansicht). Der Editor nutzt den ganzen Bildschirm.

## Grenzen

- Nachrichten werden nicht offline gespeichert; der Client arbeitet bei bestehender Verbindung am Server (IMAP).
- Keine OAuth-Anmeldung: Anbieter, die nur OAuth erlauben (z. B. Gmail und Microsoft 365 mit moderner Authentifizierung),
  brauchen ein App-Passwort.
- Keine Verschlüsselung oder Signaturen (S/MIME, OpenPGP).
