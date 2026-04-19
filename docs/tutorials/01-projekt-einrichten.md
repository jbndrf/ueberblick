# Tutorial 1: Projekt einrichten

> Konzepte: [Projekte](../handbuch/projekte.md) | [Rollen und Teilnehmer](../handbuch/rollen-und-teilnehmer.md)

In diesem Tutorial legen wir ein Projekt an, definieren drei Rollen und fuegen drei Teilnehmer hinzu, die wir den Rollen zuordnen. Das ist das minimale Setup, das jedes andere Tutorial voraussetzt.

Unter jedem Schritt ist eine **Feld-Referenz** eingeblendet. Diese Texte kommen direkt aus [`reference/admin-cheatsheet.md`](../reference/admin-cheatsheet.md) und beschreiben, was das jeweilige Feld technisch bewirkt -- inklusive der Auswirkung in der Teilnehmer-App. Aenderungen am Cheatsheet erscheinen hier automatisch beim naechsten Build.

---

## 1. Projekt anlegen

Navigation: **Startseite > "Neues Projekt"**

1. Klicken Sie auf **"Create Project"**.
2. Geben Sie einen Projektnamen und eine Beschreibung ein, z.B.:
   - Name: **E2E Test Project**
   - Beschreibung: **Automated test project for seeding**
3. Klicken Sie auf **"Erstellen"**.

### Feld-Referenz -- Projekt

--8<-- "reference/admin-cheatsheet.md:projects-name"
--8<-- "reference/admin-cheatsheet.md:projects-description"

---

## 2. Rollen anlegen

Navigation: **Projekt > Sidebar > "Rollen" > Tab "Rollen"**

Rollen steuern spaeter, wer welche Workflows, Stufen und Tools sehen oder bedienen darf. Legen Sie drei Rollen an:

| Name | Beschreibung |
|------|-------------|
| Field Worker | Collects data in the field |
| Supervisor | Reviews and approves submissions |
| Analyst | Analyzes collected data |

Fuer jede Zeile: **"Rolle erstellen"** klicken, Felder ausfuellen, **"Speichern"**.

### Feld-Referenz -- Rolle

--8<-- "reference/admin-cheatsheet.md:roles-name"
--8<-- "reference/admin-cheatsheet.md:roles-description"

---

## 3. Teilnehmer anlegen und Rollen zuweisen

Navigation: **Projekt > Sidebar > "Teilnehmer"**

Legen Sie drei Teilnehmer an. Den Login-Token generiert das System automatisch beim Speichern; Sie muessen ihn nicht selbst eintragen.

| Name | Telefon (optional) | Rolle |
|------|---------------------|-------|
| Alice Johnson | -- | Field Worker |
| Bob Smith | -- | Supervisor |
| Carol Davis | -- | Analyst |

Fuer jede Zeile: **"Teilnehmer erstellen"** klicken, Name eintragen, Rolle zuweisen, **"Speichern"**.

Tipp: In der Teilnehmerliste koennen Sie per **"QR-Export"** PDF-Seiten mit Scan-Login-Codes fuer ausgewaehlte Teilnehmer erzeugen.

### Feld-Referenz -- Teilnehmer

--8<-- "reference/admin-cheatsheet.md:participants-name"
--8<-- "reference/admin-cheatsheet.md:participants-phone"
--8<-- "reference/admin-cheatsheet.md:participants-token"
--8<-- "reference/admin-cheatsheet.md:participants-role_id"
--8<-- "reference/admin-cheatsheet.md:participants-is_active"

---

## Ergebnis

- **1 Projekt** -- der Container
- **3 Rollen** -- Field Worker, Supervisor, Analyst
- **3 Teilnehmer** -- Alice, Bob, Carol mit ihren Rollenzuweisungen

Weiter: [Tutorial 2 -- Erster Workflow](02-erster-workflow.md)
