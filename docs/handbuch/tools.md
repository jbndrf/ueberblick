# Tools

Tools sind die Funktionsbausteine, mit denen Sie einem [Workflow](workflows_reviewed.md) Leben einhauchen. Ohne Tools waere ein Workflow nur eine Reihe leerer Stufen -- erst durch Tools koennen Teilnehmer Daten erfassen, Werte aendern oder automatische Aktionen ausloesen.


## Wo Tools angehaengt werden

Sie koennen Tools an drei verschiedenen Stellen platzieren:

**An einer Verbindung:** Das Tool wird ausgefuehrt, wenn ein Teilnehmer den Uebergangs-Button drueckt. Die Sichtbarkeit und das Aussehen des Buttons ergeben sich aus der Verbindung selbst. So koennen Sie z.B. bei einer Sicherheitsbegehung ein Bewertungsformular anzeigen lassen, sobald jemand auf "Mangel bewerten" klickt. Wenn mehrere Tools an derselben Verbindung haengen, werden sie nacheinander abgearbeitet. Erst wenn alle abgeschlossen sind, wandert der Eintrag in die naechste Stufe.

**An einer Stufe:** Das Tool bekommt einen eigenen Button, der in dieser Stufe sichtbar ist. Sie legen selbst fest, welche Rollen den Button sehen und wie er beschriftet ist. Das eignet sich z.B. dafuer, dass eine Reinigungskraft den Standort eines Markers korrigieren kann, solange der Eintrag noch in der Stufe "Offen" steht.

**Global:** Das Tool erscheint in jeder Stufe des Workflows als eigener Button. Das ist vor allem fuer [Automatisierungen](automatisierungen_reviewed.md) gedacht, die unabhaengig von der aktuellen Stufe laufen sollen -- etwa ein woechentliches Altern von Sichtungsmeldungen in der Forstbefallsueberwachung.


## Die Tool-Typen

### Formular

Ein Formular-Tool zeigt dem Teilnehmer ein [Formular](formulare_reviewed.md) an und speichert die eingegebenen Daten. Sie koennen es an Verbindungen oder Stufen anhaengen.

Typische Einsaetze: Beim Erstellen eines Eintrags die Grunddaten erfassen. Bei einem Stufenwechsel zusaetzliche Informationen abfragen, etwa eine Begruendung bei der Bewertung eines Mangels. Oder in einer bestimmten Stufe ein Nacherfassungsformular bereitstellen.

### Bearbeitung

Ein Bearbeitungs-Tool erlaubt es, bereits erfasste Daten nachtraeglich zu aendern. Es gibt zwei Varianten:

- **Felder bearbeiten:** Der Teilnehmer kann bestimmte Formularfelder ueberarbeiten. Stellen Sie sich vor, bei einer Gebaeudezustandserfassung soll die Zustandsklasse nach einer Nachpruefung korrigiert werden koennen. Dabei werden nur Felder angezeigt, die der Eintrag bereits durchlaufen hat -- Felder aus spaeteren Stufen sind nicht verfuegbar. Sie waehlen den Modus (Felder oder Standort), legen fest welche Felder bearbeitbar sind, bestimmen Button-Text und -Farbe und koennen einschraenken, fuer welche Rollen der Button sichtbar ist.
- **Standort aendern:** Bei kartenbasierten Workflows kann der Marker auf der Karte verschoben werden. Das ist hilfreich, wenn ein Standort bei der Ersterfassung nur grob gesetzt wurde.

Ein gaengiges Muster: Eine Verbindung von einer Stufe zu sich selbst anlegen (Self-Loop) und daran ein Bearbeitungs-Tool haengen. So koennen Teilnehmer Werte aktualisieren, ohne den Eintrag in eine andere Stufe weiterzuschieben -- etwa um bei einer Bauminventur den Kronenzustand zu aktualisieren, solange der Baum im Status "Unter Beobachtung" bleibt.

Bearbeitungs-Tools koennen an Verbindungen, Stufen oder global angehaengt werden.

### Automatisierung

Automatisierungs-Tools fuehren regelbasierte Aktionen im Hintergrund aus, ohne dass ein Teilnehmer etwas tun muss. Sie werden global angehaengt und im Detail unter [Automatisierungen](automatisierungen_reviewed.md) beschrieben.

### Feld-Tags

Mit Feld-Tags koennen Sie einzelnen Formularfeldern eine besondere Bedeutung zuweisen. So laesst sich z.B. ein Feld als "Filterwert" markieren, damit Teilnehmer auf der Karte nach diesem Wert filtern koennen.


## Zusammenspiel von Tools und Rollen

Bei Verbindungs-Tools ergibt sich die Zugriffsbeschraenkung automatisch aus der Verbindung: Nur wer die Verbindung nutzen darf, fuehrt auch das angehaengte Tool aus.

Bei Stufen- und Global-Tools legen Sie separat fest, welche Rollen den Button sehen und nutzen duerfen. So koennen Sie z.B. bei einer Baustellen-Doppelbewertung dafuer sorgen, dass der OUe-Pruefer und der Pruefingenieur jeweils nur ihre eigenen Bearbeitungs-Buttons sehen.

---

**Siehe auch:**
- [Formulare](formulare_reviewed.md) -- Feldtypen fuer Formular-Tools
- [Workflows](workflows_reviewed.md) -- Stufen und Verbindungen
- [Automatisierungen](automatisierungen_reviewed.md) -- Zeitgesteuerte und regelbasierte Aktionen
- Tutorial: [Formulare & Tools](../tutorials/03-formulare-und-tools.md)
