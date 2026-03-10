# Tutorial 4: Reinigung Rhythmus -- Zaehler, Bedingungen und Feldvergleiche

Im Tagesplan-Projekt haben wir alle Raeume gleich behandelt: Jeden Abend wird alles zurueckgesetzt. Aber in der Realitaet hat jeder Raum ein anderes Intervall -- ein WC wird taeglich gereinigt, ein Archiv vielleicht nur alle fuenf Tage. Der Prozess ist derselbe Kreislauf (Offen/Erledigt), aber die Automatisierung wird schlauer: Ein Zaehler trackt die Zeit seit der letzten Reinigung, und das System setzt den Raum erst zurueck, wenn sein individuelles Intervall erreicht ist.

Drei Automatisierungen arbeiten zusammen:
1. **Zaehler hochzaehlen** -- regelmaessig, fuer alle erledigten Raeume
2. **Zuruecksetzen bei Intervall** -- wenn Zaehler >= Intervall
3. **Zaehler-Reset bei manueller Reinigung** -- wenn jemand "Erledigt markieren" drueckt

---

## 1. Projekt, Rolle, Teilnehmer

### Projekt

1. **Klicke auf "Neues Projekt"**
   - **Projektname: "Reinigung - Rhythmus"**
   - **Beschreibung: "Intervall-basierte Reinigung"**
2. **Klicke auf "Erstellen"**

### Rolle und Teilnehmer

Identisch zum Tagesplan-Projekt:

1. **Erstelle Rolle "Reinigungskraft"** (Beschreibung: "Fuehrt die Reinigung durch")
2. **Erstelle Teilnehmer "Max Mustermann"** (max@reinigung.test, Rolle: Reinigungskraft)
3. **Erstelle Teilnehmer "Erika Musterfrau"** (erika@reinigung.test, Rolle: Reinigungskraft)

---

## 2. Workflow: Reinigung EG (Rhythmus)

### 2.1 Workflow anlegen

1. **Navigiere zum Bereich "Workflows"**
2. **Klicke auf "Neuer Workflow"**
   - **Name: "Reinigung EG (Rhythmus)"**
   - **Beschreibung: "Intervall-basierte Reinigung Erdgeschoss"**
3. **Klicke auf "Erstellen"**

### 2.2 Stufen

Dieselben zwei Stufen wie beim Tagesplan:

1. **Start-Stufe: "Offen"** (Marker-Farbe: Rot #ef4444)
2. **Zwischen-Stufe: "Erledigt"** (Marker-Farbe: Gruen #22c55e)

### 2.3 Verbindungen

Dieselben drei Verbindungen:

1. **Entry-Verbindung zur Stufe "Offen"** (keine Rolleneinschraenkung)
2. **"Offen" --> "Erledigt"**, Button-Label: **"Erledigt markieren"**
3. **"Erledigt" --> "Offen"**, Button-Label: **"Zuruecksetzen"**

### 2.4 Eintragsformular

Hier unterscheidet sich das Rhythmus-Projekt. Statt Reinigungstagen brauchen wir ein Intervall und einen Zaehler.

1. **Waehle die Entry-Verbindung aus**
2. **Klicke auf "Formular hinzufuegen"**
   - **Formularname: "Raum-Parameter"**
   - **Beschreibung: "Reinigungsintervall und Zaehler"**

**Feld 1: Reinigungsintervall**

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Dropdown"**
   - **Label: "Reinigungsintervall"**
   - **Hilfetext: "Intervall in Minuten"**
   - **Optionen: "1", "2", "3", "5"**
   - **Position: Linke Spalte**
   - **Pflichtfeld: Nein**

In der Demo nutzen wir Minuten. In Produktion waeren das Tage.

**Feld 2: Minuten seit Reinigung**

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Number"**
   - **Label: "Minuten seit Reinigung"**
   - **Hilfetext: "Automatischer Zaehler"**
   - **Position: Rechte Spalte**
   - **Pflichtfeld: Nein**

Dieses Feld wird vom System verwaltet -- die Reinigungskraft muss es nicht anfassen. Links steht das Intervall, rechts der aktuelle Zaehlerstand. Auf einen Blick sieht man, wie nah ein Raum an der naechsten Reinigung ist.

**Feld 3: Raumnummer**

1. **Klicke auf "Feld hinzufuegen"**
   - **Feldtyp: "Short Text"**
   - **Label: "Raumnummer"**
   - **Position: Volle Breite**
   - **Pflichtfeld: Nein**

2. **Speichere das Formular**

### 2.5 Automatisierungen

Jetzt die drei Automatisierungen. Sie greifen ineinander wie ein Uhrwerk.

#### Automatisierung 1: "Minuten zaehlen"

Laeuft regelmaessig und erhoeht den Zaehler um 1 fuer alle Raeume in "Erledigt".

1. **Navigiere zum Bereich "Automations"**
2. **Klicke auf "Neue Automatisierung"**
   - **Name: "Minuten zaehlen"**
   - **Trigger-Typ: "Scheduled"**

3. **Trigger-Konfiguration:**
   - **Cron-Ausdruck: `* * * * *`** (jede Minute)
   - **Ziel-Stufe: "Erledigt"**

4. **Schritt "Main":**
   - **Bedingungen: Keine**
   - **Aktion hinzufuegen:**
     - **Aktionstyp: "Set Field Value"**
     - **Feld: "Minuten seit Reinigung"**
     - **Wert: `{Minuten seit Reinigung} + 1`**

`{Minuten seit Reinigung}` referenziert den aktuellen Wert. Steht der Zaehler auf 2, wird 2 + 1 = 3 geschrieben. Naechste Minute: 4, dann 5, und so weiter.

5. **Aktivieren und speichern**

---

#### Automatisierung 2: "Reset bei Intervall"

Prueft: Hat der Zaehler das Intervall erreicht? Wenn ja: Raum zurueck auf "Offen", Zaehler auf 0.

1. **Klicke auf "Neue Automatisierung"**
   - **Name: "Reset bei Intervall"**
   - **Trigger-Typ: "Scheduled"**

2. **Trigger-Konfiguration:**
   - **Cron-Ausdruck: `* * * * *`**
   - **Ziel-Stufe: "Erledigt"**

3. **Schritt "Main" -- mit Bedingung:**

   - **Bedingung hinzufuegen:**
     - **Bedingungstyp: "Field Value"**
     - **Feld: "Minuten seit Reinigung"**
     - **Operator: "gte" (groesser oder gleich)**
     - **Vergleichsmodus: "Feld vergleichen"**
     - **Vergleichsfeld: "Reinigungsintervall"**

   Das ist der Kern: Wir vergleichen nicht gegen eine feste Zahl, sondern gegen das individuelle Intervall jedes Raums. Ein Raum mit Intervall 1 wird nach einer Minute zurueckgesetzt, einer mit Intervall 5 erst nach fuenf.

   - **Aktion 1:**
     - **Aktionstyp: "Set Stage"**
     - **Ziel-Stufe: "Offen"**

   - **Aktion 2:**
     - **Aktionstyp: "Set Field Value"**
     - **Feld: "Minuten seit Reinigung"**
     - **Wert: "0"**

4. **Aktivieren und speichern**

---

#### Automatisierung 3: "Zaehler-Reset bei Reinigung"

Wenn eine Reinigungskraft einen Raum manuell als erledigt markiert, muss der Zaehler auf 0 zurueck, damit der Rhythmus von vorne startet.

1. **Klicke auf "Neue Automatisierung"**
   - **Name: "Zaehler-Reset bei Reinigung"**
   - **Trigger-Typ: "On Transition"**

2. **Trigger-Konfiguration:**
   - **Von Stufe: "Offen"**
   - **Zu Stufe: "Erledigt"**

   Feuert genau dann, wenn jemand "Erledigt markieren" drueckt.

3. **Schritt "Main":**
   - **Bedingungen: Keine**
   - **Aktion hinzufuegen:**
     - **Aktionstyp: "Set Field Value"**
     - **Feld: "Minuten seit Reinigung"**
     - **Wert: "0"**

4. **Aktivieren und speichern**

---

## 3. Zusammenspiel der drei Automatisierungen

So laeuft es fuer einen Raum mit Intervall 3 ab:

```
Minute 0: Reinigungskraft drueckt "Erledigt markieren"
          --> Automatisierung 3: Zaehler = 0
          --> Raum ist jetzt in "Erledigt"

Minute 1: Automatisierung 1: Zaehler = 1
          Automatisierung 2: 1 >= 3? Nein.

Minute 2: Automatisierung 1: Zaehler = 2
          Automatisierung 2: 2 >= 3? Nein.

Minute 3: Automatisierung 1: Zaehler = 3
          Automatisierung 2: 3 >= 3? Ja!
          --> Raum zurueck auf "Offen", Zaehler = 0

Der Raum wartet auf die naechste Reinigung.
```

---

## 4. Workflow duplizieren: Reinigung 1.OG (Rhythmus)

1. **Gehe zur Workflow-Uebersicht**
2. **Waehle "Reinigung EG (Rhythmus)"**
3. **Klicke auf "Workflow duplizieren"**
   - **Name: "Reinigung 1.OG (Rhythmus)"**
   - **Beschreibung: "Intervall-basierte Reinigung 1. Obergeschoss"**
4. **Speichere**

Alle drei Automatisierungen werden mit dupliziert.

---

## 5. Raeume anlegen

### Erdgeschoss

| Raum | Intervall | Typischer Einsatz |
|------|-----------|-------------------|
| Raum 0.01 | 1 | Eingangsbereich |
| Raum 0.02 | 2 | Buero |
| Raum 0.03 | 3 | Besprechungsraum |
| Raum 0.04 | 5 | Archiv |
| Raum 0.05 | 1 | WC |
| Raum 0.06 | 2 | Kueche |
| Raum 0.07 | 3 | Buero |
| Raum 0.08 | 5 | Lager |
| Raum 0.09 | 1 | Flur |

### Obergeschoss

| Raum | Intervall |
|------|-----------|
| Raum 1.01 | 2 |
| Raum 1.02 | 3 |
| Raum 1.03 | 5 |
| Raum 1.04 | 1 |
| Raum 1.05 | 2 |
| Raum 1.06 | 3 |
| Raum 1.07 | 5 |
| Raum 1.08 | 1 |
| Raum 1.09 | 2 |

Fuer jeden Raum:

1. **Neuen Eintrag erstellen** im jeweiligen Workflow
2. **Formular ausfuellen:**
   - **Reinigungsintervall: entsprechenden Wert waehlen**
   - **Minuten seit Reinigung: "0"**
   - **Raumnummer: eintragen**
3. **Speichere**

---

## 6. Demo: Individuelle Intervalle in Aktion

1. **Oeffne die Karte** -- alle 18 Raeume rot (Offen)
2. **Markiere alle als "Erledigt"** -- alle gruen
3. **Beobachte:**
   - Nach 1 Minute: Intervall-1-Raeume werden rot
   - Nach 2 Minuten: Intervall-2-Raeume werden rot
   - Nach 3 Minuten: Intervall-3-Raeume werden rot
   - Nach 5 Minuten: Intervall-5-Raeume werden rot

Jeder Raum hat seinen eigenen Rhythmus, gesteuert durch ein einziges Dropdown-Feld.

---

## Zusammenfassung

Drei neue Konzepte:

- **Zaehler-Pattern**: Ein Zahlenfeld, das von einer Automatisierung regelmaessig hochgezaehlt wird (`{feldwert} + 1`)
- **Feldvergleich-Bedingungen**: Statt gegen eine feste Zahl zu pruefen, vergleicht man zwei Felder miteinander (Zaehler >= Intervall). Jeder Eintrag hat damit sein eigenes Verhalten.
- **On-Transition-Trigger**: Feuert, wenn jemand manuell einen Stufenwechsel ausloest -- im Gegensatz zum zeitgesteuerten Trigger, der nach Zeitplan laeuft.

Im naechsten Tutorial gehen wir weiter: Berechnete Felder, die sofort auf Eingaben reagieren, und Automatisierungsketten, bei denen eine Berechnung die naechste ausloest.
