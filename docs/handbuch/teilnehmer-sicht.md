# Was sieht der Teilnehmer?

Zentrale Referenz: Was bewirkt jede Admin-Einstellung in der Teilnehmer-App?

## Workflow-Sichtbarkeit

| Admin-Einstellung | Teilnehmer sieht... |
|---|---|
| Workflow inaktiv | Workflow komplett unsichtbar. Keine Marker, kein Eintrag in der Auswahl. |
| Workflow aktiv | Workflow in der Auswahl, Marker auf Karte. |
| Einstiegsrollen leer | "+"-Button fuer alle Teilnehmer. |
| Einstiegsrollen gesetzt | "+"-Button nur fuer Teilnehmer mit passender Rolle. |
| Private Instanzen aktiv | Nur eigene Instanzen sichtbar. |

## Workflow-Typ

| Typ | Teilnehmer-Erlebnis |
|---|---|
| Kartenbasiert (incident) | Standortwahl auf Karte **vor** dem Formular. Instanz erscheint als Marker. |
| Formular (survey) | Formular oeffnet sich direkt. Kein Marker auf der Karte. |

## Stage-Sichtbarkeit

| Admin-Einstellung | Teilnehmer sieht... |
|---|---|
| Stage-Name | **Immer sichtbar** in Zeitleiste (strukturelle Transparenz). |
| Aktuelle Stage | **Immer sichtbar** -- Teilnehmer weiss, wo die Instanz steht. |
| Fortschritt | **Immer sichtbar** -- "Stage 2 von 4". |
| Stufensichtbarkeit leer | Formulardaten dieser Stage fuer alle sichtbar. |
| Stufensichtbarkeit gesetzt | Formulardaten nur fuer ausgewaehlte Rollen. Andere sehen Stage-Name, aber keine Daten. |

## Connection-Buttons

| Admin-Einstellung | Teilnehmer sieht... |
|---|---|
| Rollenfeld leer | Button fuer alle sichtbar. |
| Rollen gesetzt | Button nur fuer passende Rollen. Andere sehen keinen Button. |
| Button-Text gesetzt | Button mit dem konfigurierten Text (z.B. "Genehmigen"). |
| Button-Farbe gesetzt | Farbiger Button (z.B. gruen fuer Bestaetigungen, rot fuer Ablehnungen). |
| Bestaetigung aktiv | Bestaetigungsdialog vor Ausfuehrung. |

## Tool-Sichtbarkeit

| Szenario | Teilnehmer sieht... |
|---|---|
| Tool an Verbindung | Kein eigener Button. Tool laeuft beim Klick auf den Verbindungs-Button. |
| Tool an Stufe (Rollen leer) | Eigener Button auf dieser Stufe fuer alle. |
| Tool an Stufe (Rollen gesetzt) | Button nur fuer passende Rollen. |
| Globales Bearbeitungs-Tool | Button auf **jeder** Stufe. |
| Bearbeitung: Felder | Zeigt nur Felder aus bereits durchlaufenen Stufen. |
| Bearbeitung: Standort | Kartenansicht zum Verschieben des Markers. |

## Formular-Darstellung

| Admin-Einstellung | Teilnehmer sieht... |
|---|---|
| Pflichtfeld aktiv | Feld mit Pflichtfeld-Markierung, Absenden blockiert ohne Wert. |
| Platzhalter gesetzt | Grauer Hinweistext im leeren Feld. |
| Hilfetext gesetzt | Kleiner Text unter dem Feld. |
| Mehrseitiges Formular | Seiten-Navigation (Weiter/Zurueck). |
| Position links/rechts | Zwei Felder nebeneinander (Desktop). Auf Mobile: untereinander. |
| Datenauswahl | Dropdown mit Eintraegen der referenzierten Tabelle. |
| Abhaengige Auswahl | Optionen aendern sich basierend auf Wert eines anderen Feldes. |

## Karten-Darstellung

| Admin-Einstellung | Teilnehmer sieht... |
|---|---|
| Layer inaktiv | Layer nicht verfuegbar. |
| Layer aktiv | Layer im Layer-Switcher schaltbar. |
| Kein Hintergrund-Layer aktiv | Leere Karte (Fehler). |
| Kartenstandards (Zentrum/Zoom) | Karte oeffnet sich an dieser Position. |
| Offline-Paket vorhanden | Kartenbereich auch ohne Internet verfuegbar. |

## Automatisierungen aus Teilnehmersicht

Automatisierungen laufen unsichtbar im Hintergrund. Der Teilnehmer bemerkt nur die Auswirkungen:

| Automatisierung | Was der Teilnehmer sieht |
|---|---|
| Stufe setzen | Instanz springt in eine andere Stufe. |
| Feldwert setzen | Feldwert aendert sich (z.B. berechnetes Feld). |
| Status aendern | Status aendert sich (z.B. automatisch abgeschlossen). |
| Zeitgesteuert (Cron) | Aenderungen treten zum Zeitpunkt des naechsten Laufs ein. |

---

## Haeufige Szenarien und Tipps

### Szenarien

**"Nur Manager duerfen genehmigen"** -- Rollen der Verbindung zur Genehmigungs-Stufe auf "Manager" setzen.

**"Interne Pruefungsdaten verbergen"** -- Stufensichtbarkeit der Pruefungs-Stufe auf die gewuenschten Rollen setzen. Andere sehen den Stufennamen, aber keine Daten.

**"Alle duerfen melden, nur Inspektoren pruefen"** -- Einstiegsrollen leer lassen (alle duerfen anlegen), Verbindung zur Pruefung nur fuer Inspektoren freigeben.

**"Feld nach Einreichung bearbeitbar"** -- Bearbeitungs-Tool auf der gewuenschten Stufe. Modus "Felder bearbeiten", Felder auswaehlen, Rollen festlegen.

**"Kartenstandort nachtraeglich aendern"** -- Bearbeitungs-Tool mit Modus "Standort" auf der gewuenschten Stufe.

**"Instanzen nach 7 Tagen automatisch abschliessen"** -- Zeitgesteuerte Automatisierung: taeglich, Inaktivitaet 7 Tage, Aktion: Status auf "abgeschlossen".

**"Summe aus Feldern berechnen"** -- Automatisierung mit Trigger "Bei Feldaenderung" auf das Mengen-Feld, Aktion: Feldwert setzen mit Ausdruck.

**"Kreislauf ohne Endpunkt"** -- Zwei Stufen: Offen (Start) und Erledigt (Intermediate, nicht End). Verbindungen in beide Richtungen. Zeitgesteuerte Automatisierung setzt Erledigt zurueck auf Offen.

### Stolperfallen

- **Entry-Verbindung nicht sichtbar** -- Entry-Verbindungen erscheinen nicht als Pfeil auf dem Canvas. Konfiguration ueber die Startstufe anklicken.
- **Stufensichtbarkeit geaendert -- wirkt sofort** -- Aenderungen gelten sofort fuer alle bestehenden Daten, nicht nur fuer zukuenftige.
- **Ersteller sieht eigene Daten nicht** -- Es gibt kein Ersteller-Privileg. Loesung: Rolle des Erstellers in der Stufensichtbarkeit aufnehmen.
- **Bearbeitungs-Tool zeigt keine Felder** -- Bearbeitungs-Tools zeigen nur Felder aus Stufen, die der Eintrag bereits durchlaufen hat.
- **Automatisierung loest nicht aus** -- Zeitgesteuert: Minimum 15 Minuten. Pruefen: Ist sie aktiviert? Stimmt die Ziel-Stufe? Stimmen die Bedingungen?

### Tipps

- **Iterativ arbeiten.** Zuerst alle Rollenfelder leer lassen (alles offen), Workflow verifizieren, dann schrittweise einschraenken.
- **Berechtigungsuebersicht nutzen.** Unter Rollen > Tab "Berechtigungen" sehen Sie auf einen Blick, welche Rolle was darf -- und koennen dort direkt toggeln.
- **Mit verschiedenen Rollen testen.** Test-Teilnehmer pro Rolle anlegen und durchspielen.
- **Stage Preview nutzen.** Im Builder eine Stufe anklicken -- zeigt die Teilnehmersicht mit Buttons und Tools.
- **Regelmaessig speichern.** Der Builder haelt Aenderungen im Speicher. Ungespeicherte Aenderungen gehen beim Schliessen verloren.
- **Self-Loops fuer Bearbeitungen.** Verbindung von einer Stufe zu sich selbst + Bearbeitungs-Tool = Bearbeitung ohne Stufenwechsel.
