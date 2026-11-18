# Proportional Tests and Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline and without nested delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generierte Kiki-Regeln wählen Checks, Reviews und persistente Artefakte nach tatsächlichem Änderungsradius und Risiko statt nach einem festen Pflichtablauf.

**Architecture:** Bestehende Generatoren und den gemeinsamen Builder-Handoff in `src/cli/config.ts` ändern; keine neue Laufzeitlogik oder Policy-Engine. Templates bleiben die einzige aktive Regelquelle; die veraltete lokale Workflow-Kopie wird durch einen kurzen Stilllegungshinweis ersetzt.

**Tech Stack:** Bestehendes TypeScript, Vitest, ESLint; keine neuen Dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-proportional-tests-and-artifacts-design.md` (APPROVED).

## Global Constraints

- Task-ID: `proportional-tests-and-artifacts`; keine Release-Gate-Codeänderung (separater Plan).
- „Keine Cache-, Hash- oder Evidence-Engine; kein Risiko-Konfigurationsschema“; keine neuen Registry-Pflichtfelder, Waiver oder Pflichtberichte.
- „Kein Abbau von: Pre-change-Inventur und Schutz vorhandener Nutzerdateien“, Publishing-/Permissiongrenzen, Loop-Caps und Eskalationsregeln.
- Keine hardcodierten npm/vitest/tsc/`OPENCODE_TEST_BINARY`-Regeln oder konkreten Candidate-Gates im generierten Vertrag; konfigurierbare Befehle bleiben verfügbar.
- Keine Secrets im Source, ausschließlich parametrisierte DB-Queries, keine internen Stacktraces in API-Antworten; Alignment unverändert.
- Implementer besitzt Source/Tests, Historian Doku; Registry ausschließlich Orchestrator. Kein Commit/Push/Release/Install/Update/Rollout und keine globalen Änderungen.
- Historienevidenz einschließlich `tmp/release-3.1.0/handoff-evidence.md` erhalten; frühere PASS niemals als frisch ausgegeben.

## Review Focus

Diese fünf Fälle werden in Task 1 ausdrücklich gepinnt:
- Nicht-TypeScript-Projekt: eigene konfigurierte Befehle, keine eingebaute Kiki-Candidate-Policy.
- Kleiner lokaler Task versus semantischer Prompt-Diff: optionale Dateien/Architect-Gates, aber angemessener finaler Diff-Review.
- Unklarer Querschnitt versus irrelevanter Editorial-Delta: begründeter breiter Fallback versus ehrlich referenzierter früherer PASS.
- Skip/fehlender Lauf/Fehlschlag: getrennte Statuswerte, kein Integrations-PASS aus bloßem Exit-Code.
- Mechanische Planrevision und unveränderte Doku: kein neuer Review-/Historian-Pflichtlauf; Sicherheitsgrenzen und Loop-Caps bleiben wirksam.

---

### Task 1: Generischen proportionalen Workflow samt Lieferungstests umstellen

**Metadata:**
- risk: medium
- parallel: true
- depends_on: []

**Dateizuordnung:**
- Implementer: `src/cli/config.ts` — `NECESSITY_CRITERIA`, `buildBuilderHandoffPrompt`, Orchestrator-, Brainstormer-, Planner-, Reviewer-, Workflow-Templates; Historian-/Escalation-Text nur soweit alte unbedingte Artefaktannahmen widersprechen.
- Implementer/Test: `tests/cli/loop-controls.test.ts`, `tests/cli/install.test.ts` — gezielter Ersatz obsoleter Prosa-Pins, bestehende Verhaltenstests behalten.
- Historian: `README.md` (Einleitung/Pipeline sowie „Loop controls and review governance“, insbesondere Routing, Check ownership, Necessity); `CHANGELOG.md` (knapper Unreleased-Eintrag); `.opencode/docs/agentic-workflow.md` (Stilllegungshinweis).
- Keine neuen Quelldateien; `dist/cli/config.*` nur als reguläre Build-Ausgabe durch berechtigte ausführende Rolle, niemals manuell oder als alternative Schreibroute.

**Interfaces:**
- Bestehend/unverändert: `generateAllTemplates(config: KikiConfig): GeneratedTemplates` und alle exportierten `generate*Template`-Signaturen.
- Intern unverändert: `buildBuilderHandoffPrompt(commands: KikiConfig['commands']): string`; die vier konfigurierten Befehle sind Auswahlmöglichkeiten, keine vier Pflichten.
- Registry-Schema bleibt unverändert; kleine Tasks dürfen `spec`/`plan`-Referenzen weglassen und vorhandenen Gesprächs-/Handoff-Kontext verwenden. Keine neue Klassifizierungsstruktur.

**Entscheidung:** Generator-Prosa statt neuer Abstraktion/Persistenz (Spec Ziele 1–6, Nichtziele). Den existierenden gemeinsamen Handoff beibehalten, damit beide Builder denselben Vertrag liefern. Ein kurzer Stilllegungshinweis statt Synchronisation oder Löschen der alten Kopie reduziert zweite Wahrheiten und erhält den Fundort; er verweist auf `generateWorkflowTemplate` und den regulär generierten Workflow, ohne Live-Update auszuführen.

- [ ] **1. Vertragstests zuerst umstellen.** In `loop-controls.test.ts` R10 ersetzen durch `builders_report_proportional_check_evidence`: beide Builder, Default- und Custom-Config behalten die konfigurierten Befehle; verlangen Kommando/Scope/Exit/relevante Ergebnisse, volle Fehlerausgabe, kurze Erfolgssumme und einen Satz zur begründeten Nichtausführung. `check_status_and_prior_pass_are_honest` pinnt failed/passed/skipped/not run sowie früheren PASS mit bezeichnetem Arbeitsstand, nicht frische Evidenz oder Integrationsbehauptung. Eine zusätzliche Custom-Config mit Projektbefehlen wie `python -m pytest` beweist Konfigurationsdurchreichung; die Regeln dürfen keine fest verdrahtete Kiki-Tool-/Candidate-Policy enthalten.
- [ ] **2. Die übrigen semantischen Kontrakte ergänzen und gezielt RED prüfen.** `small_tasks_and_semantic_prompt_reviews` pinnt kleinen Ablauf ohne persistente Spec/Plan/PASS-Datei und Architect-Gate, finalen Review normaler Code-/semantischer Prompt-Diffs und Editorials ohne Agentenlauf. `check_scope_uses_radius_and_uncertainty` pinnt fokussierte Tests, breiten Fallback bei unsicherem Radius/echtem Querschnitt, keine automatische Vollsuite bloß wegen eines Pfadnamens. `reviews_docs_and_registry_are_proportional` ersetzt R7/R8-Allrevisionen-Pin und R19-Prosa-Duplikat durch substanziell/mechanisch, bedarfsbezogenen Necessity-Katalog, Parallelitätsprüfung nur bei Parallelisierung, Historian nur bei veralteter Doku und einfache Notizreferenz ohne doppelte Prosa. In `install.test.ts` die beiden vorhandenen Install-/Update-Lieferungstests um repräsentative neue Vertragsaussagen erweitern; Schutz von Settings/Permissions, Guardrail-Literal und Idempotenz unverändert behalten. Ausführen: `npm test -- tests/cli/loop-controls.test.ts tests/cli/install.test.ts`; erwartet gezieltes FAIL an alten Regeln, kein Umdeuten unabhängiger Fehler.
- [ ] **3. Templates konsistent umstellen.** Im gemeinsamen Handoff Check-Auswahl anhand Delta/Risiko/konfigurierten Befehlen und ehrliche Evidenz nach Spec Ziele 1–3 formulieren. Reviewer beurteilt Auswahl und vorhandene Evidenz statt vier Pflichtläufe/Erfolgsdumps; kein zusätzliches Check-Auswahl-Gate. Orchestrator/Brainstormer/Planner/Workflow lassen den kleinen Ablauf ausdrücklich als Ausnahme von geladenen Skill-Artefaktpflichten zu; bei größerem Risiko bleiben Spec/Plan/Architect-Review möglich. Alle Stellen zu Planrevisionen (auch FAIL/plan, BLOCKED, Escalation-Routing) auf substanzielle Revisionen abstimmen, ohne Fehlerzähler oder Caps zu ändern. Necessity nur bei neuen Dependencies/Persistenz/Abstraktionen/Scope-Wachstum katalogisieren, kleinste ausreichende Änderung stets prüfen. Separates PASS-Berichtsdokument und Dokumentations-Pflichtgate entfernen; bestehendes Handoff/Conversation plus kurzer Registry-Zustand/Verweis genügt. Keine neuen Permissions; Pre-change-Inventur, BLOCKED und Publishing-Regeln unverändert lassen.
- [ ] **4. Fokussiert GREEN, betroffene Doku über Historian.** Denselben fokussierten Befehl erneut ausführen; erwartet alle ausgewählten Tests bestanden. Nur tatsächlich obsolete Textassertions korrigieren, keine Permission-/Security-/Install-/Update-/Watchdog-Verhaltensprüfung abschwächen. Historian aktualisiert ausschließlich genannte aktuelle Dokuabschnitte und stilllegt die alte Workflow-Kopie; nicht historische Berichte umschreiben. Für `.opencode/docs/agentic-workflow.md` besteht im gelesenen Historian-Baselinegrant kein passender Edit-Grant: vor dieser konkreten Änderung gezielte Freigabe der vorgesehenen Edit-Operation einholen; bei Ablehnung stoppen, nicht über Shell/Script schreiben oder globale Rechte ändern.
- [ ] **5. Gemeinsamen Abschluss und knappen Handoff liefern.** Nach beiden Implementationsblöcken die unten vereinbarte Abschlussprüfung einmal ausführen lassen, anschließend risikogerechter unabhängiger Diff-Review über den Orchestrator. Keine erneute Nutzer-Planfreigabe und keine zusätzlichen Review-/Evidence-Dateien aus diesem Plan; Ergebnis direkt übergeben: Kommando, Scope, Exit, relevante Zusammenfassung/Skips und geänderte Dateien. Bei Fixes nur betroffene Checks wiederholen; breiten Lauf nur bei relevant veränderter Evidenz.

## Gemeinsame Abschlussprüfung beider Pläne

Einmal nach Zusammenführung beider unveränderten Deliverables: `npm test`, `npm run lint`, `npm run build` durch die berechtigte Builder-Rolle. Begründung: gemeinsam genutzter Template-Generator/Installationsvertrag und Release-Infrastruktur rechtfertigen einen finalen breiten Regressionstest, nicht eine volle Suite pro Rolle/Task/Fix. `build` ist laut `package.json` bereits `tsc` mit `tsconfig.json` (`src` eingeschlossen, Tests ausgeschlossen); kein separates `tsc --noEmit`. Kein Audit-Ritual: keine Dependency-/Buildtoolingänderung; geschütztes frisches Audit im normalen Release-Candidate bleibt Produktverhalten. `KIKI_RELEASE_TEST_REAL_TSC=1 npm test -- tests/integration/release-real-build.test.ts` gehört einmal zum anderen Plan und prüft realen Candidate-Compiler, nicht den Checkout redundant.

Opt-in-Suites bleiben ehrlich als übersprungen/nicht ausgeführt benannt, insbesondere echte OpenCode-Suites ohne `OPENCODE_TEST_BINARY`; weder Variablen noch Binärpfade erfinden. Keine Rehearsal/Veröffentlichung für diese Änderung. Historian-Editorials lösen keinen weiteren vollen Lauf aus, sofern nachweislich irrelevant; letzte Evidenz mit Stand referenzieren. Ein späterer Release führt seine normale Candidatevalidierung weiterhin selbst aus.

## Koordination und Ausgangslage

Unabhängig vom Release-Gate-Sourceblock; README/CHANGELOG nur einmal kumuliert durch Historian schreiben, `dist`-Build und finalen Testlauf serialisieren. Vorhanden dirty: `.agentic/kiki/TASK_REGISTRY.json`, `opencode.jsonc`; beide Specs untracked. Bewahren, keine Bereinigung/Commits und keine Live-Konfigauslieferung. `.agentic/kiki/config.json` konfiguriert nur den Health-Schwellenwert, keine abweichenden Befehle/Pfade. Planung ist reine Quellenlektüre: keine Tests/Builds ausgeführt, keine frische PASS-Evidenz.
