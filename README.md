# Überblick

Wörtlich genommen bedeutet Überblick genau das: Ein Blick von oben. Auf irgendetwas. Wie wäre es mit einem Blick auf deine Daten?
Überblick hilft dir und deinem Team raumbezogene Daten zu verwalten und verbindet sie mit kollaborativen Prozessen.
Dafür definieren Admins die Prozesse die jeder Punkt auf der Karte durchleben soll und eine Teilnehmer Anwendung generiert sich aus den definierten Prozessen. Überblick ist bewusst so gebaut, dass leichte und selbsterklärende Anwendungen gebaut werden können.


## Du bekommst hier 2 Anwendungen


**Überblick** ist die Teilnehmer-App. Sie ist responsiv, fürs Smartphone gebaut
und gibt dir eine Karte zum Arbeiten. Das ist die App für den Einsatz vor Ort.
Sie läuft im Browser, funktioniert offline und lässt sich als PWA installieren.
Teilnehmer installieren nichts weiter. Sie scannen einen QR-Code und legen los. Als Gäste oder auch als ausgewiesene Teilnehmer.

**Überblick SECTOR** ist die Admin-App. SECTOR steht für Spatial Engine
Coordinating Teams, Operations & Records. Hier baust du die Workflows, Rollen
und Karten, aus denen sich die Teilnehmer-App automatisch zusammensetzt.

Marker auf der Karte müssen nicht statisch sein. Du legst fest, wer welche
Aktion an welchem Datensatz ausführen darf, welche Rolle welche Daten sieht,
wer einen Marker setzen darf, wer eine Kartenebene sieht und wer welche Felder
ändert. Wenn nötig, definierst du Automationen, die im Hintergrund ablaufen.
Daher der Name: SECTOR gibt dir präzise Kontrolle darüber, wie deine Nutzer mit
deinen Daten arbeiten.

Für die Teilnehmer fällt dieser Aufbau weg. Sie sehen nur die Werte, die sie
sehen dürfen, und nur Buttons für Aktionen, die sie ausführen dürfen. Das
Prinzip ist von CMMN und BPMN inspiriert: Jeder bekommt zum richtigen Zeitpunkt
genau die Werkzeuge, die er gerade braucht. So erledigt jede Person ihre
Aufgaben, ohne den Overhead komplizierter Datenmodelle.


## Was du in SECTOR konfigurierst

- **Projekte** bündeln Workflows, Rollen, Karten, Stammdaten und Teilnehmer.
  Projekte sind voneinander getrennt. [Mehr](docs/handbuch/projekte.md)
- **Workflows** bestehen aus Stufen und Übergängen. Übergänge werden zu Buttons
  in der App. Ein Workflow kann kartenbasiert sein, dann ist jeder Vorgang ein
  Punkt auf der Karte. Oder kartenlos für reine Formular-Abläufe.
  [Mehr](docs/handbuch/workflows.md)
- **Formulare und Werkzeuge** hängst du an Stufen oder Übergänge. Formulare
  erfassen Daten. Bearbeitungs-Werkzeuge korrigieren ohne Stufenwechsel.
  Protokoll-Werkzeuge erfassen wiederkehrende Kontrollen.
  [Formulare](docs/handbuch/formulare.md), [Tools](docs/handbuch/tools.md)
- **Rollen** steuern den Zugriff. Jede Stufe, jeder Übergang, jedes Formular,
  jede Kartenebene und jede Tabelle lässt sich pro Rolle freigeben.
  [Zugriffskontrolle](docs/handbuch/zugriffskontrolle.md)
- **Automatisierungen** reagieren auf Statuswechsel, Feldänderungen oder einen
  Zeitplan. Eine Regel setzt Felder, ändert den Status oder verschiebt einen
  Vorgang. Beispiel: Erledigte Vorgänge nach 14 Tagen archivieren.
  [Mehr](docs/handbuch/automatisierungen.md)
- **Stammdaten-Tabellen** sind projekteigene Nachschlagewerke, etwa eine
  Baumarten-Liste. Formulare greifen darauf zu und bieten den Teilnehmern
  passende Auswahlen. [Mehr](docs/handbuch/custom-tables.md)
- **Karten und Offline-Pakete** kombinieren Kachel- und WMS-Quellen. Du legst
  pro Rolle fest, welche Ebenen sichtbar sind. Für den Einsatz ohne Netz
  definierst du eine Region und einen Zoom-Bereich. Teilnehmer laden das Paket
  und arbeiten offline weiter. [Karten](docs/handbuch/karten.md),
  [Offline und Sync](docs/handbuch/offline-und-sync.md)
- **Teilnehmer** brauchen keinen Benutzernamen und kein Passwort. Du erzeugst
  sie mit einer Rolle und exportierst einen QR-Code.
  [Mehr](docs/handbuch/rollen-und-teilnehmer.md)

## Schnellstart

Selbst hosten mit Docker:

```bash
cp .env.example .env
# POCKETBASE_ADMIN_EMAIL und POCKETBASE_ADMIN_PASSWORD eintragen
docker-compose up --build
```

Das Frontend läuft danach auf http://localhost:8080. Das PocketBase-Admin-UI
bleibt verborgen. Setze `EXPOSE_PB_ADMIN=true` in der `.env`, um es unter `/_/`
zu öffnen.

Lokal entwickeln, Backend und Frontend in zwei Terminals:

```bash
npm install
npm run backend   # PocketBase auf :8090
npm run dev       # Vite auf :5173
```

Weitere Skripte: `npm run check`, `npm run lint`, `npm run test:unit`,
`npm run test:e2e` und `npm run db:clear`, um die lokalen PocketBase-Daten zu
verwerfen.

## Dokumentation

- [Handbuch](docs/handbuch/index.md): Konzepte für Admins und Projektmanager.
- [Was sieht der Teilnehmer?](docs/handbuch/teilnehmer-sicht.md): Matrix von
  Admin-Einstellung zu Teilnehmer-Erlebnis.
- [Tutorials](docs/tutorials/index.md): Schritt für Schritt zum ersten Workflow.
- [Referenz](docs/reference/admin-cheatsheet.md): Jedes Admin-Feld im Detail.
- [Entwicklung](docs/dev/index.md): Architektur und Konventionen.

## Tech-Stack

SvelteKit 5 und Svelte 5 im Frontend, Tailwind 4 und Leaflet für die Karte.
PocketBase (Go) im Backend. Offline-Daten über IndexedDB. Formulare mit
Superforms und Zod. Übersetzungen über Paraglide (Deutsch, Englisch). Tests mit
Vitest und Playwright.

## Lizenz

AGPL v3. Siehe `LICENSE`.
