import { describe, it, expect } from 'vitest';
import { categorize, getDefaultRulesWithIds, getRuleConflicts } from '../categorizer';
import type { Rule } from '../../types';

describe('categorize', () => {
  const rules = getDefaultRulesWithIds();

  it('matches salary to Inkomen', () => {
    expect(categorize('SALARIS WERKGEVER', '', rules)).toBe('Inkomen');
  });

  it('matches supermarket to Boodschappen', () => {
    expect(categorize('Albert Heijn', '', rules)).toBe('Boodschappen');
  });

  it('matches belastingdienst to Belastingen', () => {
    expect(categorize('Belastingdienst', '', rules)).toBe('Belastingen');
  });

  it('matches hypotheek to Wonen', () => {
    expect(categorize('ABN AMRO', 'Termijnbetaling hypotheek', rules)).toBe('Wonen');
  });

  it('returns Overig for unknown', () => {
    expect(categorize('Random Onbekend BV', 'betaling xyz', rules)).toBe('Overig');
  });

  it('custom rules take priority over defaults', () => {
    const custom: Rule[] = [
      { id: 'c1', pattern: 'albert heijn', category: 'Speciaal', isCustom: true },
      ...rules,
    ];
    expect(categorize('Albert Heijn', '', custom)).toBe('Speciaal');
  });

  it('matches case-insensitively', () => {
    expect(categorize('ZIGGO', '', rules)).toBe('Internet & Telecom');
    expect(categorize('ziggo', '', rules)).toBe('Internet & Telecom');
  });

  it('matches on description too', () => {
    expect(categorize('Some Store', 'salaris betaling', rules)).toBe('Inkomen');
  });

  it('handles invalid regex gracefully (falls back to includes)', () => {
    const badRule: Rule[] = [
      { id: 'bad', pattern: '[invalid(', category: 'Test', isCustom: true },
    ];
    // Should not throw, should try includes match
    expect(categorize('[invalid(', '', badRule)).toBe('Test');
    expect(categorize('no match', '', badRule)).toBe('Overig');
  });
});

describe('getDefaultRulesWithIds', () => {
  it('returns rules with unique IDs', () => {
    const rules = getDefaultRulesWithIds();
    const ids = rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all rules have required fields', () => {
    const rules = getDefaultRulesWithIds();
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.pattern).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(typeof r.isCustom).toBe('boolean');
    }
  });
});

describe('getRuleConflicts', () => {
  it('detects no conflicts between non-overlapping rules', () => {
    const rules: Rule[] = [
      { id: 'a', pattern: 'albert heijn', category: 'Boodschappen', isCustom: false },
      { id: 'b', pattern: 'ziggo', category: 'Internet & Telecom', isCustom: false },
    ];
    const conflicts = getRuleConflicts(rules);
    expect(conflicts.size).toBe(0);
  });

  it('detects conflicts between overlapping patterns in different categories', () => {
    const rules: Rule[] = [
      { id: 'a', pattern: 'energie|vattenfall', category: 'Wonen', isCustom: false },
      { id: 'b', pattern: 'vattenfall|solar', category: 'Duurzaam', isCustom: false },
    ];
    const conflicts = getRuleConflicts(rules);
    // Both should be flagged
    expect(conflicts.size).toBeGreaterThan(0);
  });
});
