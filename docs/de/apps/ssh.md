# SSH-Client

Der SSH-Client (`ssh.html`) öffnet Terminalsitzungen auf SSH-Servern und überträgt Dateien über SFTP. Er arbeitet wie PuTTY mit einem
eingebauten Dateibereich. Verbindungen laufen über das **lokale Relay** (siehe Benutzerhandbuch, „Netzwerkfunktionen und das Relay“).

## Verbinden

1. **Neue Verbindung** öffnet den Verbindungsdialog: Name, Host, Port (22), Benutzer und die Anmeldung:
   - **Privater Schlüssel**: Schlüssel einfügen (OpenSSH-Format `-----BEGIN OPENSSH PRIVATE KEY-----` oder PEM) oder die Schlüsseldatei laden;
     bei einem geschützten Schlüssel die Passphrase eingeben. Unterstützt werden Ed25519-, ECDSA- und RSA-Schlüssel.
   - **Passwort** (wird auch für die Keyboard-Interactive-Anmeldung verwendet).
2. Tragen Sie einmal Adresse und Token des Relays ein (sie werden mit den Verbindungen gespeichert).
3. **Verbinden** öffnet einen neuen Reiter; **Verbindung speichern** fügt die Verbindung den **Gespeicherten Verbindungen** hinzu (Passwort und
   Passphrase nur, wenn das Kästchen angehakt ist; ein privater Schlüssel wird immer mit der Verbindung gespeichert).

### Proxy und Sprungserver

Unter **Proxy und Sprungserver** im Verbindungsdialog:

- **Sprungserver (ProxyJump)**: eine gespeicherte Verbindung wählen (Bastion, Gateway oder „Jump-Server“). Der Client verbindet sich zuerst mit ihr
  und öffnet dann die Verbindung zum Ziel **von dort aus** – das Ziel muss nur vom Sprungserver erreichbar sein. Der Sprungserver kann selbst einen
  Sprungserver verwenden; sein eigener Host-Schlüssel wird wie gewohnt geprüft. Beide Verbindungen enden, wenn der Tab geschlossen wird.
- **Proxy**: **SOCKS5** oder **HTTP (CONNECT)** mit Host, Port und optional Benutzer und Passwort (das Passwort wird wie die anderen gespeichert,
  in einer KeePass-Verbindungsdatei geschützt). Das Relay verbindet sich mit dem Proxy, der Proxy mit dem SSH-Server; SSH bleibt Ende-zu-Ende
  verschlüsselt. (Für einen Proxy für alle Verbindungen des Relays starten Sie das Relay mit `--upstream-proxy`.)

### Portweiterleitung

**⇄ Weiterleitung** (in der Werkzeugleiste eines verbundenen Tabs) öffnet Tunnel durch die SSH-Verbindung:

- **Lokal (hier → Server)**: Das Relay lauscht auf diesem Rechner an `127.0.0.1` und einem Port (leer = ein freier Port, nach dem Start angezeigt);
  jede Verbindung dorthin gibt der SSH-Server an *Host:Port* weiter – etwa eine Datenbank oder Weboberfläche, die nur der Server erreicht
  (`localhost:5432` vom Server aus gesehen). Andere Programme auf diesem Rechner und die anderen Apps der Suite verbinden sich mit `127.0.0.1` am
  angezeigten Port. Das braucht das Relay auf dem eigenen Rechner (ein gemeinsames Relay lauscht an keinen Ports).
- **Entfernt (Server → hier)**: Der SSH-Server lauscht an seinem `127.0.0.1` am angegebenen Port; Verbindungen dorthin kommen über den Browser und
  das Relay zu *Host:Port* auf dieser Seite zurück.

Jede Weiterleitung zeigt, wie viele Verbindungen sie getragen hat; × beendet sie. 💾 speichert die aktuellen Weiterleitungen mit der gespeicherten
Verbindung: Sie starten bei jedem Verbinden. Schließen des Tabs beendet alle.

### Host-Schlüssel

Beim ersten Verbinden zeigt der Client den Fingerabdruck des Serverschlüssels (`SHA256:…`). Vergleichen Sie ihn mit dem Fingerabdruck, den Ihnen
die Administration nennt (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` auf dem Server):

- **Akzeptieren und speichern** speichert den Fingerabdruck mit der gespeicherten Verbindung; spätere Verbindungen werden ohne Rückfrage akzeptiert.
- **Einmal akzeptieren** verbindet, ohne ihn zu speichern.
- **Ablehnen** bricht die Verbindung ab.

Ändert sich der Fingerabdruck einer gespeicherten Verbindung, erscheint eine **Warnung** – möglicherweise wird die Verbindung abgehört. Akzeptieren
Sie den neuen Schlüssel nur, wenn Sie den Grund kennen (z. B. wurde der Server neu installiert).

## Terminal

Jede Verbindung öffnet einen Reiter mit einem Terminal (xterm-kompatibel, Farben, Maus, Größenänderung). Der farbige Punkt zeigt den Zustand:
grün verbunden, gelb verbinde, rot geschlossen. **Neu verbinden** öffnet eine geschlossene Sitzung erneut; × schließt einen Reiter.

- Markierten Text kopiert ⧉ (oder die Kopier-Tastenkombination des Browsers); 📋 fügt die Zwischenablage in die Sitzung ein.
- **Schriftgröße** ändert die Größe aller Terminals, **Schrift** ihre Schrift (die nichtproportionale Schrift des Systems, eine mitgelieferte wie
  JetBrains Mono oder Fira Code oder eine importierte; wird gemerkt).
- **⏺** zeichnet die Sitzung ab jetzt auf; ein zweiter Klick (**⏹**, mit der aufgezeichneten Größe) beendet die Aufzeichnung und speichert das
  Protokoll als Textdatei (ohne Farbcodes). **⤓** speichert, was das Terminal gerade enthält (samt Verlauf von bis zu 5000 Zeilen).
- Auf Touch-Geräten bietet eine Tastenleiste Esc, Tab, Strg (gilt für die nächste Taste, z. B. Strg und dann C), die Pfeiltasten und einige
  Zeichen, die auf Smartphone-Tastaturen schwer zu tippen sind.

### Gespeicherte Befehle

**Befehle** in der Seitenleiste bewahrt häufig gebrauchte Befehle auf. **+ Befehl** legt einen an (mit dem im Terminal markierten Text, falls
vorhanden): einen Namen, den Befehl – mehrere Zeilen werden nacheinander gesendet – und ob danach Enter gedrückt wird. Ein Klick auf einen Befehl
tippt ihn ins aktive Terminal. Platzhalter in doppelten geschweiften Klammern fragen zuerst nach einem Wert: `tail -n 50 {{Logdatei}}` oder
`sudo systemctl restart {{Dienst}}`. ✎ bearbeitet oder löscht einen Befehl. Die Befehle liegen in der Verbindungsdatei, zusammen mit den gespeicherten
Verbindungen.

## Dateien (SFTP)

**📁 Dateien** öffnet den Dateibereich der Sitzung (er beginnt im Home-Verzeichnis):

- Ein Klick auf einen Ordner öffnet ihn, `..` führt nach oben; einen Pfad eintippen und `Eingabe` drücken springt dorthin; ⟳ lädt neu.
- Ein Klick auf eine Datei (oder ⬇) lädt sie herunter.
- **Hochladen…** lädt Dateien in den aktuellen Ordner hoch; Dateien können auch auf den Bereich gezogen werden.
- **Neuer Ordner**, ✎ umbenennen und × löschen (Ordner müssen leer sein).

## Gespeicherte Verbindungen

Gespeicherte Verbindungen und die Relay-Einstellungen liegen in einer Verbindungsdatei, einer **KeePass-Datenbank** (verschlüsselt, empfohlen)
oder einer **JSON-Datei** (unverschlüsselt). Verwenden Sie **Speichern** und **Öffnen…** im linken Bereich. In KeePass ist jede Verbindung ein
Eintrag in der Gruppe „Portable Web App Suite/ssh“ mit dem privaten Schlüssel und dem Fingerabdruck des Host-Schlüssels als zusätzlichen Feldern
(der Schlüssel geschützt). Ein Klick auf eine gespeicherte Verbindung verbindet; ✎ bearbeitet und × löscht sie.

Im Dateibereich öffnet ↗ (**Öffnen mit…**) eine entfernte Datei in einer anderen Anwendung der Suite; Speichern dort schreibt sie über SFTP zurück.


**Bekannte Host-Schlüssel**: Der linke Bereich listet die mit Verbindungen gespeicherten Fingerabdrücke; × vergisst einen, die nächste Verbindung
fragt dann erneut (etwa nachdem der Server neu installiert wurde).

### Ein Schlüsselpaar erzeugen

**🔑 Neues Schlüsselpaar…** erzeugt einen Schlüssel für die Anmeldung ohne Passwort: Ed25519 (empfohlen), ECDSA P-256 oder RSA 4096, mit einem
Kommentar und einer optionalen Passphrase, die den privaten Schlüssel verschlüsselt. Danach zeigt der Dialog den öffentlichen Schlüssel und seinen
Fingerabdruck: Tragen Sie ihn auf dem Server in `~/.ssh/authorized_keys` ein (oder speichern Sie ihn als `.pub`), speichern Sie den privaten Schlüssel
(`id_ed25519`, OpenSSH-Format, verwendbar mit OpenSSH und PuTTYgen), und **In neuer Verbindung verwenden** übernimmt ihn in den Verbindungsdialog.
Portweiterleitung ist im Browser nicht möglich (eine Seite kann nicht auf lokalen Ports lauschen).

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

☰ öffnet die gespeicherten Verbindungen. Der Dateibereich teilt sich den Bildschirm mit dem Terminal (darunter). Nutzen Sie die Tastenleiste für Tasten, die der
Bildschirmtastatur fehlen.
