# „Kiki permission plan (verbatim)“-Ausgabe — Faktanalyse (read-only)

- **Date:** 2026-11-23 · **Reviewer:** kiki-reviewer (read-only Subagent)
- **Auftrag:** Fakten zur korrigierten Nutzerbeobachtung — Ausgabe „Kiki permission plan (verbatim):\n  [generated] /home/lutz/.config/opencode/opencode.jsonc: read * allow“ plus „ein paar hundert mehr“. Fragen: welcher Subcommand, was `[generated]` heißt, Anzeige vs. Schreibmenge, Ursprung der Hunderte, Verstoß gegen eine dokumentierte Anforderung „keine langen Einzellisten“. Keine Implementation, kein Config-Zugriff, kein Update-Lauf, keine Session-Rekonstruktion.
- **Geprüft:** `src/cli/opencode-config.ts` (insb. `installGlobalFiles` :732-862, `configFiles` :179-184, `configTarget` :223-225, `collectAgentSources` :673-717), `src/cli/permission-consolidation.ts` (:41, :4056-4119), `src/cli/commands/permissions.ts` (komplett), `src/cli/permission-requests.ts` (:68-94), `src/cli/commands/update.ts`, `src/cli/commands/install.ts`, `src/cli/config.ts` (:288-539, :527-539); `git log -S`, `git show` auf `bb1acee`/Arbeitsdiff; Specs/Plans/Reviews 2026-11-13, 2026-11-19, 2026-11-20, 2026-11-23; TASK_REGISTRY; README/CHANGELOG. Regelzählung ausschließlich am Repo-eigenen Generator (`dist/cli/config.js` resp. `git show bb1acee:dist/cli/config.js`), nie an der privaten Live-Konfiguration.

## Verdict: PASS_WITH_NOTES

**Basis:** Vollständige Codepfad- und Historie-Analyse der zitierten Ausgabe gegen den tatsächlichen Quellcode (HEAD 8c71efe + uncommitteter Arbeitsstand) und die approbierten Specs/Plans. Alle Zahlen (505/569 Regeln) am Repo-Generator gemessen, nicht erfunden; Live-Konfiguration bewusst nicht gelesen. Kein belegbarer Verstoß gegen eine im Repository dokumentierte Anforderung gefunden; die dokumentierten Anforderungen verlangen die Voll-Auflistung ausdrücklich. Notes unten.

## Befunde

### 1. Welcher Code die Ausgabe emittiert

- Der String `Kiki permission plan (verbatim):` existiert im gesamten Quellbaum genau einmal: `src/cli/opencode-config.ts:762`, in `installGlobalFiles()` (:732).
- Erreicht wird `installGlobalFiles` nur über **`kiki update`** (`src/cli/commands/update.ts:7`, mit `update=true`) und **`kiki install` ohne `--project`** (`src/cli/commands/install.ts:25`).
- **`kiki permissions list|check|add|remove` druckt diese Zeile nie** (`src/cli/commands/permissions.ts` komplett geprüft; Formate: `list` = tab-getrennt `scope file agent index action resource effect` :157; `add`/`remove` = `proposal`/`updated`/`unchanged`-Zeilen :200-206, :224-230).
- Die Nutzer-Korrektur („kommt von kiki permission“) ist inhaltlich richtig (es ist der Permission-Plan), aber der emittierende Befehl ist `kiki update` (oder `kiki install`) — **nicht** der `kiki permissions`-Subcommand. Die ursprüngliche Assoziation mit `kiki update` war vom Befehl her die richtigere.

### 2. Was `[generated]` bedeutet

- Label aus `classifyPermissionSources` (`src/cli/permission-consolidation.ts:4098-4119`): Jede Regel jedes Quelleintrags wird gegen die „known“-Menge klassifiziert (:4103-4107) = historisch belegte Generator-Sequenzen (`HISTORICAL_GENERATED_SEQUENCES`, :41, gepinnt in `tests/fixtures/kiki-permission-history.json`) ∪ frische kanonische Baseline (`generateAgentPermissions(DEFAULT_CONFIG)`).
- Treffer = `[generated]` = ersetzbarer bekannter Default; kein Treffer = `[custom]` = bleibt unverändert erhalten (exakte Dedup, Begegnungsreihenfolge).
- Die zitierte erste Zeile `[generated] … read * allow` ist das erste Tupel des kiki-orchestrator-Arrays (erste Rolle in `AGENT_NAMES`, `opencode-config.ts:21-22`; erste Baseline-Regel `allow('read','*')`, `config.ts:303`).

### 3. Anzeige vs. Mutation (display ≠ write)

- Der Report listet **jede Regel jeder Quelle für alle 8 Rollen** — keine Deltas: Schleife `opencode-config.ts:752-758` pusht pro Regel eine Zeile (:757), Quellen = existierende globale Config-Dateien (`opencode.json`+`opencode.jsonc`, :179-184) plus Rollen-Markdown (:684-707).
- Der Druck (:762-763) erfolgt **vor** jeder Mutation und **vor** dem `needsChange`-Early-Return (:815-819): Auch ein vollständig konvergierter, **schreibfreier** Update-Lauf druckt die gesamte Auflistung. Anzeige kann also hunderte Zeilen lang sein, während das Writeset leer ist (nur „Kiki installed/updated globally …“ folgt).
- Tatsächliches Writeset bei Änderung: Registration, Rollen-Markdowns, Workflow-Datei, `agents.<name>.permissions` im globalen Ziel-File (`configTarget` :223-225 = letzte existierende aus `[opencode.json, opencode.jsonc]`, Default `opencode.jsonc`) via `patchAgents` (:836), Plus Bereinigung anderer globaler Config-Dateien (:837-839) und V1-Reste. Bei Konvergenz: **null Schreiboperationen**.

### 4. Ursprung der „Hunderte“ (belegte Zahlen)

- Eine Zeile pro persistenten Regel; seit der Single-Source-Architektur (`bb1acee`, 2026-11-20) liegen alle 8 Rollen-Arrays in `~/.config/opencode/opencode.jsonc`.
- Gemessen am Repo-eigenen Generator (nicht an der Live-Konfiguration):
  - **bb1acee-era:** 505 Regeln gesamt (59-72 je Rolle) — `git show bb1acee:dist/cli/config.js`, `generateAgentPermissions(DEFAULT_CONFIG)`.
  - **Aktueller Arbeitsstand:** 569 Regeln gesamt (67/70/70/74/71/70/67/80 je Rolle) — `dist/cli/config.js`.
- Jeder `kiki update` ab bb1acee druckt also ~505-569 `[generated]`-Zeilen + Kopfzeile — deckt „und dann noch ein paar hundert mehr“ exakt mechanisch. Die genaue Live-Zeilenzahl hängt vom installierten Binary und der Live-Konfiguration ab (unbewiesen, s. §7).
- **Rollenname fehlt pro Zeile**: Format :757 ist `  [kind] file: action resource effect` — kein Agentenname, keine Gruppierungsüberschrift. Die Zeilen sind nur implizit nach `AGENT_NAMES`-Reihenfolge sortiert. Damit ist die Nutzer-Vermutung „roles omitted“ im Wortsinn korrekt: Die Zuordnung welcher Zeile zu welcher Rolle gehört ist aus der Ausgabe nicht ablesbar.

### 5. Keine Schuld der letzten Reconciliation

- `git log -S "Kiki permission plan (verbatim)"` → einziges Vorkommen: eingeführt in **`bb1acee`** (2026-11-20 16:21:58 +0100). Die Voll-Enumeration (`report.push` je Regel je Agent) ist genauso alt wie der Druck selbst (`git show bb1acee:src/cli/opencode-config.ts` :670-676).
- HEAD `8c71efe` und der uncommittete Reconciliation-Stand (Löschung `permission-ownership.ts`) behalten die Enumeration unverändert (Arbeitsdiff um :752-763 zeigt nur Löschung des Ownership-Zweigs; `[owned]`-Zusatzzeilen entfallen — der Report wird allenfalls **kürzer**, nie länger).

### 6. Dokumentierte Anforderungen — Voll-Auflistung ist approbiertes Design, kein Verstoß

- Spec `docs/superpowers/specs/2026-11-19-global-permissions-single-source-design.md` §6 :89-93: „custom rules are preserved verbatim … and **listed verbatim in the dry-run report that precedes every live write**“; :81-83 „validate/classify all config + markdown sources and report … verbatim report“; Settled defaults :174-177: „`kiki update` replaces the kiki-owned baseline … **reported verbatim**“. Spec-Status :3-4: APPROVED, inkl. batch-approbiertem Rollout.
- Plan `docs/superpowers/plans/2026-11-19-global-permissions-single-source-plan.md:101`: „**Pre-write console report lists each source/rule/classification and proposed preservation/replacement verbatim**“.
- Spec-Review `.agentic/reviews/2026-11-19-global-permissions-single-source-spec-review.md` Note 3 (:32): Report bewusst **verstärkt**: „list replaced and preserved rules **verbatim** (not just counts)“ — Auditierbarkeit einer Kollision (Custom identisch zu Legacy-Signatur würde fallen gelassen).
- **Kein Repository-Artefakt dokumentiert eine Nutzer-Anforderung „keine langen individuellen Rule-Listen“** für CLI-/Update-Ausgaben. Nächste Treffer anderer Art: `2026-11-13-loop-controls-design.md:29` („constraint-heavy, duplicated rule lists measurably reduce compliance“ — betrifft Agenten-Prompts, nicht CLI-Output) und `2026-11-20-managed-permission-requests-design.md:15` („User goal (KISS): clean, convergent `kiki update`, no persistent garbage“ — persistent state, nicht Anzeigelänge).
- README/CHANGELOG dokumentieren die Update-Report-Ausgabe **nirgends** (nur `kiki permissions list|check`-Format, CHANGELOG :42-44). Die Ausgabe ist also spec-/plan-gedeckt, aber für Nutzer undokumentiert.

### 7. Unbekannt / bewusst nicht geprüft

- Live-Zustand: welche Version das installierte Binary fährt (Repo: alles unter CHANGELOG `[Unreleased]`, dist/ uncommittet modifiziert), ob/wann der letzte Live-Update-Lauf passierte, exakte Live-Regelzahl — dafür müsste die private Konfiguration gelesen werden (unterlassen; Secrets-Risiko). Die Ausgabeform selbst beweist mindestens bb1acee-Stand des emittierenden Codes.
- Ob die Nutzer-Erinnerung „prior requirement no long individual rule lists“ auf eine Aufzeichnung außerhalb dieses Repos (Session/Transkript) zurückgeht — nicht zugreifbar, daher **weder belegbar noch widerlegbar**; aus Repo-Artefakten lässt sie sich nicht bestätigen.
- Einziger sinnvoller Folgefrage-Kandidat: „Welchen Befehl hast du genau ausgeführt (vermutlich `kiki update`?) und von welchem Stand lief dein installiertes kiki?“ — klärt nur die Live-Version, nicht das Verhalten (das ist vollständig aus dem Code belegt).

## Notes (nicht blockend)

1. **Anzeige-Volumen:** Report = 1 Zeile je Regel (aktuell 569, zur bb1acee-Zeit 505), auch bei Null-Writes; mit Rollenname je Zeile wäre er deutlich lesbarer, ohne eine Anforderung zu verletzen — reine Nutzer-Entscheidung, kein Fix vorgeschlagen (Auftrag: kein Design).
2. **Dokumentationslücke:** Der verbatim-Report ist in keinem nutzerlesbaren Dokument (README/CHANGELOG) erwährt; nur Spec/Plan/Reviews.
3. **Attribution:** Nutzer-Korrektur „kommt von kiki permission“ ist thematisch richtig, befehlsseitig aber `kiki update`/`kiki install`; `kiki permissions list` hätte ein anderes Format (mit Agent und Scope je Zeile) und kann die zitierte Ausgabe nicht erzeugt haben.
4. **Reconciliation entlastet:** Ausgabelänge existiert unverändert seit bb1acee; der uncommittete Stand macht den Report höchstens kürzer (Wegfall der 8 `[owned]`-Zeilen).

**Verdict: PASS_WITH_NOTES** — kein belegbarer Anforderungsverstoß; Befunde oben. Keine Fixes/Designs vorgeschlagen.
