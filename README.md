# Überblick

Kartenbasierte Prozesssteuerung mit Offline-Synchronisation und rollenbasierter Zugriffskontrolle

## Zusammenfassung

Überblick ist eine offene, selbst hostbare Kartenanwendung zur Abbildung räumlicher Arbeitsabläufe. Die Anwendung richtet sich an Organisationen, die Tätigkeiten im Feld koordinieren bspw. Gebäudemanagement, kommunale Infrastrukturpflege, Bauprojekte, Reinigungsdienste oder Vermessungsarbeiten.

Überblick besteht aus zwei Komponenten: einer mobilen Teilnehmeranwendung für den Einsatz vor Ort und Überblick SECTOR (Spatial Engine for Collaboration and Task Orchestration with Role-scoped Data Access). Welche die administrative Konfigurationsoberfläche darstellt. In Überblick SECTOR werden Karten, Workflows, Rollen und Berechtigungen definiert die Teilnehmeranwendung generiert sich daraus automatisch.

---

## Funktionsumfang

### Kartenverwaltung

Administratoren laden eigene Kartendaten hoch -- Gebäudegrundrisse, Lagepläne, Katasterkarten oder beliebige georeferenzierte Daten. Überblick unterstützt gängige Geodatenformate und ermöglicht die Darstellung mehrerer Layer übereinander. Teilnehmer können Kartenpakete auf ihr Endgerät herunterladen und vollständig offline nutzen.

### Workflow-Definition

Arbeitsprozesse werden in Überblick SECTOR als Zustandsmodelle definiert. Jeder Punkt auf der Karte durchläuft festgelegte Stufen. Der Übergang zwischen Stufen wird durch Aktionen ausgelöst -- etwa das Ausfüllen eines Formulars, eine Statusänderung oder eine automatisierte Hintergrundaktion wie der Versand einer E-Mail oder Benachrichtigung. Die gesamte Konfiguration erfolgt visuell über einen Drag-and-Drop-Editor. Programmierkenntnisse sind nicht erforderlich.

### Rollenbasierte Zugriffskontrolle

Überblick trennt Daten strikt nach Rollen. Teilnehmer sehen ausschließlich die Informationen, die für ihre Zuständigkeit relevant sind. Interne Prozesszustände können von externen Ansichten entkoppelt werden -- so bleiben betriebsinterne Abläufe geschützt, während Dienstleister oder Partner nur die für sie bestimmten Daten erhalten.

### Offline-Betrieb und Synchronisation

Die Teilnehmeranwendung ist für den Einsatz ohne durchgängige Netzverbindung konzipiert. Nach dem Herunterladen eines Kartenpakets arbeiten Teilnehmer vollständig offline -- in Untergeschossen, auf weitläufigen Geländen oder in Gebieten ohne Mobilfunkabdeckung. Bei Wiederherstellung der Verbindung synchronisiert die Anwendung automatisch alle erfassten Daten mit dem Server. Die Synchronisation erfolgt konfliktfrei über eine eigens entwickelte Sync-Engine.

### Versionierung und Audit Trail

Sämtliche Änderungen an Datenpunkten und Workflowzuständen werden versioniert und mit Zeitstempel sowie Benutzerkennung protokolliert. Der lückenlose Audit Trail ermöglicht die vollständige Nachvollziehbarkeit aller Vorgänge -- eine Voraussetzung für den Einsatz in regulierten Umgebungen und bei öffentlichen Auftraggebern.

### Visuelle Konfiguration

Überblick SECTOR stellt einen visuellen Editor bereit, über den Workflows, Formulare und die gesamte Teilnehmeroberfläche konfiguriert werden. Was in SECTOR definiert wird, rendert die mobile Anwendung automatisch als einsatzfertige Benutzeroberfläche -- angepasst an die jeweilige Rolle des Teilnehmers.

---

## Betrieb und Bereitstellung

Überblick ist Open Source und kann auf eigener Infrastruktur betrieben werden. Alternativ bieten wir gehostete Instanzen an. Jeder Mandant erhält dabei eine dedizierte Instanz mit eigener Datenbank in einem isolierten Container. Eine Vermischung von Kundendaten findet nicht statt.

Die Anwendung basiert auf PocketBase als Backend und Svelte als Frontend-Framework. Der Betrieb erfordert keine komplexe Infrastruktur -- eine einzelne Serverinstanz genügt.

---

## Einsatzbeispiele

**Gebäudereinigung.** Räume werden als Punkte auf dem Gebäudeplan dargestellt. Reinigungskräfte sehen ihre zugewiesenen Bereiche, dokumentieren die Durchführung per Formular und der Auftraggeber erhält den aktuellen Status -- ohne Einblick in interne Personalplanung.

**Kommunale Infrastruktur.** Straßenschäden, Grünflächenpflege oder Spielplatzinspektionen werden räumlich erfasst, mit Workflows versehen und über Rollen an die zuständigen Abteilungen verteilt.

**Bauprojekte.** Gewerke werden auf dem Lageplan verortet, Abnahmen als Workflow-Stufen abgebildet. Der Bauleiter konfiguriert den Prozess in SECTOR, Subunternehmer arbeiten mit Überblick auf der Baustelle -- auch ohne WLAN.

**Vermessung und Feldforschung.** Messpunkte oder Erhebungsstandorte werden auf eigenen Karten markiert. Erfasste Daten synchronisieren automatisch, sobald das Feldteam wieder im Netzbereich ist.

---

## Technische Eckdaten

| Eigenschaft | Details |
|---|---|
| Lizenz | Open Source |
| Backend | PocketBase |
| Frontend | Svelte |
| Geodaten | GeoJSON, eigene Kartenuploads |
| Offline | Eigene Sync-Engine, lokale Kartenpakete |
| Mandantentrennung | Dedizierte Instanzen, isolierte Container |
| Audit | Vollständige Versionierung mit Zeitstempel und Benutzerkennung |

---

Überblick -- Kartenbasierte Prozesssteuerung. Offline-fähig. Rollenbasiert. Open Source.
