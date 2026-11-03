# Globale Kiki-Installation und Projektanpassungen

Status: Im Gespräch freigegeben, 2026-11-02.

## Ziel und Grenzen

Kiki wird einmal global installiert und aktualisiert. Keine Projektregistrierung,
kein eigenes Rechtesystem, keine automatischen Eingriffe in andere Projekte.
OpenCode führt globale Agentendefinitionen und lokale Einstellungen zusammen.
Referenz: OpenCode 1.18.35, `src/config/config.ts` (JSON deep merge, anschließend
Markdown-Agenten). Globale Markdown-Agenten müssen deshalb migriert werden.

## Ablage und Eigentum

- Global: OpenCode-JSON/JSONC enthält Kikis `agent`-Einträge; Anweisungstexte liegen
  unter `kiki/prompts/`, Workflow-Dokumentation unter `kiki/`; ein Plugin liegt in
  `plugins/kiki.ts`. Andere OpenCode-Einstellungen bleiben erhalten.
- Projekt: `opencode.json` bzw. die vorhandene JSONC-Konfiguration enthält nur
  Agentenanpassungen (Rechte, Modelle). `.agentic/kiki/` behält Pfade, Befehle,
  Health-Konfiguration, Alignment und Arbeitsdaten.
- Globale Updates aktualisieren Kiki-Anweisungen und Runtime, erhalten vorhandene
  Modellwahl und Zugriffsrechte. Keine stillschweigende Rechteausweitung.
- Projektanweisungen können bewusst über lokale Markdown-Agenten angepasst werden.
  Deren Anweisungstext erhält dann keine automatischen globalen Prompt-Updates.
- Globale Prompts weisen Agenten an, die Projektpfade und Befehle aus
  `.agentic/kiki/config.json` zu lesen; Projektpfade werden nicht global fest verdrahtet.

## Befehle

- `kiki install` installiert global, wiederholbar; `kiki update` aktualisiert global.
  `--global` ist eine explizite Schreibweise. Kein positionsabhängiger Projekt-Update.
- `kiki init [path]` / `kiki install --project <path>` initialisieren nur Projektkonfiguration.
  Bestehende Arbeitsdaten werden nicht überschrieben, auch nicht mit `--force`.
- `kiki migrate --project <path>` übernimmt lokale Markdown-Rechte und Modelle,
  ergänzt bisherige routing.json-Modellzuweisungen, lässt existierende JSON-Werte
  gewinnen und entfernt danach alte Kiki-Markdown-Dateien und lokale Plugin-Kopie.
  Die globale Installation muss zuvor vorhanden sein. Der Nutzer bestätigt, dass
  keine eigenen Prompt-Anpassungen zu übernehmen sind; Originaldateien werden gesichert.
- `kiki reset --project <path>` entfernt Kiki-Agenteneinträge und lokale
  Kiki-Agenten-/Plugin-Dateien. Andere Agenten, Provider, Arbeitsdaten und Dokumente
  bleiben erhalten. Alte routing.json wird entfernt, damit sie keine Modelle
  zurückbringt. Konfigurationspfade, Alignment und Health bleiben Projektmetadaten.
- `kiki routing` wird durch einen schreibfreien Hinweis auf native OpenCode-
  Modellkonfiguration abgelöst. Keine zweite aktive Modellquelle.
- Hilfe und unbekannte Argumente schreiben niemals Dateien. Nach Änderungen ist
  OpenCode neu zu starten; laufende Sessions werden nicht verändert.

## Migration und Fehlerbehandlung

JSONC-Kommentare und fremde Schlüssel werden durch gezielte Änderungen erhalten.
YAML-Frontmatter wird mit einem Parser gelesen; ungültige Eingaben brechen vor
dem Entfernen alter Dateien ab. Rechte werden unverändert übernommen, nicht mit
breiteren Generator-Defaults ersetzt. Vorhandene JSON-Einstellungen haben Vorrang.
Migration und Reset sichern die betroffenen Originaldateien außerhalb der von
OpenCode gescannten Agenten-/Plugin-Verzeichnisse unter `.agentic/kiki/backups/`.
Globale Migration sichert unter `kiki/backups/`. Konfigurationsdateien werden per
temporärer Datei und Rename ersetzt. Keine Ausgabe vollständiger Konfigurationen.

## Prüfungen

- Globale Installation/Update erhalten fremde Konfiguration, Rechte und Modelle;
  keine globalen Markdown-Kopien; genau ein globales Plugin.
- Init erzeugt keine lokalen Agenten/Plugins und erhält bestehende Arbeitsdaten.
- Migration erhält alle Permission-Arten, vorhandene JSON-Anpassungen und Modelle;
  ungültige Eingaben löschen keine Originaldateien; Wiederholung ist idempotent.
- Reset entfernt nur Kiki-Anpassungen, nicht fremde Agenten oder Arbeitsdaten.
- OpenCode-Konfigurationsauflösung mit isoliertem HOME bestätigt globale Prompts
  plus lokale Rechte/Modelle, ohne echte Nutzerkonfiguration auszugeben.
- Vollständige Tests, Build und generierter Plugin-Typecheck bleiben grün.

## Nicht Teil der Umsetzung

Kein Paketmanager/Self-Updater: `update` aktiviert die Version des aufgerufenen
Kiki-CLI. Paketinstallation bzw. Git-Pull und Build bleiben bestehende Schritte.
Keine Änderung an OpenCode selbst; JSON/YAML-Abhängigkeiten nur im CLI, nicht im Plugin.
