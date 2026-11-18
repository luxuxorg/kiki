# Proportionaler Kiki-Workflow — Spec 1: Allgemeine Regeln (APPROVED)

Datum: 2026-11-17 · Status: **APPROVED** ·
Task: `proportional-tests-and-artifacts` · Gegenstück: `2026-11-17-kiki-release-gate-simplification-design.md`
(Kiki-eigene Release-CLI, separat freigebbar; keine Übersichts-/Mischdatei).

Nutzerfreigabe: „OK, klingen jetzt beide gut und können beide umgesetzt werden.“

## Zweck und Geltungsbereich

Regeln für den **generierten Kiki-Workflow in beliebigen Nutzerprojekten**: Prompt- und
Workflow-Templates, die `kiki init`/`kiki update` generiert. Check-Auswahl und Artefaktumfang
folgen dem jeweiligen Projekt, seinen konfigurierten Befehlen und seinem Risiko. Die
generierte Softwarequelle ist Kiki-eigener Code; das erzeugte Regelverhalten ist generisch.
Keine Annahmen über npm/vitest/tsc/`OPENCODE_TEST_BINARY` und kein fester Compiler-/
Kandidaten-/Release-Gate-Katalog für fremde Projekte (das ist Spec 2).

Richtung (vom Nutzer bestätigt): **kleiner Standardablauf, Zusatzschritte nur bei konkretem
Bedarf.** Bestätigt/korrigiert von der Kimi-Escalation, Session
`ses_e171b7427ffeSVH0RC9JpQdwrX` (Agent `kiki-escalation`, Modell `moonshotai/kimi-k3.1-pro`
per Session-Metadaten verifiziert; finale Antwort im Transkript referenziert, nicht kopiert).

## Ziele

1. **Proportionaler Builder-Handoff:** statt „alle vier Checks mit vollständigem Output"
   (`src/cli/config.ts:501-508`) die vom Delta betroffenen Checks. Handoff: Kommando, Scope,
   Exit-Status, relevante Ergebnisse; Fehlerausgaben vollständig, Erfolg nur Zusammenfassung.
   Nicht ausgeführte Checks kurz begründen — ein Satz, kein Negativkatalog pro Task.
   Test-Status semantisch korrekt unterscheiden: **fehlgeschlagen / bestanden / übersprungen /
   nicht ausgeführt** — nicht aus einem Test-Exit-Status „volle echte Integration" ableiten.
2. **Fokussierte Tests mit breitem Fallback:** Check-Auswahl nach Änderungsradius, gemeinsam
   genutzter Infrastruktur, vorhandenen fokussierten Tests und verbleibender Unsicherheit.
   Volle Suite nur begründet: unklarer Radius oder echter Querschnitt (Permission-/
   Publishing-Grenzen, Generierungs-/Installationsinfrastruktur, Build-/Testkonfiguration) —
   nicht automatisch wegen einer kleinen Änderung an einem benannten Pfad.
   Volle Wiederholung ohne relevanten Anlass entfällt.
3. **Ehrliche Evidenzwiederverwendung:** nachweislich irrelevante Docs-/Version-/Prompt-Deltas
   zitieren die letzte aufgezeichnete PASS-Evidenz als *früheren PASS an bezeichnetem
   Arbeitsstand* — nie als frischen PASS fingiert. Kein Cache.
4. **Kleiner Workflow ohne Dokumentenpflicht:** klare, niedrigriskante lokale Tasks ohne
   persistente Spec/Plan-Dateien, ohne Architect-Gate, ohne separates PASS-Berichtsdokument;
   vorhandenes Gespräch/Handoff plus knapper Registry-Status genügt. Normale Code-Diffs und
   semantisch relevante Prompt-Diffs bekommen einen risikogerechten finalen Diff-Review;
   reine Editorials ohne eigenen Agentenlauf.
5. **Doku/Registry schlank:** Historian nur, wenn bestehende Doku tatsächlich veraltet; das
   Dokumentations-Gate als eigener Pflichtschritt entfällt. Registry führt Zustand und
   Verweise, keine Berichtsduplikation (Review-Notizen nicht doppelt in Dokument *und*
   Registry-Prosa, `src/cli/config.ts:590`, `:808`).
6. **Reviews nach Bedarf:** Plan-Re-Review nur bei substanziellen, nicht bei mechanischen
   Revisionen; Necessity-Katalog nur bei neuen Dependencies/Persistenz/Abstraktionen/
   Scope-Wachstum (Prinzip „kleinste ausreichende Änderung" bleibt im normalen Review);
   Parallelitätsprüfung nur bei tatsächlicher Parallelisierung.
7. **Veraltete Bestände dem zugehörigen Change zuordnen:** obsolete prosa-pinnende
   Assertions werden gezielt mit den jeweiligen Regeländerungen korrigiert; die veraltete
   Workflow-Kopie (`.opencode/docs/agentic-workflow.md:16-17`, `:61-82`, veraltet gegenüber
   Generator `src/cli/config.ts:905-913`, `:983-997`) wird mit klarem begrenztem Umgang
   eingestellt, kein Synchronisationsframework. README nur Abschnitte, die wegen der
   jeweiligen Änderung falsch/überflüssig sind.

## Nichtziele / Anti-Ziele

- Keine Cache-, Hash- oder Evidence-Engine; kein Risiko-Konfigurationsschema; kein neues
  Gate zur Prüfung der Check-Auswahl — der vorhandene Reviewer beurteilt die Auswahl im
  bestehenden Review.
- Keine pauschale „Codeänderung → volle Suite" und ebenso wenig „Prompt → automatisch
  harmlos"; Promptdeltas werden semantisch bewertet.
- Keine neuen Registry-Pflichtfelder, Waiver-Formulare oder Necessity-/Negativkataloge.
- Kein Abbau von: Pre-change-Inventur und Schutz vorhandener Nutzerdateien
  (`src/cli/config.ts:520-526`), Publishing-/Permissiongrenzen, Loop-Caps,
  Eskalationsregeln.
- Keine globale Historien-/Artefaktlöschung; `tmp/release-3.1.0/handoff-evidence.md`
  ist keine Aufräumziel dieser Spec.
- Keine Änderung an Release-Gate-Code oder Live-Agent-Konfiguration in diesem Task
  (Spec 2 bzw. `kiki update` getrennt).

## Abnahmekriterien

- Generierte Builder-/Reviewer-/Workflow-Templates verlangen keine vier festen Checks und
  kein vollständiges Output-Dump mehr; sie verlangen betroffene Checks, ehrlichen Status je
  Check (fehlgeschlagen/bestanden/übersprungen/nicht ausgeführt) und eine Kurz-Begründung
  für ausgelassene relevante Checks.
- Kleine Tasks können ohne Spec-/Plan-Datei, Architect-Gate und PASS-Berichtsdokument
  abgeschlossen werden; Review- und Dokumentationsumfang folgen dem Risiko.
- Textpinnende Assertions, die ausschließlich die alte Vier-Checks-/Komplett-Output- und
  Artefaktpflicht festlegen (`tests/cli/loop-controls.test.ts:310-360`, `:984-1018`;
  Prompt-Inhalts-Duplikate `tests/cli/install.test.ts:72-245`), sind mit den Regeln
  entfernt bzw. semantisch fokussiert.
- **Geschützt bleiben unverändert:** Sicherheits-/Permission-Grenzentests,
  Release-Delivery- und Apply-Verifikationstests, Verhaltens- und Install-/Update-Tests,
  Watchdog-Tests; Permission-Arrays nur soweit Teil des genehmigten Designs.

## Auswirkungen

Berührt: `src/cli/config.ts` (`buildBuilderHandoffPrompt` `:501-527`, Reviewer-Template
`:780-818`, Planner `:700-720`, Orchestrator `:580-651`, Workflow `:883-998`, Necessity-Einbau
`:484-494`, `:800-808`); zugehörige Generierungstests (`tests/cli/loop-controls.test.ts`,
`tests/cli/install.test.ts`); `.opencode/docs/agentic-workflow.md` (Einstellung);
README-Abschnitte, die diese Regeln falsch beschreiben. Nicht berührt:
`src/cli/release-gates.ts` (Spec 2), Live-Agent-Rechte (kein `kiki update`-Rollout in
diesem Task — getrennt freigeben und ausliefern).

## Verworfene Alternativen

- **„Code mit echtem Risiko → einmal volle Suite":** zu pauschal; ersetzt durch
  Radius-/Infrastruktur-/Unsicherheits-basierte Auswahl mit begründetem breitem Fallback.
- **Cross-Candidate-Pfad-Evidenz-Reuse (automatisch):** Pfadlisten beschreiben erlaubte
  Transformationen, keine semantische Gleichheit; kein Kandidat lebt über den Release-Lauf
  hinaus (`src/cli/commands/release.ts:717-720`). Verworfen (Details in Spec 2).
- **Status quo:** Vier-Checks-Komplett-Output-Pflicht pro Runde, Dokumentenpflicht für
  jeden Task — die beobachtete Wiederholungs- und Artefaktvermehrung bliebe.

## Quellen

`src/cli/config.ts:37-42` (Befehle konfigurierbar), `:98-110`, `:484-527`, `:580-651`,
`:700-720`, `:780-818`, `:883-998`; `src/cli/commands/init.ts:96-106` (Test-Befehl frei
wählbar, z. B. pytest); `tests/cli/loop-controls.test.ts:310-360`, `:984-1018`;
`tests/cli/install.test.ts:72-245`; `.opencode/docs/agentic-workflow.md:16-17`, `:61-82`
(veraltet); `src/cli/config.ts:905-913`, `:983-997` (aktueller Generator-Zustand);
`src/cli/opencode-config.ts:523-526` (Installation generiert Workflow aus dem Generator).
Lokale Erkenntnis ohne Specinhalt: Nutzer führte `kiki update` selbst aus
(`~/.config/opencode/agents/kiki-implementer.md` aktuell; dort sind noch die alten
Vier-Checks/Komplett-Output-Zeilen enthalten — wird erst mit dieser Spec über ein
späteres `kiki update` wirksam). Entfernte OC1/OC2-Redirects aus `~/.local/bin/kiki` waren
separate, ausdrücklich nutzerautorisierte Live-Aktionen, kein Teil beider Specs.
Escalation-Transkript: `ses_e171b7427ffeSVH0RC9JpQdwrX` (s. o.).
