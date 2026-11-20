import { SECRET_GLOBS } from './config.js';
/**
 * Additional evidenced historical generated sequences, keyed by agent name.
 * The tracked fixture `tests/fixtures/kiki-permission-history.json` pins these
 * values. Entries are added only with exact content and provenance; a
 * generated-looking tuple without a proven sequence is ordinary custom input.
 */
export const HISTORICAL_GENERATED_SEQUENCES = {
    "kiki-orchestrator": [
        [
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-brainstormer": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "src/**", effect: "deny" },
            { action: "edit", resource: "tests/**", effect: "deny" },
            { action: "edit", resource: "docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: "docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: "docs/superpowers/specs/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/specs/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/specs/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "git diff*", effect: "allow" },
            { action: "shell", resource: "git log*", effect: "allow" },
            { action: "shell", resource: "mkdir*", effect: "allow" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-planner": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "src/**", effect: "deny" },
            { action: "edit", resource: "tests/**", effect: "deny" },
            { action: "edit", resource: "docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: "docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: "docs/superpowers/specs/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/plans/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/superpowers/specs/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/superpowers/specs/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "git diff*", effect: "allow" },
            { action: "shell", resource: "git log*", effect: "allow" },
            { action: "shell", resource: "mkdir*", effect: "allow" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-implementer": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "docs/superpowers/**", effect: "deny" },
            { action: "edit", resource: "src/**", effect: "allow" },
            { action: "edit", resource: "tests/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/src/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/src/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/tests/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/tests/**", effect: "allow" },
            { action: "edit", resource: "/tmp/**", effect: "allow" },
            { action: "edit", resource: "tmp/**", effect: "allow" },
            { action: "external_directory", resource: "/tmp/**", effect: "allow" },
            { action: "external_directory", resource: "tmp/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "allow" },
            { action: "shell", resource: "git push*", effect: "ask" },
            { action: "shell", resource: "gh pr merge*", effect: "ask" },
            { action: "shell", resource: "gh release*", effect: "ask" },
            { action: "shell", resource: "gh workflow run*", effect: "ask" },
            { action: "shell", resource: "scalingo *deploy*", effect: "ask" },
            { action: "shell", resource: "railway up*", effect: "ask" },
            { action: "shell", resource: "railway deploy*", effect: "ask" },
            { action: "shell", resource: "ssh*", effect: "ask" },
            { action: "shell", resource: "sftp*", effect: "ask" },
            { action: "shell", resource: "scp*", effect: "ask" },
            { action: "shell", resource: "rsync*", effect: "ask" },
            { action: "shell", resource: "lftp*", effect: "ask" },
            { action: "shell", resource: "ftp*", effect: "ask" },
            { action: "shell", resource: "curl*", effect: "ask" },
            { action: "shell", resource: "wget*", effect: "ask" },
            { action: "shell", resource: "npm publish*", effect: "ask" },
            { action: "shell", resource: "yarn publish*", effect: "ask" },
            { action: "shell", resource: "pnpm publish*", effect: "ask" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "shell", resource: "git push --force*", effect: "deny" },
            { action: "shell", resource: "git push -f*", effect: "deny" },
            { action: "shell", resource: "git push *--force*", effect: "deny" },
            { action: "shell", resource: "git push * -f", effect: "deny" },
            { action: "shell", resource: "git push * --force", effect: "deny" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-gui-designer": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "docs/superpowers/**", effect: "deny" },
            { action: "edit", resource: "src/**", effect: "allow" },
            { action: "edit", resource: "tests/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/src/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/src/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/tests/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/tests/**", effect: "allow" },
            { action: "edit", resource: "/tmp/**", effect: "allow" },
            { action: "edit", resource: "tmp/**", effect: "allow" },
            { action: "external_directory", resource: "/tmp/**", effect: "allow" },
            { action: "external_directory", resource: "tmp/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "allow" },
            { action: "shell", resource: "git push*", effect: "ask" },
            { action: "shell", resource: "gh pr merge*", effect: "ask" },
            { action: "shell", resource: "gh release*", effect: "ask" },
            { action: "shell", resource: "gh workflow run*", effect: "ask" },
            { action: "shell", resource: "scalingo *deploy*", effect: "ask" },
            { action: "shell", resource: "railway up*", effect: "ask" },
            { action: "shell", resource: "railway deploy*", effect: "ask" },
            { action: "shell", resource: "ssh*", effect: "ask" },
            { action: "shell", resource: "sftp*", effect: "ask" },
            { action: "shell", resource: "scp*", effect: "ask" },
            { action: "shell", resource: "rsync*", effect: "ask" },
            { action: "shell", resource: "lftp*", effect: "ask" },
            { action: "shell", resource: "ftp*", effect: "ask" },
            { action: "shell", resource: "curl*", effect: "ask" },
            { action: "shell", resource: "wget*", effect: "ask" },
            { action: "shell", resource: "npm publish*", effect: "ask" },
            { action: "shell", resource: "yarn publish*", effect: "ask" },
            { action: "shell", resource: "pnpm publish*", effect: "ask" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "shell", resource: "git push --force*", effect: "deny" },
            { action: "shell", resource: "git push -f*", effect: "deny" },
            { action: "shell", resource: "git push *--force*", effect: "deny" },
            { action: "shell", resource: "git push * -f", effect: "deny" },
            { action: "shell", resource: "git push * --force", effect: "deny" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-reviewer": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "src/**", effect: "deny" },
            { action: "edit", resource: "tests/**", effect: "deny" },
            { action: "edit", resource: "docs/**", effect: "deny" },
            { action: "edit", resource: ".agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".opencode/docs/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/.agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/.agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/.opencode/docs/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/.opencode/docs/reviews/*", effect: "allow" },
            { action: "external_directory", resource: "/tmp/**", effect: "allow" },
            { action: "external_directory", resource: "tmp/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "git diff*", effect: "allow" },
            { action: "shell", resource: "git log*", effect: "allow" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-escalation": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: ".agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".opencode/docs/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/.agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/.agentic/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/.opencode/docs/reviews/*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/.opencode/docs/reviews/*", effect: "allow" },
            { action: "external_directory", resource: "/tmp/**", effect: "allow" },
            { action: "external_directory", resource: "tmp/**", effect: "allow" },
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "git diff*", effect: "allow" },
            { action: "shell", resource: "git log*", effect: "allow" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
    "kiki-historian": [
        [
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: ".env*", effect: "deny" },
            { action: "read", resource: "**/.env*", effect: "deny" },
            { action: "read", resource: "**/*secret*", effect: "deny" },
            { action: "read", resource: "**/*credential*", effect: "deny" },
            { action: "read", resource: "**/*.pem", effect: "deny" },
            { action: "read", resource: "**/*.key", effect: "deny" },
            { action: "read", resource: "**/id_rsa*", effect: "deny" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: "README*", effect: "allow" },
            { action: "edit", resource: "CHANGELOG*", effect: "allow" },
            { action: "edit", resource: "docs/**", effect: "allow" },
            { action: "edit", resource: "docs/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/docs/**", effect: "allow" },
            { action: "edit", resource: ".agentic/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/README*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/README*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/CHANGELOG*", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/CHANGELOG*", effect: "allow" },
            { action: "edit", resource: ".worktree/**/docs/**", effect: "allow" },
            { action: "edit", resource: ".worktree/**/.agentic/**", effect: "allow" },
            { action: "edit", resource: ".worktrees/**/.agentic/**", effect: "allow" },
            { action: "edit", resource: "src/**", effect: "deny" },
            { action: "edit", resource: "tests/**", effect: "deny" },
            { action: "edit", resource: ".worktree/**/src/**", effect: "deny" },
            { action: "edit", resource: ".worktrees/**/src/**", effect: "deny" },
            { action: "edit", resource: ".worktree/**/tests/**", effect: "deny" },
            { action: "edit", resource: ".worktrees/**/tests/**", effect: "deny" },
            { action: "shell", resource: "*", effect: "deny" },
            { action: "shell", resource: "git log*", effect: "allow" },
            { action: "shell", resource: "git diff*", effect: "allow" },
            { action: "shell", resource: "git status *", effect: "allow" },
            { action: "shell", resource: "git rev-parse *", effect: "allow" },
            { action: "shell", resource: "git worktree list *", effect: "allow" },
            { action: "edit", resource: ".env*", effect: "deny" },
            { action: "edit", resource: "**/.env*", effect: "deny" },
            { action: "edit", resource: "**/*secret*", effect: "deny" },
            { action: "edit", resource: "**/*credential*", effect: "deny" },
            { action: "edit", resource: "**/*.pem", effect: "deny" },
            { action: "edit", resource: "**/*.key", effect: "deny" },
            { action: "edit", resource: "**/id_rsa*", effect: "deny" },
        ],
    ],
};
function keyOf(rule) {
    return `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
}
function sameRules(left, right) {
    if (left.length !== right.length)
        return false;
    return left.every((rule, index) => keyOf(rule) === keyOf(right[index]));
}
/** Split a canonical array into its non-secret prefix and final secret-edit tail. */
export function splitSecretTail(baseline) {
    const tail = SECRET_GLOBS.map(resource => ({ action: 'edit', resource, effect: 'deny' }));
    if (baseline.length >= tail.length && sameRules(baseline.slice(-tail.length), tail)) {
        return { prefix: baseline.slice(0, -tail.length), tail };
    }
    return { prefix: baseline, tail: [] };
}
/** Exact-tuple deduplication that keeps the first occurrence and tail order. */
export function stableCustoms(customs) {
    const seen = new Set();
    const result = [];
    for (const rule of customs) {
        const key = keyOf(rule);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push({ ...rule });
    }
    return result;
}
function classifySource(agent, baseline, source) {
    const entries = [];
    let pointer = 0;
    const historical = HISTORICAL_GENERATED_SEQUENCES[agent] ?? [];
    if (historical.some(sequence => sameRules(sequence, source.rules))) {
        return {
            entries: source.rules.map(rule => ({ file: source.file, rule, kind: 'generated' })),
            matched: baseline.length,
            complete: true,
        };
    }
    for (const rule of source.rules) {
        if (pointer < baseline.length && keyOf(rule) === keyOf(baseline[pointer])) {
            entries.push({ file: source.file, rule, kind: 'generated' });
            pointer += 1;
        }
        else {
            entries.push({ file: source.file, rule, kind: 'custom' });
        }
    }
    return {
        entries,
        matched: pointer,
        complete: pointer === baseline.length,
    };
}
/**
 * Classify ordered sources (discovered config files first, then the single
 * existing role markdown) against the fresh canonical array. Proven generated
 * rules are replaceable; unknown rules stay custom and are preserved verbatim;
 * custom denies and incomplete/ambiguous generated shapes block the write.
 */
export function classifyPermissionSources(agent, baseline, sources) {
    const entries = [];
    const blockers = [];
    let matchedTotal = 0;
    let sawGenerated = false;
    for (const source of sources) {
        const result = classifySource(agent, baseline, source);
        matchedTotal += result.matched;
        if (result.entries.some(entry => entry.kind === 'generated'))
            sawGenerated = true;
        entries.push(...result.entries);
        if (!result.complete && result.entries.some(entry => entry.kind === 'generated')) {
            // A generated prefix without the full canonical sequence may be a stale
            // or hand-patched shape. Missing evidence is a blocker, never reconstructed.
            for (const entry of result.entries) {
                if (entry.kind === 'generated')
                    entry.kind = 'ambiguous';
            }
            blockers.push(`${agent} (${source.file}): incomplete generated permission shape (${result.matched}/${baseline.length} rules matched)`);
        }
    }
    const customs = [];
    for (const entry of entries) {
        if (entry.kind === 'generated')
            continue;
        if (!customs.some(rule => keyOf(rule) === keyOf(entry.rule)))
            customs.push({ ...entry.rule });
    }
    for (const entry of entries) {
        if (entry.kind === 'custom' && entry.rule.effect === 'deny') {
            blockers.push(`${agent} (${entry.file}): custom deny must be resolved manually: ${entry.rule.action} ${entry.rule.resource}`);
        }
    }
    // Two customs that target the same action/resource with different effects are
    // an ownership conflict: appending both would make the result order-dependent.
    const effects = new Map();
    for (const rule of customs) {
        const key = `${rule.action}\u0000${rule.resource}`;
        const existing = effects.get(key);
        if (existing !== undefined && existing !== rule.effect) {
            blockers.push(`${agent}: conflicting custom effects for ${rule.action} ${rule.resource}`);
        }
        if (existing === undefined)
            effects.set(key, rule.effect);
    }
    if (sawGenerated && matchedTotal === 0) {
        blockers.push(`${agent}: generated rules appear out of canonical order`);
    }
    return { entries, customs, blockers: [...new Set(blockers)] };
}
//# sourceMappingURL=permission-consolidation.js.map