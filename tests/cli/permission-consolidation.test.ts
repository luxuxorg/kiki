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

const canonical = generateAgentPermissions(DEFAULT_CONFIG);
const baseline = canonical['kiki-implementer'];
const { prefix, tail } = splitSecretTail(baseline);
const scriptsGrant: PermissionRule = { action: 'edit', resource: 'scripts/**', effect: 'allow' };

function source(file: string, rules: PermissionRule[]): PermissionSource {
  return { file, rules };
}

function keyOf(rule: PermissionRule): string {
  return `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
}

describe('permission source classification', () => {
  it('classifies an exact canonical array as generated', () => {
    const result = classifyPermissionSources('kiki-implementer', baseline, [source('global', baseline)]);
    expect(result.customs).toEqual([]);
    expect(result.entries).toHaveLength(baseline.length);
    expect(result.entries.every(entry => entry.kind === 'generated')).toBe(true);
  });

  it('keeps a custom addition and still recognises the trailing secret denies', () => {
    const result = classifyPermissionSources('kiki-implementer', baseline, [
      source('global', [...prefix, scriptsGrant, ...tail]),
    ]);
    expect(result.customs).toEqual([scriptsGrant]);
    expect(result.entries.filter(entry => entry.rule === scriptsGrant)
      .every(entry => entry.kind === 'custom')).toBe(true);
    // The final seven secret-edit denies are known defaults, not customs.
    for (const resource of SECRET_GLOBS) {
      expect(result.customs).not.toContainEqual({ action: 'edit', resource, effect: 'deny' });
    }
  });

  it('mixed_historical_defaults_and_customs', () => {
    let historicalOnlyChecked = 0;
    for (const [agent, sequences] of Object.entries(HISTORICAL_GENERATED_SEQUENCES)) {
      const canonicalKeys = new Set(canonical[agent].map(keyOf));
      sequences.forEach((sequence, index) => {
        const customBefore: PermissionRule = {
          action: 'edit', resource: `before/${agent}/${index}.txt`, effect: 'allow',
        };
        const customWithin: PermissionRule = {
          action: 'shell', resource: `within-${agent}-${index} *`, effect: 'ask',
        };
        const customAfter: PermissionRule = {
          action: 'edit', resource: `after/${agent}/${index}.txt`, effect: 'deny',
        };
        const middle = Math.floor(sequence.length / 2);
        const mixed = [
          customBefore,
          ...sequence.slice(0, middle),
          customWithin,
          ...sequence.slice(middle),
          customAfter,
        ];

        const result = classifyPermissionSources(agent, canonical[agent], [source('mixed.jsonc', mixed)]);
        expect(result.entries.filter(entry => entry.kind === 'generated'), agent).toHaveLength(sequence.length);
        expect(result.customs, agent).toEqual([customBefore, customWithin, customAfter]);

        // A retired default that is absent from the fresh baseline is still a
        // known default, not an unknown custom.
        const historicalOnly = sequence.find(rule => !canonicalKeys.has(keyOf(rule)));
        if (historicalOnly) {
          historicalOnlyChecked += 1;
          expect(result.customs.some(rule => keyOf(rule) === keyOf(historicalOnly)), agent).toBe(false);
          const entries = result.entries.filter(entry => keyOf(entry.rule) === keyOf(historicalOnly));
          expect(entries.length, agent).toBeGreaterThan(0);
          expect(entries.every(entry => entry.kind === 'generated'), agent).toBe(true);
        }
      });
    }
    expect(historicalOnlyChecked).toBeGreaterThan(0);
  });

  it('known_defaults_ignore_position_completeness_and_author', () => {
    for (const [agent, sequences] of Object.entries(HISTORICAL_GENERATED_SEQUENCES)) {
      const current = canonical[agent];
      const cases: PermissionRule[][] = [
        [current[0]],
        [...current].reverse(),
        sequences[0].slice(0, -1),
        [...current, ...current],
      ];
      for (const rules of cases) {
        const result = classifyPermissionSources(agent, current, [source('shape.jsonc', rules)]);
        expect(result.customs, agent).toEqual([]);
        expect(result.entries.every(entry => entry.kind === 'generated'), agent).toBe(true);
      }
    }
  });

  it('identity_includes_effect_without_provenance', () => {
    const smallBaseline: PermissionRule[] = [
      { action: 'read', resource: 'identity-only.txt', effect: 'allow' },
    ];
    // Object key order is not part of the identity.
    const reordered: PermissionRule = { effect: 'allow', resource: 'identity-only.txt', action: 'read' };
    const ask: PermissionRule = { action: 'read', resource: 'identity-only.txt', effect: 'ask' };
    const deny: PermissionRule = { action: 'read', resource: 'identity-only.txt', effect: 'deny' };
    const unknownShell: PermissionRule = { action: 'shell', resource: 'custom-tool --flag *', effect: 'allow' };

    const result = classifyPermissionSources('kiki-implementer', smallBaseline, [
      source('identity.jsonc', [reordered, ask, deny, unknownShell]),
    ]);

    expect(result.entries[0].kind).toBe('generated');
    expect(result.customs).toEqual([ask, deny, unknownShell]);
  });

  it('different_custom_effects_keep_order', () => {
    const allow: PermissionRule = { action: 'edit', resource: 'shared/**', effect: 'allow' };
    const ask: PermissionRule = { action: 'edit', resource: 'shared/**', effect: 'ask' };
    const deny: PermissionRule = { action: 'edit', resource: 'shared/**', effect: 'deny' };

    const result = classifyPermissionSources('kiki-implementer', baseline, [
      source('global', [...prefix, allow, ask, ...tail]),
      source('markdown', [...prefix, deny, allow, ...tail]),
    ]);

    // Encounter order is kept; exact duplicates across sources appear once.
    expect(result.customs).toEqual([allow, ask, deny]);
    expect(result.entries.filter(entry => entry.kind === 'custom')).toHaveLength(4);
    // Unknown rules are preserved for every effect; no blocker channel remains.
    expect(result).not.toHaveProperty('blockers');
  });

  it('deduplicates exact custom tuples across crash-recovery sources', () => {
    const first = source('global', [...prefix, scriptsGrant, ...tail]);
    // Crash window: the same custom is still present in the markdown source.
    const second = source('markdown', [...prefix, scriptsGrant, ...tail]);
    const result = classifyPermissionSources('kiki-implementer', baseline, [first, second]);
    expect(result.customs).toEqual([scriptsGrant]);
    expect(stableCustoms([...result.customs, ...result.customs])).toEqual([scriptsGrant]);
  });

  it('current_pre_simplification_generation_is_known', () => {
    // Pinned independently of the future generator: the third sequence per role
    // is the captured 569-rule pre-simplification output. Every tuple must be in
    // the historical membership union, otherwise an update would preserve it as
    // a custom and the reduction would never arrive.
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/kiki-permission-history.json', import.meta.url), 'utf8'),
    ) as {
      agents: Record<string, PermissionRule[][]>;
      provenance: { currentGeneration: { totalRules: number; perRole: Record<string, number> } };
    };
    let total = 0;
    for (const [agent, sequences] of Object.entries(fixture.agents)) {
      const current = sequences.at(-1)!;
      total += current.length;
      expect(current.length, agent).toBe(fixture.provenance.currentGeneration.perRole[agent]);
      const known = new Set<string>();
      for (const historical of HISTORICAL_GENERATED_SEQUENCES[agent] ?? []) {
        for (const rule of historical) known.add(keyOf(rule));
      }
      for (const rule of current) {
        expect(known.has(keyOf(rule)), `${agent}: ${JSON.stringify(rule)}`).toBe(true);
      }
    }
    expect(total).toBe(569);
    expect(fixture.provenance.currentGeneration.totalRules).toBe(569);
  });

  it('pins the production historical catalog to the tracked fixture', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/kiki-permission-history.json', import.meta.url), 'utf8'),
    ) as { agents: Record<string, PermissionRule[][]> };
    expect(fixture.agents).toEqual(HISTORICAL_GENERATED_SEQUENCES);
  });

  it('recognises each exact historical and current global markdown shape as generated', () => {
    expect(Object.keys(HISTORICAL_GENERATED_SEQUENCES).sort()).toEqual(Object.keys(canonical).sort());
    for (const [agent, sequences] of Object.entries(HISTORICAL_GENERATED_SEQUENCES)) {
      expect(sequences, agent).toHaveLength(3);
      for (const sequence of sequences) {
        const result = classifyPermissionSources(agent, canonical[agent], [
          { file: `/home/lutz/.config/opencode/agents/${agent}.md`, rules: sequence },
        ]);
        expect(result.customs, agent).toEqual([]);
        expect(result.entries.length, agent).toBe(sequence.length);
        expect(result.entries.every(entry => entry.kind === 'generated'), agent).toBe(true);
        // Read-only preflight preview: the proposed target is the canonical array.
        const { prefix: canonicalPrefix, tail: canonicalTail } = splitSecretTail(canonical[agent]);
        expect([...canonicalPrefix, ...result.customs, ...canonicalTail], agent).toEqual(canonical[agent]);
      }
    }
  });

  it('splitSecretTail returns an empty tail for lean output and recognises a synthetic suffix', () => {
    // The lean role bracket no longer ends in the secret-edit tail; the helper
    // stays for install consumers and degrades to a plain prefix.
    expect(splitSecretTail(baseline)).toEqual({ prefix: baseline, tail: [] });
    expect(tail).toEqual([]);
    expect(prefix).toEqual(baseline);

    const secretTail = SECRET_GLOBS.map(resource => ({ action: 'edit' as const, resource, effect: 'deny' as const }));
    const synthetic = [...baseline, ...secretTail];
    const split = splitSecretTail(synthetic);
    expect(split.tail).toEqual(secretTail);
    expect(split.prefix).toEqual(baseline);

    const altered = [...synthetic];
    altered[altered.length - 1] = { ...altered[altered.length - 1], effect: 'allow' };
    expect(splitSecretTail(altered)).toEqual({ prefix: altered, tail: [] });
  });
});
