import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm, stat, writeFile, } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { changedPaths, } from './release-candidate.js';
import { prepareChangelog, transformVersions } from './release-policy.js';
const AUDIT_ARGS = ['audit', '--json', '--include=dev', '--include=optional', '--include=peer'];
const REQUIRED_TRANSFORMED_FILES = [
    'package.json',
    'package-lock.json',
    'src/cli/config.ts',
    'CHANGELOG.md',
];
const RELEASE_ARTIFACT_PREFIX = 'dist/';
const GATE_ARTIFACT_PREFIXES = ['tmp/', '.agentic/', 'coverage/', '.cache/'];
const COMPILER_RELATIVE_PATH = 'node_modules/typescript/bin/tsc';
const ESLINT_RELATIVE_PATH = 'node_modules/eslint/bin/eslint.js';
const KNOWN_DISTRIBUTABLE_OUTPUTS = [
    'dist/cli/index.js',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/server/index.js',
    'dist/server/index.d.ts',
    'dist/tui/index.js',
    'dist/tui/index.d.ts',
];
const MAX_DETAIL_LENGTH = 600;
const SECRET_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?)$/i;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isWithin(root, target) {
    const rel = relative(root, target);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function sanitizeDetail(value, maxLength = MAX_DETAIL_LENGTH) {
    return value
        .replace(/https?:\/\/[^\s)>"']+/gi, '<url>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function ignoredGateArtifact(relativePath) {
    return GATE_ARTIFACT_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}
function relativeHasSecretSegment(relativePath) {
    return relativePath
        .split('/')
        .some((segment) => segment !== '' && SECRET_BASENAME.test(segment));
}
function failed(name, message) {
    return { name, status: 'failed', detail: `${name}: ${message}` };
}
function passed(name, detail) {
    return { name, status: 'passed', detail };
}
function incompleteSecurity(reason) {
    return {
        name: 'security',
        status: 'incomplete',
        detail: `security: INCOMPLETE — npm audit unavailable (${sanitizeDetail(reason)})`,
    };
}
function commandFailure(name, result) {
    const status = typeof result.status === 'number' ? result.status : 'unknown';
    const stderr = sanitizeDetail(result.stderr ?? '');
    return failed(name, `failed (exit ${status})${stderr === '' ? '' : `: ${stderr}`}`);
}
async function runCommandGate(name, file, args, options, runner, successDetail) {
    try {
        const result = await runner(file, args, options);
        if (result.signal !== undefined && result.signal !== null) {
            return failed(name, `failed (terminated by signal ${String(result.signal)})`);
        }
        if (typeof result.status !== 'number' || result.status !== 0) {
            return commandFailure(name, result);
        }
        return passed(name, successDetail);
    }
    catch (error) {
        return failed(name, `failed (subprocess could not be started: ${sanitizeDetail(errorMessage(error))})`);
    }
}
async function resolveCandidateTool(candidateRoot, relativePath, label) {
    let rootReal;
    try {
        rootReal = await realpath(candidateRoot);
    }
    catch {
        return { error: `release: candidate root '${candidateRoot}' cannot be resolved.` };
    }
    const absolute = join(rootReal, ...relativePath.split('/'));
    let realPath;
    try {
        realPath = await realpath(absolute);
    }
    catch {
        return {
            error: `release: missing local ${label} at ${relativePath}; no network fallback.`,
        };
    }
    if (!isWithin(rootReal, realPath) || !realPath.startsWith(rootReal + sep)) {
        return {
            error: `release: local ${label} resolves outside the candidate; refusing.`,
        };
    }
    let info;
    try {
        info = await stat(realPath);
    }
    catch {
        return { error: `release: local ${label} at ${relativePath} is unreadable.` };
    }
    if (!info.isFile()) {
        return { error: `release: local ${label} at ${relativePath} is not a regular file.` };
    }
    return { realPath };
}
async function readCandidateText(candidateRoot, relativePath) {
    const absolute = join(candidateRoot, ...relativePath.split('/'));
    try {
        return await readFile(absolute, 'utf8');
    }
    catch {
        throw new Error(`release: candidate file '${relativePath}' is missing or unreadable.`);
    }
}
function parseJsonObject(text, label) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new Error(`release: candidate ${label} is not valid JSON.`);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`release: candidate ${label} must be a JSON object.`);
    }
    return value;
}
function versionOf(value) {
    return typeof value === 'string' ? value : undefined;
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
async function writeCandidateFile(candidateRoot, relativePath, contents) {
    const absolute = join(candidateRoot, ...relativePath.split('/'));
    let mode = 0o644;
    try {
        mode = (await stat(absolute)).mode & 0o777;
    }
    catch {
        // New file: use the default mode.
    }
    await writeFile(absolute, contents);
    await chmod(absolute, mode);
}
async function applyCandidateTransforms(candidate, next, date) {
    const errors = [];
    let candidateRoot;
    try {
        candidateRoot = await realpath(candidate.root);
    }
    catch {
        return [`candidate root '${candidate.root}' cannot be resolved`];
    }
    try {
        const packageJson = await readCandidateText(candidateRoot, 'package.json');
        const lockJson = await readCandidateText(candidateRoot, 'package-lock.json');
        const configTs = await readCandidateText(candidateRoot, 'src/cli/config.ts');
        const packageData = parseJsonObject(packageJson, 'package.json');
        const lockData = parseJsonObject(lockJson, 'package-lock.json');
        const configMatch = /^export const KIKI_VERSION = '([^'\r\n]+)';$/m.exec(configTs);
        const lockPackages = typeof lockData.packages === 'object' && lockData.packages !== null
            ? lockData.packages
            : undefined;
        const rootPackage = lockPackages !== undefined && typeof lockPackages[''] === 'object' && lockPackages[''] !== null
            ? lockPackages['']
            : undefined;
        const currentVersions = [
            versionOf(packageData.version),
            versionOf(lockData.version),
            versionOf(rootPackage?.version),
            configMatch?.[1],
        ];
        const allAlreadyNext = currentVersions.every((value) => value === next);
        if (!allAlreadyNext) {
            const transformed = transformVersions({ packageJson, lockJson, configTs }, next);
            await writeCandidateFile(candidateRoot, 'package.json', transformed.packageJson);
            await writeCandidateFile(candidateRoot, 'package-lock.json', transformed.lockJson);
            await writeCandidateFile(candidateRoot, 'src/cli/config.ts', transformed.configTs);
        }
    }
    catch (error) {
        errors.push(`version transform failed: ${sanitizeDetail(errorMessage(error))}`);
    }
    try {
        const changelog = await readCandidateText(candidateRoot, 'CHANGELOG.md');
        if (!changelogAlreadyPrepared(changelog, next, date)) {
            const prepared = prepareChangelog(changelog, [], next, date);
            await writeCandidateFile(candidateRoot, 'CHANGELOG.md', prepared);
        }
    }
    catch (error) {
        errors.push(`changelog transform failed: ${sanitizeDetail(errorMessage(error))}`);
    }
    return errors;
}
async function clearCandidateDist(candidateRoot) {
    const rootReal = await realpath(candidateRoot);
    const dist = join(rootReal, 'dist');
    let info;
    try {
        info = await lstat(dist);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('candidate dist is not a plain directory; refusing to clear it');
    }
    const distReal = await realpath(dist);
    if (!isWithin(rootReal, distReal) || !distReal.startsWith(rootReal + sep)) {
        throw new Error('candidate dist resolves outside the candidate; refusing to clear it');
    }
    await rm(distReal, { recursive: true, force: true });
}
async function snapshotReleaseTree(root, before) {
    const snapshot = new Map();
    const visit = async (directory, prefix) => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            if (entry.name === 'node_modules')
                continue;
            const trackedBefore = before.has(relativePath);
            // Check every full relative component before descending or reading so a
            // gate-created secrets/data.json or credentials/config.json is never read.
            if (relativeHasSecretSegment(relativePath)) {
                if (trackedBefore) {
                    throw new Error(`release: tracked secret-bearing path '${relativePath}' cannot be diffed safely without reading its contents`);
                }
                continue;
            }
            const absolute = join(directory, entry.name);
            const entryStat = await lstat(absolute);
            if (entryStat.isDirectory()) {
                await visit(absolute, relativePath);
                continue;
            }
            if (!trackedBefore && ignoredGateArtifact(relativePath))
                continue;
            if (entryStat.isFile()) {
                snapshot.set(relativePath, await readFile(absolute));
            }
            else if (entryStat.isSymbolicLink()) {
                snapshot.set(relativePath, Buffer.from(`symlink:${await readlink(absolute)}`));
            }
        }
    };
    await visit(root, '');
    return snapshot;
}
function parseAuditPayload(stdout) {
    const trimmed = stdout.trim();
    if (trimmed === '')
        return undefined;
    const attempts = [trimmed];
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
    for (const attempt of attempts) {
        try {
            const parsed = JSON.parse(attempt);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Try the next candidate payload.
        }
    }
    return undefined;
}
function vulnerabilityCount(vulnerabilities, key) {
    const value = vulnerabilities[key];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}
function parseAuditResult(result, securityException) {
    const signal = result.signal;
    if (signal !== undefined && signal !== null && signal !== '') {
        return incompleteSecurity(`terminated by signal ${String(signal)}`);
    }
    const rawStatus = result.status;
    if (typeof rawStatus !== 'number' ||
        !Number.isFinite(rawStatus) ||
        !Number.isInteger(rawStatus)) {
        return incompleteSecurity('missing or invalid exit status');
    }
    if (rawStatus !== 0 && rawStatus !== 1) {
        return incompleteSecurity(`unexpected exit status ${rawStatus}`);
    }
    const payload = parseAuditPayload(result.stdout);
    if (payload === undefined) {
        return incompleteSecurity(result.stdout.trim() === '' ? 'registry or network unavailable' : 'invalid JSON response');
    }
    if (typeof payload.error === 'object' && payload.error !== null) {
        const error = payload.error;
        const summary = typeof error.summary === 'string' ? error.summary : 'audit error response';
        return incompleteSecurity(summary);
    }
    if (typeof payload.metadata !== 'object' || payload.metadata === null) {
        return incompleteSecurity('missing vulnerability metadata');
    }
    const metadata = payload.metadata;
    if (typeof metadata.vulnerabilities !== 'object' || metadata.vulnerabilities === null) {
        return incompleteSecurity('missing vulnerability metadata');
    }
    const vulnerabilities = metadata.vulnerabilities;
    const high = vulnerabilityCount(vulnerabilities, 'high');
    const critical = vulnerabilityCount(vulnerabilities, 'critical');
    if (high === undefined || critical === undefined) {
        return incompleteSecurity('missing vulnerability metadata');
    }
    const low = vulnerabilityCount(vulnerabilities, 'low') ?? 0;
    const moderate = vulnerabilityCount(vulnerabilities, 'moderate') ?? 0;
    const total = high + critical + low + moderate;
    if (rawStatus === 1 && total === 0) {
        return incompleteSecurity('unexpected exit status 1 with no findings');
    }
    const blocking = high + critical;
    if (blocking > 0) {
        if (securityException !== undefined && securityException.trim() !== '') {
            return passed('security', `security: passed with approved exception (${high} high, ${critical} critical; reason: ${securityException}); low: ${low}, moderate: ${moderate}; dev/optional/peer included`);
        }
        return {
            name: 'security',
            status: 'failed',
            detail: `security: blocked: ${blocking} high/critical vulnerabilities; no exception approved`,
        };
    }
    return passed('security', `security: passed (0 high/critical; low: ${low}, moderate: ${moderate}; dev/optional/peer included)`);
}
async function runSecurityGate(candidate, runner, securityException) {
    let invocation;
    try {
        invocation = await createAuditInvocation(candidate.root, candidate.runRoot, candidate.npmEnv);
    }
    catch (error) {
        return incompleteSecurity(errorMessage(error));
    }
    try {
        const result = await runner(invocation.file, invocation.args, invocation.options);
        return parseAuditResult(result, securityException);
    }
    catch (error) {
        return incompleteSecurity(`npm audit could not be started: ${sanitizeDetail(errorMessage(error))}`);
    }
}
function testGateEnvironment(npmEnv) {
    const env = { ...npmEnv };
    for (const key of Object.keys(env)) {
        if (/^KIKI_RELEASE_TEST_/i.test(key))
            delete env[key];
    }
    return env;
}
function addDistributableTarget(raw, field, targets, errors) {
    const value = raw.trim();
    if (value === '') {
        errors.push(`package.json ${field} target is empty`);
        return;
    }
    if (value.includes('\0')) {
        errors.push(`package.json ${field} target contains NUL`);
        return;
    }
    const forward = value.replace(/\\/g, '/');
    if (isAbsolute(value) || forward.startsWith('/') || /^[A-Za-z]:\//.test(forward)) {
        errors.push(`package.json ${field} target '${sanitizeDetail(value, 120)}' is not a safe local dist path (absolute)`);
        return;
    }
    const normalized = forward.replace(/^\.\/+/, '');
    const segments = normalized.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
        errors.push(`package.json ${field} target '${sanitizeDetail(value, 120)}' is not a safe local dist path (traversal)`);
        return;
    }
    if (normalized === 'dist' || !normalized.startsWith('dist/')) {
        errors.push(`package.json ${field} target '${sanitizeDetail(value, 120)}' is not under dist/`);
        return;
    }
    targets.add(segments.join('/'));
}
function collectExportTargets(value, field, targets, errors) {
    if (typeof value === 'string') {
        addDistributableTarget(value, field, targets, errors);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => collectExportTargets(entry, `${field}[${index}]`, targets, errors));
        return;
    }
    if (value === null || value === undefined)
        return;
    if (typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            collectExportTargets(entry, `${field}.${key}`, targets, errors);
        }
        return;
    }
    errors.push(`package.json ${field} target must be a string or nested export map`);
}
function distributableTargets(packageData) {
    const targets = new Set(KNOWN_DISTRIBUTABLE_OUTPUTS);
    const errors = [];
    for (const field of ['main', 'types']) {
        const value = packageData[field];
        if (value === undefined)
            continue;
        if (typeof value === 'string')
            addDistributableTarget(value, field, targets, errors);
        else
            errors.push(`package.json ${field} target must be a string`);
    }
    const bin = packageData.bin;
    if (typeof bin === 'string') {
        addDistributableTarget(bin, 'bin', targets, errors);
    }
    else if (bin !== undefined) {
        if (typeof bin === 'object' && bin !== null && !Array.isArray(bin)) {
            for (const [name, value] of Object.entries(bin)) {
                if (typeof value === 'string')
                    addDistributableTarget(value, `bin.${name}`, targets, errors);
                else
                    errors.push(`package.json bin.${name} target must be a string`);
            }
        }
        else {
            errors.push('package.json bin target must be a string or object of strings');
        }
    }
    if (packageData.exports !== undefined) {
        collectExportTargets(packageData.exports, 'exports', targets, errors);
    }
    return { targets: [...targets].sort(), errors };
}
async function distributableOutputFailures(candidateRoot, packageData) {
    const { targets, errors } = distributableTargets(packageData);
    for (const target of targets) {
        const absolute = join(candidateRoot, ...target.split('/'));
        if (!isWithin(candidateRoot, absolute) || !absolute.startsWith(candidateRoot + sep)) {
            errors.push(`distributable output '${target}' resolves outside the candidate`);
            continue;
        }
        try {
            const info = await lstat(absolute);
            if (!info.isFile()) {
                errors.push(`distributable output '${target}' is not a regular file`);
            }
        }
        catch {
            errors.push(`missing distributable output '${target}'`);
        }
    }
    return errors;
}
async function checkInvariants(candidate, next, date, transformErrors = [], distResetError) {
    const failures = [...transformErrors];
    if (distResetError !== undefined)
        failures.push(`dist reset failed: ${distResetError}`);
    let candidateRoot;
    try {
        candidateRoot = await realpath(candidate.root);
    }
    catch {
        return failed('invariants', `failed (candidate root '${candidate.root}' cannot be resolved)`);
    }
    const read = async (relativePath, label) => {
        try {
            return await readCandidateText(candidateRoot, relativePath);
        }
        catch (error) {
            failures.push(`${label}: ${sanitizeDetail(errorMessage(error))}`);
            return undefined;
        }
    };
    const packageJson = await read('package.json', 'package.json');
    const lockJson = await read('package-lock.json', 'package-lock.json');
    const configTs = await read('src/cli/config.ts', 'src/cli/config.ts');
    const changelog = await read('CHANGELOG.md', 'CHANGELOG.md');
    const distConfig = await read('dist/cli/config.js', 'dist/cli/config.js');
    let packageDataForOutputs;
    if (packageJson !== undefined) {
        try {
            const packageData = parseJsonObject(packageJson, 'package.json');
            packageDataForOutputs = packageData;
            if (versionOf(packageData.version) !== next) {
                failures.push(`package.json version '${String(packageData.version)}' is not '${next}'`);
            }
        }
        catch (error) {
            failures.push(sanitizeDetail(errorMessage(error)));
        }
    }
    failures.push(...(await distributableOutputFailures(candidateRoot, packageDataForOutputs ?? {})));
    if (lockJson !== undefined) {
        try {
            const lockData = parseJsonObject(lockJson, 'package-lock.json');
            if (versionOf(lockData.version) !== next) {
                failures.push(`package-lock.json root version '${String(lockData.version)}' is not '${next}'`);
            }
            const packages = typeof lockData.packages === 'object' && lockData.packages !== null
                ? lockData.packages
                : undefined;
            const rootPackage = packages !== undefined && typeof packages[''] === 'object' && packages[''] !== null
                ? packages['']
                : undefined;
            if (versionOf(rootPackage?.version) !== next) {
                failures.push(`package-lock.json packages[""].version '${String(rootPackage?.version)}' is not '${next}'`);
            }
        }
        catch (error) {
            failures.push(sanitizeDetail(errorMessage(error)));
        }
    }
    if (configTs !== undefined) {
        const matches = [...configTs.matchAll(/^export const KIKI_VERSION = '([^'\r\n]+)';$/gm)];
        if (matches.length !== 1) {
            failures.push('src/cli/config.ts must contain exactly one anchored KIKI_VERSION export');
        }
        else if (matches[0][1] !== next) {
            failures.push(`src/cli/config.ts KIKI_VERSION '${matches[0][1]}' is not '${next}'`);
        }
    }
    if (distConfig !== undefined) {
        const matches = [...distConfig.matchAll(/^export const KIKI_VERSION = (['"])([^'"\r\n]+)\1;$/gm)];
        if (matches.length !== 1) {
            failures.push('dist/cli/config.js must contain exactly one anchored KIKI_VERSION export');
        }
        else if (matches[0][2] !== next) {
            failures.push(`dist/cli/config.js KIKI_VERSION '${matches[0][2]}' is not '${next}'`);
        }
    }
    if (changelog !== undefined) {
        const unreleased = [...changelog.matchAll(/^## \[Unreleased\][ \t]*$/gm)];
        const dated = [
            ...changelog.matchAll(new RegExp(`^## \\[${escapeRegExp(next)}\\] — ${escapeRegExp(date)}$`, 'gm')),
        ];
        if (unreleased.length !== 1) {
            failures.push("CHANGELOG.md must contain exactly one '## [Unreleased]' heading");
        }
        if (dated.length !== 1) {
            failures.push(`CHANGELOG.md must contain exactly one '## [${next}] — ${date}' heading`);
        }
        if (unreleased.length === 1 && dated.length === 1) {
            const unreleasedIndex = unreleased[0].index ?? 0;
            const unreleasedEnd = unreleasedIndex + unreleased[0][0].length;
            const datedIndex = dated[0].index ?? 0;
            if (unreleasedIndex > datedIndex) {
                failures.push("CHANGELOG.md fresh '## [Unreleased]' heading must appear above the dated release");
            }
            else if (changelog.slice(unreleasedEnd, datedIndex).trim() !== '') {
                failures.push("CHANGELOG.md fresh '## [Unreleased]' section must be empty");
            }
        }
    }
    const trackedSecretPaths = [...candidate.before.keys()]
        .filter((relativePath) => relativeHasSecretSegment(relativePath))
        .sort();
    if (trackedSecretPaths.length > 0) {
        failures.push(`tracked secret-bearing path(s) cannot be diffed safely without reading: ${trackedSecretPaths
            .map((path) => `'${path}'`)
            .join(', ')}`);
    }
    else {
        try {
            const after = await snapshotReleaseTree(candidateRoot, candidate.before);
            const changed = changedPaths(candidate.before, after);
            const allowed = (relativePath) => REQUIRED_TRANSFORMED_FILES.includes(relativePath) ||
                relativePath.startsWith(RELEASE_ARTIFACT_PREFIX);
            const unexpected = changed.filter((relativePath) => !allowed(relativePath));
            if (unexpected.length > 0) {
                failures.push(`changed files outside the release allowlist: ${unexpected.map((path) => `'${path}'`).join(', ')}`);
            }
            const missingRequired = REQUIRED_TRANSFORMED_FILES.filter((required) => !changed.includes(required));
            if (missingRequired.length > 0) {
                failures.push(`required transformed files did not change: ${missingRequired.map((path) => `'${path}'`).join(', ')}`);
            }
        }
        catch (error) {
            failures.push(`release diff failed: ${sanitizeDetail(errorMessage(error))}`);
        }
    }
    if (failures.length > 0) {
        return failed('invariants', `failed (${failures.join('; ')})`);
    }
    return passed('invariants', 'invariants: passed');
}
export async function createAuditInvocation(root, runRoot, ambient) {
    const rootPath = resolve(root);
    let rootReal;
    try {
        rootReal = await realpath(rootPath);
    }
    catch {
        throw new Error(`release: audit root '${root}' cannot be resolved.`);
    }
    const rootStat = await stat(rootReal);
    if (!rootStat.isDirectory()) {
        throw new Error(`release: audit root '${root}' is not a directory.`);
    }
    if (await pathExists(join(rootReal, '.npmrc'))) {
        throw new Error('release: refusing audit: root .npmrc exists and would be consumed by npm; move or remove it (contents were not read).');
    }
    const runRootPath = resolve(runRoot);
    const runRootStat = await stat(runRootPath);
    if (!runRootStat.isDirectory()) {
        throw new Error(`release: audit run root '${runRoot}' is not a directory.`);
    }
    for (const directory of ['cache', 'logs', 'tmp']) {
        await mkdir(join(runRootPath, directory), { recursive: true, mode: 0o700 });
    }
    const configRoot = await mkdtemp(join(runRootPath, 'npm-config-'));
    const userConfig = join(configRoot, 'user.npmrc');
    const globalConfig = join(configRoot, 'global.npmrc');
    for (const configPath of [userConfig, globalConfig]) {
        const handle = await open(configPath, 'wx', 0o600);
        await handle.close();
        await chmod(configPath, 0o600);
    }
    const env = { ...ambient };
    for (const key of Object.keys(env)) {
        if (/^npm_config_/i.test(key) ||
            /^(?:NODE_AUTH_TOKEN|NPM_TOKEN|NPM_AUTH_TOKEN|YARN_NPM_AUTH_TOKEN)$/i.test(key)) {
            delete env[key];
        }
    }
    const tmp = join(runRootPath, 'tmp');
    env.NODE_ENV = 'development';
    env.npm_config_cache = join(runRootPath, 'cache');
    env.npm_config_logs_dir = join(runRootPath, 'logs');
    env.npm_config_tmp = tmp;
    env.npm_config_userconfig = userConfig;
    env.npm_config_globalconfig = globalConfig;
    env.TMPDIR = tmp;
    env.TMP = tmp;
    env.TEMP = tmp;
    return {
        file: 'npm',
        args: [...AUDIT_ARGS],
        options: { cwd: rootReal, env },
    };
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
export async function runCandidateGates(candidate, next, date, runner, securityException) {
    const transformErrors = await applyCandidateTransforms(candidate, next, date);
    let distResetError;
    try {
        await clearCandidateDist(candidate.root);
    }
    catch (error) {
        distResetError = sanitizeDetail(errorMessage(error));
    }
    const candidateRoot = candidate.root;
    const ts = await resolveCandidateTool(candidateRoot, COMPILER_RELATIVE_PATH, 'TypeScript compiler');
    const eslint = await resolveCandidateTool(candidateRoot, ESLINT_RELATIVE_PATH, 'ESLint');
    const build = distResetError !== undefined
        ? failed('build', `failed (${distResetError})`)
        : 'error' in ts
            ? failed('build', `failed (${ts.error})`)
            : await runCommandGate('build', process.execPath, [ts.realPath, '-p', 'tsconfig.json'], { cwd: candidateRoot, env: candidate.npmEnv }, runner, 'build: passed (dist/)');
    const test = await runCommandGate('test', 'npm', ['test'], { cwd: candidateRoot, env: testGateEnvironment(candidate.npmEnv) }, runner, 'test: passed');
    const typecheck = 'error' in ts
        ? failed('typecheck', `failed (${ts.error})`)
        : await runCommandGate('typecheck', process.execPath, [ts.realPath, '-p', 'tsconfig.json', '--noEmit'], { cwd: candidateRoot, env: candidate.npmEnv }, runner, 'typecheck: passed (src/)');
    const lint = 'error' in eslint
        ? failed('lint', `failed (${eslint.error})`)
        : await runCommandGate('lint', process.execPath, [eslint.realPath, 'src/**/*.ts'], { cwd: candidateRoot, env: candidate.npmEnv }, runner, 'lint: passed (src/)');
    const security = await runSecurityGate(candidate, runner, securityException);
    const invariants = await checkInvariants(candidate, next, date, transformErrors, distResetError);
    return [build, test, typecheck, lint, security, invariants];
}
export async function validateCandidate(candidate, next, date) {
    const result = await checkInvariants(candidate, next, date);
    if (result.status !== 'passed') {
        throw new Error(result.detail);
    }
}
//# sourceMappingURL=release-gates.js.map