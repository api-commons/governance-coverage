#!/usr/bin/env node
// Snapshot the API Commons rule catalog into a coverage-ready ruleset bundle:
// per format, each rule reduced to what the coverage engine needs — its id, the
// JSONPath given(s), the then.field, and tags. Run locally (`npm run data`); the
// output public/rulesets.json is COMMITTED so CI only runs `vite build`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const COMMONS = resolve(REPO, '..');
const CATALOG = join(COMMONS, 'api-validator', 'rules', 'all-rules.yaml');

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

const catalog = parseYaml(readFileSync(CATALOG, 'utf8'));
const rulesets = {};
let total = 0;
for (const [format, group] of Object.entries(catalog)) {
  if (!group || typeof group !== 'object') continue;
  const rules = [];
  for (const [id, r] of Object.entries(group)) {
    if (!r || typeof r !== 'object') continue;
    const given = arr(r.given).map(String).filter(Boolean);
    if (!given.length) continue;
    rules.push({
      id,
      given,
      field: r.then && !Array.isArray(r.then) ? (r.then.field ?? null) : null,
      formats: arr(r.formats),
      tags: arr(r.tags),
      title: r.title || id,
    });
    total++;
  }
  rulesets[format] = rules;
}

const bundle = {
  generatedAt: new Date().toISOString(),
  source: 'API Commons rule catalog (api-validator/rules/all-rules.yaml)',
  counts: Object.fromEntries(Object.entries(rulesets).map(([k, v]) => [k, v.length])),
  rulesets,
};
const OUT = join(REPO, 'public', 'rulesets.json');
writeFileSync(OUT, JSON.stringify(bundle));
console.log(`Wrote ${OUT}`);
console.log(`  ${total} rules across ${Object.keys(rulesets).length} formats`);
console.log(`  counts:`, bundle.counts);
