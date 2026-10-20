# Portable Web App Suite – licence notice

## English

Copyright © 2026 Adrian Fuchs

Licensed under the EUPL-1.2 (European Union Public Licence, version 1.2). The licence text is in
[`LICENSE`](LICENSE) (English) and [`LICENSE-de.txt`](LICENSE-de.txt) (German); all language versions of the EUPL are
equally valid. The source code is available at https://software.adrianfuchs.at/local-tools/portable-web-app-suite/.

### No warranty

The Work is provided "as is", without any warranty, and the Licensor's liability is limited as far as the
applicable law permits (Articles 7 and 8 of the EUPL). In particular, the Licensor does not promise that any
function is correct, complete or secure. Check results that matter before you rely on them, and keep backups of
your files.

### Modified versions must say so – visibly

Article 5 of the EUPL requires that a derivative work carries a prominent notice ("deutlich darauf hinweisen")
stating that the Work has been modified, and the date of the modification. The Licensor's intention, and the way
this obligation is to be fulfilled for this Work, is that the notice is **obvious to the people who use the
software**, not only to those who read its source code:

- every application of a modified version states "Modified version", the name of the modifier and the date of the
  modification in its about dialog, and marks its window title as modified;
- the build supports this: put a file named `MODIFIED` in the root of the repository whose first line names the
  modifier, the date and, briefly, the change (e.g. `Modified by Example Ltd, 2027-03-01: own mail server
  presets`). `build.py` then shows this line in the title and in the about dialog of every application.

The EUPL does not grant permission to use the names of the Licensor except to describe the origin of the Work
(Article 5). A modified version must therefore not be presented as the original "Portable Web App Suite" by
Adrian Fuchs.

### Security of modified versions (statement of intent)

The suite stores credentials and private data. The Licensor objects to any modification that weakens the security
of the software or deceives its users – for example sending credentials, keys or documents to anyone without the
user's clear knowledge, or storing data unencrypted where the software says that it is encrypted. Such
modifications are not endorsed by the Licensor and may be unlawful (fraud, computer crime and data protection law).
This statement does not add conditions to the EUPL; it explains the Licensor's intention.

### Third-party components

The applications contain third-party libraries and data under their own licences (MIT, BSD, Apache-2.0,
MPL-2.0, LGPL, GPL and others), among them the German Hunspell dictionary igerman98 (GPL-2.0 or GPL-3.0) and
pykeepass (GPL-3.0). These components remain under their licences; the EUPL lists the GPL, LGPL and MPL as
compatible licences. The about dialog of every application lists the components it contains with their licence
texts; [`vendor/README.md`](vendor/README.md) describes all vendored components.

## Deutsch

Copyright © 2026 Adrian Fuchs

Lizenziert unter der EUPL-1.2 (Open-Source-Lizenz für die Europäische Union, Version 1.2). Der Lizenztext steht in
[`LICENSE-de.txt`](LICENSE-de.txt) (Deutsch) und [`LICENSE`](LICENSE) (Englisch); alle Sprachfassungen der EUPL sind
gleichermaßen verbindlich. Der Quellcode ist unter https://software.adrianfuchs.at/local-tools/portable-web-app-suite/
verfügbar.

### Keine Gewährleistung

Das Werk wird „wie es ist“ ohne jede Gewährleistung zur Verfügung gestellt, und die Haftung des Lizenzgebers ist
beschränkt, soweit das anwendbare Recht es zulässt (Artikel 7 und 8 der EUPL). Insbesondere verspricht der
Lizenzgeber nicht, dass eine Funktion richtig, vollständig oder sicher ist. Prüfen Sie wichtige Ergebnisse, bevor Sie
sich darauf verlassen, und bewahren Sie Sicherungen Ihrer Dateien auf.

### Geänderte Fassungen müssen das zeigen – sichtbar

Artikel 5 der EUPL verlangt, dass auf jedem abgeleiteten Werk deutlich darauf hingewiesen wird, dass das Werk
geändert wurde, und das Datum der Bearbeitung angegeben wird. Die Absicht des Lizenzgebers – und die Art, wie diese
Pflicht für dieses Werk zu erfüllen ist – ist, dass der Hinweis **für die Menschen, die die Software benutzen,
offensichtlich** ist, nicht nur für jene, die den Quellcode lesen:

- jede Anwendung einer geänderten Fassung nennt im Info-Dialog „Geänderte Fassung“, den Namen des Bearbeiters und das
  Datum der Änderung und kennzeichnet ihren Fenstertitel als geändert;
- der Build unterstützt das: Legen Sie im Wurzelverzeichnis des Repositorys eine Datei `MODIFIED` an, deren erste Zeile
  den Bearbeiter, das Datum und kurz die Änderung nennt (z. B. `Geändert von Beispiel GmbH, 2027-03-01: eigene
  Mailserver-Vorgaben`). `build.py` zeigt diese Zeile dann im Titel und im Info-Dialog jeder Anwendung.

Die EUPL gewährt kein Recht, die Namen des Lizenzgebers zu verwenden, außer um die Herkunft des Werks zu beschreiben
(Artikel 5). Eine geänderte Fassung darf daher nicht als die ursprüngliche „Portable Web App Suite“ von Adrian Fuchs
ausgegeben werden.

### Sicherheit geänderter Fassungen (Absichtserklärung)

Die Suite speichert Zugangsdaten und private Daten. Der Lizenzgeber widerspricht jeder Änderung, die die Sicherheit
der Software schwächt oder ihre Benutzer täuscht – etwa das Senden von Zugangsdaten, Schlüsseln oder Dokumenten an
Dritte ohne klares Wissen des Benutzers oder das unverschlüsselte Speichern von Daten, wo die Software angibt, sie zu
verschlüsseln. Solche Änderungen werden vom Lizenzgeber nicht gebilligt und können rechtswidrig sein (Betrug,
Computerkriminalität, Datenschutzrecht). Diese Erklärung fügt der EUPL keine Bedingungen hinzu; sie erläutert die
Absicht des Lizenzgebers.

### Komponenten Dritter

Die Anwendungen enthalten Bibliotheken und Daten Dritter unter deren eigenen Lizenzen (MIT, BSD, Apache-2.0, MPL-2.0,
LGPL, GPL und andere), darunter das deutsche Hunspell-Wörterbuch igerman98 (GPL-2.0 oder GPL-3.0) und pykeepass
(GPL-3.0). Diese Komponenten bleiben unter ihren Lizenzen; die EUPL nennt GPL, LGPL und MPL als kompatible Lizenzen.
Der Info-Dialog jeder Anwendung listet die enthaltenen Komponenten mit ihren Lizenztexten;
[`vendor/README.md`](vendor/README.md) beschreibt alle eingebundenen Komponenten.
