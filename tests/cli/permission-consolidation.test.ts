import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyPermissionSources,
  splitSecretTail,
  stableCustoms,
  HISTORICAL_GENERATED_SEQUENCES,
  type PermissionSource,
} from '../../src/cli/permission-consolidation';
import { DEFAULT_CONFIG, SECRET_GLOBS, generateAgentPermissions } from '../../src/cli/config';
import type { PermissionRule } from '../../src/cli/opencode-config';

const baseline = generateAgentPermissions(DEFAULT_CONFIG)['kiki-implementer'];
const { prefix, tail } = splitSecretTail(baseline);
const scriptsGrant: PermissionRule = { action: 'edit', resource: 'scripts/**', effect: 'allow' };

function source(file: string, rules: PermissionRule[]): PermissionSource {
  return { file, rules };
}

describe('permission source classification', () => {
  it('classifies an exact canonical array as generated', () => {
    const result = classifyPermissionSources('kiki-implementer', baseline, [source('global', baseline)]);
    expect(result.blockers).toEqual([]);
    expect(result.customs).toEqual([]);
    expect(result.entries).toHaveLength(baseline.length);
    expect(result.entries.every(entry => entry.kind === 'generated')).toBe(true);
  });

  it('keeps a custom addition and still recognises the trailing secret denies', () => {
    const result = classifyPermissionSources('kiki-implementer', baseline, [
      source('global', [...prefix, scriptsGrant, ...tail]),
    ]);
    expect(result.blockers).toEqual([]);
    expect(result.customs).toEqual([scriptsGrant]);
    expect(result.entries.filter(entry => entry.rule === scriptsGrant)
      .every(entry => entry.kind === 'custom')).toBe(true);
    // The final seven secret-edit denies are owned generated rules, not customs.
    for (const resource of SECRET_GLOBS) {
      expect(result.customs).not.toContainEqual({ action: 'edit', resource, effect: 'deny' });
    }
  });

  it('deduplicates exact custom tuples across crash-recovery sources', () => {
    const first = source('global', [...prefix, scriptsGrant, ...tail]);
    // Crash window: the same custom is still present in the markdown source.
    const second = source('markdown', [...prefix, scriptsGrant, ...tail]);
    const result = classifyPermissionSources('kiki-implementer', baseline, [first, second]);
    expect(result.blockers).toEqual([]);
    expect(result.customs).toEqual([scriptsGrant]);
    expect(stableCustoms([...result.customs, ...result.customs])).toEqual([scriptsGrant]);
  });

  it('treats unknown and partial generated shapes as custom or blocked', () => {
    const result = classifyPermissionSources('kiki-implementer', baseline, [
      source('markdown', baseline.slice(0, 2)),
    ]);
    expect(result.blockers.some(blocker => /incomplete generated permission shape/.test(blocker))).toBe(true);
    expect(result.entries.some(entry => entry.kind === 'ambiguous')).toBe(true);
  });

  it('does not infer ownership from an isolated generated tuple', () => {
    const isolated = classifyPermissionSources('kiki-implementer', baseline, [
      source('markdown', [baseline[0]]),
    ]);
    expect(isolated.blockers.some(blocker => /incomplete/.test(blocker))).toBe(true);
    expect(isolated.entries[0].kind).toBe('ambiguous');
    // Catalog entries are exact complete sequences; an isolated tuple is not a
    // recognised historical shape even though the catalog is populated.
    expect(HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][0]).not.toEqual([baseline[0]]);
  });

  it('blocks custom denies and conflicting custom tails verbatim', () => {
    const customDeny: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'deny' };
    const denied = classifyPermissionSources('kiki-implementer', baseline, [
      source('markdown', [...prefix, customDeny, ...tail]),
    ]);
    expect(denied.blockers.some(blocker => /custom deny/.test(blocker))).toBe(true);
    expect(denied.customs).toContainEqual(customDeny);

    const conflicting = classifyPermissionSources('kiki-implementer', baseline, [
      source('global', [...prefix, scriptsGrant, { ...scriptsGrant, effect: 'ask' }, ...tail]),
    ]);
    expect(conflicting.blockers.some(blocker => /conflicting custom effects/.test(blocker))).toBe(true);
  });

  it('pins the production historical catalog to the tracked fixture', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/kiki-permission-history.json', import.meta.url), 'utf8'),
    ) as { agents: Record<string, PermissionRule[][]> };
    expect(fixture.agents).toEqual(HISTORICAL_GENERATED_SEQUENCES);
  });

  it('recognises each exact current global markdown shape as generated', () => {
    const canonical = generateAgentPermissions(DEFAULT_CONFIG);
    expect(Object.keys(HISTORICAL_GENERATED_SEQUENCES).sort()).toEqual(Object.keys(canonical).sort());
    for (const [agent, sequences] of Object.entries(HISTORICAL_GENERATED_SEQUENCES)) {
      expect(sequences, agent).toHaveLength(1);
      const result = classifyPermissionSources(agent, canonical[agent], [
        { file: `/home/lutz/.config/opencode/agents/${agent}.md`, rules: sequences[0] },
      ]);
      expect(result.blockers, agent).toEqual([]);
      expect(result.customs, agent).toEqual([]);
      expect(result.entries.length, agent).toBe(sequences[0].length);
      expect(result.entries.every(entry => entry.kind === 'generated'), agent).toBe(true);
      // Read-only preflight preview: the proposed target is the canonical array.
      const { prefix, tail } = splitSecretTail(canonical[agent]);
      expect([...prefix, ...stableCustoms(result.customs), ...tail], agent).toEqual(canonical[agent]);
    }
  });

  it('altered historical shapes and custom denies still block', () => {
    const canonical = generateAgentPermissions(DEFAULT_CONFIG);
    const truncated = HISTORICAL_GENERATED_SEQUENCES['kiki-orchestrator'][0].slice(0, -1);
    const truncatedResult = classifyPermissionSources('kiki-orchestrator', canonical['kiki-orchestrator'], [
      { file: 'altered.md', rules: truncated },
    ]);
    expect(truncatedResult.blockers.length).toBeGreaterThan(0);

    const customDeny: PermissionRule = { action: 'shell', resource: 'rm -rf *', effect: 'deny' };
    const denied = classifyPermissionSources('kiki-implementer', canonical['kiki-implementer'], [
      { file: 'custom.md', rules: [...HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][0], customDeny] },
    ]);
    expect(denied.blockers.some(blocker => /custom deny/.test(blocker))).toBe(true);
  });

  it('splitSecretTail only recognises the exact canonical suffix', () => {
    expect(tail).toEqual(SECRET_GLOBS.map(resource => ({ action: 'edit', resource, effect: 'deny' })));
    expect(prefix).toEqual(baseline.slice(0, -SECRET_GLOBS.length));
    const altered = [...baseline];
    altered[altered.length - 1] = { ...altered[altered.length - 1], effect: 'allow' };
    expect(splitSecretTail(altered)).toEqual({ prefix: altered, tail: [] });
  });
});
