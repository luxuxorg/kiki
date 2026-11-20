# Index: Veraltete / überflüssige Kiki-Inhalte in lokalen Projekten

Datum: 2026-11-20 · Nur Bestandsaufnahme, keine Änderungen · Erstellt nach der freigegebenen globalen Rechte-Konsolidierung.

**Referenzarchitektur (verbindlich):** Rollen-Rechte ausschließlich global in `agents.<name>.permissions`; Agenten-Markdown ohne `permission(s)`; Projektkonfigurationen nur bewusste, validierte Ergänzungen plus Modelle.

**Geprüfter Bereich:** `/home/lutz/lprojekte` vollständig (inkl. aller Worktrees), dazu globale Alt-Stände unter `~/.opencode` und `~/.opencode2`.

**Ohne Kiki-Spuren (nichts zu tun):** axe-server, barry, demo, karakeep-swift, kleinkram, lutzschmitt-kirby5, lutzschmitt-web, pilewise, Noema-Worktree `sensorium-pilot`.

---

## Kategorie 1 — Alte Rechtekopien in Projektkonfigurationen (Kern-Kandidaten)

### 1.1 MiniParticipant — `opencode.jsonc` (6.371 B, Stand 2026-11-04)

Vollständige V1-Struktur: `agent.<name>.permission` mit read/edit/**bash**-Maps für 7 Rollen, plus je-Rolle-Modelle. Enthält das alte `bash: "allow"` für implementer + gui-designer **(widerspricht der D4-Entscheidung: aktuelle globale Politik statt Blankett-Freigabe)** und die alten `bash: { "*": "deny", git diff*/log*/mkdir* }`-Blöcke für die restlichen Rollen.

Repräsentativer Block (brainstormer; planner identisch):

```jsonc
"kiki-brainstormer": {
  "permission": {
    "read":  { "*": "allow", ".env*": "deny", "**/.env*": "deny", "**/*secret*": "deny",
               "**/*credential*": "deny", "**/*.pem": "deny", "**/*.key": "deny", "**/id_rsa*": "deny" },
    "edit": { "*": "deny", "src/**": "deny", "tests/**": "deny",
               "docs/superpowers/**": "allow", "docs/superpowers/plans/**": "allow", "docs/superpowers/specs/**": "allow",
               ".worktree/**/docs/superpowers/**": "allow", ".worktree/**/docs/superpowers/plans/**": "allow",
               ".worktree/**/docs/superpowers/specs/**": "allow" },
    "bash": { "*": "deny", "git diff*": "allow", "git log*": "allow", "mkdir*": "allow" }
  },
  "model": "deepseek/deepseek-flash"
}
```

Alle Modelle darin (lokale Wahl, Stand November):

| Rolle | Modell |
|---|---|
| orchestrator | deepseek/deepseek-flash |
| brainstormer | deepseek/deepseek-flash |
| planner | openrouter/z-ai/glm-5.3 |
| implementer | deepseek/deepseek-flash |
| gui-designer | openrouter/z-ai/glm-5.3 |
| reviewer | openrouter/z-ai/glm-5.3 |
| escalation | openai/gpt-5.6-sol |
| historian | deepseek/deepseek-flash |

**Empfehlung:** `permission`-Blöche komplett entfernen (globale Baseline deckt alles ab, `.worktrees/**`-Parität gäbe es hier sogar gratis). Modelle entweder nativ nach `agents.<name>.model` übernehmen oder verwerfen (dann globale Vorgabe). **Modelle = deine Entscheidung.**

### 1.2 Noema-Worktree `eu-inference-staan-search` — `opencode.json` (8.104 B)

Gleiche V1-Struktur wie Noema-Root **vor** der Bereinigung, aber neuere Generation (enthält bereits `.worktree/**`- UND `.worktrees/**`-Grants). **Keine Modelle enthalten.**

Besonderheiten:
- gui-designer: `bash: "allow"` (alte Blankett-Freigabe, D4 widerspricht)
- implementer: echte Ergänzungen `/tmp/opencode/**` + `**/tmp/opencode/**` (erhaltenswert, inventarisierte Form) plus `bash: "allow"` (weg)
- historian: enthält zusätzlich `.worktrees/**/.superpowers/**` allow

Repräsentativ (planner):

```jsonc
"kiki-planner": {
  "permission": {
    "read":  { "*": "allow", ".env*": "deny", "…": "… (7 Secret-Denies)" },
    "edit": { "*": "deny", "src/**": "deny", "tests/**": "deny",
              "docs/superpowers/**": "allow", "…plans/**": "allow", "…specs/**": "allow",
              ".worktree/**/docs/superpowers/{**,plans/**,specs/**}": "allow",
              ".worktrees/**/docs/superpowers/{**,plans/**,specs/**}": "allow" },
    "bash": { "*": "deny", "git diff*": "allow", "git log*": "allow", "mkdir*": "allow" }
  }
}
```

**Empfehlung:** exakt wie Noema-Root behandeln: Legacy-Maps per Validierung auflösen, inventarisierte implementer-tmp-Grants als `agents.kiki-implementer.permissions` behalten, `bash: "allow"` nicht übernehmen, Rest entfernen.

### 1.3 Scientist — `opencode.jsonc` (19.126 B, Stand 2026-11-10)

V2-Syntax, aber: **8 vollständige veraltete Baseline-Spiegel** (18–27 Regeln je Rolle — der Stand vom 2026-11-13, also OHNE die drei Git-Read-Grants, OHNE Secret-Edit-Denies, OHNE `.worktrees`-Parität) unter `agents.<name>.permissions`, plus `"mode": "all"` je Agent, plus top-level `permissions: external_directory * → ask`.

Struktur (kein Modell enthalten):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [ { "action": "external_directory", "resource": "*", "effect": "ask" } ],
  "agents": {
    "kiki-orchestrator": { "mode": "all", "permissions": [ /* 2 external_directory tmp-Grants */ ] },
    "kiki-brainstormer": { "mode": "all", "permissions": [ /* 22 Regeln: alter Baseline-Spiegel */ ] },
    "kiki-planner":      { "mode": "all", "permissions": [ /* 22 Regeln */ ] },
    "kiki-implementer":  { "mode": "all", "permissions": [ /* 21 Regeln */ ] },
    "kiki-gui-designer": { "mode": "all", "permissions": [ /* 20 Regeln */ ] },
    "kiki-reviewer":     { "mode": "all", "permissions": [ /* 27 Regeln */ ] },
    "kiki-escalation":   { "mode": "all", "permissions": [ /* 18 Regeln */ ] },
    "kiki-historian":    { "mode": "all", "permissions": [ /* 27 Regeln */ ] }
  }
}
```

**Wirkung heute:** Die alten Spiegel hängen der frischen globalen Baseline hinten an und gewinnen bei Überlappung — Scientist läuft faktisch noch auf der alten Politik (z. B. fehlen dort die drei `git status/rev-parse/worktree list`-Freigaben und die Secret-Edit-Denies, sofern nicht global schon wirksam… global wirkt, aber projekt-lokale Altreihen wie `edit * deny` im Spiegel können globale Allows wieder kassieren).

**Empfehlung:** alle 8 Spiegel entfernen (ersetzt durch globale Baseline). **Zwei bewusste Setting-Entscheidungen für dich:** `mode: "all"` (V1-Kompatibilität aus der Scientist-Migration — erlaubt jeden Agent auch als Haupt-Agent) und top-level `external_directory * → ask` (Scientist-Policy aus der Abnahme 2026-11-10; orchestrator-tmp-Grants funktionieren auch ohne, da spezifischer).

### 1.4 Noema-Account-Worktrees — Legacy-`agent`-Tier (je 1.440 B, Rest post-Rollout)

In `account-signup-integration` und `account-signup-password-otp` liegen nach dem Rollout noch die alten V1-`agent.<name>.model`-Strings UNTERHALB der nativen `agents.<name>.model`-Objekte. Sie werden von der nativen Schicht übersteuert (verifiziert: effektive Modelle = native), sind also inerte Altlast:

```jsonc
"agent": {
  "kiki-orchestrator": { "model": "openai/gpt-5.6-terra" },   // alt, übersteuert von agents → gpt-6-terra
  "kiki-gui-designer": { "model": "openrouter/moonshotai/kimi-k3" },  // übersteuert → z-ai/glm-5.3
  "kiki-escalation":  { "model": "openai/gpt-5.6-sol" },      // übersteuert → z-ai/glm-5.3
  "kiki-planner":     { "model": "openrouter/qwen/qwen3.8-max" },     // übersteuert → gpt-6-sol
  "kiki-reviewer":    { "model": "openrouter/qwen/qwen3.8-max" }      // übersteuert → deepseek-flash
}
```

**Empfehlung:** `agent`-Tier in beiden Dateien entfernen; native `agents.<name>.model` (die aktuellen wirksamen Wahlen) bleiben.

### 1.5 Leere Konfigurationsleichen (trivial)

- `"agent": {}` leeres Objekt in: `noema/opencode.json`, `voice-concierge/opencode.json`, `kiki/opencode.jsonc` (nach Bereinigung übrig).
- `kiki/opencode.jsonc`: zusätzlich 8 leere `"kiki-<rolle>": {}`-Objekte (nach Spiegel-Entfernung übrig). Die ganze Datei wäre danach faktisch leer (nur noch `$schema`).

**Empfehlung:** leere Objekte/Datei-Skelett aufräumen.

---

## Kategorie 2 — Veraltete Kiki-Infrastrukturdateien

### 2.1 V1-Plugin-SDK-Reste: `.opencode/package.json` + `package-lock.json` + `node_modules/`

Alle deklarieren `@opencode-ai/plugin` (V1-SDK, Mai 2026) mit vollem Abhängigkeitsbaum; kein Projekt hat noch ein aktives lokales Plugin (außer die zwei Alt-Kopien in 2.3):

| Ort | node_modules-Größe |
|---|---|
| `noema/.opencode/node_modules` | 59 MB |
| `MiniParticipant/.opencode/node_modules` | 63 MB |
| `kiki/.opencode/node_modules` | 58 MB |
| `scientist/.opencode/node_modules` | 58 MB |
| `~/.opencode/node_modules` (+ package.json, V1-SDK 1.14.33) | 58 MB |

Inhalt (je identisch):

```json
{ "dependencies": { "@opencode-ai/plugin": "1.15.13" } }
```

**Summe: ~296 MB toter V1-SDK-Ballast.** Achtung: `~/.opencode/bin/opencode` (Live-Binary) und `~/.opencode/skills/` bleiben unangetastet — dort nur `package.json`/`node_modules` entfernen.

### 2.2 Verwaister V1-Konfigurations-Root `~/.opencode2/` (308 KB)

Kompletter alter Konfigurations-Root aus der V1→V2-Migrationsphase (Launcher-Redirects wurden bereits entfernt):

```text
.opencode2/config/opencode/opencode.jsonc   ← Policies + plugins: ["/home/lutz/lprojekte/kiki"]
.opencode2/config/opencode/cli.json         ← plugins: ["/home/lutz/lprojekte/kiki"]
.opencode2/config/opencode/agents/kiki-*.md ← 8 alte Agenten-MDs MIT V1-Permission-Frontmatter
.opencode2/config/opencode/kiki/agentic-workflow.md
.opencode2/data/opencode/log/opencode.log
```

**Hinweis:** Die Live-Global-Config (`~/.config/opencode/opencode.jsonc`) trägt noch Policies, die auf `.opencode2/.../service.json` zeigen. Falls `.opencode2` weg soll, bieten sich diese Policy-Zeilen zur Mit-Bereinigung an (globale Änderung).

### 2.3 Lokale V1-Plugin-Kopien `kiki.ts` (12.179 B, 2026-11-07) — **Aktivitäts-Warnung**

- `noema/.worktrees/account-signup-integration/.opencode/plugins/kiki.ts`
- `noema/.worktrees/account-signup-password-otp/.opencode/plugins/kiki.ts`

Alter V1-Watchdog als lokales Plugin (eigene hashText-/Ring-Implementierung, **ohne** den Empty-Reasoning-Fix und alle späteren Korrekturen). OpenCode lädt projektlokale Plugins — in diesen Worktrees kann gerade dieser alte Watchdog laufen.

**Empfehlung: höchste Priorität entfernen** (globales Paket-Plugin ist registriert und übernimmt die Funktion).

### 2.4 Zurückgezogene Modelldateien `routing.json` (404 B)

- `noema/.worktrees/account-signup-integration/.agentic/kiki/routing.json`
- `noema/.worktrees/account-signup-password-otp/.agentic/kiki/routing.json`

```json
{ "agents": { "kiki-orchestrator": "openai/gpt-6-terra", "kiki-brainstormer": "openai/gpt-6.1-sol",
  "kiki-planner": "openai/gpt-6-sol", "kiki-implementer": "deepseek/deepseek-flash",
  "kiki-gui-designer": "openrouter/z-ai/glm-5.3", "kiki-reviewer": "deepseek/deepseek-flash",
  "kiki-escalation": "openrouter/z-ai/glm-5.3", "kiki-historian": "deepseek/deepseek-flash" } }
```

`kiki routing` ist zurückgezogen; alle Werte sind bereits nativ in den Worktree-Configs gesichert. **Empfehlung: entfernen.**

### 2.5 Alte Workflow-Doku `agentic-workflow.md` (7 Vorkommen)

Beschreibt den zurückgezogenen V1-Workflow: `task`-Tool-Routing, `kiki routing`-Sync in Frontmatter, Frontmatter-Permissions — alles nicht mehr gültig. Das Kiki-Repo selbst hat seine Kopie bereits durch einen Ruhestands-Hinweis ersetzt (432 B).

| Datei | Größe |
|---|---|
| `noema/.opencode/docs/agentic-workflow.md` | 4.432 B |
| `noema/.worktree/voice-concierge/.opencode/docs/agentic-workflow.md` | 4.432 B |
| `noema/.worktrees/eu-inference-staan-search/.opencode/docs/agentic-workflow.md` | 4.432 B |
| `noema/.worktrees/account-signup-integration/.opencode/docs/agentic-workflow.md` | 4.432 B |
| `noema/.worktrees/account-signup-password-otp/.opencode/docs/agentic-workflow.md` | 4.432 B |
| `MiniParticipant/.opencode/docs/agentic-workflow.md` | 3.728 B |
| `scientist/.opencode/docs/agentic-workflow.md` | 4.427 B |

Auszug der überholten Anweisungen (MiniParticipant-Kopie):

```markdown
### 5. Implement
The orchestrator dispatches the appropriate implementation subagent via the `task` tool. …
## Role-Level Model Routing
Model selection is one model per Kiki role. Edit the `agents` map in
`.agentic/kiki/routing.json`, then run `kiki routing` to sync those models into
`.opencode/agents/kiki-*.md` frontmatter.
```

**Empfehlung:** entfernen oder durch den aktuellen Ruhestands-Hinweis ersetzen (wie im Kiki-Repo).

### 2.6 Inerte Alt-Sektionen in `.agentic/kiki/config.json` (7 Dateien)

Der aktuelle Loader verwirft `models` und `riskMatrix` (funktionslos, aber irreführend):

- `models`-Sektion (V1-Modell-Routing): noema-Root + alle 4 Noema-Worktrees, MiniParticipant, scientist
- `riskMatrix` (in Kiki entfernt): noema-Root + 4 Noema-Worktrees

Beispiel scientist (inert):

```json
"models": { "standard": "mistral/mistral-large-4", "critical": "openai/gpt-6.1-sol",
             "workhorse": "deepseek/deepseek-v4-pro" }
```

**Empfehlung:** Sektionen streichen; Pfade/Commands/Health (aktiv genutzt) bleiben.

### 2.7 Leere Verzeichnisse

- `noema/.opencode/agents/`, `noema/.opencode/plugins/` (leer)
- `MiniParticipant/.opencode/agents/`, `MiniParticipant/.opencode/plugins/` (leer)
- `scientist/.opencode/plugins/` (leer)
- `noema/.worktrees/account-signup-{integration,password-otp}/.opencode/agents/` (leer seit Rollout)

### 2.8 Migrations-Backups `.agentic/kiki/backups/` — **Empfehlung: BEHALTEN**

`noema` (a4847c75: 11 Dateien inkl. kiki.ts/routing.json/opencode.json), `kiki` (2 Verzeichnisse), `MiniParticipant` (bc9b7837), `scientist` (5294029b). Sicherheitskopien der V1→V2-Migration; gleichzeitig Provenance-Nachweis für den historischen Erkennungskatalog. Nur der Vollständigkeit halber aufgeführt.

---

## Kategorie 3 — Sieht alt aus, ist aber zu BEHALTEN

| Inhalt | Grund |
|---|---|
| `noema/opencode.json` + `voice-concierge/opencode.json`: `agents.kiki-implementer.permissions` | Freigegebene Ergänzungen inkl. D3 (scripts/**, package.json, cleanup.ts, cron.json) |
| Account-Worktrees: `agents.<name>.model` | Aktuell wirksame Modellwahlen (aus MD-Relokation), verifiziert |
| `kiki/.opencode/docs/agentic-workflow.md` (432 B) | Aktueller Ruhestands-Hinweis, absichtlich gesetzt |
| `noema/AGENTS.md` (7590 B, root + Worktree-Kopien) | Projekteigene Anweisungen, git-getrackt — kein Kiki-Legacy |
| Scientist: `.opencode/agents/*.md` (10 eigene Agenten), `.opencode/models.json`, `.opencode/skills/scientist` | Eigene Scientist-Infrastruktur, kein Kiki — von diesem Refactoring unberührt |
| `~/.opencode/bin/`, `~/.opencode/skills/` | Live-Binary bzw. aktive Skills |
| `~/.config/opencode/kiki/backups/` | Rollout-Sicherung von gestern |

---

## Entscheidungen (User, 2026-11-20)

1. MiniParticipant-Modelle: **verwerfen**
2. Scientist: `mode:"all"` und top-level `external_directory→ask` **mit entfernen**
3. `~/.opencode2`: **komplett weg**, inkl. `.opencode2`-Policy-Zeilen aus der Live-Global-Config
4. Alte `agentic-workflow.md`: **ersatzlos löschen**
5. V1-SDK-Reste: **alle fünf Orte löschen**
6. Backups: **je Ort das letzte behalten, ältere löschen**

## Ausführung (2026-11-20, angewendet und verifiziert)

Backup: `/tmp/opencode/kiki-legacy-cleanup-20261120-J2Ilri/` (Manifest + alle geänderten/gelöschten Einzeldateien; `node_modules` per gesichertem `package.json`/Lock wiederherstellbar).

Durchgeführt:
- **MiniParticipant:** `opencode.jsonc` gelöscht (keine Eigenanteile, Modelle verworfen); `config.json` ohne `models`.
- **Scientist:** 8 Baseline-Spiegel, `mode:"all"`, top-level `permissions` entfernt; Eigenanteile erhalten: Orchestrator-tmp (`external_directory /tmp/**`, `tmp/**`), Implementer `docs/releases/**`, Historian `decisions.md` + `.worktree/**/decisions.md` (jeweils mit Secret-Masken); `config.json` ohne `models`.
- **Noema:** Root + voice `agent:{ }` entfernt; eu-inference Legacy-Rechte entfernt, Eigenanteile erhalten (Implementer `scripts/**`, `package.json`, `package-lock.json`, tmp/opencode-Formen, Worktree-Pfade; Historian `.worktrees/**/.superpowers/**`); Account-Worktrees: Legacy-`agent`-Tier entfernt, native Modelle bleiben; alle 5 `config.json` ohne `models`/`riskMatrix`.
- **Kiki-Repo:** leere `opencode.jsonc` gelöscht.
- **Infrastruktur:** 7 alte Workflow-Dokus, 2 `kiki.ts`-Plugin-Kopien, 2 `routing.json` gelöscht; V1-SDK an 5 Orten entfernt (~296 MB); `~/.opencode2` (308 KB) entfernt; 2 `.opencode2`-Policies aus der Live-Global-Config entfernt (Policies 8→6).
- **Backups:** Kiki-Repo und global je neuesten behalten (ältere gelöscht); Noema/MiniParticipant/Scientist haben je genau einen Bestand.
- **Bewusst unberührt:** `~/.opencode/bin/` (inkl. `opencode2`-Launcher → zeigt auf das Live-Binary), Skills, Scientist-eigene Agenten/`models.json`/Skills, Migrations-Backups, projekt-eigene `AGENTS.md`, Noema-Dokumentation.

Verifikation: 46 Struktur-/Konfigurationschecks + 18 echte Permission-Entscheidungen (MiniParticipant, Scientist, eu-inference, Account-Modell) alle PASS. Hinweis: Der laufende OpenCode-Dienst lädt Projekt-Locations erst beim Laden/Session-Start neu; nach Änderungen einmal `/reload` oder Projekt öffnen.
