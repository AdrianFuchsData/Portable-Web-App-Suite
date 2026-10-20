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
| Einmalpasswort | wird mit den verbleibenden Sekunden angezeigt, wenn der Eintrag ein Feld `otp` hat (`otpauth://totp/…`, wie es KeePassXC schreibt) |
| Tags | durch Kommas getrennt |
| Läuft ab | setzt ein Ablaufdatum; abgelaufene Einträge werden markiert |
| Weitere Felder | eigene Felder mit Name und Wert; 🔒 schützt ein Feld (es wird verborgen und im Speicher verschlüsselt gehalten) |
| Anhänge | Dateien hinzufügen, durch Klick auf den Namen herunterladen oder entfernen |
| Gruppe | verschiebt den Eintrag in eine andere Gruppe |
| Verlauf | frühere Versionen des Eintrags; **Wiederherstellen** macht eine frühere Version wieder aktuell |

Bei jeder Bearbeitung eines Eintrags wird die vorherige Version einmal im **Verlauf** abgelegt (nicht bei jedem Tastendruck).

Kopierte Werte werden nach 30 Sekunden aus der Zwischenablage entfernt.

Rückgängig (↶, `Strg+Z`) und Wiederholen (↷, `Strg+Y`) wirken auf alle Änderungen der Datenbank seit dem Entsperren: Felder, neue und gelöschte Einträge und Gruppen, Verschieben, Anhänge und Einstellungen. Tippen in ein Feld zählt als ein Schritt. Sperren löscht den Verlauf.

↗ neben einem Anhang (**Öffnen mit…**) öffnet ihn in einer anderen Anwendung der Suite; Speichern dort ersetzt den Anhang. Speichern Sie danach die Datenbank.

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
