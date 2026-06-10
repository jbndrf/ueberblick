# Formulare

Mit Formularen erfassen Ihre Teilnehmer strukturierte Daten direkt vor Ort -- zum Beispiel den Zustand eines Raums bei der Reinigung, eine Gefaehrdungsbeurteilung bei der Sicherheitsbegehung oder den Fortschritt auf einer Baustelle. Formulare gehoeren immer zu einem [Tool](tools.md) vom Typ "Formular" und werden im Workflow-Builder zusammengestellt.

## Aufbau eines Formulars

Ein Formular kann mehrere **Seiten** haben. Das ist nuetzlich, wenn Sie viele Felder brauchen, aber die Eingabe uebersichtlich halten wollen -- etwa eine erste Seite fuer die Grunddaten und eine zweite fuer Details oder Bewertungen. Innerhalb einer Seite lassen sich Felder links, rechts oder ueber die volle Breite anordnen. Auf dem Desktop werden links/rechts-Felder nebeneinander dargestellt. Auf Mobilgeraeten erscheinen sie automatisch untereinander, damit alles gut lesbar bleibt.

## Ein Feld, mehrere Formulare (Feld-Bibliothek)

In Ueberblick wird ein Feld **einmal definiert** und kann anschliessend in mehreren Formularen verwendet werden. Die Definition eines Feldes -- Anzeigename, Feldtyp, Schreibmodus, Validierung, Auswahloptionen -- lebt zentral in der **Feld-Bibliothek** eines Workflows. Wenn Sie ein Feld in ein Formular ziehen, legen Sie damit nur eine **Platzierung** an: Diese steuert ausschliesslich, *wo* und *wie* das Feld im Formular erscheint (Seite, Position links/rechts/volle Breite, Reihenfolge). Inhalt und Verhalten des Feldes bleiben ueberall gleich.

Der praktische Nutzen: Dasselbe Feld -- etwa "Zustandsindex" oder "Zustaendige Firma" -- kann im Erfassungsformular und in einem spaeteren Bewertungsformular auftauchen, ohne dass Sie es doppelt pflegen muessen. Aendern Sie die Definition in der Feld-Bibliothek, wirkt das auf alle Platzierungen.

> **Hinweis: protokoll-lokale Felder.** Ein Formular, das zu einem [Protokoll-Tool](tools.md) gehoert, kann zusaetzlich **protokoll-lokale Felder** enthalten. Diese definieren Sie direkt im jeweiligen Protokoll-Formular -- sie sind also keine Felder aus der Feld-Bibliothek. Ihre Eingaben werden ausschliesslich im Protokoll-Schnappschuss gespeichert und tauchen nicht in der gemeinsamen Feld-Bibliothek bzw. in den Feldwerten des Eintrags auf. Das eignet sich fuer Angaben, die nur den einzelnen Protokolleintrag betreffen und nicht workflow-weit wiederverwendet oder gefiltert werden sollen.

## Welche Feldtypen gibt es?

Ueberblick stellt Ihnen verschiedene Feldtypen zur Verfuegung, die Sie frei kombinieren koennen:

**Textfelder** -- einzeilig fuer kurze Angaben (z.B. ein Ansprechpartner-Name) oder mehrzeilig fuer laengere Beschreibungen (z.B. Maengelbeschreibung bei einer Begehung).

**Zahl** -- fuer numerische Werte. Sie koennen einen Minimal- und Maximalwert festlegen. So laesst sich beispielsweise ein Zustandsindex von 1 bis 5 nach DIN 31051 abbilden oder die gemessene Breite eines Fluchtweg-Abschnitts erfassen.

**E-Mail** -- prueft automatisch, ob eine gueltige E-Mail-Adresse eingegeben wurde.

**Datum** -- oeffnet einen Datumspicker. Praktisch zum Beispiel fuer das Datum der naechsten Pruefung bei einer Brandschutzeinrichtung.

**Datei-Upload** -- Teilnehmer koennen Fotos oder Dokumente anhaengen. Sie koennen erlaubte Dateitypen und eine maximale Groesse vorgeben.

**Auswahlliste (Dropdown)** -- der Teilnehmer waehlt genau eine Option aus einer von Ihnen definierten Liste. Zum Beispiel die Bauphase (Rohbau, TGA, Ausbau) oder den Typ einer Brandschutzeinrichtung (Feuerloescher, Brandschutztuer, Rauchmelder).

**Mehrfachauswahl** -- wie die Auswahlliste, aber der Teilnehmer kann mehrere Optionen ankreuzen. Gut geeignet fuer Checklisten, etwa bei einer Befallsueberwachung im Forst: Bohrmehl vorhanden? Einbohrlocher sichtbar? Harzfluss? Jeder Indikator wird einzeln abgehakt.

**Abhaengige Auswahl (Smart Dropdown)** -- die verfuegbaren Optionen passen sich automatisch an ein anderes Feld an. Ein typisches Beispiel: Bei einer Sicherheitsbegehung waehlt der Teilnehmer zuerst den Gefaehrdungsfaktor (Mechanisch, Elektrisch, Gefahrstoffe). Daraufhin zeigt das naechste Feld nur die passenden Detailtypen an -- bei "Mechanisch" etwa Sturzgefahr und Absturzgefahr, bei "Elektrisch" etwa Kurzschluss und Lichtbogen. Sie definieren diese Zuordnungen bequem im Formular-Editor, ohne technische Konfiguration.

**Datenauswahl** -- greift auf bereits vorhandene Projektdaten zu. Der Teilnehmer waehlt dann einen Eintrag aus einer Ihrer Datentabellen, aus den Marker-Kategorien, aus der Teilnehmerliste oder aus den Rollen des Projekts. So koennen Sie zum Beispiel auf einer Baustelle eine Tabelle mit beteiligten Firmen pflegen und im Formular die zustaendige Firma direkt auswaehlen lassen -- inklusive Ansprechpartner und Telefonnummer.

**Verknuepfung zu Eintraegen (instance_reference)** -- soll spaeter erlauben, ein Feld mit Eintraegen *eines anderen Workflows* zu verknuepfen (z.B. einen Mangel mit dem zugehoerigen Pruefvorgang). Die Datenstruktur dafuer ist bereits vorbereitet, die Funktion steht aber **noch nicht vollstaendig zur Verfuegung** und kann derzeit noch nicht produktiv genutzt werden.

## Felder konfigurieren

Jedes Feld hat einen **Anzeigenamen**, der dem Teilnehmer gezeigt wird. Optional koennen Sie einen **Platzhaltertext** hinterlegen (z.B. "Bitte Raumnummer eingeben") und einen **Hilfetext**, der unter dem Feld erscheint und zusaetzliche Hinweise gibt.

Felder lassen sich als **Pflichtfeld** markieren -- der Teilnehmer muss sie dann ausfuellen, bevor er das Formular absenden kann.

Je nach Feldtyp stehen zusaetzliche Validierungsregeln zur Verfuegung -- etwa Minimal- und Maximalwerte bei Zahlen oder erlaubte Dateitypen bei Uploads. Wenn eine Eingabe ungueltig ist, sieht der Teilnehmer direkt am Feld eine Fehlermeldung und kann den Wert korrigieren, bevor er das Formular absendet.

## Schreibmodus: Wie ein Feld seine Werte speichert

Jedes Feld hat einen **Schreibmodus**, der festlegt, wie mit eingegebenen Werten ueber die Zeit umgegangen wird. Den Schreibmodus stellen Sie in der Feld-Definition ein -- er gilt damit fuer alle Formulare, in denen das Feld verwendet wird.

**Einzelwert** -- das Feld haelt genau einen aktuellen Wert. Wird das Feld spaeter erneut ausgefuellt, ueberschreibt die neue Eingabe die vorherige. Das ist der Standardfall und passt fuer Angaben, bei denen nur der zuletzt gueltige Stand zaehlt -- etwa die aktuell zustaendige Firma oder der derzeitige Zustandsindex.

**Beobachtung (Verlauf)** -- jede Eingabe wird zusaetzlich gespeichert, statt die vorige zu ersetzen. So entsteht ein lueckenloser Verlauf. Das eignet sich fuer wiederkehrende Messungen oder Kontrollen am selben Eintrag, bei denen Sie nachvollziehen wollen, wie sich ein Wert entwickelt hat -- zum Beispiel die wiederholte Erfassung eines Befallsgrads bei der Baumkontrolle. An Stellen, an denen "der aktuelle Wert" gebraucht wird, gilt jeweils die zuletzt erfasste Eingabe.

**Berechnet** -- das Feld wird vom Server aus anderen Feldern abgeleitet und ist fuer den Teilnehmer schreibgeschuetzt. Er sieht das Ergebnis, kann es aber nicht direkt aendern. Typisch sind Summen oder abgeleitete Bewertungen, die sich automatisch aktualisieren, wenn sich die zugrundeliegenden Felder aendern.

## Bedingte Sichtbarkeit

Einzelne Felder eines Formulars lassen sich abhaengig vom Wert eines anderen Feldes **ein- oder ausblenden**. Die Auswertung geschieht live, waehrend der Teilnehmer das Formular ausfuellt: Trifft die Bedingung zu, erscheint das Feld; trifft sie nicht (mehr) zu, verschwindet es. Ausgeblendete Felder werden weder angezeigt noch beim Absenden gespeichert -- auch eine Pflichtfeld-Markierung greift dann nicht.

Eine Bedingung vergleicht ein anderes Feld mit einem Wert. Verfuegbare Vergleiche sind *gleich*, *ungleich*, *enthaelt*, *enthaelt nicht* sowie *ist leer* / *ist nicht leer*; mehrere Bedingungen lassen sich mit *und* / *oder* verschachteln. So koennen Sie z.B. ein Textfeld "Begruendung" nur dann einblenden, wenn eine Auswahlliste den Wert "Sonstiges" enthaelt.

Konfiguriert wird die Bedingung pro **Platzierung** eines Feldes (sie gilt also fuer dieses eine Formular, nicht workflow-weit). Derzeit geschieht das ueber die **JSON-Ansicht** des Formular-Editors: Dort sehen Sie die Feld-IDs des Formulars und hinterlegen je Feld eine kleine `show_if`-Regel, zum Beispiel:

```json
{
  "conditional_logic": {
    "show_if": { "op": "includes", "field": "<Feld-ID von oben>", "value": "stake_missing" }
  }
}
```

Im Unterschied zur [Abhaengigen Auswahl (Smart Dropdown)](#welche-feldtypen-gibt-es), die die *Optionen* eines Feldes an ein anderes Feld koppelt, steuert die bedingte Sichtbarkeit, ob ein Feld ueberhaupt **erscheint**. Nicht zu verwechseln mit den [Bedingungen an einer Verbindung](workflows.md#bedingte-verfuegbarkeit-von-verbindungen-waechter), die steuern, ob ein **Uebergangs-Button** verfuegbar ist.

---

**Siehe auch:**
- [Tools](tools.md) -- Anhaengepunkte und Tool-Typen
- [Workflows](workflows.md) -- Wo Formulare im Lebenszyklus stehen
- [Custom Tables](custom-tables.md) -- Datenquelle fuer Custom Table Selector
- Tutorial: [Formulare & Tools](../tutorials/03-formulare-und-tools.md)
