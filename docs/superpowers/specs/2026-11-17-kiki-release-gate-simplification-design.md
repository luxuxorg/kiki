# Kiki Release-Gate-Vereinfachung — Spec 2: Konkrete CLI (APPROVED)

Datum: 2026-11-17 · Status: **APPROVED** ·
Task: `release-gate-simplification` · Gegenstück: `2026-11-17-proportional-tests-and-artifacts-design.md`
(generische Workflow-Regeln; hier keine generischen Agentenregeln).

Nutzerfreigabe: „OK, klingen jetzt beide gut und können beide umgesetzt werden.“

## Zweck und Geltungsbereich

Vereinfachung der **vorhandenen konkreten `kiki`-CLI-Releaseimplementierung**
(`src/cli/release-gates.ts`, `src/cli/release-apply.ts`, `src/cli/commands/release.ts`) —
kein Gatekonzept für Nutzerprojekte und keine generischen Agentenregeln. Richtung bestätigt
von der Kimi-Escalation `ses_e171b7427ffeSVH0RC9JpQdwrX` (Agent `kiki-escalation`, Modell
`moonshotai/kimi-k3.1-pro`, Metadaten verifiziert; Transkript referenziert, nicht kopiert).

## Ziele

1. **Typecheck-Gate entfernen:** Der Build ruft denselben kandidateneigenen
   `node_modules/typescript/bin/tsc` mit derselben `tsconfig.json` auf wie das separate
   Typecheck-Gate; `--noEmit` ist der einzige Unterschied (`src/cli/release-gates.ts:833-864`).
   Beide decken nur `src` ab; `tests` ist ohnehin ausgeschlossen (`tsconfig.json:21-22`).
   Bedingungen offen legen: gilt **nur unter dieser Config** — ein Projekt mit anderem
   Compiler/anderer Config behält sein eigenes Typecheck-Gate (generisch nicht verallgemeinert).
   Im Code bedeutet das mehr als eine Zeile: `GateResult.name`-Typ
   (`src/cli/release-gates.ts:25-29`), die Gate-Rückgabe in `runCandidateGates`
   (`:814-887`), die Gate-Ausgabe/Verarbeitung im Release-Lauf und zugehörige
   Vertragstests (Gateanzahl, `typecheck`-Erwartungen) gehören in den Scope.
2. **Normale Release-Sequenz behalten:** ein frischer transformierter Kandidat mit einmal
   Build/Test/Lint/Security/Invariants (`src/cli/release-gates.ts:846-887`); die
   Apply-Prüfung (Verifizieren der Ausgangsdateien und geschriebenen Bytes) und der
   Rollback bleiben unverändert (`src/cli/release-apply.ts:1050-1055`, `:1086-1132`).
3. **Dry-run optional:** `--apply` verlangt und validiert selbst einen bereits geprüften
   Kandidaten; ein vorausgehender Dry-run ist optionale Vorschau, keine Pflichtstufe.
   Zwei getrennte Aufrufe erzeugen jeweils eigene Kandidaten und Gate-Läufe
   (`src/cli/commands/release.ts:640-670`) — Dopplung ohne neuen Anlass vermeiden.
4. **Keine Wiederholung ohne Anlass, keinReuse-Apparat:** keine Cross-Candidate-Pfad-
   Evidenz-Reuse-, Hash- oder Cache-Engine; keine neue Rehearsal-Rekursionssperre —
   bereits unterbunden über das Entfernen der `KIKI_RELEASE_TEST_*`-Variablen vor dem
   Candidate-Test (`src/cli/release-gates.ts:464-469`) und die Opt-in-Struktur
   (`tests/integration/oc2-release-rehearsal.test.ts:33`, `:678-680` testet genau das).
   Nutzerautorisierte Ausnahmen von der vollen Candidate-Prüfung bleiben möglich und
   werden ehrlich als autorisierte Ausnahme benannt.
5. **Ehrliche eigene Verifikation, kein pauschales Urteil:** `OPENCODE_TEST_BINARY` ist hier
   nur der klar abgegrenzte Hinweis, welche echte OpenCode-Integration in *diesem* Repo ohne
   die Variable ausfällt (`tests/helpers/oc2-fixture.ts:133-135`; Opt-in-Skips u. a.
   `tests/integration/oc2-watchdog.test.ts:125`, `routing-pipeline.test.ts:36`,
   `release-real-build.test.ts:112`) — kein generisches Gatekriterium und keine Aussage
   „npm test = keine reale Integration" für andere Integrationstests.
6. **Historie korrekt, keine Aufräumaktion:** Kein Beweis tatsächlicher mehrfacher
   3.1.0-Gates; der dokumentierte 3.1.0-Endlauf lief ausdrücklich **ohne** erneute Vollsuite
   oder Candidate-Gates (`tmp/release-3.1.0/handoff-evidence.md:4-7`). Diese Datei ist
   Historienevidenz und **kein Aufräumziel**; es gibt keine globale Löschaktion.

## Nichtziele / Anti-Ziele

- Keine Änderung generierter Agenten-/Workflow-Templates (Spec 1) und keine
  Live-/Permission-/Konfigurationsänderung.
- Keine Aufweichung von Release-Build, Release-Test, Security-Audit (zeitkritisch, frisch
  pro Release), Invariants oder Apply-Verifizierung/Rollback.
- Kein neue Kandidatenidentitäts-, Evidence-Reuse- oder Rekursivschutzschicht.
- Keine Verallgemeinerung der Typecheck-Entscheidung auf andere Projekte.

## Abnahmekriterien

- `runCandidateGates` liefert fünf statt sechs Gate-Ergebnisse; `typecheck` ist aus Typ,
  Ausführung, Auswertung und Vertragstests entfernt; die Config-Bedingung
  (Build ≡ Typecheck unter `tsconfig.json:21-22`) steht als Kommentar/Begründung im Code.
- Release-Lauf verlangt keinen vorgeschalteten Dry-run vor `--apply`; `--apply`-Verhalten
  (Validierung, Byte-Verifikation, Rollback) ist unverändert und durch bestehende Tests
  abgedeckt.
- Kein neues Prüf-/Reuse-/Sperrmodul; Rehearsal-Opt-in-Struktur unverändert.

## Auswirkungen

`src/cli/release-gates.ts` (Gate-Typ `:25-29`, `runCandidateGates` `:814-887`);
`src/cli/commands/release.ts` (Gate-Auswertung/Ausgabe); zugehörige Vertragstests
(Gateanzahl/-namen, z. B. in `tests/cli/*` und `tests/integration/oc2-release-rehearsal.test.ts`,
das die Gate-Sequenz beobachtet). Nicht berührt: `release-apply.ts`-Logik (nur ggf.
Dokumentation des Dry-run-Verhältnisses), `release-candidate.ts`, generische Templates.

## Verworfene Alternativen

- **Cross-Candidate-Evidenz-Reuse über `changedPaths`/`REQUIRED_TRANSFORMED_FILES`
  (`src/cli/release-gates.ts:32-39`, `:696-725`):** beschreibt erlaubte Release-Transforms,
  keine semantische Kandidatengleichheit; jeder Kandidat kopiert frisches `node_modules`
  (`src/cli/release-candidate.ts:565-593`) und wird nach dem Lauf entsorgt
  (`src/cli/commands/release.ts:717-720`); Audits sind zeitabhängig. Verworfen.
- **Sechs-Gate-Status quo:** Typecheck-Dopplung bliebe.

## Quellen

`src/cli/release-gates.ts:25-53`, `:464-470`, `:587-735`, `:814-898`;
`src/cli/release-apply.ts:1050-1055`, `:1086-1132`;
`src/cli/commands/release.ts:635-650`, `:715-722`;
`src/cli/release-candidate.ts:565-593`; `tsconfig.json:21-22`;
`tests/helpers/oc2-fixture.ts:133-135`;
`tests/integration/oc2-release-rehearsal.test.ts:33`, `:433`, `:678-680`;
`tests/integration/release-real-build.test.ts:112`;
`tmp/release-3.1.0/handoff-evidence.md:4-7`.
Escalation-Transkript: `ses_e171b7427ffeSVH0RC9JpQdwrX` (s. o.).
