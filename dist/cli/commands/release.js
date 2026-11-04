import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, readdir, readlink, realpath, rename, stat, writeFile, } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { applyCandidate, scanDistCollisions } from '../release-apply.js';
import { changedPaths, createCandidate, readGit, } from '../release-candidate.js';
import { runCandidateGates } from '../release-gates.js';
import { decideVersion, parseReleaseArgs, prepareChangelog, selectBaseline, } from '../release-policy.js';
const REQUIRED_TRACKED = [
    'package.json',
    'package-lock.json',
    'src/cli/config.ts',
    'CHANGELOG.md',
];
const GATE_ARTIFACT_PREFIXES = ['tmp/', '.agentic/', 'coverage/', '.cache/'];
const SECRET_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?)$/i;
const GIT_LOG_FORMAT = '--format=%x00%x00%H%x00%s%x00%B';
const BACKUP_PREFIX = 'apply-backup-';
const PRESERVED_BACKUP_PREFIX = 'kiki-release-backup-';
// Keep in sync with RUN_ROOT_PREFIX in release-candidate.ts. A relocation base
// must never itself be a candidate run root (or nested inside one), because the
// enclosing release disposes that tree recursively.
const CANDIDATE_RUN_ROOT_PREFIX = 'kiki-candidate-';
const HELP_LINES = [
    'Usage: kiki release [--apply] [--bump auto|major|minor|patch] [--since <ref>] [--security-exception <reason>]',
    '',
    'Validates a fully transformed release candidate in an isolated temporary copy.',
    'The default is a dry run; --apply copies the verified candidate back with rollback.',
    '--security-exception <reason> records an approved high/critical audit exception; INCOMPLETE audits cannot be excepted.',
    'Kiki never commits, tags, pushes, or publishes.',
];
const execFileAsync = promisify(execFile);
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isWithin(root, target) {
    const rel = relative(root, target);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function summarizePaths(paths) {
    const shown = paths.slice(0, 20);
    return `${shown.join(', ')}${paths.length > shown.length ? ', …' : ''}`;
}
function shortHash(bytes) {
    return createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}
function hasSecretSegment(relativePath) {
    return relativePath
        .split('/')
        .some((segment) => segment !== '' && SECRET_BASENAME.test(segment));
}
function ignoredGateArtifact(relativePath) {
    return GATE_ARTIFACT_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}
function releaseDate(now) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error('release: the current clock value is invalid.');
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
async function pathExists(path) {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return false;
        throw error;
    }
}
async function inspectSafeCheckoutFile(checkoutRoot, relativePath) {
    const segments = relativePath.split('/');
    if (relativePath === '' ||
        relativePath.includes('\0') ||
        isAbsolute(relativePath) ||
        segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
        throw new Error(`release: unsafe release input path '${relativePath}'.`);
    }
    if (hasSecretSegment(relativePath)) {
        throw new Error(`release: refusing release input '${relativePath}': secret-bearing path names are not read.`);
    }
    let current = checkoutRoot;
    let info;
    for (let index = 0; index < segments.length; index++) {
        current = join(current, segments[index]);
        try {
            info = await lstat(current);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`release: required tracked input '${relativePath}' is missing from the working tree; refusing to fall back to HEAD bytes.`);
            }
            throw error;
        }
        if (info.isSymbolicLink()) {
            throw new Error(`release: required path '${relativePath}' or an ancestor is a symlink; refusing to read release inputs through links.`);
        }
        if (index < segments.length - 1) {
            if (!info.isDirectory()) {
                throw new Error(`release: required path '${relativePath}' has a non-directory ancestor.`);
            }
        }
        else if (!info.isFile()) {
            throw new Error(`release: required tracked input '${relativePath}' is not a regular file.`);
        }
    }
    if (info === undefined) {
        throw new Error(`release: required tracked input '${relativePath}' could not be inspected.`);
    }
    let realPath;
    let realParent;
    try {
        realPath = await realpath(current);
        realParent = await realpath(dirname(current));
    }
    catch {
        throw new Error(`release: required tracked input '${relativePath}' is unreadable or dangling; refusing unsafe path.`);
    }
    if (!isWithin(checkoutRoot, realPath) || !isWithin(checkoutRoot, realParent)) {
        throw new Error(`release: required tracked input '${relativePath}' resolves outside the checkout; refusing unsafe path.`);
    }
    const realRelative = relative(checkoutRoot, realPath);
    if (hasSecretSegment(realRelative) ||
        hasSecretSegment(relative(checkoutRoot, realParent)) ||
        hasSecretSegment(basename(realPath))) {
        throw new Error(`release: refusing release input '${relativePath}': resolved path is secret-bearing.`);
    }
    return { realPath };
}
async function readPackageData(packagePath, checkout) {
    let raw;
    try {
        raw = await readFile(packagePath, 'utf8');
    }
    catch {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json is missing or unreadable.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json is not valid JSON.`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json must be an object.`);
    }
    return parsed;
}
async function assertKikiCheckout(checkout) {
    let info;
    try {
        info = await lstat(checkout);
    }
    catch {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: path is missing.`);
    }
    if (!info.isDirectory()) {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: not a directory.`);
    }
    let checkoutRoot;
    try {
        checkoutRoot = await realpath(checkout);
    }
    catch {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: path is unreadable.`);
    }
    const inputs = new Map();
    for (const relativePath of REQUIRED_TRACKED) {
        try {
            inputs.set(relativePath, await inspectSafeCheckoutFile(checkoutRoot, relativePath));
        }
        catch (error) {
            if (relativePath === 'package.json' &&
                /missing from the working tree/.test(errorMessage(error))) {
                throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json is missing or unreadable.`);
            }
            throw error;
        }
    }
    const packageInput = inputs.get('package.json');
    if (packageInput === undefined) {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json is missing or unreadable.`);
    }
    const packageData = await readPackageData(packageInput.realPath, checkout);
    if (packageData.name !== 'kiki') {
        throw new Error(`release: '${checkout}' is not a Kiki source checkout: package.json must declare name "kiki".`);
    }
    return packageData;
}
function currentVersion(packageData) {
    const version = packageData.version;
    if (typeof version !== 'string' || version.trim() === '') {
        throw new Error('release: package.json version must be a stable SemVer string.');
    }
    return version;
}
async function readTracked(runner, checkout) {
    const raw = await readGit(runner, checkout, 'ls-files', ['-z']);
    return raw.split('\0').filter((path) => path !== '');
}
function assertRequiredTracked(tracked) {
    const set = new Set(tracked);
    for (const relativePath of REQUIRED_TRACKED) {
        if (!set.has(relativePath)) {
            throw new Error(`release: required tracked file '${relativePath}' is missing; refusing release.`);
        }
    }
}
async function readStatus(runner, checkout) {
    const raw = await readGit(runner, checkout, 'status', [
        '--porcelain',
        '--untracked-files=all',
    ]);
    return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
}
function parseGitLog(raw) {
    const commits = [];
    for (const record of raw.split('\0\0')) {
        if (record.trim() === '')
            continue;
        const fields = record.split('\0');
        if (fields.length < 3)
            continue;
        const hash = fields[0].trim();
        if (hash === '')
            continue;
        commits.push({
            hash,
            subject: fields[1],
            body: fields.slice(2).join('\0'),
        });
    }
    return commits;
}
async function readCommits(runner, checkout, range) {
    const args = [GIT_LOG_FORMAT];
    if (range !== undefined)
        args.push(range);
    const raw = await readGit(runner, checkout, 'log', args);
    return parseGitLog(raw);
}
function changelogAlreadyPrepared(text, next, date) {
    const unreleased = [...text.matchAll(/^## \[Unreleased\][ \t]*$/gm)];
    const dated = [
        ...text.matchAll(new RegExp(`^## \\[${escapeRegExp(next)}\\] — ${escapeRegExp(date)}$`, 'gm')),
    ];
    if (unreleased.length !== 1 || dated.length !== 1)
        return false;
    const unreleasedIndex = unreleased[0].index ?? 0;
    const unreleasedEnd = unreleasedIndex + unreleased[0][0].length;
    const datedIndex = dated[0].index ?? 0;
    if (unreleasedIndex > datedIndex)
        return false;
    return text.slice(unreleasedEnd, datedIndex).trim() === '';
}
async function prepareCandidateChangelog(candidate, commits, next, date) {
    const absolute = join(candidate.root, 'CHANGELOG.md');
    let text;
    try {
        text = await readFile(absolute, 'utf8');
    }
    catch {
        throw new Error('release: candidate CHANGELOG.md is missing or unreadable.');
    }
    if (changelogAlreadyPrepared(text, next, date))
        return;
    const prepared = prepareChangelog(text, commits, next, date);
    let mode = 0o644;
    try {
        mode = (await stat(absolute)).mode & 0o777;
    }
    catch {
        // New candidate file: keep the default mode.
    }
    await writeFile(absolute, prepared);
    await chmod(absolute, mode);
}
async function snapshotForReport(root) {
    const snapshot = new Map();
    const visit = async (directory, prefix) => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            if (entry.name === 'node_modules')
                continue;
            const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            if (ignoredGateArtifact(relativePath) || hasSecretSegment(relativePath))
                continue;
            const absolute = join(directory, entry.name);
            const info = await lstat(absolute);
            if (info.isDirectory()) {
                await visit(absolute, relativePath);
            }
            else if (info.isFile()) {
                snapshot.set(relativePath, await readFile(absolute));
            }
            else if (info.isSymbolicLink()) {
                snapshot.set(relativePath, Buffer.from(`symlink:${await readlink(absolute)}`));
            }
        }
    };
    await visit(root, '');
    return snapshot;
}
function reportChangedFiles(before, after, log) {
    const changed = changedPaths(before, after);
    log('Candidate changed files:');
    if (changed.length === 0) {
        log('  (none)');
        return;
    }
    for (const relativePath of changed) {
        const previous = before.get(relativePath);
        const current = after.get(relativePath);
        const label = (value) => value === undefined ? '(absent)' : shortHash(value);
        log(`  ${relativePath}: ${label(previous)} -> ${label(current)}`);
    }
}
function reportGates(gates, log) {
    log('Gates:');
    for (const gate of gates) {
        log(`  ${gate.name}: ${gate.status} — ${gate.detail}`);
    }
}
function reportManualNextSteps(next, log, securityException) {
    log('Manual next steps (not executed):');
    log(`  git add ${REQUIRED_TRACKED.join(' ')} dist`);
    log(`  git commit -m "feat: release v${next}"`);
    log('  # Optional tag (separate authorization required):');
    log(`  git tag v${next}`);
    log('  # Optional push (separate authorization required):');
    log('  git push --follow-tags');
    if (securityException !== undefined && securityException.trim() !== '') {
        log(`  # Security exception: ${securityException}`);
    }
}
function rewriteBackupPaths(error, preserved) {
    const original = errorMessage(error);
    let rewritten = original;
    let replaced = false;
    for (const mapping of preserved.mappings) {
        if (mapping.original === mapping.preserved)
            continue;
        const parts = rewritten.split(mapping.original);
        if (parts.length > 1)
            replaced = true;
        rewritten = parts.join(mapping.preserved);
    }
    if (!replaced) {
        rewritten = `${rewritten}; backup retained at ${preserved.mappings[0].preserved}`;
    }
    return new Error(rewritten, { cause: error instanceof Error ? error : undefined });
}
function hasCandidateRunRootSegment(directory) {
    return directory
        .split(sep)
        .some((segment) => segment !== '' && segment.startsWith(CANDIDATE_RUN_ROOT_PREFIX));
}
async function preservedBackupBase(candidate) {
    const runRoot = await realpath(candidate.runRoot);
    let base = dirname(runRoot);
    // The ambient TMPDIR may itself be inside an enclosing release candidate
    // (the candidate test gate redirects TMPDIR/TMP/TEMP to <outerRunRoot>/tmp).
    // Walk up until the base is no longer inside a kiki-candidate-* tree, which
    // normally lands on the OS temp parent (e.g. /tmp) and keeps normal-env
    // behavior unchanged.
    while (hasCandidateRunRootSegment(base)) {
        const parent = dirname(base);
        if (parent === base)
            break;
        base = parent;
    }
    const baseReal = await realpath(base);
    if (isWithin(runRoot, baseReal)) {
        throw new Error('release: backup relocation directory resolves inside the candidate run root; refusing to retain a backup there.');
    }
    const baseStat = await stat(baseReal);
    if (!baseStat.isDirectory()) {
        throw new Error('release: backup relocation base is not a directory.');
    }
    return baseReal;
}
async function preserveApplyBackups(candidate) {
    const entries = await readdir(candidate.runRoot, { withFileTypes: true });
    const backups = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(BACKUP_PREFIX))
        .map((entry) => join(candidate.runRoot, entry.name))
        .sort();
    if (backups.length === 0)
        return undefined;
    const base = await preservedBackupBase(candidate);
    const root = await mkdtemp(join(base, PRESERVED_BACKUP_PREFIX));
    const mappings = [];
    for (const original of backups) {
        const preserved = join(root, basename(original));
        await rename(original, preserved);
        mappings.push({ original, preserved });
    }
    return { root, mappings };
}
const defaultRunner = async (file, args, options) => {
    try {
        const result = await execFileAsync(file, args, {
            cwd: options.cwd,
            env: options.env,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            timeout: 120_000,
        });
        return { status: 0, stdout: result.stdout, stderr: result.stderr };
    }
    catch (error) {
        const failure = error;
        return {
            status: typeof failure.code === 'number' ? failure.code : 1,
            stdout: failure.stdout ?? '',
            stderr: failure.stderr ?? failure.message ?? String(error),
            signal: failure.signal ?? null,
        };
    }
};
export async function prepareRelease(checkout, options, deps) {
    let candidate;
    let primaryError;
    let result;
    try {
        const checkoutPath = checkout;
        const packageData = await assertKikiCheckout(checkoutPath);
        const current = currentVersion(packageData);
        const tracked = await readTracked(deps.runner, checkoutPath);
        assertRequiredTracked(tracked);
        const dirtyPaths = await readStatus(deps.runner, checkoutPath);
        deps.log(`Release ${options.apply ? 'apply' : 'dry run'}: ${checkoutPath}`);
        deps.log(options.apply
            ? 'Mode: apply (verified candidate copy-back)'
            : 'Mode: dry run (validation only; no checkout writes)');
        if (options.securityException !== undefined && options.securityException.trim() !== '') {
            deps.log(`Security exception: ${options.securityException}`);
        }
        if (dirtyPaths.length > 0) {
            if (options.apply) {
                throw new Error('release: --apply requires a clean working tree (including untracked files); commit, stash, or move these changes first.');
            }
            deps.log(`Dirty preview: working tree has ${dirtyPaths.length} changed/untracked path(s); no checkout writes will occur.`);
        }
        else {
            deps.log('Status: clean');
        }
        let commits;
        let baselineLabel;
        if (options.since !== undefined) {
            if (options.since.trim() === '' || options.since.startsWith('-')) {
                throw new Error('release: --since requires a non-empty ref that does not begin with "-".');
            }
            try {
                commits = await readCommits(deps.runner, checkoutPath, `${options.since}..HEAD`);
            }
            catch {
                throw new Error(`release: --since '${options.since}' is not a usable git revision; pass a resolvable ref.`);
            }
            baselineLabel = `--since ${options.since}`;
        }
        else {
            const history = await readCommits(deps.runner, checkoutPath);
            const baseline = selectBaseline(history, current);
            const baselineCommit = history.find((commit) => commit.hash === baseline);
            if (baselineCommit === undefined) {
                throw new Error('release: selected baseline commit is not present in git log; pass --since <ref>.');
            }
            try {
                commits = await readCommits(deps.runner, checkoutPath, `${baseline}..HEAD`);
            }
            catch {
                throw new Error('release: failed to read the commit range after the selected baseline; pass --since <ref>.');
            }
            baselineLabel = `${baseline.slice(0, 12)} ${baselineCommit.subject}`;
        }
        deps.log(`Baseline: ${baselineLabel}`);
        deps.log(`Range: ${commits.length} commit(s)`);
        const version = decideVersion(current, commits, options.bump);
        deps.log(`Version: ${version.current} -> ${version.next} (${version.rule}; ignored ${version.ignored})`);
        const date = releaseDate(deps.now());
        candidate = await createCandidate(checkoutPath, tracked);
        await prepareCandidateChangelog(candidate, commits, version.next, date);
        const gates = await runCandidateGates(candidate, version.next, date, deps.runner, options.securityException);
        reportGates(gates, deps.log);
        const failures = gates.filter((gate) => gate.status !== 'passed');
        if (failures.length > 0) {
            throw new Error(`release: validation failed: ${failures.map((gate) => gate.detail).join('; ')}`);
        }
        const collisions = await scanDistCollisions(checkoutPath, tracked);
        if (collisions.length > 0) {
            const detail = `${collisions.length} colliding dist path(s): ${summarizePaths(collisions)}; move or explicitly integrate them before applying.`;
            if (options.apply)
                throw new Error(`release: apply refused: ${detail}`);
            deps.log(`Collision preview: apply would refuse: ${detail}`);
        }
        const after = await snapshotForReport(candidate.root);
        reportChangedFiles(candidate.before, after, deps.log);
        let applied = false;
        if (options.apply) {
            const applyResult = await applyCandidate(checkoutPath, candidate, deps.applyHooks);
            applied = true;
            if (await pathExists(applyResult.backupRoot)) {
                const preserved = await preserveApplyBackups(candidate);
                if (preserved === undefined) {
                    deps.log(`Apply backup cleanup failed; reported backup path '${applyResult.backupRoot}' is missing.`);
                }
                else {
                    deps.log(`Apply backup retained at ${preserved.mappings[0].preserved}`);
                }
            }
            else {
                deps.log('Apply backup removed after verified apply.');
            }
        }
        reportManualNextSteps(version.next, deps.log, options.securityException);
        deps.log(applied
            ? 'Applied: true (verified candidate copied back).'
            : 'Applied: false (dry run; no checkout writes).');
        deps.log('Kiki performed no commit/tag/push/publish.');
        result = { version, gates, applied };
    }
    catch (error) {
        primaryError = error;
    }
    let preservedBackup;
    if (candidate !== undefined && primaryError !== undefined) {
        try {
            preservedBackup = await preserveApplyBackups(candidate);
        }
        catch (preservationError) {
            throw new AggregateError([primaryError, preservationError], `${errorMessage(primaryError)}; backup preservation failed (${errorMessage(preservationError)}); retained candidate run root '${candidate.runRoot}' for manual recovery.`);
        }
    }
    if (primaryError !== undefined && preservedBackup !== undefined) {
        primaryError = rewriteBackupPaths(primaryError, preservedBackup);
    }
    if (candidate !== undefined) {
        try {
            await candidate.dispose();
        }
        catch (cleanupError) {
            if (primaryError !== undefined) {
                throw new AggregateError([primaryError, cleanupError], `${errorMessage(primaryError)}; candidate cleanup also failed: ${errorMessage(cleanupError)}; retained run root '${candidate.runRoot}'.`);
            }
            throw cleanupError;
        }
    }
    if (primaryError !== undefined)
        throw primaryError;
    return result;
}
export async function release(args) {
    const options = parseReleaseArgs(args);
    if (options.help) {
        for (const line of HELP_LINES)
            console.log(line);
        return;
    }
    await prepareRelease(process.cwd(), options, {
        runner: defaultRunner,
        now: () => new Date(),
        log: (line) => console.log(line),
    });
}
//# sourceMappingURL=release.js.map