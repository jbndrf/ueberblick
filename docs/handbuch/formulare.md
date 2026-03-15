# Formulare

Mit Formularen erfassen Ihre Teilnehmer strukturierte Daten direkt vor Ort -- zum Beispiel den Zustand eines Raums bei der Reinigung, eine Gefaehrdungsbeurteilung bei der Sicherheitsbegehung oder den Fortschritt auf einer Baustelle. Formulare gehoeren immer zu einem [Tool](tools_reviewed.md) vom Typ "Formular" und werden im Workflow-Builder zusammengestellt.

## Aufbau eines Formulars

Ein Formular kann mehrere **Seiten** haben. Das ist nuetzlich, wenn Sie viele Felder brauchen, aber die Eingabe uebersichtlich halten wollen -- etwa eine erste Seite fuer die Grunddaten und eine zweite fuer Details oder Bewertungen. Innerhalb einer Seite lassen sich Felder links, rechts oder ueber die volle Breite anordnen. Auf dem Desktop werden links/rechts-Felder nebeneinander dargestellt. Auf Mobilgeraeten erscheinen sie automatisch untereinander, damit alles gut lesbar bleibt.

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

## Felder konfigurieren

Jedes Feld hat einen **Anzeigenamen**, der dem Teilnehmer gezeigt wird. Optional koennen Sie einen **Platzhaltertext** hinterlegen (z.B. "Bitte Raumnummer eingeben") und einen **Hilfetext**, der unter dem Feld erscheint und zusaetzliche Hinweise gibt.

Felder lassen sich als **Pflichtfeld** markieren -- der Teilnehmer muss sie dann ausfuellen, bevor er das Formular absenden kann.

Je nach Feldtyp stehen zusaetzliche Validierungsregeln zur Verfuegung -- etwa Minimal- und Maximalwerte bei Zahlen oder erlaubte Dateitypen bei Uploads. Wenn eine Eingabe ungueltig ist, sieht der Teilnehmer direkt am Feld eine Fehlermeldung und kann den Wert korrigieren, bevor er das Formular absendet.

## Bedingte Sichtbarkeit (geplant)

In einer kuenftigen Version werden Felder bedingt ein- oder ausgeblendet werden koennen, abhaengig vom Wert eines anderen Feldes. Die Datenstruktur dafuer ist bereits vorbereitet. Bis dahin laesst sich ein aehnlicher Effekt mit Smart Dropdowns erreichen, die je nach vorheriger Auswahl unterschiedliche Optionen anbieten.

---

**Siehe auch:**
- [Tools](tools_reviewed.md) -- Anhaengepunkte und Tool-Typen
- [Workflows](workflows_reviewed.md) -- Wo Formulare im Lebenszyklus stehen
- [Custom Tables](custom-tables_reviewed.md) -- Datenquelle fuer Custom Table Selector
- Tutorial: [Formulare & Tools](../tutorials/03-formulare-und-tools.md)
