# FTP/SFTP-Client

Der FTP/SFTP-Client (`ftp.html`) überträgt Dateien zwischen Ihrem Computer und Servern, wie FileZilla. Er unterstützt **SFTP** (über SSH),
**FTPS** (FTP über TLS, explizit und implizit) und einfaches **FTP**. Verbindungen laufen über das **lokale Relay** (siehe Benutzerhandbuch,
„Netzwerkfunktionen und das Relay“).

## Verbinden

Die Leiste oben verbindet direkt: Protokoll wählen, Host, Port (wird zum Protokoll ausgefüllt), Benutzer und Passwort eingeben und
**Verbinden** klicken.

| Protokoll | Port | Hinweise |
|---|---|---|
| SFTP (SSH) | 22 | Passwort oder privater Schlüssel (in das Schlüsselfeld einfügen); beim ersten Verbinden wird der Host-Schlüssel des Servers angezeigt |
| FTPS (explizites TLS) | 21 | nach `AUTH TLS` verschlüsselt; das übliche sichere FTP |
| FTPS (implizites TLS) | 990 | von Anfang an verschlüsselt |
| FTP (unverschlüsselt) | 21 | Passwörter und Dateien werden im Klartext übertragen – nur in vertrauenswürdigen Netzen verwenden |

Für FTPS mit einem selbst signierten Serverzertifikat haken Sie **Nicht vertrauenswürdige Zertifikate akzeptieren** an. FTP verwendet immer den
passiven Modus; die Datenverbindungen gehen zum selben Host wie die Steuerverbindung.

**Server speichern** legt die aktuellen Einstellungen unter einem Namen in der Liste **Server** ab; ein Klick auf einen Server verbindet, ✎ lädt
ihn in die Leiste, × löscht ihn. Server und Relay-Einstellungen liegen in einer Verbindungsdatei (KeePass-Datenbank oder JSON-Datei,
**Speichern** und **Öffnen…** unter der Liste).

## Lokale und entfernte Dateien

Das Fenster zeigt zwei Listen: **Lokal** links, **Server** rechts.

- **Lokal** (Chrome/Edge am Desktop): **Lokalen Ordner wählen…** öffnet einen Ordner Ihres Computers. Doppelklick öffnet Ordner, ↑ führt nach oben.
  Downloads werden in diesen Ordner geschrieben; Ordner werden mit ihrem Inhalt heruntergeladen.
- In Firefox und auf Smartphones können keine lokalen Ordner geöffnet werden: **Dateien hochladen…** lädt Dateien hoch, Downloads landen im
  Download-Ordner des Browsers.
- **Server**: Doppelklick öffnet einen Ordner, ↑ führt nach oben, oder einen Pfad eintippen und `Eingabe` drücken; ⟳ lädt neu.

Klick wählt einen Eintrag, `Strg`+Klick mehrere.

## Übertragungen

- **Hochladen →** lädt die gewählten lokalen Einträge (Ordner mit Inhalt) in den aktuellen Serverordner; Einträge können auch aus der lokalen
  Liste (oder Dateien vom Desktop) auf die Serverliste gezogen werden.
- **← Herunterladen** lädt die gewählten Servereinträge herunter; ein Doppelklick auf eine Serverdatei lädt sie herunter; Servereinträge können
  auch auf die lokale Liste gezogen werden.
- Vorhandene Dateien auf dem Server werden nach einer Bestätigung überschrieben.

Die Liste **Übertragungen** zeigt jede Übertragung mit Fortschritt, Größe und Ergebnis; **Erledigte entfernen** entfernt die fertigen.

**Fortsetzen**: Schlägt eine Übertragung fehl (z. B. weil die Verbindung abbrach), setzt **↻ Fortsetzen** daneben sie an der Stelle
fort, an der sie stehen blieb – ein Download behält den bereits empfangenen Teil und fordert vom Server nur den Rest an, ein Upload
macht nach dem Teil weiter, den der Server schon hat. Liegt beim Hochladen eine kleinere Datei gleichen Namens auf dem Server, fragt
der Client, ob das Hochladen fortgesetzt werden soll; enthält beim Herunterladen der lokale Ordner eine kleinere Datei gleichen Namens,
fragt er, ob der Download fortgesetzt werden soll. Fortsetzen funktioniert mit SFTP und mit FTP-Servern, die `REST` und `APPE`
unterstützen (fast alle).

## Ordner vergleichen und synchronisieren

Mit geöffnetem lokalem Ordner (Chrome/Edge am Desktop) und einer Verbindung vergleicht **⇄ Vergleichen / synchronisieren** den lokalen
Ordner mit dem aktuellen Serverordner samt allen Unterordnern. Die Liste zeigt jede abweichende Datei: *nur lokal*, *nur auf dem
Server*, *lokal neuer*, *Server neuer* oder *andere Größe* (wenn die Zeiten nicht verraten, welche neuer ist), mit Größe und
Änderungszeit auf beiden Seiten; **Gleiche Dateien zeigen** ergänzt die übereinstimmenden Dateien.

Jede Datei erhält eine Aktion – **hochladen**, **herunterladen** oder **überspringen** –, die sich ändern lässt. **Richtung** schlägt
die Aktionen vor: *in beide Richtungen* (die neuere Datei gewinnt), *nur hochladen* (der Server wird an den lokalen Ordner angeglichen)
oder *nur herunterladen*. **Synchronisieren** stellt die Übertragungen in die Warteschlange; fehlende Ordner werden angelegt. Dateien
werden nie gelöscht.

Dateien gleicher Größe gelten als gleich; mit **Bei gleicher Größe die Änderungszeiten vergleichen** werden auch ihre Zeiten verglichen.
Uploads übernehmen die lokale Änderungszeit auf den Server (FTP `MFMT`, SFTP), sodass sie danach als gleich gelten. Ein Browser kann
die Zeit einer heruntergeladenen Datei nicht setzen: heruntergeladene Dateien erhalten die aktuelle Zeit, deshalb stützt sich der
Vergleich standardmäßig auf die Größen. Je Seite werden höchstens 5000 Dateien verglichen.

## Dateien auf dem Server verwalten

**Neuer Ordner**, **Umbenennen** (ein gewählter Eintrag) und **Löschen** (gewählte Einträge; Ordner werden nach einer Bestätigung mit Inhalt gelöscht).

**Öffnen mit…** öffnet die gewählte entfernte Datei in einer anderen Anwendung der Suite; Speichern dort lädt sie wieder hoch (in der Übertragungsliste sichtbar). Sind **mehrere Dateien** gewählt (`Strg+Klick`), öffnet der Texteditor oder der Hex-Editor alle in einem Fenster, jede in einem eigenen Tab.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

Die Listen stehen untereinander; ☰ **Server** öffnet die gespeicherten Server.
