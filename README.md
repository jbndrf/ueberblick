# Überblick

Überblick ist eine Open-Source-Plattform für die Verwaltung raumbezogener
Geodaten und deren Verknüpfung mit kollaborativem Prozessmanagement.
Angelegte Prozesse resultieren automatisch in einer mobilen, offline-fähigen
Anwendung. Die Webanwendung erlaubt es Benutzern ohne Installation einer
Anwendung, in der ihnen zugewiesenen Rolle an einem Prozess teilzunehmen.
So wird jeder Punkt auf der Karte ein lebendiger Vorgang mit einem Anfang
und einem Ende. Oder, sofern gewünscht: keinem Ende. So lassen sich bspw.
Bürgermeldungen von der Aufnahme bis zur Erledigung abbilden oder auch
regelmäßige Begehungen mit definierten Protokollierungen und
Eskalationsstufen anlegen.

Wir möchten mit Überblick eine bunte Community schaffen, die
es einer Vielzahl von Nutzern erlaubt, ihre eigenen Anwendungen zu
erstellen, mit deren Hilfe sie ihre räumlichen Daten pflegen können.

Lizenz: AGPL v3.


## Die zwei Oberflächen

Überblick besteht aus zwei Teilen, die zusammengehören. Überblick **SECTOR** (Spatial
Engine for Collaboration, Task Orchestration and Role-Based Access) ist die
Admin-Oberfläche. Hier legen Sie Projekte an, konfigurieren Karten, Rollen,
Stammdaten und Arbeitsprozesse. **Überblick** ist die Teilnehmer-App, welche für
Smartphones konzipiert und offline-fähig ist. Sie kann außerdem als PWA installiert werden. Die Teilnehmer-App rendert sich
vollständig aus der Projektkonfiguration, die Sie in SECTOR angelegt haben.
Sie müssen also keine eigene Oberfläche für Ihre Teilnehmer bauen. So können Sie beliebig komplizierte Prozesse abbilden und Endnutzer werden sauber durch den Prozess durch geleitet, da die Anwendung keine Handlungsmöglichkeiten anzeigt (und auch nicht erlaubt), die nicht für den jeweiligen Punkt anstehen. Jede Rolle sieht nur, was sie im aktuellen Schritt bedienen darf.
Die Teinehmer-App ist bewusst darauf ausgelegt durch wenige UI Elemente nicht zu überfordern, aber gleichzeitig vollständige Funktionalität zu ermöglichen. Darüber hinaus werden langfristig Opt-in Funktionalitäten hinzugefügt, die jeder Teinehmer selbst aktivieren kann.


## Wie die Teilnehmer-UI entsteht

Stellen Sie sich eine Schadensmeldung an einer Ampel vor. Ein Bürger öffnet
die Teilnehmer-App, tippt auf die Karte und meldet den Schaden. Danach
sieht er nur noch, dass sein Vorgang gemeldet ist. Er kann ihn nicht
verändern, weil Sie im Workflow für die öffentliche Rolle keine weiteren
Aktionen vorgesehen haben.

Ein Disponent öffnet denselben Vorgang und sieht zwei Buttons: Übernehmen
und Ablehnen. Mehr nicht, weil der Workflow an dieser Stufe für die Rolle
Disponent genau diese beiden Übergänge vorsieht. Weder Priorität noch
Termin tauchen auf, denn diese Felder sind der nächsten Stufe zugeordnet.

Nach dem Klick auf Übernehmen wandert der Vorgang in die nächste Stufe.
Jetzt sieht der zuständige Techniker die Felder für Priorität, Termin und
Material, und erst jetzt. Der Bürger von oben sieht währenddessen nur noch
den Hinweis "In Bearbeitung". Alles andere existiert für ihn schlicht
nicht.

Der entscheidende Punkt ist, dass Sie diese drei Ansichten nicht einzeln
gebaut haben. Sie haben einen Workflow konfiguriert und Rollen vergeben.
Die Teilnehmer-App leitet daraus automatisch ab, was jeder Teilnehmer an
jedem Punkt zu sehen bekommt.


## Was Sie in SECTOR konfigurieren

Ein **Projekt** bündelt alles, was zu einem Einsatzzweck gehört. Es enthält
Workflows, Rollen, Karten, Stammdaten und Teilnehmer. Teilnehmer aus
Projekt A sehen nichts von Projekt B.

Ein **Workflow** beschreibt einen Ablauf aus Stufen und Übergängen. Eine
Schadensmeldung könnte durch "Gemeldet", "In Bearbeitung" und "Erledigt"
laufen. Eine Baumkontrolle durch "Geplant", "Begangen", "Kontrolliert".
Übergänge sind Buttons in der Teilnehmer-App mit eigenem Text, eigener
Farbe und optionaler Bestätigungsabfrage. Workflows können kartenbasiert
sein, dann ist jeder Vorgang ein Marker, oder kartenlos als reine
Formular-Abläufe etwa für Checklisten.

**Formulare und Werkzeuge** hängen Sie an Stufen oder Übergänge. Ein
Formular öffnet sich beim Übergang, ein Bearbeitungs-Werkzeug erlaubt
Korrekturen ohne Stufenwechsel. Protokoll-Werkzeuge eignen sich für
wiederkehrende Kontrollen und schreiben einen eigenen Eintrag neben dem
lebenden Vorgang.

**Rollen** legen fest, wer was darf. Jede Workflow-Stufe, jeder Übergang,
jedes Formular, jede Karten-Ebene und jede Stammdaten-Tabelle lässt sich
pro Rolle freigeben oder sperren. Ein leeres Rollenfeld bedeutet
"sichtbar für alle Teilnehmer im Projekt".

**Automatisierungen** reagieren auf Statuswechsel, Feldänderungen oder
einen Zeitplan. Eine Regel kann Felder setzen, den Status ändern oder
einen Vorgang in eine andere Stufe schieben. So archivieren Sie zum
Beispiel erledigte Vorgänge nach vierzehn Tagen automatisch.

**Stammdaten-Tabellen** (Custom Tables) sind projekteigene Nachschlagewerke,
etwa eine Baumarten-Liste oder ein Gebäudeverzeichnis. Formulare können
darauf zugreifen und den Teilnehmern passende Auswahlen anbieten.

**Karten und Offline-Pakete** richten Sie ebenfalls im Projekt ein. Sie
kombinieren beliebige Kachel- oder WMS-Quellen, laden eigene Kachelarchive
hoch und legen pro Rolle fest, welche Ebenen sichtbar sind. Für den Einsatz
ohne Netz definieren Sie eine Region und den gewünschten Zoom-Bereich. Die
Teilnehmer laden das Paket aufs Gerät und arbeiten komplett offline weiter.

**Teilnehmer** erhalten keinen Benutzernamen und kein Passwort. Sie
erzeugen in SECTOR einen Teilnehmer mit Rolle und exportieren einen
QR-Code. Die Teilnehmer scannen diesen QR-Code in der App und sind
angemeldet.


## Tech-Stack

| Bereich | Verwendet |
|---|---|
| Frontend | SvelteKit 5, Svelte 5, Tailwind 4, bits-ui, Leaflet |
| Backend | PocketBase (Go) |
| Offline | IndexedDB (`idb`), `leaflet.offline` |
| i18n | Paraglide (Deutsch, Englisch) |
| Forms | sveltekit-superforms + Zod |
| Tests | Vitest (Unit + Browser), Playwright (E2E) |


## Quickstart

Für einen selbstgehosteten Betrieb kopieren Sie `.env.example` nach `.env`,
tragen `POCKETBASE_ADMIN_EMAIL` und `POCKETBASE_ADMIN_PASSWORD` ein und
starten das Ganze mit Docker Compose:

```bash
cp .env.example .env
docker-compose up --build
```

Das Frontend erreichen Sie danach unter <http://localhost:8080>. Das
PocketBase-Admin-UI bleibt standardmäßig verborgen. Wenn Sie darauf zugreifen
möchten, setzen Sie `EXPOSE_PB_ADMIN=true` in der `.env`. Es liegt dann
unter `/_/`.

Für lokale Entwicklung installieren Sie die Abhängigkeiten und starten
Backend und Frontend in zwei Terminals:

```bash
npm install
npm run backend    # Terminal 1, PocketBase auf :8090
npm run dev        # Terminal 2, Vite auf :5173
```

Weitere Skripte sind `npm run check` (svelte-check), `npm run lint`,
`npm run test:unit`, `npm run test:e2e` und `npm run db:clear`, um die
lokalen PocketBase-Daten zu verwerfen.


## Ersten Vorgang anlegen

Ein typischer Einstieg sieht so aus. Sie legen in SECTOR ein Projekt an
und definieren die Rollen, die in Ihrem Szenario vorkommen, zum Beispiel
Bürger, Disponent und Techniker. Anschließend fügen Sie im Karten-Tab
mindestens eine Kartenebene hinzu (das OSM-Preset reicht für den Start)
und setzen Startposition und Zoom.

Danach bauen Sie Ihren Workflow. Sie legen die Stufen an, ziehen
Verbindungen zwischen ihnen und vergeben pro Verbindung einen Button-Text.
An den Stufen hängen Sie Formulare oder Werkzeuge, und unter Permissions
weisen Sie den Rollen ihre Rechte zu.

Zum Schluss erzeugen Sie Teilnehmer, exportieren die QR-Codes als
Sammel-PDF und verteilen sie. Sobald ein Teilnehmer den Code scannt, ist er
in der App angemeldet und sieht genau die Oberfläche, die sich aus Ihrer
Konfiguration ergeben hat.

Eine vollständige Referenz jedes Admin-Feldes steht in
[`docs/reference/admin-cheatsheet.md`](docs/reference/admin-cheatsheet.md);
konzeptionelle Erklärungen finden Sie im
[Handbuch](docs/handbuch/index.md).


## Projektstruktur

```
src/routes/(admin)/        SECTOR, Admin-Oberfläche
src/routes/participant/    Teilnehmer-App
src/lib/participant-state/ IndexedDB-Speicher und Sync-Queue
src/lib/automation/        Automation-Engine
src/lib/workflow-builder/  Workflow-Builder (Canvas, Formulare, Tools)
src/lib/components/        shadcn-svelte und eigene Komponenten
pb/                        PocketBase-Backend, Migrations, Hooks
messages/                  Paraglide-Übersetzungen (de, en)
e2e/                       Playwright-Tests
docs/                      Handbuch und Entwicklerdokumentation
```


## Roadmap

Die Anwendung ist in aktiver Entwicklung. Als nächste Schwerpunkte sind
Projekt-Templates vorgesehen, mit denen sich wiederkehrende Abläufe wie
Mängelmelder oder Baumkataster als Vorlage teilen lassen. Die
Automation-Engine soll um weitere Aktions- und Bedingungstypen wachsen,
insbesondere um zusätzliche Expression-Funktionen und neue Trigger. Für
Protokolle ist die Anbindung externer Timestamp-Anbieter geplant, um
rechtssichere Nachweise zu ermöglichen. Beim Offline-Betrieb liegt der
Fokus auf robusterer Konfliktlösung, wenn größere Datenmengen nach langen
Offline-Phasen synchronisiert werden.


## Mitwirken

Issues und Pull Requests sind willkommen. Der Code steht unter AGPL v3.
Wer eine modifizierte Version als Service anbietet, muss die Änderungen
ebenfalls unter AGPL veröffentlichen.


## Lizenz

AGPL v3. Siehe `LICENSE`.
