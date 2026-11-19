import { describe, expect, it } from 'vitest';
import { resolveTuiLanguage, tuiStrings } from '../../src/tui/strings';

describe('TUI language resolution', () => {
  it.each([
    'de',
    'de_DE',
    'de-DE',
    'de_DE.UTF-8',
    'de-DE.UTF-8',
    'de_DE@euro',
    ' de_DE.utf8 ',
  ])('detects %s as German', value => {
    expect(resolveTuiLanguage({ LC_ALL: value })).toBe('de');
  });

  it.each([
    {},
    { LANG: '' },
    { LANG: 'C' },
    { LC_ALL: 'POSIX' },
    { LANG: 'C.UTF-8' },
    { LANG: 'en_US.UTF-8' },
    { LANG: 'fr_FR.UTF-8' },
    { LC_ALL: 'en_US.UTF-8' },
  ])('falls back to English for %j', env => {
    expect(resolveTuiLanguage(env)).toBe('en');
  });

  it('resolves LC_ALL before LC_MESSAGES before LANG', () => {
    expect(resolveTuiLanguage({
      LC_ALL: 'de_DE.UTF-8', LC_MESSAGES: 'en_US.UTF-8', LANG: 'en_US.UTF-8',
    })).toBe('de');
    expect(resolveTuiLanguage({
      LC_ALL: '', LC_MESSAGES: 'de_DE.UTF-8', LANG: 'en_US.UTF-8',
    })).toBe('de');
    expect(resolveTuiLanguage({
      LC_MESSAGES: 'de_DE.UTF-8', LANG: 'C.UTF-8',
    })).toBe('de');
    expect(resolveTuiLanguage({
      LC_ALL: 'C', LC_MESSAGES: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8',
    })).toBe('en');
  });
});

describe('typed German/English TUI dictionary', () => {
  it('exposes the same entries in both languages', () => {
    const de = tuiStrings('de');
    const en = tuiStrings('en');
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(de)) {
      expect(typeof value, key).toBe(typeof en[key as keyof typeof en]);
    }
  });

  it.each(['de', 'en'] as const)('has no empty copy in %s', language => {
    for (const [key, value] of Object.entries(tuiStrings(language))) {
      if (typeof value === 'string') expect(value.trim(), key).not.toBe('');
    }
  });

  it('returns German copy', () => {
    const de = tuiStrings('de');
    expect(de.savedTitle).toBe('Kiki-Modell gespeichert');
    expect(de.changeModelGlobal).toBe('Modell ändern — global');
    expect(de.inheritedMarker).toBe('Global');
    expect(de.projectOverrideMarker).toBe('Projekt');
    expect(de.savedMessage('kiki-reviewer', 'provider/alpha', 'global', 'provider/project'))
      .toBe('kiki-reviewer: provider/alpha (global). Projektzuordnung provider/project bleibt aktiv. OpenCode neu starten.');
  });

  it('returns English copy', () => {
    const en = tuiStrings('en');
    expect(en.savedTitle).toBe('Kiki model saved');
    expect(en.changeModelGlobal).toBe('Change model — global');
    expect(en.inheritedMarker).toBe('Global');
    expect(en.projectOverrideMarker).toBe('Project');
    expect(en.savedMessage('kiki-reviewer', 'provider/alpha', 'global'))
      .toBe('kiki-reviewer: provider/alpha (global). Restart OpenCode.');
  });
});
