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

Es gibt gute Tools mit denen sich Karten bauen lassen und Überblick versucht nicht diese zu ersetzen. Im Gegenteil, für diene Daten gibt es keinen Lock in. Du kannst Sie immer exportieren und in anderer Software analysieren oder weiter verarbeiten. Was wir schaffen wollen, ist ein Interface mit dme Leute auch arbeiten können. So, dass Marker auf der Karte nicht statisch sein müssen. Du legst fest, wer welche
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
