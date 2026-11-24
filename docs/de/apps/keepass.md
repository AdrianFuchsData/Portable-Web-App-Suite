# KeePass

Die KeePass-Anwendung (`keepass.html`) öffnet, bearbeitet und erstellt KeePass-Passwortdatenbanken (`.kdbx`, KDBX 3.1 und 4).
Die Dateien bleiben mit KeePass, KeePassXC, KeePassDX und anderen KeePass-Apps kompatibel. Alles läuft im Browser;
nichts wird über das Netzwerk gesendet.

## Eine Datenbank entsperren

1. **Datenbank wählen…** wählt die `.kdbx`-Datei. Sie können die Datei (und ihre Schlüsseldatei) auch auf das Fenster ziehen.
   In Chrome/Edge am Desktop listet **Zuletzt verwendet** die zuvor geöffneten Datenbanken.
2. Geben Sie das Master-Passwort ein.
3. Verwendet die Datenbank eine Schlüsseldatei, wählen Sie diese mit **Schlüsseldatei wählen…**.
4. **Entsperren**. Ein falsches Passwort oder eine falsche Schlüsseldatei ergibt eine Fehlermeldung.

## Eine Datenbank anlegen

**Neue Datenbank anlegen** fragt nach einem Namen und dem Master-Passwort (zweimal). Optional erzeugt die Anwendung auch eine
**Schlüsseldatei** (`<Name>.keyx`), die sofort heruntergeladen wird: Bewahren Sie sie sicher auf, denn ohne sie lässt sich
die Datenbank nicht öffnen. Die neue Datenbank wird erst gespeichert, wenn Sie **Speichern** wählen.

## Gruppen und Einträge

- Der linke Bereich zeigt die **Gruppen**. Ein Klick auf eine Gruppe zeigt ihre Einträge; ein Doppelklick (oder **Umbenennen**)
  benennt sie um. **Neue Gruppe** legt eine Untergruppe der gewählten Gruppe an; **Gruppe löschen** verschiebt die Gruppe mit
  allen Einträgen in den Papierkorb.
- Der mittlere Bereich listet die **Einträge** der Gruppe, nach Titel sortiert. Das **Suchfeld** durchsucht Titel, Benutzername,
  URL, Notizen und Tags in allen Gruppen (`Strg+F`).
- **Neuer Eintrag** legt in der gewählten Gruppe einen Eintrag mit einem erzeugten Passwort an.
- Der rechte Bereich bearbeitet den gewählten Eintrag. Alle Änderungen wirken sofort; die Schaltfläche **Speichern** ist
  hervorgehoben, solange es ungespeicherte Änderungen gibt.

## Einen Eintrag bearbeiten

| Feld | Hinweise |
|---|---|
| Titel, Benutzername, URL, Notizen | ⧉ kopiert den Benutzernamen; **Öffnen** öffnet die URL in einem neuen Tab |
| Passwort | 👁 zeigt oder verbirgt es, ⧉ kopiert es; die Stärke wird in Bit angezeigt |
| Einmalpasswort | der aktuelle Code mit den verbleibenden Sekunden (siehe unten); 🔑 **Einmalpasswort einrichten…** fügt eines hinzu |
| Tags | durch Kommas getrennt |
| Läuft ab | setzt ein Ablaufdatum; abgelaufene Einträge werden markiert |
| Weitere Felder | eigene Felder mit Name und Wert; 🔒 schützt ein Feld (es wird verborgen und im Speicher verschlüsselt gehalten) |
| Anhänge | Dateien hinzufügen, durch Klick auf den Namen herunterladen oder entfernen |
| Gruppe | verschiebt den Eintrag in eine andere Gruppe |
| Verlauf | frühere Versionen des Eintrags; **Wiederherstellen** macht eine frühere Version wieder aktuell |

Bei jeder Bearbeitung eines Eintrags wird die vorherige Version einmal im **Verlauf** abgelegt (nicht bei jedem Tastendruck). Der Verlauf
listet die Versionen, die neueste zuerst, jeweils mit dem, was danach geändert wurde (zum Beispiel „danach geändert: Passwort“). Ein Klick auf
eine Version zeigt ihre Felder – die vom aktuellen Eintrag abweichenden sind hervorgehoben, Passwörter und geschützte Felder bleiben verborgen,
bis Sie auf 👁 klicken – und erlaubt **Wiederherstellen**, das Passwort zu kopieren oder **Diese Version löschen**. **Ganzen Verlauf löschen**
entfernt alle älteren Versionen des Eintrags (etwa wenn ein altes Passwort nirgends mehr gespeichert sein soll). Unter **⚙ Datenbank** begrenzt
*Ältere Versionen je Eintrag* den Verlauf (Vorgabe von KeePass: 10; −1 behält alle); ältere Versionen über der Grenze werden beim Speichern
entfernt.

Kopierte Werte werden nach 30 Sekunden aus der Zwischenablage entfernt.

Rückgängig (↶, `Strg+Z`) und Wiederholen (↷, `Strg+Y`) wirken auf alle Änderungen der Datenbank seit dem Entsperren: Felder, neue und gelöschte Einträge und Gruppen, Verschieben, Anhänge und Einstellungen. Tippen in ein Feld zählt als ein Schritt. Sperren löscht den Verlauf.

↗ neben einem Anhang (**Öffnen mit…**) öffnet ihn in einer anderen Anwendung der Suite; Speichern dort ersetzt den Anhang. Speichern Sie danach die Datenbank.

## Einmalpasswörter (Zwei-Faktor-Codes)

Ein Eintrag kann das Geheimnis eines Einmalpassworts enthalten, so ersetzt die Datenbank auch eine Authenticator-App. Der Eintrag zeigt den
aktuellen Code (⧉ kopiert ihn; der Balken zeigt, wie lange er gilt). **🔑 Einmalpasswort einrichten…** – oder ✎ bei einem vorhandenen – öffnet
einen Dialog: Fügen Sie den `otpauth://`-Link ein, den ein Dienst anbietet (er füllt alle Felder aus), oder geben Sie den **geheimen Schlüssel**
ein (Base32, Leerzeichen werden ignoriert) und, wenn der Dienst es verlangt, die Art (**TOTP**: zeitbasiert, die übliche; **HOTP**: zählerbasiert;
**Steam**: die fünf Zeichen von Steam Guard), Algorithmus, Stellen und Intervall oder Zähler. 🎲 erzeugt einen neuen zufälligen Schlüssel, etwa
für einen eigenen Server. × entfernt das Einmalpasswort.

Bei HOTP zeigt der Eintrag den Code zum aktuellen Zähler; **Nächster Code** kopiert ihn und zählt weiter (speichern Sie danach die Datenbank,
damit der Zähler erhalten bleibt).

Das Geheimnis wird geschützt im Feld `otp` als `otpauth://`-Link gespeichert (wie bei KeePassXC, KeeWeb, KeePassDX und Strongbox) und zusätzlich
in den Feldern `TimeOtp-…` / `HmacOtp-…` von KeePass 2.47+, damit jede gängige KeePass-App dieselben Codes zeigt. Einträge, die nur die Felder von
KeePass 2, die älteren KeePassXC-Felder `TOTP Seed` / `TOTP Settings` oder das KeeOtp-Format haben, werden ebenfalls gelesen. Diese Felder
erscheinen nicht unter *Weitere Felder*.

**QR-Codes.** Im Einrichtungsdialog liest **📷 QR-Code scannen** den QR-Code, den ein Dienst anzeigt, mit der Kamera des Geräts (der Browser fragt
um Erlaubnis; nichts verlässt das Gerät), **🖼 QR-Code aus einem Bild…** liest ihn aus einem Bildschirmfoto oder Foto. Auch eine Übertragung aus dem
Google Authenticator (*Konten übertragen*, `otpauth-migration://`) funktioniert: Das erste Konto kommt in den Eintrag, **Als neue Einträge hinzufügen**
legt für jedes weitere Konto einen Eintrag in derselben Gruppe an. Um ein Geheimnis auf ein anderes Gerät zu bringen – etwa in die Authenticator-App
des Telefons –, klicken Sie neben dem Code auf **▦ QR**: Nach einer Warnung zeigt **QR-Code anzeigen** ihn als QR-Code (und das Geheimnis als Text).
Wer ihn sieht, kann Ihre Codes erzeugen; zeigen Sie ihn also nur, um ihn selbst zu scannen.

## Passwortgenerator

🎲 **Erzeugen** öffnet den Generator: Länge (4 bis 64), Kleinbuchstaben, Großbuchstaben, Ziffern, Sonderzeichen und die Option,
ähnliche Zeichen (l, 1, O, 0) zu vermeiden. ⟳ erzeugt ein neues Passwort; **Übernehmen** setzt es als Passwort des Eintrags.

## Papierkorb

Gelöschte Einträge und Gruppen werden in die Gruppe **Papierkorb** verschoben. Um einen Eintrag wiederherzustellen, wählen Sie
ihn im Papierkorb aus und wählen im Feld **Gruppe** eine andere Gruppe. **Papierkorb leeren** löscht den Inhalt endgültig.

## Speichern

**Speichern** (`Strg+S`) schreibt die Datenbank in Chrome/Edge am Desktop direkt in die geöffnete Datei. In Firefox und unter
Android wird die Datenbank heruntergeladen: Ersetzen Sie die ursprüngliche Datei damit. `Strg+Umschalt+S` speichert unter
einem neuen Namen. Nach dem Schreiben prüft die Anwendung, ob sich die gespeicherte Datei wieder öffnen lässt.

## Hauptschlüssel und Datenbankeinstellungen

**Datenbank** öffnet die Einstellungen: den Namen der Datenbank und **Hauptschlüssel ändern** (neues Passwort und optional eine
neue Schlüsseldatei oder das Entfernen der bisherigen). Speichern Sie die Datenbank danach; behalten Sie die alte Datei, bis Sie
geprüft haben, dass sich die neue öffnen lässt.

## Datenbanken zusammenführen

**⇄ Zusammenführen…** verbindet eine andere `.kdbx`-Datei mit der geöffneten Datenbank (Sie geben ihr Passwort und bei Bedarf
ihre Schlüsseldatei ein):

- **Eine Kopie derselben Datenbank** (etwa auf einem anderen Computer oder Smartphone bearbeitet) wird **abgeglichen**: für jeden
  Eintrag gewinnt die neuere Fassung, die ältere kommt in den Verlauf; neue Einträge und Gruppen werden übernommen, in einer
  Kopie gelöschte Einträge werden gelöscht. Das entspricht „Synchronisieren“ in KeePass und KeePassXC.
- **Eine andere Datenbank** wird **übernommen**: ihre Gruppen und Einträge werden in eine neue Gruppe mit ihrem Namen kopiert
  (ohne Papierkorb). In der geöffneten Datenbank wird nichts verändert.

Speichern Sie danach, um das Ergebnis zu behalten; ↶ macht das Zusammenführen rückgängig.

## Passwortbericht

**🩺 Bericht** prüft alle Einträge (außer denen im Papierkorb) und listet Probleme auf: leere Passwörter, schwache Passwörter
(weniger als 60 Bit geschätzte Stärke, dieselbe Schätzung wie im Generator), in mehreren Einträgen verwendete Passwörter,
abgelaufene Einträge und Passwörter, die seit mehr als einem Jahr unverändert sind (aus dem Verlauf der Einträge). Ein Klick
öffnet den Eintrag. Die Prüfung läuft vollständig im Browser; kein Passwort verlässt das Gerät.

## CSV-Import und -Export

**⇅ CSV → CSV exportieren…** schreibt die Einträge der ganzen Datenbank oder der aktuellen Gruppe (mit ihren Untergruppen) in eine
CSV-Datei (Spalten `Group`, `Title`, `Username`, `Password`, `URL`, `Notes`, `TOTP`, `Tags`, `Last Modified`, `Created` – das Format von
KeePassXC, das die meisten Passwortmanager importieren können). **Eine CSV-Datei ist nicht verschlüsselt**: Der Dialog warnt davor, und die
Schaltfläche sagt es auch. Exportieren Sie nur, wenn Sie es brauchen, behalten Sie die Datei auf Ihrem eigenen Gerät und löschen Sie sie danach.

**⇅ CSV → CSV importieren…** liest die CSV-Datei eines anderen Passwortmanagers in eine neue Gruppe ein. Die Spaltenköpfe von KeePassXC,
KeePass, Bitwarden, Chrome/Edge, Firefox, Safari, LastPass, 1Password, Dashlane, Proton Pass und ähnlichen Exporten werden erkannt (auch
deutsche wie *Benutzername* oder *Kennwort*); der Dialog zeigt, welche Spalte zu welchem Feld wird. Spalten ohne Bedeutung für KeePass
(Favorit, IDs, Zeitstempel) werden ignoriert, unbekannte Spalten werden zu weiteren Feldern. Eine Gruppen-/Ordnerspalte legt Untergruppen an;
eine TOTP-Spalte (ein `otpauth://`-Link oder ein Base32-Geheimnis) wird zum Einmalpasswort des Eintrags; Einträge ohne Titel werden nach der
Website benannt. Trennzeichen (Komma, Strichpunkt oder Tabulator) und Kodierung (UTF-8 oder Windows-1252) werden erkannt. Löschen Sie die
CSV-Datei nach dem Import – sie enthält Ihre Passwörter im Klartext.

## Sperren

**Sperren** (`Strg+L`) schließt die Datenbank; bei ungespeicherten Änderungen ist eine Bestätigung nötig. Nach 15 Minuten ohne
Aktivität wird die Datenbank automatisch gesperrt, außer es gibt ungespeicherte Änderungen.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+S` | Speichern |
| `Strg+Umschalt+S` | Speichern unter |
| `Strg+L` | Sperren |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |
| `Strg+F` | Suchen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Anwendung zeigt jeweils einen Bereich: die Eintragsliste, die Gruppen (‹ **Gruppen**) und den Eintrag (‹ **Einträge** führt zurück).
