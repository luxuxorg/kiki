# Berechtigungs-Baseline vereinfachen — Design

**Datum:** 2026-11-23 · **Status: ENTWURF.** Die Richtung hat der Eigentümer freigegeben; dieses Dokument wartet noch auf seine ausdrückliche Freigabe. Vor ihr wird nichts umgesetzt: keine Config geschrieben, kein `kiki update` gestartet.

## 1. Das Problem

Kiki startete am 12.06.2026 mit 18 Regeln für 5 Rollen; über sieben Ausbauschritte sind daraus 569 Regeln für 8 Rollen geworden (277 Shell-, 112 Secret-, 93 Schreib-, 79 Routen-Regeln, 8 Lese-Freigaben). Diese Listen kann niemand mehr überblicken oder prüfen — und die nächste Anwachs-Runde steht bereits an.

## 2. Was danach gilt

**Der Kern-Kompromiss in einem Satz:** Der Preis dafür, dass Routine-Arbeit frei läuft, ist, dass Veröffentlichen nur noch durch Verhalten zugestimmt wird — der bindende Prompt und die Mitschrift sind das Rückgrat; mechanisch fragt nur `git push` nach.

Alles bleibt in der globalen OpenCode-Konfiguration; die Rollen-Beschreibungen (Markdown) bleiben reine Prompts. Neu gilt:

**Pro Rolle (8 Kiki-Rollen, je höchstens 9 Zeilen; Reihenfolge wichtig — die letzte passende Regel gewinnt):**

- `shell *` erlaubt: Routine läuft ohne Nachfrage.
- Zwei Nachfragen: `kiki permissions add *`, `kiki permissions remove *`. (`list`/`check` laufen unter der freien Shell, ohne eigene Regeln.)
- Erst `edit *` blockiert, dann das eigene Schreibgebiet erlaubt (je Rolle, Tabelle im Anhang).
- Letzte Zeile: Nachfrage `git push *`. Obere Nachfragen binden die Rollen nicht (gemessen) — deshalb braucht jede Rolle ihre eigene Zeile.

Zusätzlich erhält jeder Rollen-Prompt die genehmigte Zeile **„Die Regeln aus Main gelten auch im Worktree."** und eine kurze Werkzeug-Zeile, ehrlich als Verhaltensregel gekennzeichnet: Brainstormer/Planner dürfen Web-Recherche; die Delegations-Grenze des Orchestrators (nur die sieben Kiki-Rollen) steht heute schon in seinem Prompt; alle übrigen Rollen: kein Web, kein MCP, keine Delegation, kein Code Mode.

**Für alle Agenten (auch Nicht-Kiki):**

- Eine verwaltete Regel auf oberster Ebene: Nachfrage für `git push *`. Sie erreicht jeden Agenten ohne eigene Push-Regel.
- Ein verwalteter **Policy-Block** mit 14 Anweisungen: die 7 Secret-Muster, je als Lese- und Schreib-Verbot. Policys sind harte Verbote, die erst **nach** allen Berechtigungs-Regeln und gespeicherten Freigaben geprüft werden; sie können nie etwas erlauben. Deshalb bindet dieser eine Block alle Agenten, auch gegen spätere Freigaben (gemessen, Anhang). Weil Policys nicht nachfragen können, bleibt die Push-Nachfrage eine Berechtigungs-Regel.
- Nutzereigene Einträge bleiben unangetastet: der bestehende obere Block (Shell-Nachfrage, `git status`, `git diff`) und ein bestehender nutzereigener Policy-Bestand. Kiki hängt seinen Abschnitt dahinter an, löscht nie fremde Einträge, erkennt die eigenen Zeilen bei jedem Update wieder und stoppt mit Beleg, falls jemand sie verändert hat.
- Die Zustimmung zum Veröffentlichen bleibt an den bestehenden bindenden Prompt gebunden (config.ts:546–547). Er nennt „publishing" ausdrücklich, „Deploy" nicht wörtlich — er wird minimal um dieses Wort ergänzt, ebenfalls als Verhaltensregel gekennzeichnet.

**Für Projekte:**

- `kiki permissions list|check|add|remove` bleibt im Verhalten genau gleich: nur Projekt-Dateien, native Nachfragen, Backups. Nur der gedruckte Bestand wird kleiner. Den Policy-Block schreibt der Generator-Umzug in dieselbe globale Datei; Backup, Nachlesen und Rollback gelten für die ganze Datei und decken ihn mit ein.
- Projekt-spezifische Freigaben (z. B. `scripts/**` in einem Repo, das sie braucht) gehören in die Projekt-Ebene — per CLI oder Projekt-Config, nie global.

## 3. Was bewusst wegfällt

Es entfallen vollständig: die 18 Publishing-Nachfragen, die 5 Force-Push-Verbote, die 79 Routen-Regeln (Web/MCP/Ausführung/Delegation), die 8 Lese-Freigaben (je Rolle `allow read *`), die Worktree-Spiegel-Regeln, die `/tmp`-Schreib-Freigaben und sämtliche Secret-Regeln aus den Berechtigungs-Listen — auf beiden Ebenen. Keine Regel bleibt irgendwo doppelt.

Warum das okay ist:

- **Publishing:** mechanisch fragt nur `git push` nach; alles Weitere regeln der bindende Prompt und die Mitschrift. Genau das ist der Kern-Kompromiss.
- **Routen:** die Prompts steuern künftig, welche Werkzeuge jede Rolle benutzt. Der Verzicht auf mechanische Sperrungen ist ehrlich ausgesprochen: offen ist offen.
- **Secrets:** stärker statt schwächer. Ein Block statt 112 verstreuter Regeln — und er gewinnt, anders als Berechtigungs-Regeln, auch gegen spätere Freigaben (gemessen, Anhang).
- **Lesen:** OpenCode erlaubt standardmäßig alles Lesen; die Secret-Löcher schließt der Policy-Block jetzt für alle Agenten.
- **Worktree:** die Gebiets-Regeln greifen im Worktree, wenn OpenCode die Muster pro Arbeitsverzeichnis auflöst. Das wird vorab geprüft (Prüfung 2 unten). Scheitert die Prüfung, gilt je Rolle eine zusätzliche Freigabe `edit .worktrees/**`; die Gesamtzahl steigt dann ehrlich auf bis zu 82. Das ist ein bedingter Notfallplan, nicht der Entwurf.

Nicht-Ziele: keine Sandbox, kein Wirkungs-Klassifizierer, kein neuer Befehls-Katalog, keine pauschalen Nachfragen, keine neue Maschinarie — nur Einträge in den zwei vorhandenen OpenCode-Mechanismen. Die Null-Alternative (nichts tun) hieße: 569 unlesbare Regeln bleiben. Die einzige echte Neuerung ist der Policy-Block; ohne ihn blieben nur zwei schlechte Wege — dieselben Secret-Zeilen neunfach im Bestand, oder Secret-Schreiben innerhalb der Rollengebiete mechanisch offen.

## 4. Was nicht garantiert wird

- Unbekannte oder verpackte Deploy-/Publish-Befehle (`npm run deploy`, SSH-Aliasse) laufen ohne Nachfrage durch; nichts sortiert Befehle nach Wirkung. Rückgrat: bindender Prompt und Mitschrift.
- `git push --force` ist kein hartes Nein mehr, sondern eine Nachfrage. Eine abgelehnte oder blockierte Nachfrage stoppt endgültig.
- Web, Delegation, MCP und Code Mode sind mechanisch offen; die Prompts steuern. Wer sie ignoriert, fällt nur in der Mitschrift auf.
- Zugriffe außerhalb des Projekts sind mechanisch offen (OpenCode-Standard), wo sie heute für die meisten Rollen blockiert sind.
- Muster sind Textvergleich: Aliasse und Wrapper bleiben unerkannt (wie heute).
- Rohe Hand-Änderungen an der Konfiguration bleiben das akzeptierte Rest-Risiko. Das bekannte Loch — jemand trägt per Hand eine Secret-Freigabe ein — schließt der Policy-Block jetzt mechanisch (gemessen). Wer den gepflegten Block selbst umschreibt, hebt ihn auf; Kikis Erkennung stoppt den Update dann mit Beleg.

## 5. Abnahme-Prüfungen

Vorab am echten Binary — isoliert, nur Entscheidungs-Ergebnisse, nie echte Ausführung:

1. **Policy-Bindung:** Der Block verweigert Secret-Lesen und -Schreiben für Kiki-Rollen trotz Gebiets-Freigabe und trotz handgeschriebener Einzelfreigabe; für Agenten ohne eigene Regeln; die eingebaute Standard-Nachfrage für `.env` wird zum harten Nein. Er besteht neben nutzereigenen Berechtigungs- und Policy-Einträgen. Die Gegenproben bleiben offen: Gebiets-Dateien sind weiter bearbeitbar und lesbar. Jede Abweichung: Stopp, keine Umstellung.
2. **Worktree:** Greift das Rollengebiet automatisch, wenn die Sitzung im Worktree läuft? Sonst greift die genannte Ausweichregel.

Nach der Umsetzung:

3. Jede Rollen-Liste höchstens 9 Zeilen und lesbar; Gesamtzahl ehrlich: 74 (mit Ausweichregeln entsprechend mehr).
4. Update-Transaktion unverändert: Backup → Schreiben → Nachlesen → Rollback; Nutzereigenes bleibt erhalten, bekannte Alt-Regeln werden entfernt, veränderte Kiki-Zeilen stoppen mit Beleg — für beide gepflegten Orte (Berechtigungen und Policys).
5. `kiki permissions`-CLI im Verhalten unverändert, inklusive ihrer Tests.
6. README und CHANGELOG danach durch den Historian; die zwei überholten Sätze (README.md:239; API-Vertrag `docs/migrations/kiki-3-oc2-api-contract.md:247–248`) werden aktualisiert.

## Anhang

### A. Exakte Rollen-Listen

Jede Rolle erhält dieselbe Klammer (Reihenfolge; letzte Übereinstimmung gewinnt):

`allow shell *` → `ask shell kiki permissions add *` → `ask shell kiki permissions remove *` → `deny edit *` → Eigenes Schreibgebiet (erlauben) → `ask shell git push *`

| Rolle             | Schreibgebiet (erlauben)                                     | Zeilen |
| ----------------- | ------------------------------------------------------------ | ------ |
| kiki-orchestrator | `.agentic/kiki/TASK_REGISTRY.json` · `.superpowers/sdd/**`   | 7      |
| kiki-brainstormer | `docs/superpowers/**`                                        | 6      |
| kiki-planner      | `docs/superpowers/**`                                        | 6      |
| kiki-implementer  | `src/**` · `tests/**` · `.gitignore` · `.superpowers/sdd/**` | 9      |
| kiki-gui-designer | `src/**` · `tests/**` · `.superpowers/sdd/**`                | 8      |
| kiki-reviewer     | `.agentic/reviews/*` · `.opencode/docs/reviews/*`            | 7      |
| kiki-escalation   | `.agentic/reviews/*` · `.opencode/docs/reviews/*`            | 7      |
| kiki-historian    | `docs/**` · `README*` · `CHANGELOG*` · `.agentic/**`         | 9      |

Summe: 59 Rollen-Zeilen + 1 Berechtigungs-Regel der obersten Ebene + 14 Policy-Anweisungen = **74 Einträge**; keine Regel doppelt.

Herkunft der Gebiete (Generator, `src/cli/config.ts`): `src`/`tests` aus dem Ursprung (Commit `0ae6d7f`); SDD-Arbeitsbereich, Review-Ordner, Task-Registry, `.agentic/**`, `README*`/`CHANGELOG*` aus den heutigen Rollengebieten. `docs/superpowers/**` fasst die heutigen drei Brainstormer/Planner-Grants (Superpowers-Ordner, Plans, Specs) zusammen. Beim Historian deckt `docs/**` die DECISIONS- und Wissens-Ordner mit ab — die heutigen drei Dubletten (config.ts:470, 477, 484) werden zu einer Zeile. `list`/`check` brauchen keine Regeln (laufen unter `allow shell *`). Die Worktree-Ausweichregel käme je Rolle als normale Gebiets-Zeile hinzu.

### B. Schutzbasis auf oberster Ebene

Berechtigungs-Regel: `ask shell git push *` — Form mit Leerzeichen-Platzhalter, greift nur echtes Push (nicht Wörter wie „pushup") und deckt laut Doku die bloße Grundform ab.

Policy-Block: 14 Anweisungen in der am Binary gemessenen Form

`{ "action": "tool.use", "resource": "read:<Muster>" bzw. "edit:<Muster>", "effect": "deny" }`

mit denselben 7 Mustern wie heute (config.ts:288–296), je für Lesen und Schreiben: `.env*` · `**/.env*` · `**/*secret*` · `**/*credential*` · `**/*.pem` · `**/*.key` · `**/id_rsa*`. Kikis Anweisungen stehen hinter den Nutzer-Einträgen (letzte Übereinstimmung gewinnt). Der Mechanismus prüft nach allen Berechtigungen und macht erlaubt oder nachfragend zu verboten.

### C. Mess-Evidenz

Alle Messungen isoliert: Wegwerf-Fixtures, nur Entscheidungs-Ergebnisse, Platzhalter-Inhalte, nie echte Secrets.

- Ursprung `0ae6d7f` (18 Regeln/5 Rollen) und heutiger Bestand 569/8: zeilengenaue Nachzählung in `.agentic/reviews/2026-11-23-permission-baseline-simplification-spec-review.md`, Ziffer 1.
- „Agent schlägt obere Ebene": gemessen (OpenCode 2.2.7; `docs/research/2026-11-12-security-boundaries-probes.md:139–155`), für Datei-Schreiben bestätigt an 2.3.2 — der Grund für die je-Rolle-Push-Nachfrage.
- Schwäche oberer Berechtigungs-Blocken (Rollen-Schreibfreigaben übersteuern sie) und Stärke des Policy-Blocks (bindet alle, auch gegen handgeschriebene Freigaben; Standard-Nachfrage wird hartes Nein; Verbot plus Freigabe bleibt Verbot; Gegenproben offen; Meldung „Blocked by configuration policy"): gemessen an 2.3.2, 15 bzw. 28 Entscheidungen (`/tmp/opencode/secret-binding-probe.mjs`, `/tmp/opencode/policy-binding-probe.mjs`, Ergebnis-JSON ebenda, Fixtures danach entfernt). Doku opencode.ai/docs/permissions und opencode.ai/docs/policies (abgerufen 2026-11-23) stimmen mit dem Binary überein.
- Bestehende Matrix: 160 Entscheidungen an 2.3.2 (`2026-11-20-managed-permission-requests-design.md` §5).
- Leak-Befund (zwei Implementer-Zusätze; nutzereigener oberer Block unantastbar): `.agentic/reviews/2026-11-23-global-permissions-analysis.md`.
- Abgleichs-Katalog `tests/fixtures/kiki-permission-history.json`; Update-Transaktion `src/cli/opencode-config.ts`.
- Stellen im Generator: bindender Prompt `config.ts:546–547`; Secret-Muster `:288–296`; CLI-Regeln heute `:231–256`; Routen heute `:338–369`; Worktree-Spiegel heute `:142–158`.
- Nicht gemessen: die `git push`-Nachfrage selbst (die ausführende Session darf diese Literale nicht tragen; Beleg bleibt die 2.2.7-Messung plus die 160er-Matrix); ob Projekt-Config globale Policys aufheben kann (Doku sagt: nein); ob die CLI den Policy-Block anzeigt.
- Entwurfshistorie (eine Zeile): 74 → 130 (je-Rolle-Secret-Schwänze, nach der Messung der schwachen oberen Blocken) → zurück auf 74 nach der Policy-Messung vom 2026-11-23; ein früherer technischer Katalog-Entwurf war bereits verworfen und gelöscht.

### D. Versions-Hinweis

Gemessen am installierten OpenCode 2.3.2 (die ältere Shell-Messung an 2.2.7); Doku-Stände abgerufen am 2026-11-23. Vor der Umstellung wird die Policy-Bindung am finalen Generator-Stand erneut gemessen; widerspricht das Binary dem: Stopp und zurück zum Eigentümer.
