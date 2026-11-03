# /kiki — Lokale Modell-Zuordnungen löschen & Schreibgarantie

Datum: 2026-11-02. Entwurf zur Freigabe im Gespräch.

## Ziel

1. Projekt-lokale Modell-Zuordnungen (`agent.<name>.model` in der Projekt-Konfiguration)
   direkt im `/kiki`-Menü entfernen — einzeln pro Agent oder alle auf einmal — damit
   wieder die globalen Vorgaben greifen.
2. Garantie: Kein Kiki-Mechanismus (init / update / migrate / Plugin) schreibt implizit
   lokale Modellwerte in die Projekt-Konfiguration. Lokale Werte entstehen nur durch
   explizite Nutzereingabe (Init-Assistent mit abweichender Wahl, `/kiki`, manuelle
   Datei) und werden von jedem späteren init/update/migrate respektiert.

## Bedienung

1. `/kiki` → **Modell ändern — dieses Projekt** → Agent → Modelldialog. Existiert für
   diesen Agenten ein lokales Modell, steht ganz oben ein zusätzlicher Eintrag:
   **„Globales Modell (<globales Modell>) verwenden“** (z. B. „Globales Modell
   (anthropic/claude-sonnet-5) verwenden“). Auswahl löscht nur den `model`-Schlüssel
   des lokalen Agent-Eintrags; Rechte, Kommentare und sonstige Einstellungen bleiben.
   Ist der Eintrag danach leer, wird der ganze Agent-Eintrag entfernt.
2. Die Agentliste im Projekt-Geltungsbereich endet mit **„Alle lokalen Modell-Zuordnungen
   löschen“**. Eine native Bestätigungsauswahl („Ja, alle löschen“ / „Abbrechen“)
   entfernt `model` aus allen acht Kiki-Agenten in allen Projekt-Konfigurationsdateien
   (`opencode.json`, `opencode.jsonc`, `.opencode/opencode.json(c)`).
3. Erfolgs-Toast nennt Agent, entferntes lokales Modell, nun greifendes globales Modell
   und den nötigen OpenCode-Neustart. Abbrechen schreibt nichts.
4. Im globalen Geltungsbereich wird kein Löschen angeboten — globale Werte sind die
   Vorgaben selbst.

## Technischer Ansatz

- Speicheroperationen in `src/cli/opencode-config.ts` neben `setAgentModel`:
  - `removeAgentModel(scope, agent, context)` — validiert Scope/Agent, liest frisch,
    patcht `agent.<name>.model` per jsonc-parser auf `undefined` im Config-Target des
    Scopes (analog zum bestehenden `remove`-Pfad); leerer Agent-Eintrag wird entfernt.
    Rückgabe: `{ file, removed?: string, effective?: string }`.
  - `removeAllProjectModels(context)` — nur Projekt-Scope; iteriert alle vorhandenen
    Projekt-Tiers und entfernt `model` aus jedem Kiki-Agenten. Fremd-Agenten,
    Fremd-Einstellungen und JSONC-Kommentare bleiben byte-stabil wo möglich.
- TUI `src/tui/model-menu.ts`: `ModelSettings` um `remove(scope, agent)` und
  `removeAllProject()` erweitert; Verdrahtung in `src/tui/index.ts`. Der
  „Globales Modell … verwenden“-Eintrag erscheint nur im Projekt-Scope und nur wenn
  ein lokales Override existiert (`projectOverride`); er ist in der Optionsliste oben
  einsortiert und trägt einen reservierten Wert (z. B. `__inherit__`), der nie als
  Modell gespeichert wird. Guard-Logik (generation/busy/active) wie beim Speichern.
  Native Dialoge nur; keine LLM-Aufrufe.
- Schreibgarantie (Init-Pfad):
  - `initializeProjectAgents` bleibt semantisch unverändert: lokale `model`-Werte
    werden nur geschrieben, wenn die Projekt-Konfiguration explizit davon abweicht
    (`config.models` ≠ eingebaute `DEFAULT_MODELS`); bestehende lokale Einträge haben
    Vorrang (`existing.agent[name]` wird zuletzt gemerged).
  - Neu: Standard-Modellwerte werden nicht mehr fest in `.agentic/kiki/config.json`
    persistiert — nur explizite Abweichungen von `DEFAULT_MODELS` werden gespeichert.
    `loadConfig` merft weiterhin Defaults für die Template-Generierung, sodass ein
    Wechsel der eingebauten Defaults in einem späteren Kiki-Release nicht über alte
    gespeicherte Werte lokal ausgeschrieben wird.
  - `update` bleibt global-only und berührt Projekte nicht; `migrateProject` importiert
    nur tatsächlich vorhandene Legacy-Werte (explizit). Beides per Tests festgeschrieben.

## Prüfungen

- Projekt-Scope: „Globales Modell (<name>) verwenden“ löscht nur `model`, behält
  `permission`/Kommentare, entfernt leere Agent-Einträge, schreibt nichts bei Abbruch
  oder wenn kein lokales Override existiert; Toast nennt entferntes und nun greifendes
  Modell.
- „Alle lokalen Modell-Zuordnungen löschen“ entfernt `model` aus allen Kiki-Agenten
  über alle Projekt-Tiers hinweg, lässt Fremd-Agenten und Fremd-Einstellungen unangetastet.
- Init mit Standardwerten schreibt keine `model`-Schlüssel in die lokale Konfiguration;
  explizite Assistenten-Wahl wird wie bisher lokal geschrieben; bestehende lokale
  Modellwerte überstehen erneutes init/update/migrate unverändert.
- `.agentic/kiki/config.json` enthält nach Init mit Standardwerten keine
  Default-Modelle mehr; Templates werden weiterhin korrekt generiert.
- Ungültiger Agent/Scope oder defektes JSONC: Fehler, Originaldatei byte-identisch.
- Bestehende Tests und Build bleiben grün; Menü-Tests mit Host-API-Fixture ohne echte
  Nutzerkonfiguration.

## Nicht Bestandteil

- Kein Löschen globaler Modellwerte über `/kiki` (global = Vorgabe); dort bleibt es
  beim manuellen Datei-Eingriff.
- Keine Rechteverwaltung, keine Änderung an `kiki reset --project`.
- Kein Hot-Reload; Neustart-Hinweis bleibt.
