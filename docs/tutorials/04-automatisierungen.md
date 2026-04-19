# Tutorial 4: Automatisierungen

> Konzepte: [Automatisierungen](../handbuch/automatisierungen.md) | [Workflows](../handbuch/workflows.md)

Voraussetzung: [Tutorial 3](03-formulare-und-tools.md) (Permission Test Workflow mit Formularen und Edit Tool).

Automatisierungen sind regelbasierte Aktionen, die serverseitig ausgefuehrt werden. In diesem Tutorial erstellen wir zwei Automatisierungen: eine mit `on_transition`-Trigger und eine mit `scheduled`-Trigger.

## 1. Automatisierung als globales Tool anlegen

Automatisierungen werden im Workflow-Builder als **Global Tools** hinzugefuegt.

1. Oeffne den **Permission Test Workflow** im Workflow-Builder
2. Klicke auf den Hintergrund der Canvas (kein Element auswaehlen), um die Workflow-Einstellungen zu oeffnen
3. Im Bereich **"Global Tools"** klicke auf **"Automation"** (Beschreibung: *Run actions on triggers like transitions or field changes*)
4. Der Automation-Editor oeffnet sich rechts

## 2. On-Transition-Automatisierung

Diese Automatisierung setzt automatisch die Prioritaet auf 0, wenn ein Eintrag von **Review** nach **Resolved** wechselt.

### Grunddaten konfigurieren

1. Name: **Clear Priority on Resolve**
2. Enabled: einschalten (Switch auf aktiv setzen)

### Trigger konfigurieren

Im Bereich **"Trigger"** wird zunaechst **"Choose a trigger"** angezeigt. Drei Optionen stehen zur Wahl:

| Option | Interner Typ | Ausloeser |
|--------|-------------|-----------|
| On Transition | `on_transition` | Stufenwechsel |
| On Field Change | `on_field_change` | Feldwert aendert sich |
| Scheduled | `scheduled` | Cron-Zeitplan |

1. Klicke auf **"On Transition"**
2. Der Trigger-Konfigurator oeffnet sich mit den Feldern **From Stage** und **To Stage**
3. From Stage: **Review**
4. To Stage: **Resolved**
5. Klicke auf **"Done"**

### Schritt hinzufuegen

Im Bereich **"Steps"** steht zunaechst **"No steps yet"**. Jede Automatisierung hat geordnete Schritte. Jeder Schritt besteht aus Bedingungen (Guards) und Aktionen.

1. Klicke auf **"Add Step"**
2. Ein neuer Schritt wird angelegt und automatisch geoeffnet
3. Name: **Reset priority**

### Bedingungen (optional)

Im Bereich **"Conditions (guard)"** koennen Bedingungen definiert werden, unter denen der Schritt ausgefuehrt wird. Fuer diese Automatisierung brauchen wir keine Bedingungen -- der Schritt soll immer laufen.

Falls Bedingungen benoetigt werden, klicke auf **"Add Condition"** und konfiguriere:

| Einstellung | Beschreibung |
|-------------|-------------|
| Bedingungstyp | Field Value, Instance Status oder Stage |
| Feld | Das zu pruefende Feld (bei Field Value) |
| Operator | `=`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `is empty`, `is not empty` |
| Vergleichsmodus | **Value** (fester Wert) oder **Field** (Feld-zu-Feld-Vergleich) |

Mehrere Bedingungen werden per **All** (AND) oder **Any** (OR) verknuepft.

### Aktion hinzufuegen

Im Bereich **"Actions"** stehen unter **"Add action"** drei Aktionstypen zur Verfuegung:

| Button | Interner Typ | Beschreibung |
|--------|-------------|-------------|
| Set Status | `set_instance_status` | Instanz-Status aendern (active, completed, archived, deleted) |
| Set Field | `set_field_value` | Feldwert setzen (unterstuetzt Ausdruecke) |
| Set Stage | `set_stage` | Instanz auf bestimmte Stufe setzen |

1. Klicke auf **"Set Field"**
2. Konfiguriere:
   - Field: **Priority**
   - Value: **0**
3. Klicke auf den Zurueck-Pfeil **"Steps"** oben links

### Ergebnis

Wenn ein Supervisor oder Analyst den Button **review-to-resolved** klickt und das Review-Summary-Formular ausfuellt, wird nach dem Stufenwechsel automatisch das Feld Priority auf 0 gesetzt.

## 3. Scheduled-Automatisierung

Diese Automatisierung archiviert alle Eintraege, die sich seit laengerer Zeit in der Stufe **Resolved** befinden.

### Zweite Automatisierung anlegen

1. Klicke erneut auf den Canvas-Hintergrund und dann unter **"Global Tools"** auf **"Automation"**
2. Eine neue Automatisierung wird angelegt

### Grunddaten konfigurieren

1. Name: **Auto-Archive Resolved**
2. Enabled: einschalten

### Trigger konfigurieren

1. Klicke auf **"Scheduled"**
2. Konfiguriere:
   - Target Stage: **Resolved** (nur Instanzen in dieser Stufe werden betroffen)
   - Cron Expression: `0 2 * * 1-5` (Montag bis Freitag um 02:00 Uhr)
   - Inactive for (days): **7** (nur Instanzen ohne Aktivitaet seit 7 Tagen)
3. Klicke auf **"Done"**

### Cron-Ausdruecke

| Feld | Werte | In unserem Beispiel |
|------|-------|---------------------|
| Minute | 0--59 | `0` |
| Stunde | 0--23 | `2` |
| Tag (Monat) | 1--31 | `*` |
| Monat | 1--12 | `*` |
| Wochentag | 0--6 (So=0) | `1-5` |

Weitere Beispiele:

| Cron-Ausdruck | Bedeutung |
|---------------|-----------|
| `0 8 * * *` | Taeglich um 08:00 |
| `*/15 * * * *` | Alle 15 Minuten |
| `0 0 * * 1` | Jeden Montag um Mitternacht |
| `0 12 1 * *` | Am 1. jedes Monats um 12:00 |

Der Workflow-Builder zeigt unter dem Cron-Feld eine menschenlesbare Beschreibung an (z.B. *"Weekdays at 02:00"*).

### Schritt mit Bedingung

1. Klicke auf **"Add Step"**
2. Name: **Archive old entries**

### Bedingung hinzufuegen

1. Klicke auf **"Add Condition"**
2. Bedingungstyp: **Instance Status**
3. Status: **active**

Diese Bedingung stellt sicher, dass nur aktive Instanzen archiviert werden. Bereits archivierte oder geloeschte Eintraege werden uebersprungen.

### Aktion hinzufuegen

1. Klicke auf **"Set Status"**
2. Status: **archived**
3. Klicke auf den Zurueck-Pfeil **"Steps"**

### Ergebnis

Jeden Werktag um 02:00 Uhr prueft die Automatisierung alle Instanzen in der Stufe **Resolved**, die seit mindestens 7 Tagen keine Aktivitaet hatten. Aktive Instanzen werden auf den Status **archived** gesetzt.

## 4. Ausdruecke in Set Field

Die Aktion **Set Field** unterstuetzt nicht nur feste Werte, sondern auch Ausdruecke mit Feldverweisen und Arithmetik:

| Ausdruck | Ergebnis |
|----------|----------|
| `42` | Fester Wert 42 |
| `{Priority} + 1` | Aktueller Wert von Priority plus 1 |
| `{field_a} * {field_b}` | Produkt zweier Felder |
| `{counter} + 10` | Zaehler um 10 erhoehen |

Feldverweise werden in geschweifte Klammern gesetzt und zur Laufzeit durch den aktuellen Wert ersetzt.

## 5. Uebersicht der Automatisierungen

| Name | Trigger | Bedingung | Aktion |
|------|---------|-----------|--------|
| Clear Priority on Resolve | On Transition (Review --> Resolved) | keine | Set Field: Priority = 0 |
| Auto-Archive Resolved | Scheduled (0 2 * * 1-5, 7 Tage inaktiv) | Instance Status = active | Set Status: archived |

## 6. Automatisierung loeschen

Falls eine Automatisierung nicht mehr benoetigt wird:

1. Oeffne die Automatisierung im Editor
2. Scrolle nach unten
3. Klicke auf **"Delete Automation"**
