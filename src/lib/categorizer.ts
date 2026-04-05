import type { Rule } from '../types';

export const DEFAULT_RULES: Omit<Rule, 'id'>[] = [
  // Inkomen
  { pattern: 'salaris|salary', category: 'Inkomen', isCustom: false },

  // Overboekingen
  { pattern: 'knab|triodos|bunq|abn.*eigen', category: 'Overboekingen', isCustom: false },

  // Bank & Rente
  { pattern: 'bunq.*invoice|interest payment', category: 'Bank & Rente', isCustom: false },

  // Verzekeringen (specifiek eerst)
  { pattern: 'zilveren kruis|centraal beheer|nationale nederlanden|cz zorg|vgz|menzis|fbto|interpolis|aegon|univ\\u00e9|asr verzeker', category: 'Verzekeringen', isCustom: false },

  // Zorg & Medisch (specifiek eerst, CZ als zorgverzekeraar)
  { pattern: 'apotheek|benu|tandarts|huisarts|ziekenhuis|fysiotherap|optici|specsavers|eigen risico|zorgverzekering', category: 'Zorg & Medisch', isCustom: false },

  // Belastingen
  { pattern: 'belastingdienst|belasting|\\bcak\\b|\\bduo\\b|\\bcjib\\b|gemeente|waterschap', category: 'Belastingen', isCustom: false },

  // Kinderopvang
  { pattern: 'kinderopvang|\\bkdv\\b|\\bbso\\b|gastouder|peuterspeelzaal|kinderdagverblijf', category: 'Kinderopvang', isCustom: false },

  // Wonen
  { pattern: 'hypotheek|florius|energie|vattenfall|eneco|vitens|waterbedrijf|woningcorporatie', category: 'Wonen', isCustom: false },

  // Internet & Telecom
  { pattern: 'ziggo|odido|t-mobile|tele2|vodafone|simyo|\\bben\\b|glasvezel|\\bkpn\\b', category: 'Internet & Telecom', isCustom: false },

  // Abonnementen
  { pattern: 'netflix|spotify|disney|youtube|hbo max|videoland|nrc|volkskrant|\\bapple\\b|icloud', category: 'Abonnementen', isCustom: false },

  // Vakantie & Reizen
  { pattern: 'booking\\.com|airbnb|\\btui\\b|corendon|transavia|\\bklm\\b|ryanair|easyjet|camping|\\bhotel\\b|vakantie', category: 'Vakantie & Reizen', isCustom: false },

  // Transport
  { pattern: 'arriva|connexxion|\\bret\\b|\\buber\\b|\\btaxi\\b|flixbus|ns |gvb|ov-chipkaart', category: 'Transport', isCustom: false },

  // Auto
  { pattern: 'shell|totalenergies|\\bbp\\b|tango', category: 'Auto', isCustom: false },

  // Sport & Gezondheid
  { pattern: 'crossfit|hardloop|decathlon|intersport', category: 'Sport & Gezondheid', isCustom: false },

  // Horeca
  { pattern: 'deliveroo|thuisbezorgd|uber eats|restaurant|cafe|eetcafe', category: 'Horeca', isCustom: false },

  // Boodschappen
  { pattern: 'albert heijn|jumbo|lidl|picnic|dirk|aldi|\\bplus\\b|\\bspar\\b|dekamarkt|coop', category: 'Boodschappen', isCustom: false },

  // Kleding & Mode
  { pattern: 'zalando|\\bh&m\\b|\\bzara\\b|wehkamp|primark|\\bc&a\\b|\\bonly\\b|we fashion|vero moda|\\bnike\\b|\\badidas\\b', category: 'Kleding & Mode', isCustom: false },

  // Cadeaus & Shopping
  { pattern: 'bol\\.com|\\bamazon\\b|coolblue|mediamarkt|\\bikea\\b|\\baction\\b|\\bhema\\b|blokker|cadeau', category: 'Cadeaus & Shopping', isCustom: false },

  // Persoonlijke verzorging
  { pattern: 'kapper|kruidvat|\\betos\\b|douglas|rituals|\\bsalon\\b', category: 'Persoonlijke verzorging', isCustom: false },

  // Tuin & Huishouden
  { pattern: 'gamma|praxis|hornbach|karwei|intratuin|tuincentr', category: 'Tuin & Huishouden', isCustom: false },

  // Parkeren
  { pattern: 'q-park|\\bp1\\b|interparking|parkeer|parkeergeld', category: 'Parkeren', isCustom: false },

  // Donaties
  { pattern: 'donatie|\\bgift\\b|goed doel|stichting|contributie|vereniging', category: 'Donaties', isCustom: false },
];

export function getDefaultRulesWithIds(): Rule[] {
  return DEFAULT_RULES.map((r, i) => ({ ...r, id: `default-${i}` }));
}

/** Extract literal terms from a regex pattern (splits on `|`, strips `\b` and escape chars) */
function extractTerms(pattern: string): string[] {
  return pattern
    .split('|')
    .map(t => t.trim())
    // Strip word-boundary markers
    .map(t => t.replace(/\\b/g, ''))
    // Strip regex-escape backslashes (e.g. \. → .)
    .map(t => t.replace(/\\(.)/g, '$1'))
    // Strip common regex meta chars used in patterns
    .map(t => t.replace(/\.\*/g, ' ').trim())
    .filter(t => t.length >= 3);
}

export interface RuleConflict {
  ruleId: string;
  otherRuleId: string;
  otherCategory: string;
  sharedTerm: string;
}

/** Find rule conflicts: rules in different categories that share a literal term */
export function getRuleConflicts(rules: Rule[]): Map<string, RuleConflict[]> {
  const result = new Map<string, RuleConflict[]>();
  const ruleTerms = rules.map(r => ({ rule: r, terms: extractTerms(r.pattern) }));

  for (let i = 0; i < ruleTerms.length; i++) {
    for (let j = i + 1; j < ruleTerms.length; j++) {
      const a = ruleTerms[i];
      const b = ruleTerms[j];
      if (a.rule.category === b.rule.category) continue;

      // Find any shared term (exact or substring overlap with length >= 3)
      for (const termA of a.terms) {
        for (const termB of b.terms) {
          const la = termA.toLowerCase();
          const lb = termB.toLowerCase();
          if (la === lb || (la.length >= 3 && lb.includes(la)) || (lb.length >= 3 && la.includes(lb))) {
            const shared = la.length <= lb.length ? termA : termB;
            // Add to both rules
            if (!result.has(a.rule.id)) result.set(a.rule.id, []);
            result.get(a.rule.id)!.push({
              ruleId: a.rule.id, otherRuleId: b.rule.id, otherCategory: b.rule.category, sharedTerm: shared,
            });
            if (!result.has(b.rule.id)) result.set(b.rule.id, []);
            result.get(b.rule.id)!.push({
              ruleId: b.rule.id, otherRuleId: a.rule.id, otherCategory: a.rule.category, sharedTerm: shared,
            });
            break; // one conflict per pair is enough
          }
        }
        if (result.get(a.rule.id)?.some(c => c.otherRuleId === b.rule.id)) break;
      }
    }
  }
  return result;
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
