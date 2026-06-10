# Tutorial 2: Erster Workflow

> Konzepte: [Workflows](../handbuch/workflows.md) | [Tools](../handbuch/tools.md) | [Zugriffskontrolle](../handbuch/zugriffskontrolle.md)

Voraussetzung: [Tutorial 1](01-projekt-einrichten.md) (Projekt mit 3 Rollen und 3 Teilnehmern).

## 1. Workflow erstellen

1. Navigiere zu **"Workflows"** in der Seitenleiste
2. **"Create Workflow"** -- Name: **Permission Test Workflow**, Beschreibung: **Tests role-based access control**
3. Klicke auf **"Erstellen"**

Du bist jetzt im Workflow-Builder.

## 2. Stufen anlegen

Erstelle drei Stufen:

1. **Submit Report** -- Typ: **Start**
2. **Review** -- Typ: **Intermediate**
3. **Resolved** -- Typ: **End**

## 3. Datensichtbarkeit verstehen

Die Sichtbarkeit von erfassten Werten wird **nicht je Stufe**, sondern **je Feld** gesteuert. Jedes Feld traegt eine eigene Rolleneinschraenkung: Lassen Sie sie leer, ist der Wert fuer alle sichtbar; waehlen Sie Rollen aus, sehen nur diese den Wert (alle anderen sehen weiterhin Stufenname und Fortschritt).

Konfiguriert wird das in der **Feld-Bibliothek** des Workflow-Builders -- also dann, wenn Sie die Formularfelder anlegen (siehe [Tutorial 3](03-formulare-und-tools.md)). Fuer dieses Tutorial koennen Sie den Schritt zunaechst ueberspringen.

## 4. Verbindungen erstellen

### Entry-Verbindung

1. Erstelle eine Entry-Verbindung zur Stufe **"Submit Report"**
2. Berechtigungen: nur **Supervisor**

### Submit Report --> Review

1. Ziehe eine Verbindung von **"Submit Report"** zu **"Review"**
2. Aktionsname: **submit-to-review**
3. Berechtigungen: leer lassen (alle Rollen erlaubt)

### Review --> Resolved

1. Ziehe eine Verbindung von **"Review"** zu **"Resolved"**
2. Aktionsname: **review-to-resolved**
3. Berechtigungen: **Supervisor** und **Analyst**

## 5. Eintragsformular

1. Waehle die **Entry-Verbindung** aus
2. **"Formular hinzufuegen"** -- Name: **Initial Report Form**, Beschreibung: **Fill out to start a report**
3. Felder hinzufuegen:
   - **Report Title** -- Typ: Short Text, Pflichtfeld: Ja
   - **Description** -- Typ: Long Text, Pflichtfeld: Ja
4. Speichere das Formular

## 6. Berechtigungsmatrix

| Aktion | Field Worker | Supervisor | Analyst |
|--------|:---:|:---:|:---:|
| Neuen Eintrag erstellen | -- | Ja | -- |
| "Submit Report" sehen | Ja | Ja | Ja |
| "Review" sehen | -- | Ja | Ja |
| "Resolved" sehen | Ja | Ja | Ja |
| Submit Report --> Review | Ja | Ja | Ja |
| Review --> Resolved | -- | Ja | Ja |

Alice (Field Worker) sieht nur Anfang und Ende. Bob (Supervisor) kann alles. Carol (Analyst) kann pruefen und abschliessen, aber nichts erstellen.

Weiter: [Tutorial 3 -- Formulare und Tools](03-formulare-und-tools.md)
