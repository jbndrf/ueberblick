# Reinigung auf der Karte -- Zwei Demo-Optionen

## Kontext

Reinigungsplane sollen auf der Karte als Workflow-Instanzen dargestellt werden. Zwei Ansatze werden als Kundendemos gebaut: ein Tagesplan (welche Raume an welchem Tag) und ein Rhythmus-System (Arbeitstage-Zahler). Beide teilen dieselbe Grundlage (Workflow pro Etage, Stages, Automationen) aber unterscheiden sich in der Filter- und Reset-Logik.

Raume verteilen sich uber mehrere Etagen, werden in verschiedenen Rhythmen gereinigt, und die Reinigungskrafte mussen sehen, was zu tun ist. Nicht erledigte Raume (Carryover) sollen sichtbar bleiben.

---

## Gemeinsame Grundlage

### Workflow-Struktur (pro Etage)
- **Typ**: Incident
- **Stages**: "Offen" (Start, rot/orange Icon) -> "Erledigt" (Intermediate, grunes Icon)
- **Verbindungen**: Offen -> Erledigt ("Erledigt markieren"), Erledigt -> Offen ("Zurucksetzen")
- **Etagen-Filter**: Workflow-Master-Toggle im FilterSheet (bereits eingebaut)

### Benotigte Code-Anderungen

**1. `set_stage` Automations-Aktion (~30 Zeilen)**
Neue Aktion in `pb/pb_hooks/main.pb.js` in `executeActions()`. Setzt die Stage einer Instanz per Automation -- wie eine manuelle Transition, aber automatisch ausgelost.

**2. `increment_field` Automations-Aktion (~40 Zeilen)**
Liest ein numerisches Feld, erhoht um 1, schreibt zuruck. Wird fur den Arbeitstage-Zahler in Demo B benotigt.

**3. Numerische Bedingungsoperatoren (~20 Zeilen)**
`>=`, `<=`, `>`, `<` fur field_value Conditions in der Automations-Engine. Fur "Zahler >= Intervall"-Prufung in Demo B.

**4. Wochentag-Cron**
Cron-Schedule von `"0 2 * * *"` auf `"0 2 * * 1-5"` andern. Kein Reset am Wochenende.

**5. Multi-Value Feld-Splitting (bereits implementiert)**
`splitMultiValue()` Hilfsfunktion in 3 Dateien, damit Multiple-Choice-Felder als einzelne Filter-Toggles erscheinen.

---

## Demo A: "Tagesplan" (Tagesbasierter Plan)

### Konzept
Explizite Tageszuweisung. Reinigungskraft schaltet den heutigen Tag ein und sieht genau welche Raume heute dran sind.

### FilterSheet-Ansicht
```
Reinigung 4.OG          [ein/aus]
  Mo    (12)             [ein/aus]
  Di    (14)             [ein/aus]
  Mi    (22)             [ein/aus]
  Do    (18)             [ein/aus]
  Fr    (18)             [ein/aus]

Reinigung 3.OG          [ein/aus]
  Mo    (4)              [ein/aus]
  ...
```

### Felder
- `Reinigungstag` (Multiple Choice): Mo, Di, Mi, Do, Fr -- an welchen Tagen dieser Raum gereinigt wird
- Filterable Tag: Filter nach Feld "Reinigungstag"

### Automation
Eine Automation pro Workflow:
```
"Nachtlicher Reset"
  Trigger:    time_based, days=0, stage=Erledigt
  Aktion:     set_stage -> "Offen"
```
Setzt ALLE erledigten Raume jeden Werktag-Abend zuruck. Der Tagesfilter bestimmt, welche Raume an welchem Tag relevant sind.

### Carryover
Nicht gereinigte Raume bleiben "Offen". Sie erscheinen am nachsten geplanten Tag. Um gestrige Ruckstande zu sehen, lasst die Reinigungskraft den vorherigen Tag-Toggle an.

### Vorteile / Nachteile
- Passt exakt zum Vermietervertrag (welche Raume an welchen Tagen)
- Reinigungskraft sieht eine prazise Tagesliste
- Erfordert explizite Tageszuweisung pro Raum
- Carryover erfordert manuelles Umschalten des Filters

---

## Demo B: "Rhythmus" (Arbeitstage-Zahler)

### Konzept
Keine Tageszuweisung. Jeder Raum hat ein Reinigungsintervall in Arbeitstagen. Ein Zahler trackt wie viele Arbeitstage seit der letzten Reinigung vergangen sind. Wenn der Zahler das Intervall erreicht, wird der Raum auf "Offen" zuruckgesetzt. Reinigungskraft sieht nur: rot (fallig) vs. grun (erledigt).

### FilterSheet-Ansicht
```
Reinigung 4.OG          [ein/aus]
  Offen     (15)         [ein/aus]
  Erledigt  (7)          [ein/aus]
```

### Felder
- `Reinigungsintervall` (Dropdown): 1, 2, 3, 5 -- Arbeitstage zwischen Reinigungen
- `Arbeitstage_seit_Reinigung` (Zahlenfeld, versteckt/read-only): Zahler, startet bei 0
- Filterable Tag: Filter nach Stage (Offen/Erledigt)

### Intervall-Zuordnung

| Rhythmus | Intervall | Ergebnis |
|----------|-----------|----------|
| taglich | 1 | Jeden Arbeitstag |
| 3x/Woche | 2 | Mo/Mi/Fr Zyklus |
| 2x/Woche | 3 | Mo/Do Zyklus |
| 1x/Woche | 5 | Gleicher Tag jede Woche |

### Ablauf-Beispiel (3x/Woche, Intervall=2)
```
Mo:       Gereinigt. Zahler=0. Stage=Erledigt.
Di 02:00: Cron erhoht Zahler -> 1. 1 < 2, kein Reset.
Mi 02:00: Cron erhoht Zahler -> 2. 2 >= 2, RESET -> Offen! Zahler=0.
Mi:       Gereinigt. Zahler=0. Stage=Erledigt.
Do 02:00: Zahler -> 1. Kein Reset.
Fr 02:00: Zahler -> 2. RESET -> Offen!
Fr:       Gereinigt. Zahler=0. Erledigt.
Sa/So:    KEIN CRON. Zahler bleibt 0.
Mo 02:00: Zahler -> 1. Kein Reset.  <-- Raum bleibt grun ubers Wochenende!
Di 02:00: Zahler -> 2. RESET -> Offen!
```

Hauptvorteil gegenuber Kalendertag-Ansatz: Raum der Freitag gereinigt wurde bleibt Erledigt ubers Wochenende UND Montag. Wird erst Dienstag "Offen" -- exakt 2 Arbeitstage nach Reinigung.

### Automationen (3 pro Workflow)

**Automation 1: "Arbeitstage zahlen"**
```
Trigger:    time_based, days=0, stage=Erledigt
Aktion:     increment_field "arbeitstage_seit_reinigung"
```
Erhoht den Zahler jeden Werktag um 02:00 fur alle Raume in "Erledigt".

**Automation 2: "Reset bei Intervall"**
```
Trigger:    on_field_change, field="arbeitstage_seit_reinigung"
Bedingung:  Feld "arbeitstage_seit_reinigung" >= Feld "reinigungsintervall"
Aktionen:   set_stage -> "Offen"
            set_field_value "arbeitstage_seit_reinigung" = "0"
```
Reagiert auf Zahler-Anderung, pruft ob Schwellwert erreicht, setzt zuruck.

**Automation 3: "Zahler-Reset bei Reinigung"**
```
Trigger:    on_transition, von=Offen, nach=Erledigt
Aktion:     set_field_value "arbeitstage_seit_reinigung" = "0"
```
Setzt den Zahler auf 0 zuruck wenn die Reinigungskraft einen Raum als erledigt markiert.

### Carryover
Vollautomatisch. Nicht gereinigte Raume bleiben "Offen" unbegrenzt. Der Zahler erhoht sich nur fur Raume im "Erledigt"-Stage, also werden "Offen"-Raume nicht beruhrt.

### Vorteile / Nachteile
- Prazise Arbeitstage-Zahlung -- Wochenenden wirklich ubersprungen
- Carryover automatisch (rote Raume bleiben rot bis erledigt)
- Vorgesetzter kann Intervall eines Raums andern ohne Automationen umzubauen
- Einfacher fur Reinigungskrafte (einfach putzen was rot ist)
- Keine spezifische Wochentag-Kontrolle (Mo/Do statt z.B. Di/Fr)
- Passt nicht zu expliziten tagesbasierten Vertragen

---

## Implementierungsschritte

### Schritt 1: Automations-Engine -- neue Aktionstypen
**Datei**: `pb/pb_hooks/main.pb.js`, in `executeActions()`

**`set_stage`** (~30 Zeilen): Versetzt Instanz in eine Ziel-Stage.
```javascript
case 'set_stage': {
  const targetStageId = action.params.stage_id;
  // Stage validieren (existiert, gehort zum Workflow)
  // instance.current_stage_id aktualisieren
  // unsafeWithoutHooks() verwenden um Endlos-Trigger zu vermeiden
}
```

**`increment_field`** (~40 Zeilen): Liest numerisches Feld, erhoht um 1, schreibt zuruck.
```javascript
case 'increment_field': {
  const fieldKey = action.params.field_key;
  const stageId = action.params.stage_id;
  // Bestehenden Feldwert finden (oder mit 0 erstellen)
  // Als Zahl parsen, +1, als String zuruckschreiben
  // unsafeWithoutHooks() verwenden
}
```

### Schritt 2: Numerische Bedingungsoperatoren
**Datei**: `pb/pb_hooks/main.pb.js`, in `evaluateConditions()` (~20 Zeilen)

Neue Operatoren fur field_value Bedingungen:
- `>=` (grosser_gleich)
- `<=` (kleiner_gleich)
- `>` (grosser)
- `<` (kleiner)

Beide Seiten als Zahlen parsen fur Vergleich.

### Schritt 3: Wochentag-Cron
**Datei**: `pb/pb_hooks/main.pb.js`
- Vorher: `cronAdd("automation_time_check", "0 2 * * *", ...)`
- Nachher: `cronAdd("automation_time_check", "0 2 * * 1-5", ...)`

### Schritt 4: Admin-UI Updates
- `ActionBuilder.svelte` -- `set_stage` und `increment_field` zum Aktionstyp-Selektor hinzufugen
- `ConditionBuilder.svelte` -- Numerische Operatoren zum Operator-Dropdown hinzufugen
- `types.ts` -- Typdefinitionen fur neue Aktionen/Bedingungen aktualisieren

### Schritt 5: Multi-Value Feld-Splitting (bereits erledigt)
Bereits geanderte Dateien: `+page.svelte`, `FilterSheet.svelte`, `MapCanvas.svelte`

### Schritt 6: Admin-Setup (manuell, pro Demo)
Workflows, Stages, Verbindungen, Felder und Automationen wie oben beschrieben erstellen.

---

## Zu andernde Dateien

1. `pb/pb_hooks/main.pb.js` -- `set_stage`, `increment_field`, numerische Bedingungen, Wochentag-Cron
2. `.../automation-editor/ActionBuilder.svelte` -- Neue Aktionstypen in der UI
3. `.../automation-editor/ConditionBuilder.svelte` -- Numerische Operatoren in der UI
4. `src/lib/workflow-builder/types.ts` -- Typdefinitionen

Bereits geandert:
5. `src/routes/participant/map/+page.svelte` -- `splitMultiValue` Hilfsfunktion
6. `src/routes/participant/map/components/FilterSheet.svelte` -- Multi-Value Zahlung
7. `src/routes/participant/map/components/MapCanvas.svelte` -- Multi-Value Sichtbarkeitsprufung

---

## Zukunft: Automations-Engine Verbesserungen

### `set_stage` -- Stage-Daten-Sichtbarkeit
Wenn `set_stage` eine Instanz ruckwarts bewegt (z.B. Erledigt -> Offen), bleiben Feldwerte aus der Erledigt-Stage in `workflow_instance_field_values`. Das Detail-Modul filtert nach `stage_id`, also sollten sie nicht in der Offen-Ansicht auftauchen. Muss bei der Implementierung verifiziert werden.

### Eigene Cron-Zeitplane pro Automation
Den einzelnen hardcodierten Cron durch pro-Automation-Konfiguration ersetzen:
- UI: Wochentag-Checkboxen, Uhrzeit-Picker, Intervall-Selektor
- Generiert Cron-Ausdrucke unter der Haube (z.B. `"0 9 * * 1,3,5"`)
- Mindestintervall serverseitig erzwungen (15 Min)
- Jede Automation bekommt ihren eigenen `cronAdd()` Aufruf

### Mogliche Automations-Szenarien
- **Eskalation**: Raum 2+ Tage nicht gereinigt -> set_stage "Eskaliert" (Alarm-Icon)
- **Auto-Archivierung**: Abgeschlossene Instanzen nach 30 Tagen archivieren
- **Schicht-basierte Resets**: Verschiedene Cron-Zeiten fur Fruh-/Spat-/Nachtschicht
- **Monats-Grundreinigung**: Am 1. des Monats alle Raume fur Grundreinigung markieren
- **SLA-Monitoring**: Vorfall X Tage offen -> automatisch eskalieren

---

## Verifikation

### Automations-Engine
1. `set_stage` Aktion testen: Automation erstellen, Stage-Wechsel, Icon-Update, last_activity_at verifizieren
2. `increment_field` Aktion testen: Feldwert erhoht sich bei jedem Aufruf um 1
3. Numerische Bedingungen (>=, <=) testen: korrekte Auswertung mit Zahlenwerten
4. Wochentag-Cron testen: keine Automationen am Samstag/Sonntag

### Demo A (Tagesplan)
5. Workflow mit Multiple-Choice "Reinigungstag" erstellen, Tag-Toggles im FilterSheet verifizieren
6. Instanzen mit verschiedenen Tag-Auswahlen erstellen, Tage umschalten, korrekte Instanzen angezeigt
7. Nachtlichen Reset-Automation einrichten, Erledigt-Raume werden auf Offen zuruckgesetzt

### Demo B (Arbeitstage-Zahler)
8. Workflow mit Intervall + Zahler-Feldern erstellen, 3 Automationen einrichten
9. Instanzen mit Intervall=2 erstellen, Zahler erhoht sich taglich um 02:00
10. Reset feuert wenn Zahler das Intervall erreicht
11. Zahler wird auf 0 zuruckgesetzt wenn Raum gereinigt wird (Offen -> Erledigt)
12. Wochenende testen: Raum Freitag reinigen, Zahler bleibt 0 uber Wochenende, erhoht sich Montag
13. Carryover testen: Raum nicht reinigen, bleibt unbegrenzt Offen
