# Datenbankwerkzeug

Das Datenbankwerkzeug (`dbtool.html`) öffnet **SQLite**-Datenbankdateien und verbindet sich mit **PostgreSQL**-Servern: Schema durchsuchen,
SQL schreiben und ausführen, Tabellendaten ansehen und bearbeiten, Ergebnisse exportieren.

## SQLite-Datenbanken

- **Neue SQLite** legt eine leere Datenbank an, **SQLite öffnen…** (`Strg+O`) öffnet eine Datenbankdatei (`.sqlite`, `.db`, …); die Datei kann
  auch auf das Fenster gezogen werden. Mehrere Datenbanken können gleichzeitig geöffnet sein (Liste **Offene Datenbanken** links).
- Die Datenbank wird im Speicher bearbeitet. **Datenbank speichern** (`Strg+S`) schreibt sie zurück: in Chrome/Edge am Desktop direkt in die
  Datei, in Firefox und unter Android als Download (ersetzen Sie die ursprüngliche Datei damit). Geänderte Datenbanken sind mit • markiert.

SQLite funktioniert vollständig offline.

## PostgreSQL-Server

Ein Postgres-Server wird über das **lokale Relay** erreicht (siehe Benutzerhandbuch, „Netzwerkfunktionen und das Relay“).

1. **Mit Postgres verbinden…** öffnet den Verbindungsdialog: Name, Host, Port (5432), Datenbank, Benutzer, Passwort, SSL (bevorzugen,
   erforderlich, aus; optional selbst signierte Zertifikate akzeptieren) sowie Adresse und Token des Relays. **Testen** prüft das Relay.
2. **Verbinden** öffnet die Verbindung; **Verbindung speichern** fügt sie den **Gespeicherten Verbindungen** hinzu (das Passwort nur, wenn das
   Kästchen angehakt ist).
3. Ein Klick auf eine gespeicherte Verbindung verbindet (oder fragt nach dem Passwort, wenn es nicht gespeichert wurde); ✎ bearbeitet und
   × löscht eine Verbindung.

Unterstützt werden Passwort-, MD5- und SCRAM-SHA-256-Anmeldung.

### Verbindungen speichern

Gespeicherte Verbindungen und die Relay-Einstellungen liegen in einer **Verbindungsdatei**. **Speichern** im Bereich „Verbindungen“ fragt nach
dem Format:

- **KeePass-Datenbank** (mit Passwort verschlüsselt; empfohlen) – jede Verbindung wird ein KeePass-Eintrag in der Gruppe
  „Portable Web App Suite/dbtool“ und ist auch in KeePass sichtbar;
- **JSON-Datei** (unverschlüsselt; Passwörter wären lesbar).

**Öffnen…** öffnet eine solche Datei wieder (KeePass fragt nach dem Passwort). Dieselbe Datei kann die Verbindungen der anderen Anwendungen
der Suite enthalten.

## Schema und SQL

- **Schema** listet die Tabellen (▦) und Sichten (👁) der aktiven Datenbank; aufgeklappt zeigt eine Tabelle ihre Spalten (🔑 = Primärschlüssel,
  Typen, NOT NULL). ⟳ lädt das Schema neu; nach `CREATE`, `ALTER` und `DROP` geschieht das automatisch.
- Der SQL-Editor hebt SQL hervor und ergänzt Schlüsselwörter, Tabellen- und Spaltennamen (`Strg+Leertaste`).
- **Ausführen** (`Strg+Eingabe`) führt den markierten Text oder die Anweisung an der Schreibmarke aus; **Alles ausführen**
  (`Strg+Umschalt+Eingabe`) führt alle Anweisungen aus.
- Jede Anweisung mit Ergebnis erhält einen Ergebnis-Reiter. Die Meldungszeile zeigt die Zahl der geänderten Zeilen, die Dauer oder den Fehler
  (bei Postgres mit SQL-State-Code, Detail und Hinweis).
- **CSV** und **JSON** exportieren das angezeigte Ergebnis.
- **⛁ ER-Diagramm** (über dem Schema) zeichnet die Tabellen und Sichten mit ihren Spalten (🔑 Primärschlüssel, → Fremdschlüssel) und
  die Fremdschlüssel-Beziehungen und öffnet die Zeichnung im Diagrammeditor (referenzierte Tabellen über den referenzierenden), wo sie
  angeordnet, bearbeitet, gedruckt oder exportiert werden kann.
- **Erklären** zeigt, wie die Datenbank die aktuelle Anweisung ausführt: bei SQLite den Abfrageplan als Baum (`SCAN` = liest die
  ganze Tabelle, `SEARCH … USING INDEX` = nutzt einen Index), bei Postgres den Text von `EXPLAIN`.
- **Verlauf** in der Seitenleiste listet die zuletzt ausgeführten Anweisungen (fehlgeschlagene sind unterstrichen). Ein Klick holt
  eine Anweisung zurück in den Editor, ein Doppelklick führt sie erneut aus. Der Verlauf liegt nur in diesem Browser; × löscht ihn.

## Tabellen ansehen und bearbeiten

**Anzeigen** neben einer Tabelle zeigt ihre Zeilen (200 pro Seite, ‹ und › blättern).

- Doppelklick auf eine Zelle bearbeitet sie; `Eingabe` speichert, `Esc` bricht ab, `Strg+Entf` setzt den Wert auf NULL.
- **Zeile hinzufügen** öffnet ein Formular mit einem Feld pro Spalte (leere Felder verwenden den Standardwert der Spalte).
- × löscht eine Zeile (nach einer Bestätigung).

Zum Bearbeiten braucht eine Tabelle einen Primärschlüssel (SQLite-Tabellen ohne Primärschlüssel werden über ihre `rowid` bearbeitet). Jede
Änderung wird sofort als `UPDATE`, `INSERT` oder `DELETE` ausgeführt; die Anweisung erscheint in der Meldungszeile.

Rückgängig (↶, `Strg+Z` außerhalb des SQL-Editors) und Wiederholen (↷, `Strg+Y`): bei SQLite-Datenbanken für jede Änderung, auch durch ausgeführte SQL-Anweisungen (bis zu 20 Schritte, für Datenbanken bis 32 MiB); bei PostgreSQL-Servern für die Änderungen in der Ergebnistabelle (geänderte Zellen, gelöschte Zeilen). Die Tabelle wird danach neu geladen.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | SQLite-Datei öffnen |
| `Strg+S` | SQLite-Datei speichern |
| `Strg+Umschalt+S` | Speichern unter |

### SQL

| Tasten | Funktion |
|---|---|
| `Strg+Eingabe` | Anweisung am Cursor (oder die Auswahl) ausführen |
| `Strg+Umschalt+Eingabe` | Alle Anweisungen ausführen |

### Tabelle

| Tasten | Funktion |
|---|---|
| `Eingabe` | Bearbeitete Zelle übernehmen |
| `Esc` | Bearbeitung abbrechen |
| `Strg+Entf` | Zelle auf NULL setzen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

☰ öffnet die Liste der Datenbanken, das Schema und die gespeicherten Verbindungen. Ergebnisse lassen sich seitlich verschieben.
