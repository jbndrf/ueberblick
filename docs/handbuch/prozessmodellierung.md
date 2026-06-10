# Prozessmodellierung (CMMN)

Diese Seite ist die **Landkarte** aller Verzweigungs- und Entscheidungsmechanismen in Ueberblick. Sie richtet sich an alle, die einen realen Ablauf modellieren und sich fragen: *Welches Werkzeug nehme ich wofuer?* Als gemeinsame Sprache dient die **CMMN** (Case Management Model and Notation) -- die Notation der oeffentlichen Verwaltung fuer schwach strukturierte, ereignisgetriebene Ablaeufe. Die Detail-Bedienung steht jeweils auf den verlinkten Seiten; hier geht es um die Einordnung.

## Ueberblick aus Sicht der Prozessmodellierung

CMMN beschreibt einen *Fall* deklarativ: Ein Fall kann viele Aufgaben enthalten, die **gleichzeitig** aktiv sein duerfen und von Bedingungen (Waechtern) ein- und ausgeschaltet werden -- es gibt keinen einzelnen "aktuellen Zustand".

Ueberblick funktioniert in einem Punkt grundlegend anders: **Jeder Eintrag befindet sich zu jedem Zeitpunkt in genau einer Stufe** (`current_stage_id`). Ueberblick ist damit eher ein **Zustandsautomat mit CMMN-artigen Eintritts-Waechtern** als ein reines Fallmodell. Praktisch heisst das:

- Den **Ablauf** modellieren Sie als Graph aus [Stufen](workflows.md#die-bausteine-eines-workflows) und Uebergaengen -- strukturierter als CMMN, naeher an einem Zustandsdiagramm.
- Die **datenabhaengige Verzweigung** liefern die [Waechter](workflows.md#bedingte-verfuegbarkeit-von-verbindungen-waechter) auf den Verbindungen -- das ist die CMMN-Idee an genau der richtigen Stelle.

CMMN-Denken hilft Ihnen also vor allem dort, wo der Ablauf **nicht** streng linear ist: wo abhaengig von erfassten Daten unterschiedliche Wege moeglich sind oder wo Dinge **ereignisgetrieben** geschehen (Zeitablauf, Feldaenderung). Wo der Ablauf streng der Reihe nach laeuft, brauchen Sie nur Stufen und Verbindungen.

## CMMN-Element → Ueberblick

Die folgende Tabelle ordnet jedem CMMN-Element seine Ueberblick-Entsprechung und -Grenze zu.

| CMMN (Begriff) | Ueberblick-Entsprechung | Grenze / Hinweis |
| --- | --- | --- |
| **Fallaktenmodell** | Ein [Workflow](workflows.md) (Definition); ein **Eintrag** = ein Fall. Die Feldwerte des Eintrags sind die Fallakte. | -- |
| **Phase** (Stage) | **Stufe** (`workflow_stages`) | Es ist immer nur **eine** Stufe aktiv -- anders als in CMMN. |
| **Aufgabe** (human task) | **Tool** vom Typ [Formular, Bearbeitung oder Protokoll](tools.md#die-tool-typen) | Kein blockierend/nicht-blockierend; Tools laufen beim Druck auf den Button. |
| **Aufgabe** (case task / Subprozess) | Feldtyp `instance_reference` | **Noch nicht nutzbar** (Phase 4) -- siehe [Kein Subprozess](#kein-subprozess-was-stattdessen-geht). |
| **Aufgabe** (decision task / DMN) | **Berechnetes Feld** + [Smart Dropdown](formulare.md#welche-feldtypen-gibt-es) | DMN-leicht: eine Formel bzw. abhaengige Auswahl statt einer eigenen Entscheidungstabelle. |
| **Waechter / Sentry** (Eintritts­kriterium, weiss) | [Bedingung an einer Verbindung](workflows.md#bedingte-verfuegbarkeit-von-verbindungen-waechter) | Nur **UND**, nur auf **Verbindungen**, geraeteseitig ausgewertet (auch offline). |
| **Waechter** (Austritts­kriterium, schwarz) | Keine deklarative Entsprechung | Wird ueber eine [Automatisierung](automatisierungen.md) nachgebildet (z.B. `Status setzen`). |
| **Ereignisueberwachung** (Event Listener) | [Automatisierungs-Ausloeser](automatisierungen.md#was-loest-eine-automatisierung-aus) | `bei Feldaenderung` = Benutzer-/Allgemein-Event, `zeitgesteuert` = Timer, `bei Stufenwechsel` = Zustands-Event. |
| **Meilenstein** | ~ eine **Endstufe** oder ein Statusfeld | Kein eigenstaendiges Meilenstein-Element. |
| **Auto Complete** | Automatisierung mit Aktion `Status setzen` → `abgeschlossen` | "Der Fall ist fertig, sobald ..." -- nur regelbasiert, nicht deklarativ. |
| **Erforderlich** (Required) | Pflichtfelder im Formular; zusaetzlich als Tor per **Waechter** | "Muss ausgefuellt sein, bevor es weitergeht." |
| **Zu wiederholende** (Repetition) | **Self-Loop**-Verbindung + Felder im Schreibmodus **Beobachtung** | Siehe [Wiederkehrende Aufgaben](#wiederkehrende-aufgaben). |
| **Manuell zu aktivierende** | Jede **Verbindungs-Schaltflaeche** (Teilnehmer-Druck) | Ueberblick-Aktionen sind grundsaetzlich manuell ausgeloest. |
| **Optionale** (Discretionary) + Planning Table | Rollen-gesteuerte Verbindungen / **globale Tools** | Keine Ad-hoc-Aufgaben zur **Laufzeit** -- alles wird vorab definiert. |

## Werkzeug-Platzierung im Detail

Eine CMMN-Aufgabe ist in Ueberblick ein **Tool**. Wo Sie es anhaengen, entscheidet ueber sein Verhalten. Tools werden an [drei Stellen](tools.md#wo-tools-angehaengt-werden) platziert -- eine Verbindung kann jedoch auch ein **Self-Loop** sein (von einer Stufe zu sich selbst), woraus sich praktisch **vier** Platzierungen ergeben:

| Platzierung | Modelliert als | Aendert die Stufe? | Per **Waechter** steuerbar? | Bestaetigung / Button-Stil? |
| --- | --- | --- | --- | --- |
| **Uebergangs-Tool** | Verbindung `von ≠ nach` | **Ja** → Zielstufe | **Ja** | Ja |
| **Self-Loop-Tool** | Verbindung `von == nach` | Nein (bleibt) | **Ja** | Ja |
| **Stufen-Tool** | an einer **Stufe** (keine Verbindung) | Nein | **Nein** (nur Rolle) | Nein |
| **Globales Tool** | an keiner Stufe/Verbindung bzw. global | Nein | Nein (nur Rolle) | Nein |

Die entscheidende Regel:

> **Waechter (Bedingungen) gibt es nur auf Verbindungen.** Wenn eine Aktion **datenabhaengig** erscheinen soll ("Button nur, wenn Risikoklasse = gering"), muss sie eine **Verbindung** sein -- ein Stufen- oder globales Tool laesst sich nur ueber die **Rolle** einschraenken, nie ueber Feldwerte.

Daraus folgt der oft uebersehene Unterschied zwischen den beiden Platzierungen, die den Eintrag **in derselben Stufe** lassen:

- Ein **Self-Loop** ist eine **Verbindung**. Er erbt damit den ganzen Funktionsumfang einer Verbindung: einen **Waechter**, zugelassene Rollen, einen optionalen Bestaetigungsdialog, Button-Farbe -- und er wird als Aktivitaet protokolliert. Nehmen Sie ihn, wenn die Aktion ein **bewusster, ggf. datenabhaengiger Schritt** ist (z.B. "Freigeben", aber erst wenn die Massnahme erfasst ist).
- Ein **Stufen-Tool** haengt direkt an der Stufe. Es hat keinen Waechter und keinen Uebergangs-Charakter -- es speichert nur Werte. Nehmen Sie es fuer ein **jederzeit verfuegbares Hilfswerkzeug** waehrend des Aufenthalts in einer Stufe (z.B. ein [Bearbeitungs-Tool](tools.md#die-tool-typen), um einen Wert zu korrigieren).

## Pattern-Recipes

### Wiederkehrende Aufgaben

"Etwas, das von Zeit zu Zeit erledigt werden muss" (taegliche Reinigung, monatliche Wiederholungspruefung, woechentliches Altern von Sichtungen) modellieren Sie als **Zustandsschleife mit zeitgesteuertem Ruecksetzen** -- die Ueberblick-Entsprechung der CMMN-**Repetition**:

```mermaid
flowchart LR
    O[Stufe "Offen / Faellig"] -->|Teilnehmer erledigt| E[Stufe "Erledigt"]
    E -.->|Zeitgesteuerte Automatisierung| O
```

1. Zwei Stufen: **"Offen/Faellig"** und **"Erledigt"**, dazwischen ein Uebergang -- das ist das eigentliche Erledigen (mit angehaengtem Formular).
2. Eine [zeitgesteuerte Automatisierung](automatisierungen.md#zeitplaene-einrichten) setzt die Eintraege periodisch `Erledigt → Offen` zurueck. Genau das beschreiben die Beispiele "taeglich um 08:00 alle Reinigungsaufgaben auf Offen zuruecksetzen" bzw. das woechentliche Herabstufen in der Forstbefallsueberwachung.

Die Stufen + der Uebergang liefern die **Aufgabe**, die Automatisierung liefert die **Wiederholung**.

Je nach Aufgabe gibt es drei Auspraegungen:

- **(a) Pflicht auf bestehenden Eintraegen** -- jeder Eintrag (z.B. jeder Raum, jeder Hydrant) durchlaeuft die Schleife. Der Regelfall.
- **(b) Ortlose Aufgabe** -- ohne Kartenbezug modellieren Sie sie als [Formular-Workflow](workflows.md#zwei-arten-von-workflows): **eine Instanz je Aufgabe** (z.B. je Checklistenpunkt). Die Wiederholung uebernimmt wieder eine zeitgesteuerte Automatisierung.
- **(c) Ad-hoc-Erfassung** -- etwas, das man *jederzeit* zu einem Eintrag beitragen kann (eine Notiz, ein Foto): dafuer ist ein **globales Tool** richtig. Das ist aber **keine Aufgabe mit Erledigt-Zustand** (siehe naechster Abschnitt).

> **Wichtige Grenze:** Automatisierungen koennen **keine neuen Eintraege erzeugen** -- ihre Aktionen wirken nur auf **bestehende** Eintraege (Stufe/Status/Feldwert setzen). Den festen Bestand wiederkehrender Aufgaben legen Sie also **einmal** an; der Zeitplan oeffnet sie nur wieder.

### Kein Subprozess -- was stattdessen geht

Eine CMMN-Aufgabe kann ein eigener Unter-Fall sein (*case task*). In Ueberblick entspraeche das dem Feldtyp `instance_reference` -- der ist jedoch **noch nicht nutzbar** (Schema vorhanden, aber keine Teilnehmer-Oberflaeche; Phase 4). Sie koennen heute also **keinen echten, verknuepften Subprozess** abbilden. Alternativen:

- **Getrennte Workflows** fuer den Teilablauf -- lose gekoppelt, ohne automatische Verknuepfung der Eintraege.
- **Mehr Stufen im selben Workflow**, wenn der Teilablauf klein genug ist.

> **Klarstellung:** Ein **globales Formular ist keine Aufgabe.** Es ist stets verfuegbare **Datenerfassung ohne Lebenszyklus** (CMMN: Discretionary) -- etwas zum Eintragen, nicht etwas mit Offen/Erledigt-Zustand. Wer eine nachverfolgbare Pflicht braucht, nimmt die Zustandsschleife aus dem vorigen Abschnitt, nicht ein globales Formular.

## Entscheidungshilfe -- welches Werkzeug wofuer?

- **Struktur des Ablaufs** (welche Zustaende, welche erlaubten Schritte) → [Stufen + Verbindungen](workflows.md#die-bausteine-eines-workflows).
- **Datenabhaengiges Tor** ("Schritt nur erlauben, wenn die Daten passen") → [Waechter](workflows.md#bedingte-verfuegbarkeit-von-verbindungen-waechter) auf einer Verbindung.
- **Reaktion ohne Teilnehmer** (zeitliches Altern, Auto-Abschluss, Eskalation, Nachberechnung) → [Automatisierung](automatisierungen.md).
- **Formular-Ergonomie** (Felder ein-/ausblenden, abhaengige Auswahl) → [bedingte Sichtbarkeit](formulare.md#bedingte-sichtbarkeit) bzw. [Smart Dropdown](formulare.md#welche-feldtypen-gibt-es). Das gehoert **in ein Formular**, nicht in die Ablauf-Struktur.
- **Abgeleiteter Wert** (eine Zahl, auf die spaetere Schritte reagieren) → **berechnetes Feld**.

> **ODER-Verzweigung:** Ein Waechter verknuepft seine Bedingungen nur mit **UND**. Brauchen Sie ein "entweder ... oder ...", modellieren Sie **mehrere Verbindungen** mit je eigenem Waechter (oder eine [Automatisierung](automatisierungen.md#aktionen) mit `erste Uebereinstimmung`, die wie ein wenn/sonst wirkt).

---

## Entwickler-Anhang

Technische Entsprechungen der oben beschriebenen Konzepte mit Datei-Verweisen.

### Tool-Platzierung (Schema & Teilnehmer-Auswertung)

- Kollektionen: `tools_forms` (`connection_id`, `stage_id`), `tools_edit` (`connection_id`, `stage_id[]`, `is_global`, `self_edit_roles`, `any_edit_roles`), `tools_protocol` (`connection_id`, `stage_id[]`, `is_global`).
- Unterscheidung: `connection_id` gesetzt = an einer Verbindung (Self-Loop, wenn `from_stage_id == to_stage_id`); `stage_id` gesetzt + `connection_id` leer = Stufen-Tool; Formular mit beidem leer bzw. Edit/Protokoll mit `is_global = true` = global.
- Teilnehmer-Auswertung ("was kann ich jetzt tun"): `src/routes/(participant)/map/modules/workflow-instance-detail/state.svelte.ts` -- `availableConnections` (~200, gefiltert per `connectionIsAvailable`), `availableStageForms` (~231), `availableStageEditTools` (~253), `getProtocolToolsForStage`/`getProtocolToolsForConnection` (~789), `getToolsForConnection` (~854). Aktionsleiste: `WorkflowInstanceDetailModule.svelte` (~370); `proceedConnection()` (~532) faehrt die Tool-Queue ab und ruft dann `executeTransition()`.

### Waechter (Sentry)

- Speicherung: `workflow_connections.sentry` (JSON, nullbar). Klausel: `{ field_def_id, op, value? }`. Operatoren: `equals`, `not_equals`, `contains`, `is_empty`, `is_not_empty`, `gt`, `gte`, `lt`, `lte` (`value` entfaellt bei den unaeren). Alle Klauseln sind **UND**-verknuepft; leer/null = immer verfuegbar.
- Auswertung: `src/lib/workflow-builder/sentry.ts` → `connectionIsAvailable(connection, ctx)`. Geraeteseitig, live, offline; bei Beobachtungs-Feldern zaehlt der zuletzt erfasste Wert (`recorded_at`). Orthogonal zu `allowed_roles`.
- `SentryClause` existiert doppelt (Builder + Participant-State) -- beide muessen synchron bleiben: `src/lib/workflow-builder/types.ts`, `src/lib/participant-state/types.ts`.

### Bedingte Sichtbarkeit (Formularfeld ein-/ausblenden)

- Speicherung: `tools_form_field_refs.config.conditional_logic.show_if`. Operatoren: `equals`, `not_equals`, `includes`, `not_includes`, `is_empty`, `is_not_empty` sowie verschachtelbares `and` / `or`.
- Auswertung: `src/lib/form-engine/conditional-logic.ts` → `evaluateShowIf(logic, values)` (geraeteseitig, im `FormRenderer`).

### Smart Dropdown (abhaengige Auswahl)

- Feldtyp `smart_dropdown`. `field_options`: `{ source_field, source_stage_id?, mappings: [{ when, options }], allow_multiple? }`.
- Auswertung: `src/lib/components/form-renderer/FieldRenderer.svelte`. Statische Zuordnung, eine Ebene.

### Automatisierung

- Kollektion `tools_automation`: `trigger_type` ∈ `on_transition | on_field_change | scheduled`; Bedingungen je Schritt (`field_value` / `instance_status` / `current_stage`) mit `AND`/`OR`; Aktionen `set_stage` / `set_field_value` / `set_instance_status`; `execution_mode` ∈ `run_all | first_match` (= wenn/sonst).
- **Keine** Aktion zum Erzeugen von Eintraegen. Auswertung/Backend: `pb/pb_hooks/automation.js`, Verdrahtung in `pb/pb_hooks/main.pb.js` (Hooks fuer Stufenwechsel/Feldaenderung + Cron fuer `scheduled`).

### Berechnetes Feld

- `workflow_field_defs.write_mode = 'computed'`, `compute_expression`, `compute_depends_on[]`. Ausdrucks-Engine (Arithmetik, `{field_def_id}`-Referenzen, Funktionen wie `count/min/max/sum/avg/round/if_empty/today/date_add/days_between` und Beobachtungs-Aggregate `obs_count/obs_last/obs_avg/...`): `pb/pb_hooks/automation.js`.

### instance_reference (Subprozess, Phase 4)

- `field_options`: `{ target_workflow_id, multiplicity, on_delete, relation_kind }`. Migration `pb/pb_migrations/1779300000_instance_reference.js`. Nur Schema -- keine Teilnehmer-Oberflaeche, kein Dereferenzieren in der Ausdrucks-Engine, kein transitiver Offline-Sync.
