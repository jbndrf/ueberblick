# Tutorial 2: Der erste Workflow -- Stufen, Verbindungen und Berechtigungen

Wir haben ein Projekt mit Rollen und Teilnehmern. Jetzt brauchen die einen Ablauf. Unser Prozess ist klar: Berichte werden eingereicht, geprueft und abgeschlossen. Drei Stufen, zwei Uebergaenge. Dazu kommt: Nicht jeder darf alles -- der Supervisor erstellt Berichte, die Review-Phase ist nur fuer Supervisor und Analyst sichtbar, und nur die beiden duerfen Eintraege abschliessen.

Das ist der Plan. Jetzt bilden wir ihn ab.

---

## 1. Workflow erstellen

1. **Navigiere zum Bereich "Workflows" in der Seitenleiste**
2. **Klicke auf "Neuer Workflow"**
   - **Name: "Permission Test Workflow"**
   - **Beschreibung: "Tests role-based access control"**
3. **Klicke auf "Erstellen"**

Wir sind jetzt im Workflow-Builder.

---

## 2. Stufen anlegen

Unser Prozess hat drei Phasen. Die bilden wir als Stufen ab:

- **Submit Report** -- Einstiegspunkt, hier kommen neue Berichte rein
- **Review** -- Pruefungsphase, nur fuer bestimmte Rollen sichtbar
- **Resolved** -- Abschluss

### Stufe 1: Submit Report

1. **Erstelle eine neue Stufe**
   - **Name: "Submit Report"**
   - **Typ: "Start"**

### Stufe 2: Review

1. **Erstelle eine neue Stufe**
   - **Name: "Review"**
   - **Typ: "Intermediate"**

### Stufe 3: Resolved

1. **Erstelle eine neue Stufe**
   - **Name: "Resolved"**
   - **Typ: "End"**

Drei Stufen stehen auf der Leinwand. Jetzt konfigurieren wir die Sichtbarkeit.

---

## 3. Sichtbarkeit konfigurieren

Die Review-Stufe soll nur fuer Supervisor und Analyst sichtbar sein. Der Field Worker soll nicht sehen, was in der Pruefung passiert.

1. **Oeffne die Einstellungen der Stufe "Review"**
2. **Im Bereich "Sichtbarkeit": Waehle "Supervisor" und "Analyst" aus**
3. **Speichere**

Die anderen beiden Stufen bleiben fuer alle sichtbar -- wenn keine Rollen ausgewaehlt sind, heisst das: alle duerfen sehen.

---

## 4. Verbindungen erstellen

Jetzt die Wege zwischen den Stufen. Wir brauchen drei Verbindungen:

- **Entry** -- wie Eintraege in den Workflow kommen (nur Supervisor)
- **Submit Report --> Review** -- alle duerfen weiterleiten
- **Review --> Resolved** -- nur Supervisor und Analyst duerfen abschliessen

### Entry-Verbindung

1. **Erstelle eine Entry-Verbindung zur Stufe "Submit Report"**
2. **Im Bereich "Berechtigungen": Waehle nur "Supervisor" aus**

Nur der Supervisor kann neue Berichte anlegen.

### Submit Report --> Review

1. **Ziehe eine Verbindung von "Submit Report" zu "Review"**
   - **Aktionsname: "submit-to-review"**
   - **Berechtigungen: leer lassen** (alle Rollen erlaubt)

### Review --> Resolved

1. **Ziehe eine Verbindung von "Review" zu "Resolved"**
   - **Aktionsname: "review-to-resolved"**
   - **Berechtigungen: "Supervisor" und "Analyst"**

---

## 5. Eintragsformular erstellen

Wenn der Supervisor einen neuen Bericht anlegt, soll ein Formular erscheinen. Formulare haengen an Verbindungen -- in diesem Fall an der Entry-Verbindung.

1. **Waehle die Entry-Verbindung aus**
2. **Klicke auf "Formular hinzufuegen"**
   - **Formularname: "Initial Report Form"**
   - **Beschreibung: "Fill out to start a report"**

### Feld 1: Report Title

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Short Text"**
   - **Label: "Report Title"**
   - **Pflichtfeld: Ja**

### Feld 2: Description

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Long Text"**
   - **Label: "Description"**
   - **Pflichtfeld: Ja**

2. **Speichere das Formular**

---

## 6. Berechtigungen im Ueberblick

Hier die vollstaendige Berechtigungsmatrix:

| Aktion | Field Worker | Supervisor | Analyst |
|--------|:---:|:---:|:---:|
| Neuen Eintrag erstellen | -- | Ja | -- |
| "Submit Report" sehen | Ja | Ja | Ja |
| "Review" sehen | -- | Ja | Ja |
| "Resolved" sehen | Ja | Ja | Ja |
| Eintrag abschliessen | -- | Ja | Ja |

Alice (Field Worker) sieht nur Anfang und Ende. Bob (Supervisor) kann alles. Carol (Analyst) kann pruefen und abschliessen, aber nichts erstellen.

---

## Zusammenfassung

Wir haben den kompletten Workflow konfiguriert:

- **Stufen** definieren die Phasen des Prozesses
- **Sichtbarkeit** steuert, wer welche Stufen sieht
- **Verbindungen** definieren die Wege und wer sie nutzen darf
- **Formulare** haengen an Verbindungen und erfassen Daten beim Uebergang

Im naechsten Tutorial bauen wir ein Reinigungsprojekt mit Automatisierung: Das System setzt jeden Abend alle erledigten Raeume automatisch zurueck.
