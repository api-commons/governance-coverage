import { JSONPath } from 'jsonpath-plus';
import { enumerate, detectFormat, type GovNode, type Section } from './openapi-nodes';
import { STANDARD_OAS_ALIASES, expandGiven } from './aliases';

export interface RuleDef { id: string; given: string[]; field: string | null; formats: string[]; tags: string[]; title: string; }

export interface SectionCoverage { section: Section; total: number; covered: number; pct: number; avgRules: number; }
export interface RuleReach { id: string; title: string; reach: number; matchedAny: boolean; gated: boolean; }
export interface CoverageResult {
  format: string;
  nodes: GovNode[];
  nodeRules: Map<string, string[]>;   // pointer -> ruleIds covering it
  totalNodes: number; coveredNodes: number; coveragePct: number; avgRules: number; thinNodes: number;
  sections: SectionCoverage[];
  ruleReach: RuleReach[];
  deadRules: RuleReach[];             // active rules that match nothing here
  gatedRules: number;                 // rules excluded by format gate
  totalRules: number; activeRules: number; unresolvedGivens: number;
}

const SECTION_ORDER: Section[] = [
  'info', 'servers', 'tags', 'security', 'paths', 'operations', 'parameters',
  'requestBodies', 'mediaTypes', 'responses', 'headers', 'schemas', 'properties',
  'securitySchemes', 'links', 'examples', 'webhooks', 'channels', 'messages', 'workflows', 'steps',
];

function docFormatTokens(doc: any): string[] {
  if (doc.openapi) return [`oas${String(doc.openapi).trim().charAt(0)}`]; // oas3 / oas2 unlikely
  if (doc.swagger) return ['oas2'];
  if (doc.asyncapi) return [`aas${String(doc.asyncapi).trim().charAt(0)}`];
  return [];
}

export function computeCoverage(doc: any, rules: RuleDef[], customAliases: Record<string, string[]> = {}): CoverageResult {
  const format = detectFormat(doc);
  const nodes = enumerate(doc);
  const aliases = { ...STANDARD_OAS_ALIASES, ...customAliases };
  const tokens = docFormatTokens(doc);

  const nodeByPointer = new Map<string, number>(nodes.map((n, i) => [n.pointer, i]));
  const cover: Set<string>[] = nodes.map(() => new Set<string>());
  const ruleReach: RuleReach[] = [];
  let unresolvedGivens = 0, gatedRules = 0, activeRules = 0;

  for (const rule of rules) {
    const gated = rule.formats.length > 0 && tokens.length > 0 && !rule.formats.some((f) => tokens.includes(f));
    if (gated) { gatedRules++; ruleReach.push({ id: rule.id, title: rule.title, reach: 0, matchedAny: false, gated: true }); continue; }
    activeRules++;
    const touched = new Set<number>();
    let matchedAny = false;
    for (const rawGiven of rule.given) {
      const expanded = expandGiven(rawGiven.replace(/~+$/g, ''), aliases);
      if (!expanded.length) { unresolvedGivens++; continue; } // unknown alias
      for (const gx of expanded) {
        let ptrs: string[] = [];
        try { ptrs = JSONPath({ path: gx, json: doc, resultType: 'pointer' }) as string[]; }
        catch { unresolvedGivens++; continue; }
        if (!Array.isArray(ptrs) || !ptrs.length) continue;
        matchedAny = true;
        for (const mp of ptrs) {
          // Credit the NEAREST enclosing governable node — the deepest node that is
          // the match itself or contains it. (Not the whole ancestor chain: a
          // description deep inside a response should govern that response, not the
          // whole path, or a broad catalog would pin every container to 100%.)
          let p = mp;
          for (;;) {
            const idx = nodeByPointer.get(p);
            if (idx !== undefined) { cover[idx].add(rule.id); touched.add(idx); break; }
            const slash = p.lastIndexOf('/');
            if (slash <= 0) break;
            p = p.slice(0, slash);
          }
        }
      }
    }
    ruleReach.push({ id: rule.id, title: rule.title, reach: touched.size, matchedAny, gated: false });
  }

  // node -> ruleIds map for drilldown
  const nodeRules = new Map<string, string[]>();
  nodes.forEach((n, i) => nodeRules.set(n.pointer, [...cover[i]]));

  const coveredNodes = cover.filter((s) => s.size > 0).length;
  const thinNodes = cover.filter((s) => s.size === 1).length;
  const totalCoveredRuleHits = cover.reduce((a, s) => a + (s.size > 0 ? s.size : 0), 0);
  const avgRules = coveredNodes ? totalCoveredRuleHits / coveredNodes : 0;

  // per-section rollup
  const bySection = new Map<Section, { total: number; covered: number; depthSum: number }>();
  nodes.forEach((n, i) => {
    const s = bySection.get(n.section) ?? bySection.set(n.section, { total: 0, covered: 0, depthSum: 0 }).get(n.section)!;
    s.total++;
    if (cover[i].size > 0) { s.covered++; s.depthSum += cover[i].size; }
  });
  const sections: SectionCoverage[] = [...bySection.entries()]
    .map(([section, v]) => ({ section, total: v.total, covered: v.covered, pct: Math.round((v.covered / v.total) * 100), avgRules: v.covered ? v.depthSum / v.covered : 0 }))
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

  const deadRules = ruleReach.filter((r) => !r.gated && !r.matchedAny).sort((a, b) => a.title.localeCompare(b.title));

  return {
    format, nodes, nodeRules,
    totalNodes: nodes.length, coveredNodes, coveragePct: nodes.length ? Math.round((coveredNodes / nodes.length) * 100) : 0, avgRules, thinNodes,
    sections, ruleReach: ruleReach.filter((r) => !r.gated).sort((a, b) => b.reach - a.reach),
    deadRules, gatedRules, totalRules: rules.length, activeRules, unresolvedGivens,
  };
}
