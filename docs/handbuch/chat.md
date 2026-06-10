# Chat

Der Chat ist ein gemeinsamer, projektweiter Raum, in dem die Teilnehmer eines Projekts miteinander schreiben. Pro Projekt gibt es genau **einen** Chat-Raum -- es gibt keine Direktnachrichten zwischen einzelnen Teilnehmern und keine getrennten Kanaele.

Administratoren **konfigurieren** den Chat nur (an/aus, erlaubte Rollen); es gibt im Administrationsbereich keine eigene Chat-Oberflaeche zum Mitschreiben. Der Chat findet ausschliesslich in der Teilnehmer-App statt.


## Chat aktivieren

Sie steuern den Chat in den **Projekt-Einstellungen** unter der Gruppe **Funktionen** > **Chat**:

- **Chat aktivieren** (Schalter): Solange der Schalter aus ist, ist der Chat fuer jeden Teilnehmer des Projekts verborgen.
- **Erlaubte Rollen** (`chat_visible_to_roles`): Bleibt die Liste **leer**, ist der Chat fuer **alle** Teilnehmer des Projekts offen. Tragen Sie eine oder mehrere Rollen ein, ist die Teilnahme auf Teilnehmer mit einer dieser Rollen beschraenkt.


## Wer kann teilnehmen?

Ein Teilnehmer ist **Mitglied** des Chats, wenn beide Bedingungen erfuellt sind:

1. Der Chat ist im Projekt aktiviert, **und**
2. es sind **keine** Rollen gesetzt (offen fuer alle) **oder** der Teilnehmer hat eine der erlaubten Rollen.

Wer kein Mitglied ist, sieht das Chat-Tool gar nicht -- es taucht in der Teilnehmer-App nicht auf.


## Chat aus Teilnehmersicht

Der Chat erscheint als **Tool** im Karten-View. Ueber den Eintrag **Tools** oeffnen die Teilnehmer das Chat-Sheet, das von der rechten Seite einblendet.

- **Erwaehnungen (@):** Ueber eine Personenauswahl koennen Teilnehmer andere Mitglieder erwaehnen. Die erwaehnte Person erhaelt einen Hinweis auf die Erwaehnung.
- **Eigene Nachrichten bearbeiten/loeschen:** Eine eigene Nachricht laesst sich innerhalb von **5 Minuten** nach dem Absenden bearbeiten oder loeschen. Danach ist sie fest.
- **Ungelesen vs. Erwaehnung:** Ungelesene Nachrichten im Raum werden durch einen **grauen Punkt** angezeigt; ungelesene **Erwaehnungen** der eigenen Person durch eine **rote Zahl** (die Anzahl der offenen Erwaehnungen).
- **Offline-faehig:** Der Chat funktioniert auch ohne Internet. Nachrichten werden in den lokalen Speicher gespiegelt; ist das Geraet online, erfolgt die Zustellung in Echtzeit.


## Gut zu wissen

- Eine Nachricht darf hoechstens **4000 Zeichen** lang sein.
- Erwaehnungen werden **serverseitig** aus dem Nachrichtentext bestimmt -- nur tatsaechlich erwaehnte Mitglieder des Projekts werden als Erwaehnung gewertet.

---

**Siehe auch:**
- [Projekte](projekte.md) -- Projekt-Einstellungen und Funktionen
- [Was sieht der Teilnehmer?](teilnehmer-sicht.md) -- Tool-Sichtbarkeit in der App
