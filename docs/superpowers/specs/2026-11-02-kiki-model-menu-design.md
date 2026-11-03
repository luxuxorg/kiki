# /kiki — Modellauswahl für Agenten

Datum: 2026-11-02. Schriftlicher Entwurf im Gespräch freigegeben; Umsetzung beauftragt.

## Ziel

Modelle pro Kiki-Agent direkt in OpenCodes Terminaloberfläche ändern, ohne JSON
von Hand zu bearbeiten. Ein global installierter Einstieg `/kiki` bleibt für
spätere Befehle erweiterbar. Zunächst enthält er ausschließlich die Modellwahl.

## Bedienung

1. `/kiki` öffnet das Menü. Erster und standardmäßig ausgewählter Eintrag:
   **Modell ändern — global**. Zweiter Eintrag: **Modell ändern — dieses Projekt**.
   Kein zusätzlicher Dialog für den Geltungsbereich im normalen globalen Ablauf.
2. Agent auswählen. Die acht Kiki-Agenten werden mit der derzeitigen Zuordnung
   des ausgewählten Geltungsbereichs angezeigt; geerbte Modelle sind gekennzeichnet.
3. Modell suchen und auswählen. Ein nativer `DialogSelect` zeigt die Modelldaten
   aus derselben Provider-/Modellliste, die OpenCode für seine Modellauswahl nutzt.
   Modellname und Provider bleiben sichtbar, die Auswahl ist durchsuchbar.
4. Die Auswahl speichert die Zuordnung unmittelbar. Eine kurze Bestätigung nennt
   Agent, Modell und Geltungsbereich sowie den nötigen OpenCode-Neustart.

Abbrechen vor der Modellauswahl schreibt nichts. Während des Speicherns wird eine
zweite Speicherung verhindert. Bei einem Fehler erscheint keine Erfolgsbestätigung;
die bestehende Konfiguration bleibt erhalten und die Auswahl kann erneut erfolgen.

Wenn im aktuellen Projekt eine eigene Modellzuordnung existiert, wird bei einer
globalen Änderung darauf hingewiesen, dass die Projektzuordnung weiter Vorrang hat.
Die globale Änderung entfernt keine Projektanpassungen.

## Technischer Ansatz

Eine kleine TUI-Erweiterung registriert `/kiki` über
`api.keymap.registerLayer` mit `slashName`. Die Dialoge verwenden
`api.ui.dialog.replace` und `api.ui.DialogSelect`; die Modellliste kommt aus
`api.state.provider`. Es findet kein Sprachmodell-Aufruf statt.

Die vollständige interne Komponente `DialogModel` wird nicht importiert: Sie
ändert das Modell des aktiven Chat-Agenten und besitzt keinen Callback für einen
beliebigen Kiki-Agenten. Stattdessen wird dieselbe native Auswahlkomponente genutzt.
Favoritenverwaltung, Provider-Verbindung und Variantenwahl aus `/models` werden
nicht nachgebaut.

Die TUI-Erweiterung bleibt vom bisherigen Hintergrund-Plugin getrennt und wird
global über OpenCodes TUI-Plugin-Konfiguration registriert. `kiki install` und
`kiki update` richten sie wiederholbar ein, ohne fremde TUI-Einstellungen oder
Plugins zu ersetzen. Der bestehende Watchdog/Logger bleibt unverändert.

Die Speicheroperation wird als schmale Funktion neben der vorhandenen
Konfigurationsbearbeitung in `src/cli/opencode-config.ts` bereitgestellt:
Einzige Änderung ist `agent.<name>.model` in der ausgewählten globalen bzw.
projektspezifischen OpenCode-Konfiguration. JSONC-Kommentare, Rechte, Prompts,
andere Agenten und andere Einstellungen bleiben erhalten. Es wird unmittelbar
vor dem Schreiben erneut gelesen und atomar ersetzt. Modell und Agent müssen
aus den angebotenen Auswahlwerten stammen. Es entsteht keine zweite Routingdatei.

Die Menülogik liegt in einem eigenen TUI-Modul, die Auswahl-/Speicherlogik ist
ohne Terminalrenderer testbar. Ein Menüeintrag enthält Titel und Aktion; eine
umfangreiche Befehlsplattform ist nicht vorgesehen.

## Nachgewiesene Schnittstellen

Die Machbarkeit wurde anhand des Quellcodes von OpenCode **1.18.35** geprüft:

- `packages/plugin/src/tui.ts`: `TuiPlugin`, `TuiPluginApi`, native Dialoge und Providerdaten.
- `packages/tui/src/plugin/command-shim.ts`: Slash-Registrierung über Keymap-Layer.
- `packages/tui/src/plugin/adapters.tsx`: `api.ui.DialogSelect` verwendet den nativen Dialog.
- `packages/tui/src/component/dialog-model.tsx`: native Modellquelle und Bindung
  des internen Modelldialogs an den aktiven Chat-Agenten.
- `packages/tui/src/config/index.tsx`: TUI-Plugins werden über `plugin` konfiguriert.

Referenz: https://github.com/anomalyco/opencode/tree/v1.18.35/packages/tui

## Prüfungen

- `/kiki` erscheint als TUI-Befehl; global ist die vorausgewählte Aktion.
- Agentenauswahl öffnet die passende Modellliste; Suche und aktuelles Modell
  werden in nativen Auswahldialogen dargestellt.
- Globales Speichern ändert ausschließlich die globale Modellzuordnung;
  projektspezifisches Speichern ausschließlich die lokale Zuordnung.
- Bestehende Projektzuordnungen bleiben bei globalen Änderungen erhalten.
- Abbruch, ungültige Auswahl und Schreibfehler verändern keine Zuordnung.
- Rechte und JSONC-Kommentare bleiben bei beiden Speicherwegen unverändert.
- Wiederholtes Installieren/Updaten erzeugt keine doppelten TUI-Plugin-Einträge.
- Keine Sprachmodell-Anfrage und keine Änderung am aktuellen Chat-Modell als
  Seiteneffekt der Auswahl.
- Build und bestehende Tests bleiben grün; ein isolierter Test der TUI-Anbindung
  verwendet ausschließlich Testkonfiguration, keine echte Nutzerkonfiguration.

## Nicht Bestandteil

Keine weiteren Menübefehle, keine neue Routingdatei, kein `/kiki-model`-Alias,
keine Rechteverwaltung und kein Versprechen eines Hot-Reloads laufender Sessions.
