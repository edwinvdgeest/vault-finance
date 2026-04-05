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

/** Find rule conflicts: rules in different categories where one's regex matches a literal term of the other */
export function getRuleConflicts(rules: Rule[]): Map<string, RuleConflict[]> {
  const result = new Map<string, RuleConflict[]>();
  const compiled = rules.map(r => {
    let regex: RegExp | null = null;
    try { regex = new RegExp(r.pattern, 'i'); } catch { /* ignore invalid regex */ }
    return { rule: r, terms: extractTerms(r.pattern), regex };
  });

  for (let i = 0; i < compiled.length; i++) {
    for (let j = i + 1; j < compiled.length; j++) {
      const a = compiled[i];
      const b = compiled[j];
      if (a.rule.category === b.rule.category) continue;

      // Check if a's regex matches any of b's terms, OR b's regex matches any of a's terms
      let shared: string | null = null;
      if (a.regex) {
        for (const termB of b.terms) {
          if (a.regex.test(termB)) { shared = termB; break; }
        }
      }
      if (!shared && b.regex) {
        for (const termA of a.terms) {
          if (b.regex.test(termA)) { shared = termA; break; }
        }
      }

      if (shared) {
        if (!result.has(a.rule.id)) result.set(a.rule.id, []);
        result.get(a.rule.id)!.push({
          ruleId: a.rule.id, otherRuleId: b.rule.id, otherCategory: b.rule.category, sharedTerm: shared,
        });
        if (!result.has(b.rule.id)) result.set(b.rule.id, []);
        result.get(b.rule.id)!.push({
          ruleId: b.rule.id, otherRuleId: a.rule.id, otherCategory: a.rule.category, sharedTerm: shared,
        });
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
