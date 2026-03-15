# Tutorial 3: Reinigung Tagesplan -- Zeitgesteuerte Automatisierung

Stellen wir uns vor, wir verwalten die Gebaeudereinigung. Der Prozess ist simpel: Jeder Raum muss gereinigt werden, und jeden Morgen startet das Team mit einer frischen Liste. Raeume sind entweder offen oder erledigt -- und das System setzt jeden Abend alles automatisch zurueck. Zwei Stufen, ein Kreislauf.

Wir haben zwei Stockwerke mit jeweils 9 Raeumen. Statt den Workflow zweimal zu bauen, erstellen wir ihn einmal und duplizieren ihn.

---

## 1. Projekt, Rolle, Teilnehmer

### Projekt

1. **Klicke auf "Neues Projekt"**
   - **Projektname: "Reinigung - Tagesplan"**
   - **Beschreibung: "Tagesplan-basierte Reinigung"**
2. **Klicke auf "Erstellen"**

### Rolle

Es gibt nur eine Rolle -- alle Reinigungskraefte haben dieselben Berechtigungen.

1. **Navigiere zum Bereich "Rollen"**
2. **Erstelle eine Rolle:**
   - **Name: "Reinigungskraft"**
   - **Beschreibung: "Fuehrt die Reinigung durch"**

### Teilnehmer

1. **Erstelle Teilnehmer "Max Mustermann"** (max@reinigung.test, Rolle: Reinigungskraft)
2. **Erstelle Teilnehmer "Erika Musterfrau"** (erika@reinigung.test, Rolle: Reinigungskraft)

---

## 2. Workflow: Reinigung EG

### 2.1 Workflow anlegen

1. **Navigiere zum Bereich "Workflows"**
2. **Klicke auf "Neuer Workflow"**
   - **Name: "Reinigung EG"**
   - **Beschreibung: "Tagesplan-basierte Reinigung Erdgeschoss"**
3. **Klicke auf "Erstellen"**

### 2.2 Stufen

Zwei Stufen: Offen und Erledigt. Kein Endpunkt, weil der Kreislauf nie aufhoert -- Raeume pendeln zwischen den beiden Stufen hin und her.

1. **Erstelle eine Start-Stufe:**
   - **Name: "Offen"**
   - **Marker-Farbe: Rot (#ef4444)**

2. **Erstelle eine Zwischen-Stufe:**
   - **Name: "Erledigt"**
   - **Marker-Farbe: Gruen (#22c55e)**

"Erledigt" ist bewusst eine Zwischen-Stufe, keine End-Stufe. Von einer End-Stufe kann nichts zurueck -- aber unsere Automatisierung muss Raeume von "Erledigt" zurueck nach "Offen" verschieben koennen.

### 2.3 Verbindungen

Drei Wege:

1. **Entry-Verbindung zur Stufe "Offen"** (keine Rolleneinschraenkung)
2. **Verbindung "Offen" --> "Erledigt"**, Button-Label: **"Erledigt markieren"**
3. **Verbindung "Erledigt" --> "Offen"**, Button-Label: **"Zuruecksetzen"**

Die dritte Verbindung wird primaer von der Automatisierung genutzt, steht aber auch manuell zur Verfuegung.

### 2.4 Eintragsformular

Wenn ein neuer Raum angelegt wird, wollen wir wissen: An welchen Tagen wird er gereinigt, und wie heisst er?

1. **Waehle die Entry-Verbindung aus**
2. **Klicke auf "Formular hinzufuegen"**
   - **Formularname: "Raum-Einrichtung"**
   - **Beschreibung: "Reinigungstage festlegen"**

**Feld 1: Reinigungstag**

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Multiple Choice"**
   - **Label: "Reinigungstag"**
   - **Optionen: "Mo", "Di", "Mi", "Do", "Fr"**
   - **Pflichtfeld: Nein**

Das ist eine Mehrfachauswahl -- ein Raum kann an mehreren Tagen gereinigt werden. Ein stark genutzter Flur vielleicht Mo, Mi, Fr, waehrend ein Lager nur am Freitag dran ist.

**Feld 2: Raumnummer**

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Short Text"**
   - **Label: "Raumnummer"**
   - **Pflichtfeld: Nein**

2. **Speichere das Formular**

### 2.5 Filterbarer Tag

Damit Reinigungskraefte auf der Karte nach Wochentagen filtern koennen:

1. **Navigiere zum Bereich "Field Tags" des Workflows**
2. **Klicke auf "Neuer Tag"**
   - **Tag-Typ: "Filterable"**
   - **Feld: "Reinigungstag"**
   - **Filter-Modus: "field"**
3. **Speichere**

Auf der Karte erscheint jetzt ein Filter -- man kann z.B. nur die Mittwochsraeume anzeigen.

### 2.6 Automatisierung: Naechtlicher Reset

Das Herzstuck. Jeden Abend sollen alle erledigten Raeume zurueck auf "Offen" gesetzt werden.

1. **Navigiere zum Bereich "Automations"**
2. **Klicke auf "Neue Automatisierung"**
   - **Name: "Naechtlicher Reset"**
   - **Trigger-Typ: "Scheduled"**

3. **Trigger-Konfiguration:**
   - **Cron-Ausdruck: `* * * * *`** (jede Minute fuer die Demo -- in Produktion: `0 2 * * 1-5` fuer 2 Uhr morgens an Werktagen)
   - **Ziel-Stufe: "Erledigt"** -- die Automatisierung greift nur Eintraege in dieser Stufe

4. **Schritt "Main":**
   - **Bedingungen: Keine** -- alle Eintraege in "Erledigt" werden zurueckgesetzt, ohne Ausnahme
   - **Aktion hinzufuegen:**
     - **Aktionstyp: "Set Stage"**
     - **Ziel-Stufe: "Offen"**

5. **Automatisierung aktivieren und speichern**

Das ist die einfachste moegliche Automatisierung: Ein Zeitplan, keine Bedingungen, eine Aktion. Jeden Morgen startet das Team mit einer leeren Liste.

---

## 3. Workflow duplizieren: Reinigung 1.OG

Wir brauchen denselben Workflow fuer das Obergeschoss. Statt alles nochmal zu bauen:

1. **Gehe zurueck zur Workflow-Uebersicht**
2. **Waehle "Reinigung EG" aus**
3. **Klicke auf "Workflow duplizieren"**
   - **Name: "Reinigung 1.OG"**
   - **Beschreibung: "Tagesplan-basierte Reinigung 1. Obergeschoss"**
4. **Speichere**

Der duplizierte Workflow hat alles: Stufen, Verbindungen, Formular, filterbaren Tag und die Automatisierung. Nichts muss nachkonfiguriert werden.

---

## 4. Raeume anlegen

Jetzt befuellen wir die Workflows mit Raeumen. Das passiert in der Teilnehmer-App.

### Erdgeschoss (Workflow: Reinigung EG)

| Raum | Reinigungstage |
|------|----------------|
| Raum 0.01 | Mo, Mi, Fr |
| Raum 0.02 | Mo, Di, Do |
| Raum 0.03 | Di, Do |
| Raum 0.04 | Mo, Mi, Fr |
| Raum 0.05 | Mo, Di, Mi, Do, Fr |
| Raum 0.06 | Mi, Fr |
| Raum 0.07 | Mo, Do |
| Raum 0.08 | Di, Mi, Fr |
| Raum 0.09 | Mo, Mi |

### Obergeschoss (Workflow: Reinigung 1.OG)

| Raum | Reinigungstage |
|------|----------------|
| Raum 1.01 | Di, Do |
| Raum 1.02 | Mo, Mi, Fr |
| Raum 1.03 | Mo, Di, Mi, Do, Fr |
| Raum 1.04 | Mi, Fr |
| Raum 1.05 | Mo, Do |
| Raum 1.06 | Mo, Di, Do |
| Raum 1.07 | Di, Mi, Fr |
| Raum 1.08 | Mo, Mi |
| Raum 1.09 | Mo, Di, Mi, Do, Fr |

Fuer jeden Raum:

1. **Tippe auf die Karte in der Teilnehmer-App**
2. **Waehle den Workflow** (EG oder 1.OG)
3. **Fuelle das Formular aus:**
   - **Reinigungstag: entsprechende Tage auswaehlen**
   - **Raumnummer: eintragen**
4. **Speichere**

---

## 5. Demo: Automatisierung in Aktion

1. **Oeffne die Karte** -- 18 rote Marker (alle Offen)
2. **Markiere einige Raeume als "Erledigt"** -- sie werden gruen
3. **Warte eine Minute**
4. **Lade die Karte neu** -- die gruenen Marker sind wieder rot

Jeden Tag dasselbe: Das System raeumt auf, das Team faengt frisch an.

---

## Zusammenfassung

- **2-Stufen-Kreislauf**: Offen und Erledigt, kein Endpunkt
- **Zeitgesteuerte Automatisierung**: Cron-Trigger, Ziel-Stufe, Aktion "Set Stage" -- ohne Bedingungen
- **Mehrfachauswahl-Felder**: Teilnehmer waehlen mehrere Werte (Wochentage)
- **Filterbare Tags**: Karte nach Feldwerten filtern
- **Workflow duplizieren**: Gleicher Ablauf fuer mehrere Bereiche, einmal bauen, beliebig oft kopieren

Im naechsten Tutorial machen wir die Automatisierung schlauer: Statt alle Raeume gleich zu behandeln, bekommt jeder Raum sein eigenes Reinigungsintervall. Dafuer brauchen wir Zaehler, Bedingungen und Feldvergleiche.
