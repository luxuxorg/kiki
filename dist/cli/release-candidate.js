import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readdir, readFile, readlink, realpath, rm, stat, writeFile, } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
const RUN_ROOT_PREFIX = 'kiki-candidate-';
const MAX_DEPENDENCY_DEPTH = 64;
const MAX_PRE_SHIM_BYTES = 64 * 1024;
const ALLOWED_GIT_SUBCOMMANDS = new Set(['log', 'ls-files', 'status']);
const SECRET_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?)$/i;
function validateGitArguments(subcommand, args) {
    for (const arg of args) {
        if (typeof arg !== 'string' || arg.includes('\0')) {
            throw new Error('release: unsafe git argument contains NUL; refusing to invoke git.');
        }
    }
    if (subcommand === 'log') {
        let sawFormat = false;
        for (const arg of args) {
            if (arg.startsWith('--format=')) {
                if (sawFormat)
                    throw new Error('release: duplicate git log --format argument refused.');
                sawFormat = true;
                continue;
            }
            if (arg.startsWith('-') || arg === '') {
                throw new Error(`release: unsupported git log argument '${arg}'.`);
            }
        }
        return;
    }
    if (subcommand === 'ls-files') {
        for (const arg of args) {
            if (arg !== '-z') {
                throw new Error(`release: unsupported git ls-files argument '${arg}'.`);
            }
        }
        return;
    }
    const seen = new Set();
    for (const arg of args) {
        if (arg !== '--porcelain' && arg !== '--untracked-files=all') {
            throw new Error(`release: unsupported git status argument '${arg}'.`);
        }
        if (seen.has(arg))
            throw new Error(`release: duplicate git status argument '${arg}' refused.`);
        seen.add(arg);
    }
}
export async function readGit(runner, root, subcommand, args) {
    if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
        throw new Error(`release: git subcommand '${String(subcommand)}' is not allowed; only log, ls-files and status are read-only.`);
    }
    validateGitArguments(subcommand, args);
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
    const result = await runner('git', [subcommand, ...args], { cwd: root, env });
    if (result.status !== 0) {
        throw new Error(`release: git ${subcommand} failed (${result.status}): ${result.stderr.trim() || 'no stderr output'}`);
    }
    return result.stdout;
}
function isWithin(root, target) {
    const rel = relative(root, target);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function isSecretBasename(name) {
    return SECRET_BASENAME.test(name);
}
function hasSecretSegment(relativePath) {
    return relativePath.split('/').some(segment => segment !== '' && isSecretBasename(segment));
}
function validateTrackedPath(relativePath) {
    if (typeof relativePath !== 'string' || relativePath === '') {
        throw new Error('release: tracked path must be a non-empty string.');
    }
    if (relativePath.includes('\0')) {
        throw new Error('release: tracked path contains NUL; refusing unsafe path.');
    }
    if (isAbsolute(relativePath)) {
        throw new Error(`release: tracked path is absolute; refusing unsafe path '${relativePath}'.`);
    }
    if (relativePath.split('/').some(segment => segment === '..')) {
        throw new Error(`release: tracked path contains parent traversal; refusing unsafe path '${relativePath}'.`);
    }
    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        throw new Error(`release: tracked path targets .git; refusing unsafe path '${relativePath}'.`);
    }
}
async function refuseRootNpmrc(checkout) {
    const rootNpmrc = join(checkout, '.npmrc');
    try {
        await lstat(rootNpmrc);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    throw new Error('release: refusing candidate: checkout root .npmrc exists and a candidate npm process could consume it; move or remove it (contents were not read).');
}
async function inspectTrackedInput(checkout, relativePath) {
    validateTrackedPath(relativePath);
    if (basename(relativePath) === '.npmrc') {
        throw new Error(`release: refusing candidate: tracked .npmrc would be copied ('${relativePath}'); contents were not read.`);
    }
    if (hasSecretSegment(relativePath)) {
        throw new Error(`release: refusing candidate: tracked secret-bearing path would be read or copied ('${relativePath}').`);
    }
    const segments = relativePath.split('/');
    let sourcePath = checkout;
    let entryStat;
    let sawSymlink = false;
    for (let index = 0; index < segments.length; index++) {
        sourcePath = join(sourcePath, segments[index]);
        let componentStat;
        try {
            componentStat = await lstat(sourcePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`release: tracked file '${relativePath}' is missing from the working tree; refusing to fall back to HEAD bytes.`);
            }
            throw error;
        }
        if (componentStat.isSymbolicLink())
            sawSymlink = true;
        if (index < segments.length - 1) {
            if (!componentStat.isDirectory() && !componentStat.isSymbolicLink()) {
                throw new Error(`release: tracked path '${relativePath}' has a non-directory ancestor.`);
            }
        }
        else {
            entryStat = componentStat;
        }
    }
    if (!entryStat) {
        throw new Error(`release: tracked path '${relativePath}' could not be inspected.`);
    }
    // Resolve real paths before any content read/copy so secret targets and
    // secret-named symlinked ancestors are refused on metadata alone.
    let realSource;
    let realParent;
    try {
        realSource = await realpath(sourcePath);
        realParent = await realpath(dirname(sourcePath));
    }
    catch {
        throw new Error(`release: tracked path '${relativePath}' is dangling or unreadable; refusing unsafe path.`);
    }
    if (!isWithin(checkout, realSource) || !isWithin(checkout, realParent)) {
        throw new Error(`release: tracked path '${relativePath}' escapes the checkout; refusing unsafe path.`);
    }
    const realRelative = relative(checkout, realSource);
    if (hasSecretSegment(realRelative) || hasSecretSegment(relative(checkout, realParent))) {
        throw new Error(`release: refusing candidate: tracked path '${relativePath}' resolves through a secret-bearing path ('${realRelative}').`);
    }
    if (sawSymlink || entryStat.isSymbolicLink()) {
        throw new Error(`release: tracked path '${relativePath}' or an ancestor is a symlink; refusing writable release target.`);
    }
    if (entryStat.isDirectory()) {
        throw new Error(`release: tracked path '${relativePath}' is a directory; tracked entries must be files.`);
    }
    if (!entryStat.isFile()) {
        throw new Error(`release: tracked path '${relativePath}' is not a regular file.`);
    }
    return { relativePath, sourcePath: realSource, mode: entryStat.mode };
}
async function copyTrackedFile(candidateRoot, input) {
    const destination = join(candidateRoot, ...input.relativePath.split('/'));
    if (!isWithin(candidateRoot, destination) || destination === candidateRoot) {
        throw new Error(`release: candidate destination escapes the candidate root for '${input.relativePath}'.`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(input.sourcePath, destination);
    await chmod(destination, input.mode & 0o777);
}
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
async function classifyEntrypoint(file) {
    const handle = await open(file, 'r');
    try {
        const buffer = Buffer.alloc(512);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const head = buffer.subarray(0, bytesRead);
        if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
            return 'native';
        }
        if (head.length === 0)
            return 'unsupported';
        if (head[0] === 0x23 && head[1] === 0x21) {
            const firstLine = head.toString('utf8').split(/\r?\n/, 1)[0].slice(2).trim();
            const tokens = firstLine.split(/\s+/).filter(Boolean);
            if (tokens.length === 0)
                return 'unsupported';
            const interpreter = basename(tokens[0]);
            if (interpreter === 'env') {
                const command = tokens[1];
                return command !== undefined && /^node(?:js)?$/i.test(basename(command)) ? 'node' : 'unsupported';
            }
            return /^node(?:js)?$/i.test(interpreter) ? 'node' : 'unsupported';
        }
    }
    finally {
        await handle.close();
    }
    return ['.js', '.mjs', '.cjs'].includes(extname(file).toLowerCase()) ? 'node' : 'unsupported';
}
async function writeBinShim(destination, kind, candidateEntrypoint) {
    const shim = kind === 'native'
        ? `#!/bin/sh\nexec ${shellQuote(candidateEntrypoint)} "$@"\n`
        : `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(candidateEntrypoint)} "$@"\n`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, shim, { mode: 0o755 });
    await chmod(destination, 0o755);
}
function parseShellQuotedArgs(body) {
    const args = [];
    let index = 0;
    while (index < body.length) {
        if (body[index] !== "'")
            return undefined;
        index++;
        let value = '';
        let closed = false;
        while (index < body.length) {
            if (body[index] === "'") {
                if (body.slice(index, index + 4) === "'\\''") {
                    value += "'";
                    index += 4;
                    continue;
                }
                index++;
                closed = true;
                break;
            }
            value += body[index++];
        }
        if (!closed)
            return undefined;
        args.push(value);
        if (index < body.length) {
            if (body[index] !== ' ')
                return undefined;
            index++;
        }
    }
    return args;
}
function parseKikiShim(text) {
    const match = /^#!\/bin\/sh\nexec (.+)\n$/.exec(text);
    if (match === null)
        return undefined;
    const command = match[1];
    if (!command.endsWith(' "$@"'))
        return undefined;
    const args = parseShellQuotedArgs(command.slice(0, -' "$@"'.length));
    if (args === undefined || args.length === 0 || args.length > 2)
        return undefined;
    let target;
    if (args.length === 2) {
        if (!/^node(?:js)?(?:\.exe)?$/i.test(basename(args[0])))
            return undefined;
        target = args[1];
    }
    else {
        target = args[0];
    }
    const normalized = target.split(sep).join('/');
    const marker = normalized.indexOf('/node_modules/');
    if (marker < 0)
        return undefined;
    const relativeTarget = normalized.slice(marker + '/node_modules/'.length);
    if (relativeTarget === '')
        return undefined;
    if (relativeTarget.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
        return undefined;
    }
    return { relativeTarget };
}
async function copyPreShimmedBinEntry(sourcePath, destination, sourceRoot, destinationRoot) {
    const buffer = await readFile(sourcePath);
    if (buffer.length === 0 || buffer[0] !== 0x23 || buffer[1] !== 0x21)
        return false;
    const parsed = parseKikiShim(buffer.toString('utf8'));
    if (parsed === undefined)
        return false;
    const { relativeTarget } = parsed;
    if (hasSecretSegment(relativeTarget)) {
        throw new Error(`release: pre-shimmed .bin entry resolves to secret-bearing path '${relativeTarget}'; refusing unsafe target.`);
    }
    const mappedSource = join(sourceRoot, relativeTarget);
    if (!isWithin(sourceRoot, mappedSource)) {
        throw new Error(`release: pre-shimmed .bin entry target '${relativeTarget}' escapes the source dependency root; refusing unsafe target.`);
    }
    let mappedStat;
    try {
        mappedStat = await lstat(mappedSource);
    }
    catch {
        throw new Error(`release: pre-shimmed .bin entry target '${relativeTarget}' is missing from the source dependency root; refusing unsafe shim.`);
    }
    if (!mappedStat.isFile()) {
        throw new Error(`release: pre-shimmed .bin entry target '${relativeTarget}' is not a regular file; refusing unsafe shim.`);
    }
    const kind = await classifyEntrypoint(mappedSource);
    if (kind === 'unsupported') {
        throw new Error(`release: pre-shimmed .bin entry target '${relativeTarget}' is not a supported Node/native entrypoint; refusing unsafe shim.`);
    }
    const candidateEntrypoint = join(destinationRoot, relativeTarget);
    if (!isWithin(destinationRoot, candidateEntrypoint)) {
        throw new Error(`release: pre-shimmed .bin entry target '${relativeTarget}' maps outside the candidate dependency root; refusing unsafe shim.`);
    }
    await writeBinShim(destination, kind, candidateEntrypoint);
    return true;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function removeRunRoot(runRoot) {
    try {
        await rm(runRoot, { recursive: true, force: true });
    }
    catch (error) {
        throw new Error(`release: failed to remove candidate run root '${runRoot}' (retained for manual cleanup): ${errorMessage(error)}`, { cause: error });
    }
}
async function copyDependencyLink(sourcePath, destination, sourceDirectory, context, label) {
    const target = await readlink(sourcePath);
    if (isAbsolute(target)) {
        throw new Error(`release: dependency symlink '${label}' uses an absolute target; refusing unsafe link.`);
    }
    const lexicalTarget = resolve(dirname(sourcePath), target);
    if (!isWithin(context.sourceRoot, lexicalTarget)) {
        throw new Error(`release: dependency symlink '${label}' escapes node_modules; refusing external link.`);
    }
    if (hasSecretSegment(relative(context.sourceRoot, lexicalTarget))) {
        throw new Error(`release: dependency symlink '${label}' targets a secret-bearing path; refusing unsafe link.`);
    }
    let realTarget;
    try {
        realTarget = await realpath(lexicalTarget);
    }
    catch {
        throw new Error(`release: dependency symlink '${label}' is dangling or missing its target; refusing unsafe link.`);
    }
    if (!isWithin(context.sourceRoot, realTarget)) {
        throw new Error(`release: dependency symlink '${label}' escapes node_modules; refusing external link.`);
    }
    if (hasSecretSegment(relative(context.sourceRoot, realTarget))) {
        throw new Error(`release: dependency symlink '${label}' targets a secret-bearing path; refusing unsafe link.`);
    }
    const targetStat = await stat(realTarget);
    const inBin = basename(sourceDirectory) === '.bin';
    if (inBin) {
        if (!targetStat.isFile()) {
            throw new Error(`release: .bin entry '${label}' does not point to a regular file.`);
        }
        const entrypointKind = await classifyEntrypoint(realTarget);
        if (entrypointKind === 'unsupported') {
            throw new Error(`release: unsupported non-Node linked executable '${label}'; only Node-shebang or recognized ELF entrypoints are shimmed.`);
        }
        if (entrypointKind === 'native' && (targetStat.mode & 0o111) === 0) {
            throw new Error(`release: native .bin entry '${label}' is not executable; refusing unsafe link.`);
        }
        const mappedRelative = relative(context.sourceRoot, lexicalTarget);
        if (mappedRelative === '' || mappedRelative === '..' || mappedRelative.startsWith(`..${sep}`)) {
            throw new Error(`release: .bin entry '${label}' has no candidate-local mapped target.`);
        }
        const candidateEntrypoint = join(context.destinationRoot, mappedRelative);
        if (!isWithin(context.destinationRoot, candidateEntrypoint)) {
            throw new Error(`release: .bin entry '${label}' maps outside the candidate dependency root.`);
        }
        await writeBinShim(destination, entrypointKind, candidateEntrypoint);
        return;
    }
    if (targetStat.isFile()) {
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(realTarget, destination);
        await chmod(destination, targetStat.mode & 0o777);
        return;
    }
    if (targetStat.isDirectory()) {
        if (context.stack.has(realTarget)) {
            throw new Error(`release: dependency symlink '${label}' is cyclic; refusing unsafe link.`);
        }
        if (context.depth + 1 > MAX_DEPENDENCY_DEPTH) {
            throw new Error(`release: dependency tree exceeds the maximum depth of ${MAX_DEPENDENCY_DEPTH}.`);
        }
        await mkdir(destination, { recursive: true });
        await chmod(destination, targetStat.mode & 0o777);
        context.stack.add(realTarget);
        try {
            await copyDependencyDirectory(realTarget, destination, context.depth + 1, context.stack, context.sourceRoot, context.destinationRoot);
        }
        finally {
            context.stack.delete(realTarget);
        }
        return;
    }
    throw new Error(`release: dependency symlink '${label}' targets an unsupported special file.`);
}
async function copyDependencyDirectory(sourceDirectory, destinationDirectory, depth, stack, sourceRoot, destinationRoot) {
    if (depth > MAX_DEPENDENCY_DEPTH) {
        throw new Error(`release: dependency tree exceeds the maximum depth of ${MAX_DEPENDENCY_DEPTH}.`);
    }
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    const context = { depth, stack, sourceRoot, destinationRoot };
    for (const entry of entries) {
        if (isSecretBasename(entry.name))
            continue;
        const sourcePath = join(sourceDirectory, entry.name);
        const destination = join(destinationDirectory, entry.name);
        const label = relative(sourceRoot, sourcePath).split(sep).join('/');
        const entryStat = await lstat(sourcePath);
        if (entryStat.isDirectory()) {
            await mkdir(destination, { recursive: true });
            await chmod(destination, entryStat.mode & 0o777);
            await copyDependencyDirectory(sourcePath, destination, depth + 1, stack, sourceRoot, destinationRoot);
            continue;
        }
        if (entryStat.isFile()) {
            if (basename(sourceDirectory) === '.bin' &&
                entryStat.size <= MAX_PRE_SHIM_BYTES &&
                (await copyPreShimmedBinEntry(sourcePath, destination, sourceRoot, destinationRoot))) {
                continue;
            }
            await copyFile(sourcePath, destination);
            await chmod(destination, entryStat.mode & 0o777);
            continue;
        }
        if (entryStat.isSymbolicLink()) {
            await copyDependencyLink(sourcePath, destination, sourceDirectory, context, label);
            continue;
        }
        throw new Error(`release: dependency entry '${label}' is not a regular file, directory or symlink.`);
    }
}
async function copyNodeModules(checkout, candidateRoot) {
    const sourceNodeModules = join(checkout, 'node_modules');
    let sourceStat;
    try {
        sourceStat = await lstat(sourceNodeModules);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('release: source node_modules is missing; install local dependencies before creating a candidate (no network fallback).');
        }
        throw error;
    }
    let sourceRoot;
    try {
        sourceRoot = await realpath(sourceNodeModules);
    }
    catch {
        throw new Error('release: source node_modules cannot be resolved; install local dependencies (no network fallback).');
    }
    if (!sourceStat.isDirectory() && !sourceStat.isSymbolicLink()) {
        throw new Error('release: source node_modules is not a directory; install local dependencies (no network fallback).');
    }
    if (!isWithin(checkout, sourceRoot)) {
        throw new Error('release: source node_modules resolves outside the checkout; refusing external dependency tree.');
    }
    const destinationRoot = join(candidateRoot, 'node_modules');
    await mkdir(destinationRoot, { recursive: true });
    await copyDependencyDirectory(sourceRoot, destinationRoot, 0, new Set([sourceRoot]), sourceRoot, destinationRoot);
}
async function resolveRunRootParent(checkout) {
    let parent;
    try {
        parent = await realpath(tmpdir());
    }
    catch {
        throw new Error('release: temporary directory cannot be resolved; refusing candidate construction.');
    }
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) {
        throw new Error('release: temporary directory is not a directory; refusing candidate construction.');
    }
    if (isWithin(checkout, parent)) {
        throw new Error(`release: temporary directory '${parent}' resolves inside the checkout; set TMPDIR outside the source checkout before creating a candidate.`);
    }
    return parent;
}
function buildNpmEnv(runRoot) {
    const tmp = join(runRoot, 'tmp');
    return {
        ...process.env,
        npm_config_cache: join(runRoot, 'cache'),
        npm_config_logs_dir: join(runRoot, 'logs'),
        npm_config_tmp: tmp,
        TMPDIR: tmp,
        TMP: tmp,
        TEMP: tmp,
    };
}
export async function createCandidate(checkout, tracked) {
    if (!Array.isArray(tracked)) {
        throw new Error('release: tracked paths must be provided as an array.');
    }
    const checkoutPath = resolve(checkout);
    let checkoutStat;
    try {
        checkoutStat = await stat(checkoutPath);
    }
    catch {
        throw new Error(`release: checkout '${checkout}' does not exist.`);
    }
    if (!checkoutStat.isDirectory()) {
        throw new Error(`release: checkout '${checkout}' is not a directory.`);
    }
    const checkoutReal = await realpath(checkoutPath);
    await refuseRootNpmrc(checkoutReal);
    const seen = new Set();
    const inputs = [];
    for (const relativePath of tracked) {
        validateTrackedPath(relativePath);
        if (seen.has(relativePath)) {
            throw new Error(`release: tracked path '${relativePath}' is duplicated; refusing ambiguous candidate.`);
        }
        seen.add(relativePath);
        inputs.push(await inspectTrackedInput(checkoutReal, relativePath));
    }
    const tempParent = await resolveRunRootParent(checkoutReal);
    const runRoot = await mkdtemp(join(tempParent, RUN_ROOT_PREFIX));
    try {
        const runRootReal = await realpath(runRoot);
        if (isWithin(checkoutReal, runRootReal)) {
            throw new Error(`release: temporary candidate root '${runRootReal}' resolves inside the checkout; refusing source writes.`);
        }
        const root = join(runRoot, 'candidate');
        await mkdir(root, { recursive: true, mode: 0o700 });
        const rootReal = await realpath(root);
        if (!isWithin(runRootReal, rootReal)) {
            throw new Error(`release: candidate root '${rootReal}' escaped the run-owned temporary root.`);
        }
        for (const directory of ['backup', 'cache', 'logs', 'tmp']) {
            await mkdir(join(runRoot, directory), { recursive: true, mode: 0o700 });
        }
        for (const input of inputs) {
            await copyTrackedFile(root, input);
        }
        const before = await snapshotTree(root);
        await copyNodeModules(checkoutReal, root);
        const npmEnv = buildNpmEnv(runRoot);
        return {
            root,
            runRoot,
            npmEnv,
            before,
            tracked: [...tracked],
            dispose: async () => {
                await removeRunRoot(runRoot);
            },
        };
    }
    catch (error) {
        try {
            await removeRunRoot(runRoot);
        }
        catch (cleanupError) {
            throw new AggregateError([error, cleanupError], `release: candidate construction failed: ${errorMessage(error)}; cleanup also failed: ${errorMessage(cleanupError)}; retained run root '${runRoot}'.`);
        }
        throw error;
    }
}
export async function snapshotTree(root) {
    const snapshot = new Map();
    const visit = async (directory, prefix) => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            const absolute = join(directory, entry.name);
            const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            const entryStat = await lstat(absolute);
            if (entryStat.isDirectory()) {
                await visit(absolute, relativePath);
            }
            else if (entryStat.isFile()) {
                snapshot.set(relativePath, await readFile(absolute));
            }
            else if (entryStat.isSymbolicLink()) {
                const target = await readlink(absolute);
                snapshot.set(relativePath, Buffer.from(`symlink:${target}`));
            }
        }
    };
    await visit(root, '');
    return snapshot;
}
export function changedPaths(before, after) {
    const all = new Set([...before.keys(), ...after.keys()]);
    const changed = [];
    for (const relativePath of all) {
        const previous = before.get(relativePath);
        const current = after.get(relativePath);
        if (previous === undefined || current === undefined || !previous.equals(current)) {
            changed.push(relativePath);
        }
    }
    return changed.sort();
}
//# sourceMappingURL=release-candidate.js.map