# Kiki Release Gate Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline and without nested delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das redundante separate Typecheck-Gate aus Kikis Release-Candidate-Vertrag entfernen; fünf geschützte Gates und Apply-Sicherheit behalten.

**Architecture:** `GateResult.name` und `runCandidateGates` minimal ändern; existierende dynamische Ausgabe/Auswertung bleibt bestehen. Tests pinnen exakt fünf Ergebnisse und einen Candidate-Compilerlauf; kein Cache, keine neue Sequenzierungslogik.

**Tech Stack:** Bestehendes TypeScript, Vitest und Candidate-Test-Fixtures; keine neuen Dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-kiki-release-gate-simplification-design.md` (APPROVED).

## Global Constraints

- Task-ID: `release-gate-simplification`; keine generischen Agenten-/Workflow-Templateänderungen (separater Plan).
- „Keine Aufweichung von Release-Build, Release-Test, Security-Audit (zeitkritisch, frisch pro Release), Invariants oder Apply-Verifizierung/Rollback.“
- „Kein neue Kandidatenidentitäts-, Evidence-Reuse- oder Rekursivschutzschicht.“ Rehearsal-Opt-in und Entfernen der `KIKI_RELEASE_TEST_*`-Variablen unverändert.
- Build ≡ Typecheck gilt nur für denselben kandidateneigenen Compiler mit derselben `tsconfig.json`; keine Verallgemeinerung auf andere Projekte.
- Keine Secrets im Source, ausschließlich parametrisierte DB-Queries, keine internen Stacktraces in API-Antworten; Alignment unverändert.
- Implementer Source/Tests, Historian Doku, Orchestrator Registry. Keine Permission-/Live-/globale Konfigänderung, kein Commit/Push/Release/Install/Update/Rollout.
- `tmp/release-3.1.0/handoff-evidence.md` nicht löschen oder als frische Verifikation ausgeben; vorhandene Nutzerdateien schützen.

## Review Focus

Diese fünf Fälle werden in Task 1 geprüft:
- Fehlender Candidate-Compiler oder Compilerfehler: Build bleibt blockierend, kein Typecheck als Ersatz oder fünftes verlorenes Gate.
- Gatevertrag und CLI-Ausgabe: exakt `build`, `test`, `lint`, `security`, `invariants` in dieser Reihenfolge, kein `typecheck`.
- Direkter Apply ohne Dry-run: genau ein frischer validierter Candidate, kein neuer Vorschauzwang.
- Audit unvollständig/fehlerhaft oder sonstiges Gate fehlgeschlagen: kein Apply; bestehende Ausnahmebedingungen bleiben unverändert.
- Schreib-/Byteverifikations-/Rollbackfehler und fremde Dateien: bestehende geschützte Apply- und Sicherheitstests unverändert grün.

---

### Task 1: Fünf-Gate-Vertrag durchgängig liefern

**Metadata:**
- risk: medium
- parallel: true
- depends_on: []

**Dateizuordnung:**
- Implementer: `src/cli/release-gates.ts:25-29,814-887` — Name-Union, Compileraufruf, Rückgabe, begrenzter Begründungskommentar.
- Prüfen, voraussichtlich keine Änderung: `src/cli/commands/release.ts:438-442,640-670` — dynamische Ausgabe/Fehlerfilter und bereits optionaler Dry-run. `src/cli/release-apply.ts`, `release-candidate.ts` bleiben unverändert.
- Implementer/Test: `tests/cli/release-gates.test.ts`, `tests/cli/release.test.ts`, `tests/integration/release-real-build.test.ts`, `tests/integration/oc2-release-rehearsal.test.ts`.
- Historian: `README.md` nur aktuelle Release-/Development-Abschnitte; `CHANGELOG.md` knapper Unreleased-Eintrag. Historische „six gates“-Evidenz bleibt historisch korrekt.
- `dist/cli/release-gates.*` nur durch vorhandenen regulären Build einer berechtigten Rolle erzeugen; kein manueller Dist-Patch, keine alternative Schreibroute.

**Interfaces:**
- `GateResult.name: 'build' | 'test' | 'lint' | 'security' | 'invariants'`; `status: 'passed' | 'failed' | 'incomplete'` und `detail: string` unverändert.
- `runCandidateGates(candidate: Candidate, next: string, date: string, runner: CommandRunner, securityException?: string): Promise<GateResult[]>` bleibt signaturgleich und liefert genau fünf Einträge in obiger Reihenfolge.
- `reportGates(gates: GateResult[], log: (line: string) => void): void` sowie der vorhandene Filter `gate.status !== 'passed'` konsumieren das Array bereits dynamisch; keinen neuen Adapter oder feste Gatezahl einbauen.

**Entscheidung:** Typecheck-Block löschen statt „übersprungenes“ sechstes Gate behalten (Spec Ziel 1/Abnahme). Der bestehende Build verwendet bereits `node_modules/typescript/bin/tsc -p tsconfig.json`, Typecheck denselben Compiler mit einzig zusätzlichem `--noEmit`; `package.json` build=`tsc`, `tsconfig.json` umfasst `src`, nicht `tests`. Keine zusätzliche Abstraktion/Persistenz: dynamische Verarbeitung trägt den kleineren Vertrag bereits, und neues Reuse würde frische Kandidaten/Audits unterlaufen (Spec Ziele 2–4).

- [ ] **1. Vertragstests auf fünf Gates ändern und RED prüfen.** In `release-gates.test.ts` den vorhandenen Invocation-Contract auf exakte Namen `['build', 'test', 'lint', 'security', 'invariants']` und fünf Statuswerte setzen; genau einen TSC-Aufruf mit `[tools.tsc, '-p', 'tsconfig.json']`, keinen `--noEmit`-Aufruf erwarten. Im Missing-tools-Test nur das obsolete Typecheck-Ergebnis entfernen; Build-/Lint-Fail-closed, keine Downloads und Umgebungsschutz behalten. Compilerfehler muss weiterhin Build failed und Releaseblock ergeben. Ausführen: `npm test -- tests/cli/release-gates.test.ts tests/cli/release.test.ts`; erwartet gezieltes FAIL wegen altem Sechs-Gate-Vertrag.
- [ ] **2. Release- und Integrationserwartungen anpassen.** In `release.test.ts` Sechs-Namen/-Status-Arrays durch die exakten fünf ersetzen, bisherigen `typecheckCalls`-Count von 1 auf 0 setzen, einen Build/Test/Lint/Audit-Aufruf und CLI-Ausgabe für alle fünf sowie Abwesenheit eines `typecheck:`-Logs pinnen. Bestehenden erfolgreichen direkten Apply-Test ohne vorherigen Dry-run um denselben Fünf-Gate-/Einmal-Ausführungsvertrag ergänzen; vorhandene Dirty-/Security-/Fehler-/Rollbacktests erhalten. In `release-real-build.test.ts` Testname, Namen/Status und Typecheck-Detail-Erwartung aktualisieren, realen Compilerlauf einmal ohne `--noEmit` sowie erzeugtes `dist` weiter prüfen. In `oc2-release-rehearsal.test.ts` ausschließlich `GATE_NAMES` und aktuellen Sechs-Gate-Kommentar auf fünf umstellen; Opt-in, Rekursionsschutz, Assertions zur entfernten Umgebung und Sicherheit unverändert.
- [ ] **3. Produktionsvertrag minimal ändern.** `typecheck` aus `GateResult.name`, separatem Aufruf und Ergebnisarray entfernen; Rückgabe `[build, test, lint, security, invariants]`. Beim Build kommentieren: derselbe Candidate-TSC/dieselbe Config prüft Quellen bereits beim Emit; Tests bleiben ausgeschlossen und die Entscheidung ist Kiki-configspezifisch. Dynamische Verarbeitung in `commands/release.ts` anhand Step-2-Tests prüfen und unverändert lassen, wenn sie wie gelesen fünf Ergebnisse korrekt verarbeitet. Keine Änderung an Apply/Byteprüfung/Rollback, Security-Audit oder Dry-run-Sequenz.
- [ ] **4. Fokussiert GREEN und reale Compilerabdeckung.** Ausführen: `npm test -- tests/cli/release-gates.test.ts tests/cli/release.test.ts tests/cli/release-apply.test.ts tests/cli/release-gates-safety-spy.test.ts tests/cli/release-safety-spy.test.ts` und einmal `KIKI_RELEASE_TEST_REAL_TSC=1 npm test -- tests/integration/release-real-build.test.ts`. Erwartet alle ausgewählten Tests bestanden, ein realer Candidate-Build mit Emit, kein zweiter Compilerlauf. Die zusätzlichen unveränderten Apply-/Safety-Tests sichern die geschützten Randbedingungen des entfernten Gates; keine reale Audit-Netzwerkprüfung, Fixtures injizieren Auditantworten. Opt-in-Rehearsal nicht aktivieren: sie validiert einen kompletten Releaseablauf samt voller Candidate-Suite/Audit, unverhältnismäßig für diese Vertragsänderung; ihre Name-Erwartung wird aktualisiert und ihr Nichtlauf offengelegt.
- [ ] **5. Doku und gemeinsamen Abschluss übergeben.** Historian ersetzt README-Aussage zum separaten Candidate-Typecheck durch fünf Gates und erklärt unter aktueller Config den Build als Quelltypprüfung. Den Development-Doppelaufruf nicht als zusätzlichen Pflichtcheck darstellen; optionalen Standalone-Typecheck höchstens als Alternative zum Build benennen. Dry-run ausdrücklich optionale Vorschau, `--apply` validiert selbst; keine Codeänderung dafür. Historische Rehearsal-Ergebnisse, Install-/Updateanleitungen und andere README-Abschnitte nicht bereinigen. README/CHANGELOG zusammen mit dem anderen Deliverable kumulieren. Danach einmal gemeinsame Abschlussprüfung unten und unabhängigen Diff-Review durch Orchestrator; kein Nutzer-Planfreigabegate, keine neuen Review-/Evidence-Dateien.

## Gemeinsame Verifikation und Handoff

Dies ist derselbe gemeinsame Abschluss wie im Plan `2026-11-17-proportional-tests-and-artifacts-plan.md`, kein zweiter Auftrag: nach beiden Blöcken einmal `npm test`, `npm run lint`, `npm run build`. Breiter Lauf ist wegen gemeinsam genutztem Generator/Installationsvertrag plus Release-Infrastruktur begründet; nicht pro Task/Rolle/Fix wiederholen. Build prüft bereits `src` per TSC, daher kein separates Checkout-`tsc --noEmit`. Der gezielte reale Candidate-Build oben prüft dagegen Compilerauflösung/Emit im Candidate und ist keine doppelte Checkout-Typprüfung. Bei unabhängigem Einzelabschluss genügt der begründete fokussierte Scope, sofern der tatsächliche Diff keinen größeren Radius zeigt.

Kein `npm audit` als Implementationsritual ohne Dependency-/Buildtoolingdelta; der normale spätere Release behält frisches Audit und alle fünf Candidate-Gates. Keine `kiki release`-/Dry-run-/Apply-Ausführung jetzt. `KIKI_RELEASE_TEST_OC2_REHEARSAL` bleibt ungesetzt; echte OpenCode-Suites ohne `OPENCODE_TEST_BINARY` sind übersprungen/nicht ausgeführt, nicht bestanden. Handoff: Kommando, Scope/Arbeitsstand, Exit, relevante Ergebnisse/Skips, vollständige Fehlerausgaben statt Erfolgsdumps; keine neue Logsammlung. Historische PASS nur mit damaligem Stand referenzieren.

## Koordination und Ausgangslage

Source-/Testdateien sind unabhängig vom anderen Plan; gemeinsame Schreibkonflikte nur README/CHANGELOG und einmalig generiertes `dist`. Historian und Abschlussbuild serialisieren, Sourcearbeit kann ohne neuen Worktree getrennt erfolgen. `.agentic/kiki/TASK_REGISTRY.json` und `opencode.jsonc` sind bereits dirty, Specs untracked; nicht aufräumen oder fremde Änderungen übernehmen. Konfiguration enthält nur Health-Override, keine abweichenden Testbefehle. Keine Checks während dieser Planung ausgeführt, keine aktuelle PASS-Aussage. Falls die vorgesehene Build-/Dateioperation keine Berechtigung hat, gezielte Freigabe anfragen; bei Ablehnung stoppen statt alternative Tools/Schreibwege verwenden.
