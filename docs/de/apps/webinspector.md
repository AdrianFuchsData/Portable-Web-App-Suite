# Web-Inspektor

Der Web-Inspektor (`webinspector.html`) ist der „Browser im Browser“ der Suite in der reduzierten Form von Entscheidung
D-004: Er lädt Webseiten und zeigt, woraus sie bestehen, öffnet HAR-Dateien und bietet ein Entwicklerwerkzeug-Bookmarklet
für Geräte, auf denen die Entwicklerwerkzeuge des Browsers fehlen oder gesperrt sind.

Zum Laden von Seiten braucht es für die meisten Websites das [Relay](../benutzerhandbuch.md#netzwerkfunktionen-und-das-relay)
(Browser lassen Seiten nur andere Websites lesen, die das per CORS erlauben). HAR-Dateien, HTML-Dateien, eingefügte
Quelltexte und das Bookmarklet funktionieren ohne.

## Seite

Geben Sie eine Adresse ein und drücken Sie **Laden** (`https://` wird bei Bedarf ergänzt). Wählen Sie den **User-Agent**
(Standard des Relays, Desktop- oder Mobilbrowser) und ob Weiterleitungen gefolgt wird. **HTML-Datei öffnen** und
**Quelltext einfügen** untersuchen eine Seite, ohne sie zu laden (optional mit ihrer Adresse, damit relative Links
funktionieren).

- **Vorschau** zeigt die Seite **ohne Skripte**, Frames und Plug-ins; Formulare senden nicht. Über das Relay werden
  Stylesheets, Bilder, Hintergrundbilder und Schriften geladen und eingebettet (bis zu 80 Ressourcen). Ein Klick auf einen
  Link lädt diese Seite; **←** führt zur vorherigen zurück. Die **Vorschaugröße** zeigt die Seite statt in voller Breite wie auf
  einem Smartphone (390 × 844), einem Tablet (820 × 1180) oder einem Desktop (1366 × 768); ⟳ dreht das Gerät. Die
  CSS-Media-Queries der Seite reagieren auf die Größe.
- **Header & Sicherheit** listet die Antwort-Header und prüft HTTPS/HSTS, Content Security Policy (auch Abschwächungen durch
  `'unsafe-inline'`/`'unsafe-eval'`), Schutz vor Einbetten, `nosniff`, Referrer- und Permissions-Policy, die
  Cross-Origin-Richtlinien, Cookie-Flags (`Secure`, `HttpOnly`, `SameSite`) und preisgegebene Versionen. ✅ in Ordnung,
  ⚠️ verbesserungswürdig, ❌ fehlender Schutz, ℹ️ Information.
- **Quelltext** zeigt das HTML mit Zeilennummern und Hervorhebung; das Suchfeld filtert Zeilen; **Quelltext speichern** lädt
  die Datei herunter.
- **Struktur** zeigt Titel, Sprache, Zeichensatz, Meta-Tags, die Überschriftengliederung, Links (intern/extern), Bilder,
  Skripte, Stylesheets, Formulare und Frames sowie Hinweise: fehlendes `lang`, fehlender Titel oder Viewport, Bilder ohne
  Alternativtext, mehrere oder keine h1, übersprungene Überschriftenebenen, Formularfelder ohne Beschriftung, Links ohne
  Text, gemischte Inhalte.
- **Anfragen** listet alle Anfragen für die Seite und ihre Vorschau. **Als HAR speichern** speichert sie als HAR-Datei, **Im
  HAR-Betrachter zeigen** öffnet sie im Reiter HAR. **Anfragen blockieren** nimmt eine Regel je Zeile: einen Host
  (`ads.example.com`, blockiert auch seine Subdomains) oder ein Adressmuster mit `*` (`*.woff2`, `*/tracking/*`); Zeilen mit `#`
  am Anfang sind Kommentare. Die Regeln gelten für die Ressourcen der Vorschau (nicht für die Seite selbst); **Übernehmen und neu
  laden** lädt sie erneut, ⊘ neben einer Anfrage blockiert deren Host. Blockierte Anfragen werden durchgestrichen. Die Regeln
  bleiben in diesem Browser gespeichert.
- **Cookies** listet die Cookies, die die Seite und ihre Ressourcen setzen (Name, Wert, Domain, Pfad, Ablauf,
  `Secure`/`HttpOnly`/`SameSite`, welche Anfrage sie gesetzt hat); Cookies für andere Websites werden wie im Browser abgelehnt.
  Mit **Cookies behalten** werden sie gespeichert und bei späteren Anfragen mitgeschickt, die zu Domain, Pfad und `Secure`
  passen – so lassen sich Seiten hinter einer Anmeldung untersuchen oder ein Sitzungscookie durch eine Website verfolgen.
  Gespeicherte Cookies lassen sich einzeln oder alle löschen; sie bleiben nur bis zum Schließen der Seite erhalten. Cookies sind
  nur über das Relay sichtbar (Browser verbergen `Set-Cookie` vor Seiten). localStorage und ähnliche Speicher werden von
  Skripten befüllt, die die Vorschau nicht ausführt; das Bookmarklet zeigt sie in der echten Seite.

## HAR-Betrachter

Eine HAR-Datei ist das Netzwerkprotokoll eines Browsers (in den Entwicklerwerkzeugen: Netzwerk → „Alle als HAR
speichern“). **HAR-Datei öffnen** (oder Ziehen auf das Fenster) zeigt alle Anfragen mit Methode, Datei und Host, Status
(Fehler rot), Typ, Größe, Zeit und einem Wasserfall; die Summen zeigen Anzahl, übertragene Bytes und Dauer. Filtern nach Text
oder Typ (Dokument, XHR/JSON, JS, CSS, Bilder, Schriften, Medien, Sonstiges); ein Klick auf eine Spaltenüberschrift sortiert.

Ein Klick auf eine Anfrage zeigt Details: **Header** (allgemein, Antwort- und Anfrage-Header), **Parameter** (Parameter und
Anfrageinhalt), **Inhalt** (die Antwort; JSON formatiert, Bilder angezeigt), **Cookies** und **Zeiten** (blockiert, DNS,
Verbindung, TLS, Senden, Warten, Empfangen). **Als cURL kopieren** kopiert die Anfrage als curl-Befehl.

## Bookmarklet

Das Bookmarklet öffnet am unteren Rand jeder Seite einen kleinen Entwicklerbereich:

- **Console**: `console.*`-Ausgaben und Fehler seit dem Öffnen sowie eine Eingabezeile, die JavaScript in der Seite ausführt.
- **Elements**: **Pick element**, dann ein Element der Seite anklicken: CSS-Pfad, Größe und Position, Attribute, berechnete
  Stile und HTML; **Parent** geht eine Ebene höher.
- **Network**: die von der Seite geladenen Ressourcen (aus der Resource Timing API) mit Größe und Zeit.
- **Storage**: Cookies, localStorage und sessionStorage.
- **Info**: Adresse, Titel, User-Agent, Viewport, Sprache und Meta-Tags.

Installieren Sie es, indem Sie den Link **🔍 Inspector** in die Lesezeichenleiste ziehen. Auf Smartphones: **Code kopieren**,
ein Lesezeichen einer beliebigen Seite anlegen, bearbeiten und die Adresse durch den kopierten Code ersetzen; dann die zu
untersuchende Seite öffnen und das Lesezeichen wählen (in Chrome für Android den Namen des Lesezeichens in die Adresszeile
tippen und den Vorschlag antippen). Erneutes Wählen blendet den Bereich aus. **Auf dieser Seite ausprobieren** öffnet ihn im
Inspektor selbst.

Auf Seiten, deren Content Security Policy `eval()` verbietet, erscheint der Bereich trotzdem, aber die Konsoleneingabe kann
dort keinen Code ausführen.

## Grenzen

Die Vorschau ist kein vollständiger Browser: keine Skripte (Seiten, die per JavaScript aufgebaut werden, bleiben leer oder
unvollständig), keine Anmeldungen (außer mit behaltenen Cookies), keine Formulare. Seiten hinter einer Anmeldung lassen sich
untersuchen, indem man sie im Browser speichert und die HTML-Datei öffnet oder eine HAR-Datei aufzeichnet.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |
