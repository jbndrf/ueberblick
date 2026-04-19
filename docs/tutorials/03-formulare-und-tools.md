# Tutorial 3: Formulare und Tools

> Konzepte: [Formulare](../handbuch/formulare.md) | [Tools](../handbuch/tools.md)

Voraussetzung: [Tutorial 2](02-erster-workflow.md) (Permission Test Workflow mit Entry-Formular, drei Stufen und Verbindungen).

In Tutorial 2 wurde bereits ein einfaches Entry-Formular mit zwei Textfeldern angelegt. Hier erweitern wir den Workflow um weitere Feldtypen, ein Edit Tool und fortgeschrittene Auswahlelemente.

## 1. Entry-Formular erweitern

Oeffne den **Permission Test Workflow** im Workflow-Builder und waehle die **Entry-Verbindung** aus.

Das vorhandene Formular **Initial Report Form** hat bereits die Felder *Report Title* (Short Text) und *Description* (Long Text). Jetzt fuegen wir weitere Felder hinzu.

### Feldtypen-Palette

Links im Formular-Editor befindet sich die Feldtypen-Palette. Klicke auf den Pfeil-Button, um sie aufzuklappen. Verfuegbare Typen:

| Typ in der Palette | Interner Typ | Beschreibung |
|---------------------|--------------|-------------|
| Short Text | `short_text` | Einzeilige Texteingabe |
| Long Text | `long_text` | Mehrzeilige Texteingabe |
| Number | `number` | Numerische Eingabe |
| Email | `email` | E-Mail-Adresse |
| Date | `date` | Datumswahl |
| File | `file` | Datei-Upload |
| Dropdown | `dropdown` | Einzelauswahl aus vordefinierten Optionen |
| Multiple Choice | `multiple_choice` | Mehrfachauswahl |
| Smart Dropdown | `smart_dropdown` | Abhaengige Auswahl |
| Custom Table | `custom_table_selector` | Auswahl aus Projektdaten |

### Felder per Drag-and-Drop hinzufuegen

1. Ziehe **Number** aus der Palette in die Formular-Vorschau
2. Klicke auf das neue Feld, um die Konfiguration zu oeffnen
3. Konfiguriere:
   - Label: **Priority**
   - Pflichtfeld: Ja
   - Validation Rules: Min = `1`, Max = `5`
4. Ziehe **Date** in die Formular-Vorschau
5. Konfiguriere:
   - Label: **Due Date**
   - Pflichtfeld: Nein

### Dropdown-Feld hinzufuegen

1. Ziehe **Dropdown** in die Formular-Vorschau
2. Klicke auf das Feld und konfiguriere:
   - Label: **Category**
   - Pflichtfeld: Ja
   - Optionen (unter `field_options.choices`): **Infrastructure**, **Safety**, **Environment**

### Aktueller Stand des Entry-Formulars

| Feld | Typ | Pflichtfeld |
|------|-----|:-----------:|
| Report Title | Short Text | Ja |
| Description | Long Text | Ja |
| Priority | Number | Ja |
| Due Date | Date | Nein |
| Category | Dropdown | Ja |

## 2. Smart Dropdown konfigurieren

Ein Smart Dropdown zeigt verschiedene Optionen je nach Wert eines anderen Feldes. Wir legen ein Feld an, dessen Optionen vom zuvor erstellten **Category**-Dropdown abhaengen.

1. Ziehe **Smart Dropdown** aus der Palette in das Formular
2. Klicke auf das Feld und konfiguriere:
   - Label: **Subcategory**
   - Pflichtfeld: Ja
3. Im Bereich **Source Field** waehle das Feld **Category** aus der Liste der vorhergehenden Felder
4. Definiere die Zuordnungen (Mappings):

| Wenn Category = | Optionen |
|-----------------|----------|
| Infrastructure | Road, Bridge, Building, Utilities |
| Safety | Fire Hazard, Structural Risk, Electrical |
| Environment | Water Quality, Air Quality, Waste |

Jedes Mapping hat ein `when`-Feld (der Wert des steuernden Feldes) und ein `options`-Array (die angezeigten Optionen). Die Teilnehmer sehen im Formular nur die Optionen, die zum gewaehlten Category-Wert passen.

## 3. Custom Table Selector

Der Custom Table Selector ermoeglicht die Auswahl aus Projektdaten (Custom Tables, Marker-Kategorien, Teilnehmer oder Rollen).

### Vorbereitung: Custom Table anlegen

Bevor der Selector verwendet werden kann, muss eine Custom Table existieren:

1. Navigiere in der Seitenleiste zu **"Custom Tables"**
2. Klicke auf **"Tabelle erstellen"**
3. Name: **Locations**, Beschreibung: **Known project locations**
4. Fuege Spalten hinzu und trage einige Zeilen ein

### Selector-Feld im Formular

1. Oeffne erneut das Entry-Formular im Workflow-Builder
2. Ziehe **Custom Table** aus der Palette in das Formular
3. Klicke auf das Feld und konfiguriere:
   - Label: **Location**
   - Source Type: `custom_table`
   - Tabelle: **Locations**
   - Display Column: die Spalte, die als Auswahltext angezeigt werden soll

Andere Source-Typen (`source_type`):

| Source Type | Beschreibung |
|-------------|-------------|
| `custom_table` | Zeilen aus einer Custom Table |
| `marker_category` | Marker-Kategorien des Projekts |
| `participants` | Teilnehmer des Projekts |
| `roles` | Rollen des Projekts |

## 4. Edit Tool an einer Stufe

Ein Edit Tool erlaubt Teilnehmern, vorhandene Felder nachtraeglich zu bearbeiten. Es kann an Stufen, Verbindungen oder global angehaengt werden.

### Edit Tool an der Stufe "Review" hinzufuegen

1. Klicke im Workflow-Builder auf die Stufe **"Review"**
2. In der linken Seitenleiste erscheint die Rubrik **"Stage Tools"**
3. Klicke auf **"Edit Fields"** (Beschreibung: *Allow editing existing fields*)
4. Der Edit-Tool-Editor oeffnet sich rechts
5. Waehle die Felder aus, die bearbeitbar sein sollen:
   - **Priority** -- der Supervisor kann die Prioritaet anpassen
   - **Due Date** -- das Faelligkeitsdatum kann aktualisiert werden
6. Die uebrigen Felder (Report Title, Description, Category, Subcategory) bleiben schreibgeschuetzt

### Konfiguration des Edit Tools

Das Edit Tool hat zwei Modi (`edit_mode`):

| Modus | Beschreibung |
|-------|-------------|
| `form_fields` | Ausgewaehlte Formularfelder bearbeiten |
| `location` | Standort der Instanz aendern (nur bei `incident`-Typ) |

In unserem Fall verwenden wir `form_fields`.

### Ergebnis in der Teilnehmer-App

Wenn ein Supervisor die Stufe **Review** oeffnet, sieht er neben dem Transition-Button (Review --> Resolved) einen zusaetzlichen Button. Beim Klick werden nur die freigegebenen Felder (Priority, Due Date) zur Bearbeitung angeboten.

## 5. Formular an einer Verbindung

Formulare koennen auch an regulaeren Verbindungen angehaengt werden. So muss der Teilnehmer beim Stufenwechsel Daten eingeben.

### Formular fuer die Verbindung Review --> Resolved

1. Klicke auf die Verbindung **"review-to-resolved"** im Workflow-Builder
2. In der linken Seitenleiste unter **"Connection Tools"** klicke auf **"Form"** (Beschreibung: *Collect data via form fields*)
3. Der Formular-Editor oeffnet sich. Benenne das Formular: **Review Summary**
4. Fuege Felder hinzu:
   - **Resolution** -- Typ: Long Text, Pflichtfeld: Ja
   - **Resolved By** -- Typ: Custom Table (Source Type: `participants`), Pflichtfeld: Ja
5. Speichere

Wenn ein Supervisor oder Analyst nun den Button **review-to-resolved** klickt, muss er zuerst dieses Formular ausfuellen, bevor der Stufenwechsel durchgefuehrt wird.

## Zusammenfassung

| Tool | Anhaengepunkt | Wer | Was |
|------|--------------|-----|-----|
| Initial Report Form (erweitert) | Entry-Verbindung | Supervisor | 7 Felder inkl. Smart Dropdown und Custom Table Selector |
| Edit Tool | Stufe Review | Alle (oder per `allowed_roles` einschraenkbar) | Priority und Due Date bearbeiten |
| Review Summary | Verbindung review-to-resolved | Supervisor, Analyst | Resolution und Resolved By erfassen |

Weiter: [Tutorial 4 -- Automatisierungen](04-automatisierungen.md)
