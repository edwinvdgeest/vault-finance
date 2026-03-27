import type { Rule } from '../types';

export const DEFAULT_RULES: Omit<Rule, 'id'>[] = [
  { pattern: 'albert heijn|jumbo|lidl|picnic|dirk', category: 'Boodschappen', isCustom: false },
  { pattern: 'shell|totalenergies|bp|tango', category: 'Auto', isCustom: false },
  { pattern: 'ns |gvb|ov-chipkaart', category: 'Transport', isCustom: false },
  { pattern: 'crossfit|hardloop|decathlon|intersport', category: 'Sport & Gezondheid', isCustom: false },
  { pattern: 'netflix|spotify|disney|youtube', category: 'Abonnementen', isCustom: false },
  { pattern: 'hypotheek|florius|energie|vattenfall|eneco', category: 'Wonen', isCustom: false },
  { pattern: 'deliveroo|thuisbezorgd|uber eats|restaurant|cafe|eetcafe', category: 'Horeca', isCustom: false },
  { pattern: 'bunq.*invoice|interest payment', category: 'Bank & Rente', isCustom: false },
  { pattern: 'knab|triodos|bunq|abn.*eigen', category: 'Overboekingen', isCustom: false },
  { pattern: 'salaris|salary', category: 'Inkomen', isCustom: false },
];

export function getDefaultRulesWithIds(): Rule[] {
  return DEFAULT_RULES.map((r, i) => ({ ...r, id: `default-${i}` }));
}

export function categorize(name: string, description: string, rules: Rule[]): string {
  const text = `${name} ${description}`.toLowerCase();

  // Custom rules take priority
  const sorted = [...rules.filter(r => r.isCustom), ...rules.filter(r => !r.isCustom)];

  for (const rule of sorted) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(text)) return rule.category;
    } catch {
      if (text.includes(rule.pattern.toLowerCase())) return rule.category;
    }
  }

  return 'Overig';
}
