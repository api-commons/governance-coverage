// The Spectral OpenAPI aliases the catalog's givens reference with `#Name`.
// These are the standard `spectral:oas` alias definitions — the catalog uses them
// but does not redefine them (the validator injects the standard set), so we expand
// them here. A given like `#ArrayProperties` is replaced by its JSONPath target(s)
// before resolution. Custom rulesets can supply their own `aliases` map, which is
// merged over these.
export const STANDARD_OAS_ALIASES: Record<string, string[]> = {
  // schema objects declaring an array type (both keyword and 3.1 array-of-types)
  ArrayProperties: [
    "$..[?(@ && @.type=='array')]",
  ],
  // every operation object under any path
  OperationObject: [
    '$.paths[*][get,put,post,delete,options,head,patch,trace]',
  ],
  // every path-item object
  PathItem: ['$.paths[*]'],
  // security requirement objects (root + per-operation)
  SecurityRequirementObject: [
    '$.security[*]',
    '$.paths[*][get,put,post,delete,options,head,patch,trace].security[*]',
  ],
  // link objects (3.x responses + components)
  LinkObject: [
    '$.paths[*][get,put,post,delete,options,head,patch,trace].responses[*].links[*]',
    '$.components.links[*]',
  ],
};

// Expand a single given: if it starts with `#Name`, swap the `#Name` head for each
// alias target (carrying any trailing path segments). Returns 1+ concrete givens.
export function expandGiven(given: string, aliases: Record<string, string[]>): string[] {
  if (!given.startsWith('#')) return [given];
  const m = /^#([A-Za-z0-9_]+)(.*)$/.exec(given);
  if (!m) return [given];
  const [, name, restRaw] = m;
  const targets = aliases[name];
  if (!targets || !targets.length) return []; // unknown alias — caller counts it unresolved
  const rest = restRaw || '';
  return targets.map((t) => t + rest);
}
