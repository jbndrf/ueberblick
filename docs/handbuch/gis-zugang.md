# GIS-Zugang (QGIS / API-Token)

Ueberblick kann die Daten eines Projekts schreibgeschuetzt als GeoJSON bereitstellen, sodass Sie sie in externen GIS-Programmen wie QGIS weiterverarbeiten koennen. Der Zugriff erfolgt ueber einen persoenlichen API-Token, den Sie selbst erstellen und jederzeit widerrufen koennen.

## API-Token erstellen

Sie finden den Zugang in den **Projekt-Einstellungen** in der Gruppe **Integrationen** unter **QGIS-/GIS-Zugang**.

1. Vergeben Sie eine **Bezeichnung**, an der Sie den Token spaeter wiedererkennen (z.B. "Mein Laptop QGIS").
2. Optional koennen Sie ein **Ablaufdatum** festlegen. Ohne Ablaufdatum bleibt der Token gueltig, bis Sie ihn widerrufen.
3. Klicken Sie auf **Token erstellen**.

Der vollstaendige Token wird **nur ein einziges Mal** direkt nach der Erstellung angezeigt. Kopieren Sie ihn sofort und bewahren Sie ihn sicher auf -- Ueberblick speichert ihn nicht im Klartext und kann ihn Ihnen spaeter nicht erneut anzeigen.

In der Token-Liste sehen Sie zu jedem Token die Bezeichnung (mit den letzten vier Zeichen), das Erstellungsdatum, **zuletzt verwendet** und ein etwaiges Ablaufdatum. Ueber **Widerrufen** entziehen Sie einem Token sofort den Zugriff; Verbindungen, die ihn nutzen, funktionieren danach nicht mehr.

Ein Token greift standardmaessig auf **alle Projekte zu, die Ihnen gehoeren**. Token koennen optional auf ein einzelnes Projekt eingegrenzt werden. Unabhaengig davon sieht ein Token immer nur das, was Sie als Admin selbst sehen duerfen.

## Welche Daten werden bereitgestellt

Pro Projekt stehen drei Arten von Endpunkten zur Verfuegung -- alle ausschliesslich lesend:

- **Ebenen-Index**: eine Uebersicht aller verfuegbaren Ebenen des Projekts (je ein Eintrag pro Workflow sowie die Marker) mit Anzahl der Features und den fertigen GeoJSON-Adressen. Diesen Index koennen Sie auch direkt im Browser oeffnen.
- **Marker als GeoJSON**: alle Marker des Projekts als Punkte.
- **Workflow-Eintraege als GeoJSON**: die Eintraege eines Workflows mit ihren Feldwerten.

Die Koordinaten werden in WGS84 (Laengen-/Breitengrad) geliefert. Verweise auf andere Datensaetze -- etwa Mehrfachauswahl-Felder oder Bezuege auf eigene Tabellen -- werden zu lesbaren Namen aufgeloest, sodass Sie in QGIS Klartext statt interner IDs sehen.

## In QGIS einbinden

1. Kopieren Sie den gewuenschten **Ebenenpfad** aus den Projekt-Einstellungen (Gruppe **Integrationen** > **QGIS-/GIS-Zugang**).
2. In QGIS: **Layer > Layer hinzufuegen > Vektorlayer hinzufuegen**, Quelltyp **Datei**.
3. Fuegen Sie den kopierten Pfad ein. Die Workflow- und Marker-Pfade beginnen mit `/vsicurl_streaming/` -- QGIS liest die Endpunkte ueber den Streaming-HTTP-Zugriff von GDAL.
4. Ersetzen Sie den Platzhalter `<YOUR_TOKEN>` im Pfad durch Ihren Token und klicken Sie auf **Hinzufuegen**.

Fuer die Authentifizierung kennt der Zugang mehrere Wege:

- **Bearer-Token** im `Authorization`-Header (`Authorization: Bearer <TOKEN>`).
- **Basic-Auth** mit dem Token als Benutzernamen (Passwort leer) -- diese Variante unterstuetzt QGIS am zuverlaessigsten.
- **`?token=<TOKEN>`** als Parameter direkt in der Adresse bzw. `/vsicurl_streaming/<adresse>?token=<TOKEN>`. Bequem, aber der Token landet dabei in URLs und Protokollen -- nur verwenden, wenn die anderen Wege nicht in Frage kommen.

**Hinweis fuer die lokale Entwicklung:** Der Dev-Server startet standardmaessig mit HTTPS und einem selbstsignierten Zertifikat, das QGIS ablehnt. Starten Sie den Server in diesem Fall ueber `npm run dev:http` (reines HTTP), damit QGIS die Ebenen laden kann.

## Sicherheit

Ein Token gewaehrt **Lesezugriff** auf die Projektdaten, die Ihrem Konto zugaenglich sind -- behandeln Sie ihn wie ein Passwort. Ueberblick speichert nur einen Hash des Tokens, nicht den Token selbst; deshalb wird er auch nur einmalig bei der Erstellung angezeigt. Geht ein Token verloren oder geraet in falsche Haende, **widerrufen** Sie ihn in den Einstellungen und erstellen bei Bedarf einen neuen.

---

**Siehe auch:**

- [Karten](karten.md) -- Layer und Marker-Kategorien im Projekt
- [Projekte](projekte.md) -- Projekt-Einstellungen
