# Tools

Tools sind die Funktionsbausteine, mit denen Sie einem [Workflow](workflows.md) Leben einhauchen. Ohne Tools waere ein Workflow nur eine Reihe leerer Stufen -- erst durch Tools koennen Teilnehmer Daten erfassen, Werte aendern oder automatische Aktionen ausloesen.


## Das Grundprinzip: ein gemeinsamer Datenbestand, viele Sichten

Bevor Sie die einzelnen Tool-Typen kennenlernen, lohnt sich ein Blick auf das zugrundeliegende Modell -- es erklaert, warum die Tools so zusammenspielen, wie sie es tun.

Jeder Eintrag (jede Workflow-Instanz) besitzt **einen gemeinsamen Bestand an Feldwerten**. Die Felder selbst sind einmal in der [Feld-Bibliothek](formulare.md) des Workflows definiert; ihre Werte gehoeren dem **Eintrag als Ganzes** -- nicht einem bestimmten Formular und nicht einer bestimmten Stufe. Ein Feld, das in mehreren Formularen vorkommt, zeigt ueberall denselben Wert.

Die Tools sind in diesem Bild lediglich **verschiedene Wege, diese gemeinsamen Werte anzuzeigen oder zu schreiben**:

- Ein **Formular** zeigt eine Auswahl von Feldern in einer aufgeraeumten Eingabemaske und schreibt die Eingaben in den gemeinsamen Bestand.
- Ein **Bearbeitungs-Tool** macht eine festgelegte Auswahl von Feldern direkt am Eintrag nachtraeglich aenderbar.
- Ein **Protokoll-Tool** schreibt -- zusaetzlich zum gemeinsamen Bestand -- einen unveraenderlichen Log-Eintrag.

Wie sich ein einzelner Wert beim Schreiben verhaelt -- ueberschreiben, einen Verlauf anlegen oder vom Server berechnet werden -- bestimmt **nicht das Tool, sondern der [Schreibmodus](formulare.md#schreibmodus-wie-ein-feld-seine-werte-speichert) des Feldes**. Dasselbe Feld verhaelt sich deshalb in jedem Tool gleich.


## Wo Tools angehaengt werden

Sie koennen Tools an drei verschiedenen Stellen platzieren:

**An einer Verbindung:** Das Tool wird ausgefuehrt, wenn ein Teilnehmer den Uebergangs-Button drueckt. Die Sichtbarkeit und das Aussehen des Buttons ergeben sich aus der Verbindung selbst. So koennen Sie z.B. bei einer Sicherheitsbegehung ein Bewertungsformular anzeigen lassen, sobald jemand auf "Mangel bewerten" klickt. Wenn mehrere Tools an derselben Verbindung haengen, werden sie nacheinander abgearbeitet. Erst wenn alle abgeschlossen sind, wandert der Eintrag in die naechste Stufe.

**An einer Stufe:** Das Tool bekommt einen eigenen Button, der in dieser Stufe sichtbar ist. Sie legen selbst fest, welche Rollen den Button sehen und wie er beschriftet ist. Das eignet sich z.B. dafuer, dass eine Reinigungskraft den Standort eines Markers korrigieren kann, solange der Eintrag noch in der Stufe "Offen" steht.

**Global:** Das Tool erscheint in jeder Stufe des Workflows als eigener Button. Das ist vor allem fuer [Automatisierungen](automatisierungen.md) gedacht, die unabhaengig von der aktuellen Stufe laufen sollen -- etwa ein woechentliches Altern von Sichtungsmeldungen in der Forstbefallsueberwachung.


## Die Tool-Typen

### Formular

Ein Formular-Tool zeigt dem Teilnehmer eine **Eingabemaske** an: eine Auswahl von Feldern aus der [Feld-Bibliothek](formulare.md), aufgeteilt auf Seiten und Spalten, mit Pflichtfeld-Pruefung und Validierung. Beim Absenden werden die Eingaben in den gemeinsamen Feldwert-Bestand des Eintrags geschrieben. Sie koennen Formulare an Verbindungen, Stufen oder global anhaengen.

**Wie sich die Felder beim Absenden verhalten**, haengt am [Schreibmodus](formulare.md#schreibmodus-wie-ein-feld-seine-werte-speichert) des jeweiligen Feldes:

- **Einzelwert:** Das Formular zeigt den aktuellen Wert zur Orientierung an; beim Absenden ersetzt die neue Eingabe den bisherigen Wert.
- **Beobachtung:** Jedes Absenden legt einen **neuen** Eintrag im Verlauf an -- das Formular startet dafuer leer, vorige Werte bleiben erhalten. So fuellt man dasselbe Formular bei wiederkehrenden Kontrollen mehrfach aus.
- **Berechnet:** Das Feld wird nur **angezeigt** (schreibgeschuetzt); seinen Wert leitet der Server ab. Eine Eingabe ist hier nicht moeglich.

**Bedingte Felder.** Einzelne Felder eines Formulars koennen abhaengig vom Wert eines anderen Feldes ein- oder ausgeblendet werden -- live, waehrend der Teilnehmer ausfuellt. Ausgeblendete Felder werden weder angezeigt noch gespeichert. Details und Konfiguration unter [Bedingte Sichtbarkeit](formulare.md#bedingte-sichtbarkeit). (Das ist etwas anderes als die [Bedingungen an einer Verbindung](workflows.md#bedingte-verfuegbarkeit-von-verbindungen-waechter), die steuern, ob ein **Uebergangs-Button** ueberhaupt erscheint.)

**Formular an einer Verbindung vs. an einer Stufe/global.** Ein Formular an einer **Verbindung** ist Teil des Uebergangs: Der Eintrag wandert erst weiter, wenn das Formular abgeschlossen ist. Ein Formular an einer **Stufe** oder **global** ist dagegen eigenstaendig -- es speichert die Eingaben, schiebt den Eintrag aber **nicht** in eine andere Stufe.

Ein **globales Formular** haengt weder an einer Verbindung noch an einer Stufe und ist deshalb in **jeder** Stufe des Workflows verfuegbar. Es erscheint -- wie jedes andere Stufen-Formular -- als gewoehnlicher Button (keine Sonderbehandlung). Den Zugriff steuern Sie ueber die eigenen zugelassenen Rollen des Formulars (`allowed_roles`): bleibt die Liste leer, sehen alle Rollen den Button; ist sie gesetzt, nur die passenden.

Typische Einsaetze: Beim Erstellen eines Eintrags die Grunddaten erfassen. Bei einem Stufenwechsel zusaetzliche Informationen abfragen, etwa eine Begruendung bei der Bewertung eines Mangels. Oder in einer bestimmten Stufe ein Nacherfassungsformular bereitstellen.

### Bearbeitung

Ein Bearbeitungs-Tool dient dazu, bereits erfasste Werte **direkt am Eintrag nachzubessern**. Anders als ein Formular oeffnet es keine eigene Eingabemaske, sondern schaltet die **Datenansicht** des Eintrags in den Bearbeitungsmodus: Die ausgewaehlten Felder erscheinen mit ihrem **aktuellen Wert vorbefuellt** und koennen an Ort und Stelle korrigiert werden. Gespeichert werden nur die tatsaechlich geaenderten Felder; eine Pflichtfeld-Pruefung wie im Formular gibt es nicht, und der Eintrag wird dabei nicht in eine andere Stufe geschoben.

Sie waehlen pro Tool einen Modus (`edit_mode`); es gibt zwei Varianten:

- **Felder bearbeiten** (`form_fields`): Der Teilnehmer kann bestimmte Felder ueberarbeiten. Stellen Sie sich vor, bei einer Gebaeudezustandserfassung soll die Zustandsklasse nach einer Nachpruefung korrigiert werden koennen. Welche Felder bearbeitbar sind, legen Sie als **explizite Auswahl** fest -- Sie waehlen die gewuenschten Feld-Definitionen des Workflows gezielt aus (`editable_fields`). Es gibt keine automatische Ableitung aus dem Stufenverlauf: Auch Felder aus spaeteren Stufen koennen Sie freigeben, und nicht jedes durchlaufene Feld ist automatisch dabei. Lediglich **berechnete Felder** stehen nicht zur Auswahl, da sich diese aus anderen Werten ergeben. Zusaetzlich bestimmen Sie Button-Text und -Farbe.
- **Standort aendern** (`location`): Bei kartenbasierten Eintraegen kann die Geometrie des Eintrags auf der Karte verschoben werden -- ein Karten-Picker oeffnet sich (bei Punkten ein Marker, bei Linien/Flaechen das Zeichenwerkzeug). Das ist hilfreich, wenn ein Standort bei der Ersterfassung nur grob gesetzt wurde. In diesem Modus werden keine Felder ausgewaehlt, sondern nur die Geometrie des Eintrags geaendert.

**Formular oder Bearbeitung -- wann was?** Beide schreiben in **denselben** gemeinsamen Feldwert-Bestand; der Unterschied liegt im Erlebnis. Ein **Formular** ist auf das **Erfassen** ausgelegt: eine eigene Eingabemaske mit Seiten, Pflichtfeldern und bedingten Feldern -- und an einer Verbindung ist es Teil des Uebergangs. Ein **Bearbeitungs-Tool** ist auf das **Korrigieren** des aktuellen Stands einer festen Feldauswahl direkt in der Datenansicht ausgelegt -- vorbefuellt, ohne Pflichtfeld-Pruefung, ohne Stufenwechsel. Ob ein Schreibvorgang dabei den Wert ueberschreibt oder einen neuen Verlaufs-Eintrag anlegt, entscheidet aber weiterhin der [Schreibmodus](formulare.md#schreibmodus-wie-ein-feld-seine-werte-speichert) des Feldes: Ein Beobachtungs-Feld legt also auch beim Bearbeiten einen **neuen** Verlaufs-Eintrag an, statt zu ueberschreiben.

Bei Stufen- und Global-Bearbeitungs-Tools steuern Sie den Zugriff ueber zwei Rollen-Listen: `self_edit_roles` erlaubt das Bearbeiten **nur eigener** (selbst erstellter) Eintraege, `any_edit_roles` das Bearbeiten **beliebiger** Eintraege. Ueberschneiden sich die Listen, gewinnt `any_edit_roles` (der Button erscheint nur einmal). Bei Verbindungs-Tools ergibt sich der Zugriff aus der Verbindung selbst.

Ein gaengiges Muster: Eine Verbindung von einer Stufe zu sich selbst anlegen (Self-Loop) und daran ein Bearbeitungs-Tool haengen. So koennen Teilnehmer Werte aktualisieren, ohne den Eintrag in eine andere Stufe weiterzuschieben -- etwa um bei einer Bauminventur den Kronenzustand zu aktualisieren, solange der Baum im Status "Unter Beobachtung" bleibt.

Bearbeitungs-Tools koennen an Verbindungen, Stufen oder global angehaengt werden.

### Protokoll

Ein Protokoll-Tool haelt zu einem Eintrag **unveraenderliche Log-Eintraege** fest. Wichtig zum Verstaendnis: Eingefroren wird **nicht der Eintrag (die Instanz)**, sondern der einzelne **Protokolleintrag**. Sie *fuehren das Protokoll aus* -- und das dabei abgegebene Protokoll wird als Schnappschuss festgehalten und bleibt dauerhaft so erhalten, wie es aufgenommen wurde. Der Eintrag selbst laeuft voellig normal weiter: Er behaelt seine Felder, kann weiter bearbeitet und durch die Stufen geschoben werden; das Protokoll legt lediglich daneben einen unveraenderlichen Beleg ab. Das eignet sich z.B. fuer wiederkehrende Begehungen, Pruefnachweise oder eine lueckenlose Beweisdokumentation.

Es gibt zwei Betriebsarten:

- **Manuelles Protokoll (an einer Stufe oder Verbindung):** Das Tool bekommt einen eigenen Button. Tippt ein Teilnehmer darauf, oeffnet sich das zum Protokoll gehoerende [Formular](formulare.md); beim Absenden wird daraus **ein** Schnappschuss aufgenommen und eingefroren. Der Eintrag bleibt davon unberuehrt. So kann z.B. eine Pruefkraft bei jeder Kontrolle eines Brandschutzelements einen neuen, eigenstaendigen Protokolleintrag anlegen.
- **Globales/automatisches Protokoll (Region):** Das Tool wird global angehaengt und ueberwacht eine **Region** -- eine von Ihnen ausgewaehlte Gruppe von Stufen. Hier tippt niemand einen Button: Sobald ein Eintrag die Region wieder verlaesst, nimmt das System automatisch einen Schnappschuss auf (Region-Auto-Snapshot). Dieser haelt fest, welche Tools waehrend des Aufenthalts in der Region verwendet wurden -- von wem und wann. Der Stufenwechsel selbst laeuft dabei normal durch; nur der entstehende Protokolleintrag ist unveraenderlich. Bei zyklischen Workflows wird jeweils nur der letzte Aufenthalt in der Region erfasst.

**Der Protokolleintrag ist unveraenderlich.** Jeder Protokolleintrag wird als Schnappschuss gespeichert und mit einer Pruefsumme (Hash) gesichert. Spaetere Aenderungen an Feldwerten oder das Umbenennen von Feldern wirken sich **nicht** rueckwirkend auf bereits aufgenommene Eintraege aus -- auch die Bezeichnungen werden beim Aufnehmen mit eingefroren.

Ein Protokoll-Formular kann zwei Arten von Feldern enthalten:

- **Fallfelder:** Felder aus der [Feld-Bibliothek](formulare.md) des Workflows. Eingaben werden sowohl in den Schnappschuss geschrieben **als auch** -- wie bei jedem normalen Formular -- in den gemeinsamen Feldwert-Bestand des Eintrags. Damit fliessen sie z.B. in Karten-Filter und die Datenansicht ein.
- **Protokoll-lokale Felder:** inline im Protokoll-Formular definierte Felder, die **ausschliesslich im Schnappschuss (im Log)** existieren. Sie leben **nicht** auf Workflow-Ebene -- sie tauchen weder in der Feld-Bibliothek noch im gemeinsamen Feldwert-Bestand des Eintrags auf und sind deshalb auch nicht filter- oder workflow-weit auswertbar (siehe [Formulare](formulare.md)).

**Wer Eintraege lesen darf:** Protokolleintraege koennen **nur Admins/Projekteigentuemer** einsehen -- sie pruefen die Eintraege auf der Detailseite eines Eintrags im SECTOR. Teilnehmer koennen Eintraege **anlegen**, aber vergangene Eintraege weder auflisten noch oeffnen. Wer ein Protokoll aufnehmen darf, steuern Sie ueber die zugelassenen Rollen (`allowed_roles`) -- analog zu Stufen- und Global-Tools.

### Automatisierung

Automatisierungs-Tools fuehren regelbasierte Aktionen im Hintergrund aus, ohne dass ein Teilnehmer etwas tun muss. Sie werden global angehaengt und im Detail unter [Automatisierungen](automatisierungen.md) beschrieben.

### Feld-Tags

Mit Feld-Tags koennen Sie einzelnen Formularfeldern eine besondere Bedeutung zuweisen. So laesst sich z.B. ein Feld als "Filterwert" markieren, damit Teilnehmer auf der Karte nach diesem Wert filtern koennen.


## Zusammenspiel von Tools und Rollen

Bei Verbindungs-Tools ergibt sich die Zugriffsbeschraenkung automatisch aus der Verbindung: Nur wer die Verbindung nutzen darf, fuehrt auch das angehaengte Tool aus.

Bei Stufen- und Global-Tools legen Sie separat fest, welche Rollen den Button sehen und nutzen duerfen. So koennen Sie z.B. bei einer Baustellen-Doppelbewertung dafuer sorgen, dass der OUe-Pruefer und der Pruefingenieur jeweils nur ihre eigenen Bearbeitungs-Buttons sehen.

---

**Siehe auch:**
- [Formulare](formulare.md) -- Feldtypen fuer Formular-Tools
- [Workflows](workflows.md) -- Stufen und Verbindungen
- [Automatisierungen](automatisierungen.md) -- Zeitgesteuerte und regelbasierte Aktionen
- Tutorial: [Formulare & Tools](../tutorials/03-formulare-und-tools.md)
