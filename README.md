# Governance Coverage

A browser-first tool that measures **how much of your API description your governance
actually looks at**. Point it at an OpenAPI (or AsyncAPI / Arazzo) and a ruleset, and it
resolves every rule's JSONPath against the document to report **coverage by section**, the
**rules that match nothing**, and **each rule's reach**. No backend, no accounts; runs
entirely in your browser. Live at **[coverage.apicommons.org](https://coverage.apicommons.org)**.

Test coverage asks how much of your code your tests execute. Governance coverage asks the
same question one altitude up: of all the addressable locations in your API description —
every operation, parameter, response, schema, and property — how many does *any* rule
actually inspect? A section at 0% is a blind spot. A rule that matches nothing is dead
weight for *this* API.

## What it reports

- **Coverage** — the share of governable nodes reached by at least one rule, and the
  **depth** (average rules per covered node). Against the comprehensive API Commons catalog
  most node *types* get touched, so the sharper signals are depth and dead rules; against
  **your own** ruleset, real blind spots appear.
- **By section** — coverage % and depth for each structural kind (info, paths, operations,
  parameters, requestBodies, responses, schemas, properties, securitySchemes, …). A
  fully-covered section that leans on a single rule is flagged **thin**. Click a section to
  see its individual nodes and which are blind.
- **Dead rules for this API** — active rules whose `given` matches nothing in the document.
  The inverse of coverage, and often the more actionable list.
- **Per-rule reach** — how many nodes each rule touches, so you can spot over-broad rules.

## How it works

A node is **covered** if a rule's `given` resolves to it or to anything inside it — credited
to the *nearest* enclosing governable node (so a `description` deep in a response governs
that response, not the whole path). Coverage measures **reach, not quality**: a node touched
by one broad rule is "covered" but barely governed, which is why depth is reported alongside.

Rule givens are resolved with [`jsonpath-plus`](https://github.com/JSONPath-Plus/JSONPath);
the five standard Spectral OpenAPI aliases (`#ArrayProperties`, `#OperationObject`,
`#PathItem`, `#SecurityRequirementObject`, `#LinkObject`) are expanded before resolution, and
a custom ruleset's own `aliases` are honoured. Rules are format-gated (an `oas2` rule is not
counted against a 3.x document); any given that can't be resolved is skipped and counted, not
silently dropped.

## Rulesets

- **API Commons catalog** (default) — the bundled 769-rule catalog from
  [`api-validator`](https://github.com/api-commons/api-validator), auto-selected by the
  document's format.
- **Bring your own** — paste a Spectral ruleset (YAML/JSON with a `rules:` map) to measure
  *your* governance against *your* API. This is the real "does our governance cover our API"
  use case.

## Develop

```bash
npm install
npm run data      # rebuild public/rulesets.json from ../api-validator/rules/all-rules.yaml
npm run dev
npm run build     # → dist/
```

`npm run data` snapshots the catalog givens into the committed
[`public/rulesets.json`](./public/rulesets.json), so CI only runs `vite build` — no sibling
repos, no network. Regenerate it when the rule catalog changes.

## Privacy

Everything runs client-side. The API description and ruleset you paste never leave the page —
there is no server.

## Part of API Commons

An open, browser-first tool from **[API Commons](https://apicommons.org)** — free, no backend, your data stays in your browser. Browse the full set at **[apicommons.org/tools](https://apicommons.org/tools/)**.

**Related tools**
- [Governance Baseline](https://baseline.apicommons.org) — adopt governance on a legacy estate; fail only new violations
- [Governance Scorecard](https://scorecard.apicommons.org) — the longitudinal health trend of your governance
- [Governance Waivers](https://waivers.apicommons.org) — sanctioned, owned, expiring governance exceptions
- [Spectral Ruleset Studio](https://studio.apicommons.org) — turn a style guide into an owned ruleset
- [API Validator](https://validator.apicommons.org) — lint OpenAPI/AsyncAPI/Arazzo/JSON Schema in your browser
- [API Governance Graph](https://graph.apicommons.org) — bind governance building blocks into one graph

---

**Governance guidance** — the human *why* behind coverage:
[Quality](https://guidance.apievangelist.com/store/quality/) and
[Rules](https://guidance.apievangelist.com/store/rules/) at guidance.apievangelist.com.

A project of [API Evangelist](https://apievangelist.com), maintained openly under
[API Commons](https://apicommons.org). Free to fork; API Evangelist offers expert API
governance services — including closing the blind spots this tool finds — when you want help.
Apache-2.0.
