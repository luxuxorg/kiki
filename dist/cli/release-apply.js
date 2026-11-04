import { createHash, randomBytes } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rename, rm, writeFile, } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
const TARGET_FILES = ['package.json', 'package-lock.json', 'src/cli/config.ts', 'CHANGELOG.md'];
const TARGET_FILE_SET = new Set(TARGET_FILES);
const DIST_PREFIX = 'dist/';
const SECRET_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?)$/i;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isWithin(root, target) {
    const rel = relative(root, target);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function hasSecretSegment(relativePath) {
    return relativePath
        .split('/')
        .some(segment => segment !== '' && SECRET_BASENAME.test(segment));
}
function hashBytes(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
function summarizePaths(paths) {
    const unique = [...new Set(paths)].sort();
    const shown = unique.slice(0, 20).join(', ');
    return unique.length > 20 ? `${shown}, ... (${unique.length} total)` : shown;
}
function validateTracked(relativePath) {
    if (typeof relativePath !== 'string' || relativePath === '') {
        throw new Error('release: tracked path must be a non-empty string.');
    }
    if (relativePath.includes('\0') || isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
        throw new Error(`release: unsafe tracked path '${relativePath}'; refusing collision scan.`);
    }
}
function safeJoin(root, relativePath) {
    if (typeof relativePath !== 'string' ||
        relativePath === '' ||
        relativePath.includes('\0') ||
        isAbsolute(relativePath) ||
        relativePath.split('/').includes('..')) {
        throw new Error(`release: unsafe relative path '${String(relativePath)}'.`);
    }
    const absolute = join(root, ...relativePath.split('/'));
    if (!isWithin(root, absolute) || absolute === root) {
        throw new Error(`release: path '${relativePath}' escapes the release root.`);
    }
    return absolute;
}
async function pathExists(absolute) {
    try {
        await lstat(absolute);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return false;
        throw error;
    }
}
async function resolveCheckoutRoot(checkout) {
    if (typeof checkout !== 'string' || checkout === '') {
        throw new Error('release: apply requires a non-empty checkout path.');
    }
    const resolved = resolve(checkout);
    let info;
    try {
        info = await lstat(resolved);
    }
    catch {
        throw new Error(`release: checkout '${checkout}' does not exist.`);
    }
    if (!info.isDirectory() && !info.isSymbolicLink()) {
        throw new Error(`release: checkout '${checkout}' is not a directory.`);
    }
    const real = await realpath(resolved);
    const realInfo = await lstat(real);
    if (!realInfo.isDirectory()) {
        throw new Error(`release: checkout '${checkout}' is not a directory.`);
    }
    return real;
}
async function inspectTargetPath(root, relativePath) {
    if (!TARGET_FILE_SET.has(relativePath)) {
        throw new Error(`release: '${relativePath}' is not an apply target.`);
    }
    const segments = relativePath.split('/');
    let absolute = root;
    for (let index = 0; index < segments.length; index++) {
        absolute = join(absolute, segments[index]);
        let info;
        try {
            info = await lstat(absolute);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            if (index < segments.length - 1) {
                throw new Error(`release: target parent directory is missing for '${relativePath}'.`);
            }
            return { present: false };
        }
        if (info.isSymbolicLink()) {
            throw new Error(`release: refusing symlinked target '${relativePath}'; apply never follows links.`);
        }
        if (index < segments.length - 1) {
            if (!info.isDirectory()) {
                throw new Error(`release: target parent for '${relativePath}' is not a directory.`);
            }
            continue;
        }
        if (!info.isFile()) {
            throw new Error(`release: target '${relativePath}' is not a regular file.`);
        }
        return { present: true, mode: info.mode & 0o777, absolute };
    }
    throw new Error(`release: target '${relativePath}' could not be inspected.`);
}
async function inspectDistRoot(root) {
    const absolute = join(root, 'dist');
    let info;
    try {
        info = await lstat(absolute);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { present: false };
        throw error;
    }
    if (info.isSymbolicLink()) {
        throw new Error('release: refusing symlinked dist root; apply never follows dist links.');
    }
    if (!info.isDirectory()) {
        throw new Error('release: dist exists but is not a directory; refusing apply.');
    }
    return { present: true, mode: info.mode & 0o777, absolute };
}
async function assertSafeTargetParent(root, relativePath) {
    const segments = relativePath.split('/');
    let absolute = root;
    for (let index = 0; index < segments.length - 1; index++) {
        absolute = join(absolute, segments[index]);
        let info;
        try {
            info = await lstat(absolute);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`release: target parent directory is missing for '${relativePath}'.`);
            }
            throw error;
        }
        if (info.isSymbolicLink()) {
            throw new Error(`release: refusing symlinked target parent for '${relativePath}'.`);
        }
        if (!info.isDirectory()) {
            throw new Error(`release: target parent for '${relativePath}' is not a directory.`);
        }
    }
}
async function collectDistFiles(root) {
    const files = new Map();
    const distState = await inspectDistRoot(root);
    if (!distState.present)
        return files;
    const visit = async (directory, prefix) => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            const fullRelativePath = `dist/${relativePath}`;
            if (hasSecretSegment(fullRelativePath)) {
                throw new Error(`release: refusing to read secret-bearing dist path '${fullRelativePath}'.`);
            }
            const absolute = join(directory, entry.name);
            const info = await lstat(absolute);
            if (info.isSymbolicLink()) {
                throw new Error(`release: refusing symlinked dist path '${fullRelativePath}'.`);
            }
            if (info.isDirectory()) {
                await visit(absolute, relativePath);
                continue;
            }
            if (!info.isFile()) {
                throw new Error(`release: refusing special dist entry '${fullRelativePath}'.`);
            }
            let data;
            try {
                data = await readFile(absolute);
            }
            catch (error) {
                throw new Error(`release: cannot read current source file '${fullRelativePath}': ${errorMessage(error)}`);
            }
            files.set(fullRelativePath, { data, mode: info.mode & 0o777 });
        }
    };
    await visit(distState.absolute, '');
    return files;
}
async function collectWriteSet(root) {
    const files = new Map();
    const targetModes = new Map();
    for (const relativePath of TARGET_FILES) {
        const state = await inspectTargetPath(root, relativePath);
        if (!state.present)
            continue;
        let data;
        try {
            data = await readFile(state.absolute);
        }
        catch (error) {
            throw new Error(`release: cannot read current source file '${relativePath}': ${errorMessage(error)}`);
        }
        files.set(relativePath, data);
        targetModes.set(relativePath, state.mode);
    }
    for (const [relativePath, entry] of await collectDistFiles(root)) {
        files.set(relativePath, entry.data);
    }
    return { files, targetModes };
}
function expectedWriteSet(before) {
    if (!(before instanceof Map)) {
        throw new Error('release: candidate snapshot is missing; refusing apply.');
    }
    const expected = new Map();
    for (const [relativePath, data] of before) {
        if (typeof relativePath !== 'string' || !Buffer.isBuffer(data)) {
            throw new Error('release: candidate snapshot contains an invalid entry; refusing apply.');
        }
        if (TARGET_FILE_SET.has(relativePath) || relativePath.startsWith(DIST_PREFIX)) {
            expected.set(relativePath, data);
        }
    }
    return expected;
}
function assertSourceUnchanged(expected, current, phase) {
    const paths = new Set([...expected.keys(), ...current.keys()]);
    const changed = [];
    for (const relativePath of [...paths].sort()) {
        const expectedBytes = expected.get(relativePath);
        const currentBytes = current.get(relativePath);
        if (expectedBytes === undefined ||
            currentBytes === undefined ||
            !expectedBytes.equals(currentBytes)) {
            changed.push(relativePath);
        }
    }
    if (changed.length > 0) {
        throw new Error(`release: source changed ${phase} for ${summarizePaths(changed)}; refusing to overwrite concurrent edits.`);
    }
}
async function assertTargetUnchanged(root, relativePath, expected, initialModes) {
    const expectedBytes = expected.get(relativePath);
    const state = await inspectTargetPath(root, relativePath);
    if (expectedBytes === undefined) {
        if (state.present) {
            throw new Error(`release: source changed immediately before writing '${relativePath}'; refusing to overwrite concurrent edits.`);
        }
        return state;
    }
    if (!state.present) {
        throw new Error(`release: source changed immediately before writing '${relativePath}'; refusing to overwrite concurrent edits.`);
    }
    let currentBytes;
    try {
        currentBytes = await readFile(state.absolute);
    }
    catch (error) {
        throw new Error(`release: cannot read current source file '${relativePath}': ${errorMessage(error)}`);
    }
    if (!currentBytes.equals(expectedBytes)) {
        throw new Error(`release: source changed immediately before writing '${relativePath}'; refusing to overwrite concurrent edits.`);
    }
    const initialMode = initialModes.get(relativePath);
    if (initialMode !== undefined && state.mode !== initialMode) {
        throw new Error(`release: target mode changed immediately before writing '${relativePath}'; refusing to overwrite concurrent edits.`);
    }
    return state;
}
export async function scanDistCollisions(checkout, tracked) {
    if (!Array.isArray(tracked)) {
        throw new Error('release: tracked paths must be an array.');
    }
    const root = await resolveCheckoutRoot(checkout);
    const trackedSet = new Set();
    for (const relativePath of tracked) {
        validateTracked(relativePath);
        if (relativePath.startsWith(DIST_PREFIX))
            trackedSet.add(relativePath);
    }
    const distPath = join(root, 'dist');
    let distInfo;
    try {
        distInfo = await lstat(distPath);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    }
    if (distInfo.isSymbolicLink() || !distInfo.isDirectory())
        return ['dist'];
    const collisions = new Set();
    const visit = async (directory, prefix) => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const entry of entries) {
            const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            const fullRelativePath = `dist/${relativePath}`;
            if (hasSecretSegment(fullRelativePath)) {
                collisions.add(fullRelativePath);
                continue;
            }
            const absolute = join(directory, entry.name);
            const info = await lstat(absolute);
            if (info.isSymbolicLink()) {
                collisions.add(fullRelativePath);
                continue;
            }
            if (info.isDirectory()) {
                if (trackedSet.has(fullRelativePath)) {
                    collisions.add(fullRelativePath);
                    continue;
                }
                const children = await readdir(absolute);
                if (children.length === 0) {
                    collisions.add(fullRelativePath);
                    continue;
                }
                await visit(absolute, relativePath);
                continue;
            }
            if (!info.isFile() || !trackedSet.has(fullRelativePath)) {
                collisions.add(fullRelativePath);
            }
        }
    };
    await visit(distPath, '');
    return [...collisions].sort();
}
function collisionError(collisions) {
    return new Error(`release: apply refused: ${collisions.length} colliding dist path(s): ${summarizePaths(collisions)}; move or explicitly integrate them before applying.`);
}
async function resolveCandidateRoot(candidate) {
    if (candidate === null || typeof candidate !== 'object') {
        throw new Error('release: candidate is required for apply.');
    }
    if (typeof candidate.root !== 'string' || typeof candidate.runRoot !== 'string') {
        throw new Error('release: candidate roots are invalid; refusing apply.');
    }
    if (!(candidate.before instanceof Map) || !Array.isArray(candidate.tracked)) {
        throw new Error('release: candidate snapshot is invalid; refusing apply.');
    }
    const resolved = resolve(candidate.root);
    const real = await realpath(resolved);
    const info = await lstat(real);
    if (!info.isDirectory()) {
        throw new Error('release: candidate root is not a directory; refusing apply.');
    }
    return real;
}
async function createBackupRoot(candidate, checkoutRoot) {
    const runRoot = resolve(candidate.runRoot);
    const real = await realpath(runRoot);
    const info = await lstat(real);
    if (!info.isDirectory()) {
        throw new Error('release: candidate run root is not a directory; refusing apply.');
    }
    if (isWithin(checkoutRoot, real)) {
        throw new Error('release: candidate run root is inside the checkout; refusing apply.');
    }
    const backupRoot = await mkdtemp(join(real, 'apply-backup-'));
    if (!isWithin(real, backupRoot)) {
        throw new Error('release: backup root escaped the run-owned temporary root.');
    }
    return backupRoot;
}
async function writeBackup(root, backupRoot) {
    const manifest = {
        targets: {},
        dist: { present: false, entries: [] },
    };
    for (const relativePath of TARGET_FILES) {
        const state = await inspectTargetPath(root, relativePath);
        if (!state.present) {
            manifest.targets[relativePath] = { present: false };
            continue;
        }
        let data;
        try {
            data = await readFile(state.absolute);
        }
        catch (error) {
            throw new Error(`release: cannot read target '${relativePath}' for backup: ${errorMessage(error)}`);
        }
        const destination = safeJoin(join(backupRoot, 'targets'), relativePath);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, data);
        await chmod(destination, state.mode);
        manifest.targets[relativePath] = {
            present: true,
            mode: state.mode,
            sha256: hashBytes(data),
        };
    }
    const distState = await inspectDistRoot(root);
    if (!distState.present) {
        manifest.dist = { present: false, entries: [] };
    }
    else {
        const backupDist = join(backupRoot, 'dist');
        await mkdir(backupDist, { recursive: true });
        manifest.dist = { present: true, mode: distState.mode, entries: [] };
        await backupDistTree(distState.absolute, backupDist, '', manifest.dist.entries);
        await chmod(backupDist, distState.mode);
    }
    await writeFile(join(backupRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}
async function backupDistTree(sourceRoot, backupRoot, prefix, entries) {
    const entriesOnDisk = await readdir(sourceRoot, { withFileTypes: true });
    entriesOnDisk.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entriesOnDisk) {
        const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (hasSecretSegment(relativePath)) {
            throw new Error(`release: refusing secret-bearing dist path 'dist/${relativePath}' during backup.`);
        }
        const source = join(sourceRoot, entry.name);
        const destination = safeJoin(backupRoot, relativePath);
        const info = await lstat(source);
        if (info.isSymbolicLink()) {
            throw new Error(`release: refusing symlinked dist path 'dist/${relativePath}' during backup.`);
        }
        if (info.isDirectory()) {
            await mkdir(destination, { recursive: true });
            entries.push({ path: relativePath, type: 'directory', mode: info.mode & 0o777 });
            await backupDistTree(source, backupRoot, relativePath, entries);
            await chmod(destination, info.mode & 0o777);
            continue;
        }
        if (!info.isFile()) {
            throw new Error(`release: refusing special dist entry 'dist/${relativePath}' during backup.`);
        }
        let data;
        try {
            data = await readFile(source);
        }
        catch (error) {
            throw new Error(`release: cannot read dist file 'dist/${relativePath}' for backup: ${errorMessage(error)}`);
        }
        await writeFile(destination, data);
        await chmod(destination, info.mode & 0o777);
        entries.push({
            path: relativePath,
            type: 'file',
            mode: info.mode & 0o777,
            sha256: hashBytes(data),
        });
    }
}
async function writeAtomicFile(root, relativePath, data, mode) {
    await assertSafeTargetParent(root, relativePath);
    const absolute = safeJoin(root, relativePath);
    const parent = dirname(absolute);
    const parentInfo = await lstat(parent);
    if (parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) {
        throw new Error(`release: target parent for '${relativePath}' is not a safe directory.`);
    }
    const temporary = join(parent, `.${basename(absolute)}.kiki-apply-${randomBytes(6).toString('hex')}.tmp`);
    let handle;
    try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await chmod(temporary, mode);
        await rename(temporary, absolute);
    }
    catch (error) {
        if (handle !== undefined) {
            try {
                await handle.close();
            }
            catch {
                // Preserve the original write failure.
            }
        }
        try {
            await rm(temporary, { force: true });
        }
        catch {
            // Preserve the original write failure.
        }
        throw error;
    }
}
async function readCandidateFile(candidateRoot, relativePath) {
    const absolute = safeJoin(candidateRoot, relativePath);
    let info;
    try {
        info = await lstat(absolute);
    }
    catch {
        throw new Error(`release: candidate file '${relativePath}' is missing; refusing apply.`);
    }
    if (info.isSymbolicLink()) {
        throw new Error(`release: candidate file '${relativePath}' is a symlink; refusing apply.`);
    }
    if (!info.isFile()) {
        throw new Error(`release: candidate file '${relativePath}' is not a regular file.`);
    }
    try {
        return { data: await readFile(absolute), mode: info.mode & 0o777 };
    }
    catch (error) {
        throw new Error(`release: candidate file '${relativePath}' is unreadable: ${errorMessage(error)}`);
    }
}
async function copyTree(sourceRoot, destinationRoot, relativePathPrefix, hooks) {
    const entries = await readdir(sourceRoot, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
        const relativePath = relativePathPrefix === '' ? entry.name : `${relativePathPrefix}${entry.name}`;
        if (hasSecretSegment(relativePath)) {
            throw new Error(`release: refusing secret-bearing path '${relativePath}' during copy.`);
        }
        const source = join(sourceRoot, entry.name);
        const destination = safeJoin(destinationRoot, entry.name);
        const info = await lstat(source);
        if (info.isSymbolicLink()) {
            throw new Error(`release: refusing symlinked path '${relativePath}' during copy.`);
        }
        if (info.isDirectory()) {
            await mkdir(destination, { recursive: true });
            await copyTree(source, destination, `${relativePath}/`, hooks);
            await chmod(destination, info.mode & 0o777);
            continue;
        }
        if (!info.isFile()) {
            throw new Error(`release: refusing special path '${relativePath}' during copy.`);
        }
        await copyFile(source, destination);
        await chmod(destination, info.mode & 0o777);
        if (hooks !== undefined)
            await hooks.afterWrite?.(relativePath);
    }
}
async function prepareStagingDist(root, candidateRoot, hooks, temporaryPaths) {
    const candidateDist = join(candidateRoot, 'dist');
    let info;
    try {
        info = await lstat(candidateDist);
    }
    catch {
        throw new Error('release: candidate dist is missing; candidate gates must build it before apply.');
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('release: candidate dist is not a regular directory; refusing apply.');
    }
    const staging = await mkdtemp(join(root, '.kiki-apply-dist-'));
    temporaryPaths.add(staging);
    await copyTree(candidateDist, staging, DIST_PREFIX, hooks);
    await chmod(staging, info.mode & 0o777);
    return staging;
}
async function replaceDist(root, staging, hooks, temporaryPaths, mutationState) {
    const dist = join(root, 'dist');
    let oldDist;
    if (await pathExists(dist)) {
        const info = await lstat(dist);
        if (info.isSymbolicLink() || !info.isDirectory()) {
            throw new Error('release: dist changed to an unsafe entry immediately before replacement.');
        }
        oldDist = join(root, `.kiki-apply-old-dist-${randomBytes(6).toString('hex')}`);
        await rename(dist, oldDist);
        mutationState.distMutated = true;
        temporaryPaths.add(oldDist);
    }
    await hooks?.afterWrite?.('dist');
    await rename(staging, dist);
    mutationState.distMutated = true;
    temporaryPaths.delete(staging);
    if (oldDist !== undefined) {
        await rm(oldDist, { recursive: true, force: true });
        temporaryPaths.delete(oldDist);
    }
}
async function readDistTree(packageRoot, requirePresent) {
    const dist = join(packageRoot, 'dist');
    let info;
    try {
        info = await lstat(dist);
    }
    catch (error) {
        if (error.code === 'ENOENT' && !requirePresent)
            return null;
        throw new Error(`release: dist tree '${dist}' is missing or unreadable: ${errorMessage(error)}`);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`release: dist tree '${dist}' is not a safe directory.`);
    }
    const entries = new Map();
    entries.set('', { type: 'directory', mode: info.mode & 0o777 });
    const visit = async (directory, prefix) => {
        const children = await readdir(directory, { withFileTypes: true });
        children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        for (const child of children) {
            const relativePath = prefix === '' ? child.name : `${prefix}/${child.name}`;
            if (hasSecretSegment(relativePath)) {
                throw new Error(`release: refusing secret-bearing dist path 'dist/${relativePath}'.`);
            }
            const absolute = join(directory, child.name);
            const childInfo = await lstat(absolute);
            if (childInfo.isSymbolicLink()) {
                throw new Error(`release: refusing symlinked dist path 'dist/${relativePath}'.`);
            }
            if (childInfo.isDirectory()) {
                entries.set(relativePath, { type: 'directory', mode: childInfo.mode & 0o777 });
                await visit(absolute, relativePath);
                continue;
            }
            if (!childInfo.isFile()) {
                throw new Error(`release: refusing special dist entry 'dist/${relativePath}'.`);
            }
            let data;
            try {
                data = await readFile(absolute);
            }
            catch (error) {
                throw new Error(`release: cannot read dist file 'dist/${relativePath}': ${errorMessage(error)}`);
            }
            entries.set(relativePath, {
                type: 'file',
                mode: childInfo.mode & 0o777,
                data,
            });
        }
    };
    await visit(dist, '');
    return entries;
}
async function verifyApplied(root, candidateRoot, manifest) {
    const problems = [];
    for (const relativePath of TARGET_FILES) {
        const expected = await readCandidateFile(candidateRoot, relativePath);
        let state;
        try {
            state = await inspectTargetPath(root, relativePath);
        }
        catch (error) {
            problems.push(`${relativePath}: ${errorMessage(error)}`);
            continue;
        }
        if (!state.present) {
            problems.push(`${relativePath}: missing after apply`);
            continue;
        }
        let actual;
        try {
            actual = await readFile(state.absolute);
        }
        catch (error) {
            problems.push(`${relativePath}: unreadable after apply (${errorMessage(error)})`);
            continue;
        }
        if (!actual.equals(expected.data)) {
            problems.push(`${relativePath}: bytes differ from candidate`);
        }
        const backedUpTarget = manifest.targets[relativePath];
        if (backedUpTarget === undefined) {
            problems.push(`${relativePath}: backup mode policy is missing`);
            continue;
        }
        const expectedMode = backedUpTarget.present ? backedUpTarget.mode : expected.mode;
        if (expectedMode !== undefined && state.mode !== expectedMode) {
            problems.push(`${relativePath}: mode differs after apply`);
        }
    }
    let expectedDist;
    let actualDist;
    try {
        expectedDist = await readDistTree(candidateRoot, true);
        actualDist = await readDistTree(root, false);
    }
    catch (error) {
        problems.push(`dist: ${errorMessage(error)}`);
        expectedDist = null;
        actualDist = null;
    }
    if (expectedDist !== null || actualDist !== null) {
        if (expectedDist === null)
            problems.push('dist: candidate dist is missing');
        if (actualDist === null)
            problems.push('dist: missing after apply');
        if (expectedDist !== null && actualDist !== null) {
            const paths = new Set([...expectedDist.keys(), ...actualDist.keys()]);
            for (const relativePath of [...paths].sort()) {
                const expected = expectedDist.get(relativePath);
                const actual = actualDist.get(relativePath);
                const label = relativePath === '' ? 'dist' : `dist/${relativePath}`;
                if (expected === undefined) {
                    problems.push(`${label}: unexpected after apply`);
                    continue;
                }
                if (actual === undefined) {
                    problems.push(`${label}: missing after apply`);
                    continue;
                }
                if (expected.type !== actual.type) {
                    problems.push(`${label}: type differs from candidate`);
                    continue;
                }
                if (expected.mode !== actual.mode) {
                    problems.push(`${label}: mode differs from candidate`);
                }
                if (expected.type === 'file') {
                    if (expected.data === undefined || actual.data === undefined || !expected.data.equals(actual.data)) {
                        problems.push(`${label}: bytes differ from candidate`);
                    }
                }
            }
        }
    }
    if (problems.length > 0) {
        throw new Error(`release: post-apply verification failed: ${summarizePaths(problems)}`);
    }
}
async function verifyRestoration(root, manifest, restoredTargets, restoreDist) {
    const problems = [];
    for (const relativePath of TARGET_FILES) {
        if (!restoredTargets.has(relativePath))
            continue;
        const expected = manifest.targets[relativePath];
        if (expected === undefined) {
            problems.push(`${relativePath}: backup state missing`);
            continue;
        }
        let state;
        try {
            state = await inspectTargetPath(root, relativePath);
        }
        catch (error) {
            problems.push(`${relativePath}: ${errorMessage(error)}`);
            continue;
        }
        if (!expected.present) {
            if (state.present)
                problems.push(`${relativePath}: should be absent after restore`);
            continue;
        }
        if (!state.present) {
            problems.push(`${relativePath}: missing after restore`);
            continue;
        }
        if (expected.mode !== state.mode) {
            problems.push(`${relativePath}: mode differs after restore`);
        }
        let actual;
        try {
            actual = await readFile(state.absolute);
        }
        catch (error) {
            problems.push(`${relativePath}: unreadable after restore (${errorMessage(error)})`);
            continue;
        }
        if (expected.sha256 !== hashBytes(actual)) {
            problems.push(`${relativePath}: bytes differ after restore`);
        }
    }
    if (!restoreDist) {
        if (problems.length > 0) {
            throw new Error(`release: rollback verification failed: ${summarizePaths(problems)}`);
        }
        return;
    }
    let actualDist;
    try {
        actualDist = await readDistTree(root, false);
    }
    catch (error) {
        problems.push(`dist: ${errorMessage(error)}`);
        actualDist = null;
    }
    if (!manifest.dist.present) {
        if (actualDist !== null)
            problems.push('dist: should be absent after restore');
    }
    else if (actualDist === null) {
        problems.push('dist: missing after restore');
    }
    else {
        if (manifest.dist.mode !== undefined) {
            const rootEntry = actualDist.get('');
            if (rootEntry === undefined || rootEntry.mode !== manifest.dist.mode) {
                problems.push('dist: root mode differs after restore');
            }
        }
        const expectedEntries = new Map(manifest.dist.entries.map(entry => [entry.path, entry]));
        for (const entry of manifest.dist.entries) {
            const actual = actualDist.get(entry.path);
            if (actual === undefined) {
                problems.push(`dist/${entry.path}: missing after restore`);
                continue;
            }
            if (actual.type !== entry.type) {
                problems.push(`dist/${entry.path}: type differs after restore`);
                continue;
            }
            if (actual.mode !== entry.mode) {
                problems.push(`dist/${entry.path}: mode differs after restore`);
            }
            if (entry.type === 'file') {
                if (entry.sha256 === undefined ||
                    actual.data === undefined ||
                    hashBytes(actual.data) !== entry.sha256) {
                    problems.push(`dist/${entry.path}: bytes differ after restore`);
                }
            }
        }
        for (const relativePath of actualDist.keys()) {
            if (relativePath !== '' && !expectedEntries.has(relativePath)) {
                problems.push(`dist/${relativePath}: unexpected after restore`);
            }
        }
    }
    if (problems.length > 0) {
        throw new Error(`release: rollback verification failed: ${summarizePaths(problems)}`);
    }
}
async function restoreFromBackup(root, backupRoot, manifest, temporaryPaths, restoredTargets, restoreDist) {
    for (const relativePath of TARGET_FILES) {
        if (!restoredTargets.has(relativePath))
            continue;
        const expected = manifest.targets[relativePath];
        if (expected === undefined) {
            throw new Error(`release: backup state for '${relativePath}' is missing.`);
        }
        const absolute = safeJoin(root, relativePath);
        if (!expected.present) {
            await rm(absolute, { recursive: true, force: true });
            continue;
        }
        const backupFile = safeJoin(join(backupRoot, 'targets'), relativePath);
        const data = await readFile(backupFile);
        await writeAtomicFile(root, relativePath, data, expected.mode ?? 0o644);
    }
    if (restoreDist) {
        const dist = join(root, 'dist');
        await rm(dist, { recursive: true, force: true });
        if (manifest.dist.present) {
            const staging = await mkdtemp(join(root, '.kiki-apply-restore-'));
            temporaryPaths.add(staging);
            await copyTree(join(backupRoot, 'dist'), staging, '');
            await chmod(staging, manifest.dist.mode ?? 0o755);
            await rename(staging, dist);
            temporaryPaths.delete(staging);
        }
    }
    await verifyRestoration(root, manifest, restoredTargets, restoreDist);
}
async function cleanupTemporaryPaths(temporaryPaths) {
    for (const temporaryPath of temporaryPaths) {
        try {
            await rm(temporaryPath, { recursive: true, force: true });
        }
        catch {
            // Temporary cleanup must not mask the apply result.
        }
    }
    temporaryPaths.clear();
}
/**
 * Applies a validated candidate to the checkout.
 *
 * Precondition: the caller has run the candidate gates and they all passed.
 * This function deliberately does not run gates or expose a skip flag; a caller
 * that invokes it before validation is bypassing the release policy.
 */
export async function applyCandidate(checkout, candidate, hooks) {
    if (hooks !== undefined && (hooks === null || typeof hooks !== 'object')) {
        throw new Error('release: apply hooks must be an object when provided.');
    }
    if (hooks?.afterWrite !== undefined && typeof hooks.afterWrite !== 'function') {
        throw new Error('release: afterWrite hook must be a function.');
    }
    if (hooks?.beforeVerify !== undefined && typeof hooks.beforeVerify !== 'function') {
        throw new Error('release: beforeVerify hook must be a function.');
    }
    const root = await resolveCheckoutRoot(checkout);
    const candidateRoot = await resolveCandidateRoot(candidate);
    if (isWithin(root, candidateRoot)) {
        throw new Error('release: candidate root is inside the checkout; refusing apply.');
    }
    const temporaryPaths = new Set();
    const writtenTargets = new Set();
    const mutationState = { distMutated: false };
    let backupRoot;
    let manifest;
    let writesStarted = false;
    try {
        const tracked = candidate.tracked;
        const initialCollisions = await scanDistCollisions(root, tracked);
        if (initialCollisions.length > 0)
            throw collisionError(initialCollisions);
        const expected = expectedWriteSet(candidate.before);
        const initial = await collectWriteSet(root);
        assertSourceUnchanged(expected, initial.files, 'since candidate validation');
        backupRoot = await createBackupRoot(candidate, root);
        manifest = await writeBackup(root, backupRoot);
        const recheckedCollisions = await scanDistCollisions(root, tracked);
        if (recheckedCollisions.length > 0)
            throw collisionError(recheckedCollisions);
        const current = await collectWriteSet(root);
        assertSourceUnchanged(expected, current.files, 'immediately before writing');
        writesStarted = true;
        for (const relativePath of TARGET_FILES) {
            const candidateFile = await readCandidateFile(candidateRoot, relativePath);
            const targetState = await assertTargetUnchanged(root, relativePath, expected, initial.targetModes);
            const mode = targetState.present ? targetState.mode : candidateFile.mode;
            await writeAtomicFile(root, relativePath, candidateFile.data, mode);
            writtenTargets.add(relativePath);
            await hooks?.afterWrite?.(relativePath);
        }
        const staging = await prepareStagingDist(root, candidateRoot, hooks, temporaryPaths);
        const collisionsBeforeReplacement = await scanDistCollisions(root, tracked);
        if (collisionsBeforeReplacement.length > 0)
            throw collisionError(collisionsBeforeReplacement);
        const expectedDist = new Map();
        for (const [relativePath, bytes] of expected) {
            if (relativePath.startsWith(DIST_PREFIX))
                expectedDist.set(relativePath, bytes);
        }
        const currentDist = new Map();
        for (const [relativePath, entry] of await collectDistFiles(root)) {
            currentDist.set(relativePath, entry.data);
        }
        assertSourceUnchanged(expectedDist, currentDist, 'immediately before dist replacement');
        await replaceDist(root, staging, hooks, temporaryPaths, mutationState);
        await hooks?.beforeVerify?.();
        await verifyApplied(root, candidateRoot, manifest);
    }
    catch (error) {
        if (!writesStarted || backupRoot === undefined || manifest === undefined) {
            await cleanupTemporaryPaths(temporaryPaths);
            const suffix = backupRoot === undefined ? '' : `; backup retained at ${backupRoot}`;
            throw new Error(`release: apply failed before writing: ${errorMessage(error)}${suffix}`, {
                cause: error,
            });
        }
        try {
            await restoreFromBackup(root, backupRoot, manifest, temporaryPaths, writtenTargets, mutationState.distMutated);
        }
        catch (rollbackError) {
            throw new AggregateError([error, rollbackError], `release: apply failed (${errorMessage(error)}); rollback failed (${errorMessage(rollbackError)}); manual recovery required from backup at ${backupRoot}; checkout restoration was NOT verified.`);
        }
        await cleanupTemporaryPaths(temporaryPaths);
        const restoredTargets = TARGET_FILES.filter(relativePath => writtenTargets.has(relativePath));
        const restored = [];
        if (restoredTargets.length > 0) {
            restored.push(`target writes restored (${restoredTargets.join(', ')})`);
        }
        if (mutationState.distMutated) {
            restored.push('dist tree restored');
        }
        else {
            restored.push('dist was not modified');
        }
        if (restoredTargets.length === 0 && !mutationState.distMutated) {
            restored.unshift('no checkout writes required restoration');
        }
        throw new Error(`release: apply failed (${errorMessage(error)}); ${restored.join('; ')}; backup retained at ${backupRoot}.`, { cause: error });
    }
    await cleanupTemporaryPaths(temporaryPaths);
    try {
        await rm(backupRoot, { recursive: true, force: true });
    }
    catch {
        // Keep the verified backup when cleanup is not permitted.
    }
    return { backupRoot };
}
//# sourceMappingURL=release-apply.js.map