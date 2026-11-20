# Global Single-Source Permission Architecture — Design

Date: 2026-11-19; clarified 2026-11-20 (additive-only permissions, explicit user correction)
Status: **APPROVED — original 2026-11-19; user subsequently chose Kiki-write validation only, no runtime hook, and batch-approved in-scope global/Kiki/Noema rollout after technical checks. No publishing/commit/push approval.**
Detail record: `.agentic/reviews/2026-11-19-global-permissions-single-source-spec-review.md`
(PASS_WITH_NOTES) holds the forensic evidence and full reasoning. This is the condensed spec
for approval; it deliberately omits the forensic narrative and giant checklists.

## 1. Goal, scope, non-goals

Kiki's role permissions currently live in several drifting copies — generator templates,
global agent markdowns, and project-config mirrors (kiki repo `opencode.jsonc` ≈49 KB, Noema) —
which is why specialists were blocked from `git status` and why live files had to be
hand-patched on 2026-11-19. Goal: one baseline location, refreshed by `kiki update`, with
project configs holding additive file/folder permissions and independent model settings, plus bounded Noema cleanup.

Scope: make `kiki install/update/init/migrate/reset` honor the fixed architecture (§2).
Non-goals: no architecture redesign; no new policies beyond §5; no model or unrelated-setting
edits; no new CLI command; no OpenCode changes; no commits in this phase.

## 2. Fixed architecture (not up for redesign)

1. Global config `~/.config/opencode/opencode.json(c)` owns the full role arrays under
   `agents.<name>.permissions` (a kiki-maintained field).
2. Global agent markdown (`~/.config/opencode/agents/kiki-*.md`) = prompts/description/mode
   only — no `permissions` and no legacy `permission`.
3. Kiki-written project permissions are **additions only** for files/folders the standard does not know;
   never remove/relax effective global protected deny/ask rules or role boundaries. No project shell
   or alternate-tool permission overrides. Models remain independent and unchanged; no
   generated full-baseline mirrors; `kiki init` writes `.agentic/kiki/*` metadata only.

Sources: `docs/superpowers/specs/2026-11-02-global-only-kiki-design.md:15-24,61-62`; the
generated prompts themselves (`src/cli/config.ts:592`); review doc §Basis.

## 3. Current state (brief; full evidence in the review doc)

- Global config has models only, **no** `agents.<name>.permissions`; global markdowns carry
  hand-patched, mutually inconsistent rule sets (stale V1-era cores plus 2026-11-19 patches).
- The installer freezes existing permission arrays forever (`Object.assign(settings,
  existing)`, `src/cli/opencode-config.ts:473-494`), never writes config permissions
  (`installGlobalFiles` `:504-542`), and `initializeProjectAgents` (`:546-564`) mirrors full
  baselines into project configs.
- Noema: root and voice-concierge configs are now byte-identical; the two account-signup
  worktrees hold byte-identical V1-era local agent markdowns that append after the global
  baseline and shadow it; their model overrides are real and preserved.
- Documented OpenCode V2 precedence (agent rules append across tiers, last match wins, no-match
  ⇒ ask) is an **assumption to prove** in the isolated binary matrix (§7), not a guarantee;
  any contradiction halts rollout.

## 4. Approach

**Chosen:** keep the builders in `src/cli/config.ts` as the single rule source;
`installGlobalFiles` writes prompt-only markdowns and patches `agents.<name>.permissions`
into the global config through the existing JSONC-preserving `patchAgents` machinery
(`opencode-config.ts:231-252`); `kiki init` stops writing mirrors; `kiki migrate` keeps its
fail-closed V1 translation and emits only validated non-generated additive file/folder grants;
`kiki reset --project` is unchanged (already removes Kiki entries and local agent files with
backup).
**Rejected:** keeping the duplicate baselines (the status quo — proven drift and blocking
regressions); a sidecar permissions file (no include mechanism; new abstraction); a one-shot
`migrate-permissions` command (install/update must converge fresh and existing installs
anyway); wholesale markdown regeneration (violates §2 and clobbers user prompt tweaks).

## 5. Approved policy baseline (the only rules this design writes)

- Seven specialists (brainstormer, planner, implementer, gui-designer, reviewer, escalation,
  historian) get exactly `git status *`, `git rev-parse *`, `git worktree list *` allows;
  the **orchestrator gets none**; only `worktree list` is named — never blanket
  `git worktree *`, no new write routes.
- Role-scoped edit grants keep **both** `.worktree/**` and `.worktrees/**` spellings.
- The 7 secret-edit denies (`.env*`, `**/.env*`, `**/*secret*`, `**/*credential*`, `**/*.pem`,
  `**/*.key`, `**/id_rsa*`) end every role's array — all 8 roles — after broad grants.
- Existing publishing asks (18) and force-push denies (5) and all role restrictions are
  preserved verbatim. No model edits, no unrelated key edits, no broadening.
- The broad `edit *` deny is the role's fallback, not a ban on additive file grants;
  explicit protected scopes and secret denies remain authoritative. Global customs precede
  the final seven secret-edit denies; conflicting customs halt/report rather than weaken policy.

## 6. Migration transaction (smallest safe path, reusing existing tooling)

`kiki install/update` on each run: validate/classify all config + markdown sources and report →
backup (existing manifest machinery, extended to the global config file) → write config arrays → **verify by
re-read** → strip markdown permission blocks → verify → verbatim report.

- **Known-generated recognition with conservative handling:** existing rules are classified
  against the fresh builder output and a small set of known-generated historical shapes
  **pinned as tracked test fixtures** (no `/tmp` runtime dependency; /tmp artifacts are
  provenance only). Anything unrecognized is `custom`.
- **No automatic drops:** custom rules are preserved verbatim after the fresh baseline's
  non-secret-edit rules and before its final seven secret-edit denies, and listed verbatim
  in the dry-run report that precedes every live write. A
  custom-classified **deny** — or any ambiguous/conflicting rule — **halts with exact evidence**,
  shown verbatim, never dropped or silently appended.
- **Idempotence:** re-runs produce zero diffs; custom rules are deduplicated by exact
  (action, resource, effect) across all sources (markdown + config) with stable tail order —
  required because a crash-recovery re-run sees the same customs in both places.
- **Failure/crash invariant — explicitly user-approved correction (“Ja, OK. So umsetzen.”):**
  Catchable failure triggers full rollback to pre-update bytes/existence/modes; rollback I/O
  failure must report incomplete restoration, the backup location and original error.
  Hard process death after config persistence but before markdown stripping leaves old
  markdown in place: tested old/status-quo markdown rules remain authoritative, not the new
  baseline (observed OpenCode 2.3.2). Rerun must converge idempotently. Preflight classifies
  every config/markdown source; only proven generated rules are replaced, validated custom
  allows survive, and ambiguity/custom denies halt before writes. Death during per-agent
  stripping can leave a mixed old/new state: no universal “never weaker” or all-agent
  atomicity claim is made; test actual per-agent states. Keep persist → re-read/verify →
  strip; no strip-first ordering, runtime hook or multi-file atomicity is introduced.
- Models, comments, unrelated settings, and user top-level `permissions`/`policies` are
  untouched. Verification canon is tracked git state (`git show HEAD:opencode.jsonc`).

## 7. Required tests (focused)

- Existing install/update on fixtures: config arrays written; markdowns stripped **only**
  after config verification; failure paths halt with no partial strip.
- Preservation: models, comments, unrelated keys and custom rules survive; custom JSONC
  round-trips.
- Idempotence including crash-recovery dedup (byte-stable second run).
- Negative: no `permissions`/`permission` in any markdown; orchestrator has zero git allows;
  every specialist's only `git worktree*` allow is `git worktree list *`; secret edits denied
  after broad grants; publishing asks and force-push denies intact; project additions cannot
  relax a protected baseline deny/ask or role boundary; only additional file/folder rights
  beyond the broad edit fallback are permitted.
- **Isolated real-binary matrix (mandatory gate):** with `OPENCODE_TEST_BINARY` (previously
  unspecified, not proof the binary is absent; locate an authorized installed binary first), prove the precedence
  assumptions, the crash-window fixture, and representative §5 cases per role. Asserts stop
  at the permission decision — **no real publishing execution**.

**Resolved boundary — user chose Kiki-managed writes only:** no runtime hook or new policy
engine. Arbitrary manual edits outside Kiki are not policed; native last-match overrides
remain possible and this residual risk is accepted. Correct `projectPermissionRules()`
(`src/cli/oc2-permissions.ts:96-130`) for bounded path forms and ordering: do not replay the
broad `edit *` fallback or copy inherited grants. Validate actual overlaps with explicit role
boundaries; reject ambiguous forms. Folder additions need a minimal protective file-rule
suffix for overlapping secret/protected descendants, not a mirrored full baseline. This
suffix preserves effective protection in Kiki's emitted arrays, not override immunity.
No project shell/alternate-tool customization is introduced. Verify emitted decisions with
the actual isolated binary; no generic glob solver or unapproved runtime component.

## 8. Noema cleanup (bounded, inventoried; batch-authorized after technical gates)

- Remove only **known-generated duplicates**: stale V1 permission remnants the global
  baseline now supplies, and the 16 byte-identical V1-era worktree agent markdowns
  (`.worktrees/account-signup-{integration,password-otp}/.opencode/agents/kiki-*.md`) that
  shadow the global baseline — byte-identity re-verified immediately before deletion.
- Preserve genuine additions and independent models: implementer grants (`scripts/**`, `package.json`,
  `package-lock.json`, `/tmp/opencode/**`, `**/tmp/opencode/**`), `external_directory` tmp
  allows, and all model assignments. No dependency, `node_modules`, empty-directory or model
  syntax cleanup in this round. Remove the duplicate voice config only if genuine settings,
  including restored absolute grants, are not lost; otherwise retain it.
- **Approved decisions (user, 2026-11-19):**
  - **D3 — restore the lost implementer rights:** `kiki-implementer`'s edit grants for
    `.worktree/voice-concierge/scripts/voice/cleanup.ts` and
    `.worktree/voice-concierge/cron.json` are restored in their original arrangement (root
    config: two relative entries; voice-concierge config: those plus the two absolute-path
    entries), executed within the approved Noema step under the same dry-run/backup
    safeguards. Keep the voice-concierge config when needed to preserve this arrangement.
  - **D4 — retain the current global implementer/gui shell envelope** (routine allowed,
    publishing asks, force-push denies); the former Noema `"bash": "allow"` is **not**
    restored.
  - Latest user authorization includes this bounded cleanup and D3 in one live batch (§9),
    without further per-step user questions; ambiguity/failure still halts with evidence.

## 9. Gates

1. **User approval complete**, including managed-write scope and bounded live batch.
2. Implementation + tests in the kiki repo (code only; no live writes; dist rebuilt normally).
3. Isolated real-binary validation passes (§7; blocking).
4. After architect review, code implementation, focused checks, isolated binary acceptance
   and whole-change review, execute the batch-approved global `kiki update`, Kiki project
   cleanup and bounded Noema cleanup/D3. Keep per-target inventory, dry-run, backups,
   persistence verification and stop-on-ambiguity gates; no repeated user approvals.
   Publishing, commits and pushes remain separately unauthorized.

Settled defaults (recorded, not reopened): current model choices preserved as-is (kiki repo
effective models thereby become the global `gpt-6.1-sol` / `kimi-k3.1-pro` — FYI); `kiki
update` replaces the kiki-owned baseline and retains surviving customs before the final
secret-edit denies, reported verbatim;
Noema worktree models keep their current syntax; the dirty tree is preserved (no reverts, no
auto-restoration); the uncommitted `oc2-permissions.test.ts` scoping filter is kept.
