# Tutorial 1: Grundlagen -- Projekt, Rollen und Teilnehmer

Willkommen zum ersten Tutorial. Bevor wir irgendetwas konfigurieren, schauen wir uns an, was wir vorhaben: Wir haben ein Team mit drei Funktionen -- jemand der Daten sammelt, jemand der prueft, und jemand der auswertet. Das bilden wir jetzt in Ueberblick ab.

---

## 1. Projekt anlegen

Ein Projekt ist der Container fuer alles: Rollen, Teilnehmer, Workflows. Alles gehoert zu einem Projekt.

1. **Klicke auf "Neues Projekt"**
2. Im Formular:
   - **Trage als Projektname "E2E Test Project" ein**
   - **Trage als Beschreibung "Automated test project for seeding" ein**
3. **Klicke auf "Erstellen"**

---

## 2. Rollen anlegen

Wir kennen unser Team: Datenerfasser, Pruefer, Auswerter. In Ueberblick heissen diese Funktionen "Rollen". Wir legen alle drei an.

### Rolle 1: Field Worker

1. **Navigiere zum Bereich "Rollen" in der Seitenleiste**
2. **Klicke auf "Neue Rolle"**
   - **Name: "Field Worker"**
   - **Beschreibung: "Collects data in the field"**
3. **Klicke auf "Speichern"**

### Rolle 2: Supervisor

1. **Klicke auf "Neue Rolle"**
   - **Name: "Supervisor"**
   - **Beschreibung: "Reviews and approves submissions"**
2. **Klicke auf "Speichern"**

### Rolle 3: Analyst

1. **Klicke auf "Neue Rolle"**
   - **Name: "Analyst"**
   - **Beschreibung: "Analyzes collected data"**
2. **Klicke auf "Speichern"**

Drei Rollen, drei Verantwortlichkeiten. Im naechsten Schritt weisen wir konkreten Personen diese Rollen zu.

---

## 3. Teilnehmer anlegen

Wir haben drei Mitarbeiter: Alice ist im Aussendienst, Bob prueft, Carol wertet aus. Jeder bekommt die passende Rolle.

### Teilnehmer 1: Alice Johnson

1. **Navigiere zum Bereich "Teilnehmer" in der Seitenleiste**
2. **Klicke auf "Neuer Teilnehmer"**
   - **Name: "Alice Johnson"**
   - **E-Mail: "alice@example.com"**
   - **Rolle: "Field Worker"**
3. **Klicke auf "Speichern"**

### Teilnehmer 2: Bob Smith

1. **Klicke auf "Neuer Teilnehmer"**
   - **Name: "Bob Smith"**
   - **E-Mail: "bob@example.com"**
   - **Rolle: "Supervisor"**
2. **Klicke auf "Speichern"**

### Teilnehmer 3: Carol Davis

1. **Klicke auf "Neuer Teilnehmer"**
   - **Name: "Carol Davis"**
   - **E-Mail: "carol@example.com"**
   - **Rolle: "Analyst"**
2. **Klicke auf "Speichern"**

---

## Zusammenfassung

Das Grundgeruest steht:

- **1 Projekt** -- der Container
- **3 Rollen** -- Field Worker, Supervisor, Analyst
- **3 Teilnehmer** -- Alice, Bob, Carol mit ihren Rollenzuweisungen

Im naechsten Tutorial bauen wir den Workflow: den Ablauf, durch den Daten fliessen, und die Berechtigungen, die steuern, wer was sehen und tun darf.
