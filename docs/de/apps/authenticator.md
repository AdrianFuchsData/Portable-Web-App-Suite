# Authenticator

Der Authenticator (`authenticator.html`) zeigt die Einmalpasswörter (Zwei-Faktor-Codes) einer KeePass-Datenbank – wie eine
Authenticator-App am Smartphone, aber die Geheimnisse bleiben in Ihrer eigenen verschlüsselten `.kdbx`-Datei. Unterstützt
werden **TOTP** (zeitbasiert, der übliche Fall), **HOTP** (zählerbasiert) und **Steam**-Codes. Alles läuft im Browser; nichts
wird irgendwohin gesendet.

Die Tokens werden so gespeichert, wie es KeePassXC, KeePass 2 (ab 2.47), KeePassDX und Strongbox tun (das Feld `otp` sowie die
Felder `TimeOtp-…`/`HmacOtp-…` von KeePass 2). Dieselbe Datenbank funktioniert also auch in diesen Programmen und in der
[KeePass](keepass.md)-Anwendung der Suite. Ältere KeePassXC-Felder (`TOTP Seed`/`TOTP Settings`) und KeeOtp-Einträge werden
ebenfalls gelesen.

## Eine Datenbank entsperren oder anlegen

1. **Datenbank wählen…** wählt die `.kdbx`-Datei; Sie können sie auch auf das Fenster ziehen, zusammen mit ihrer
   Schlüsseldatei. In Chrome/Edge am Desktop listet **Zuletzt geöffnet** die zuvor geöffneten Datenbanken.
2. Geben Sie das Passwort ein (👁 zeigt es an) und wählen Sie, falls die Datenbank eine hat, die **Schlüsseldatei**.
3. **Entsperren**. Ein falsches Passwort oder eine falsche Schlüsseldatei ergibt eine Fehlermeldung.

**Eine neue Datenbank anlegen** fragt nach einem Namen und einem Passwort (zweimal); optional wird auch eine
**Schlüsseldatei** angelegt und sofort heruntergeladen – bewahren Sie sie sicher auf, ohne sie lässt sich die Datenbank nicht
öffnen. Die neue Datenbank ist eine KDBX-4-Datei (AES-256, Argon2id); sie wird geschrieben, wenn Sie sie **speichern**.

## Die Codes

Jeder Eintrag mit Einmalpasswort-Daten (außerhalb des Papierkorbs) erscheint als Karte, nach Namen sortiert, mit Konto und
Gruppe. Für TOTP- und Steam-Tokens zeigt die Karte drei Codes: den **vorherigen**, den **aktuellen** (groß) und den
**nächsten** Code sowie einen Balken mit den verbleibenden Sekunden. Ein Klick auf einen Code kopiert ihn. Der aktuelle Code
wird in seinen letzten fünf Sekunden rot – dann ist der nächste Code der richtige. Der vorherige Code hilft, wenn ein Server
etwas nachgeht.

HOTP-Tokens zeigen den Code zum aktuellen Zähler; **⟳ n** geht zum nächsten Code weiter (der Zähler wird erhöht und mit der
Datenbank gespeichert).

**Suchen** (`Strg+F`) filtert nach Name, Konto, Aussteller und Gruppe.

## Die Uhr stellen

TOTP-Codes hängen von der Zeit ab: Weicht die Uhr Ihres Geräts von der des Servers ab, werden die Codes abgelehnt. Die Leiste
über den Codes zeigt die Uhr, mit der die Codes erzeugt werden:

- **−30 s** / **+30 s** stellen die Uhr eine halbe Minute zurück oder vor (einen Code-Schritt).
- **⏸** hält die Uhr an (die Codes bleiben stehen), **▶** lässt sie von dort weiterlaufen.
- **⚙** öffnet die Einstellungen: einen **Versatz zur lokalen Uhr** in Sekunden (z. B. `-90`) oder ein festes **Datum mit
  Uhrzeit** (die Uhr hält dabei an).
- **↺** kehrt zur lokalen Uhr zurück. Solange die Uhr von der lokalen Uhr abweicht, ist die Leiste gelb.

Die Einstellung der Uhr wird nicht gespeichert; beim nächsten Öffnen der Anwendung gilt wieder die lokale Uhr.

## Tokens hinzufügen und bearbeiten

**+ Hinzufügen** öffnet das Formular:

- **Aus einem otpauth://-Link übernehmen**: Fügen Sie einen Link ein, wie ihn eine Website beim Einrichten der
  Zwei-Faktor-Anmeldung anbietet (`otpauth://totp/Beispiel:anna@example.org?secret=…&issuer=Beispiel`) – alle Felder werden
  ausgefüllt.
- Oder geben Sie **Aussteller**, **Konto**, **Name** (den Titel des KeePass-Eintrags) und den **geheimen Schlüssel** ein
  (Base32, Leerzeichen werden ignoriert). 🎲 erzeugt einen zufälligen Schlüssel (für ein eigenes Token).
- **Erweiterte Einstellungen**: Typ (TOTP, HOTP, Steam), Algorithmus (SHA1, SHA256, SHA512), Stellen, Intervall (TOTP) oder
  Zähler (HOTP) und die KeePass-**Gruppe** für den neuen Eintrag.
- Der **aktuelle Code** wird schon beim Tippen angezeigt, sodass Sie ihn vor dem Speichern mit der Website vergleichen können.

**✎ Bearbeiten** ändert ein Token auf dieselbe Weise; die vorige Fassung des Eintrags kommt in seinen Verlauf.

## Tokens löschen

**🗑 Löschen** fragt zuerst nach und warnt: Schalten Sie die Zwei-Faktor-Anmeldung für das Konto ab (oder stellen Sie sicher,
dass Sie sich anders anmelden können), bevor Sie das Token löschen – sonst sperren Sie sich womöglich aus. Enthält der
KeePass-Eintrag mehr als das Token – ein Passwort, eine URL, Notizen, Anhänge oder weitere Felder –, können Sie **nur das
Token entfernen** und den Eintrag behalten oder den ganzen Eintrag löschen. Gelöschte Einträge kommen in den Papierkorb der
Datenbank, falls sie einen hat.

## Importieren

**⇩ Importieren** liest mehrere Tokens auf einmal:

- **Text**: `otpauth://`-Links (einer je Zeile), Export-Links von **Google Authenticator** (`otpauth-migration://`, aus den
  QR-Codes von „Konten übertragen“) und unverschlüsselte **Aegis**-JSON-Exporte.
- **🖼 QR-Code aus einem Bild…** liest die QR-Codes von Bildschirmfotos oder Fotos; Sie können ein Bildschirmfoto auch
  **einfügen** (`Strg+V`) oder Bilder auf das Fenster ziehen.
- **📷 Mit der Kamera scannen** liest QR-Codes, die Sie vor die Kamera halten (der Browser fragt nach der Erlaubnis).
- **📄 Aus einer Datei…** liest Text- und JSON-Dateien.

Die Liste darunter zeigt die gefundenen Tokens; Tokens, die schon in der Datenbank sind, sind als *schon vorhanden* markiert
und nicht angehakt. Wählen Sie die **Gruppe** für die neuen Einträge und **Importieren**. Fügen Sie einen `otpauth://`-Link
oder ein Bildschirmfoto eines QR-Codes irgendwo im Fenster ein (außerhalb der Textfelder), öffnet sich der Import damit.

## Exportieren

- **▦** auf einer Karte zeigt das Token als **QR-Code** und als `otpauth://`-Link (nach einer Warnung – wer ihn sieht, kann
  Ihre Codes erzeugen). Scannen Sie den QR-Code mit einer anderen Authenticator-App, um ein Token dorthin zu übertragen.
- **⇧ Alle exportieren** lädt alle `otpauth://`-Links als Textdatei herunter oder zeigt alle QR-Codes. Der Export ist **nicht
  verschlüsselt** – löschen Sie ihn nach Gebrauch.

## Speichern

**💾 Speichern** (`Strg+S`) schreibt die Datenbank in Chrome/Edge am Desktop in ihre Datei zurück. In anderen Browsern
(Firefox, Android) wird sie heruntergeladen: Ersetzen Sie die Originaldatei durch die heruntergeladene, sonst gehen die
Änderungen verloren. **Speichern unter** (`Strg+Umschalt+S`) schreibt eine Kopie. Vor dem Speichern wird die neue Datei zur
Kontrolle wieder entschlüsselt.

## Sperren

**🔒 Sperren** (`Strg+L`) schließt die Datenbank. Sie wird auch nach **10 Minuten** ohne Aktivität gesperrt – aber nie,
solange es ungespeicherte Änderungen gibt.

## Tastenkürzel

Auf einem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Strg+L` | Sperren |

### Codes

| Tasten | Funktion |
|---|---|
| `Strg+F` | Suchen |
| `Strg+V` | Einen eingefügten `otpauth://`-Link oder ein QR-Code-Bild importieren |
| `Escape` | Den Dialog schließen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Karten stehen in einer Spalte; die Werkzeugleiste bricht um. Zum Scannen von QR-Codes wird die rückseitige Kamera
verwendet. Unter Android wird die Datenbank als Download gespeichert (siehe *Speichern*).
