// Enumerate the "governable nodes" of an API description — the structural
// locations a rule could target — each with an RFC-6901 JSON pointer (the same
// encoding jsonpath-plus emits with resultType:'pointer') and a section label.
// Supports OpenAPI 3.x and Swagger 2.0.

export type Section =
  | 'info' | 'servers' | 'tags' | 'paths' | 'operations' | 'parameters'
  | 'requestBodies' | 'mediaTypes' | 'responses' | 'headers' | 'schemas'
  | 'properties' | 'securitySchemes' | 'security' | 'links' | 'examples'
  | 'webhooks' | 'channels' | 'messages' | 'workflows' | 'steps';

export interface GovNode { pointer: string; section: Section; label: string; }

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

export function detectFormat(doc: any): 'openapi' | 'asyncapi' | 'arazzo' | 'jsonschema' | 'unknown' {
  if (!isObj(doc)) return 'unknown';
  if (doc.openapi || doc.swagger) return 'openapi';
  if (doc.asyncapi) return 'asyncapi';
  if (doc.arazzo) return 'arazzo';
  if (doc.$schema || doc.properties || doc.type) return 'jsonschema';
  return 'unknown';
}

export function enumerate(doc: any): GovNode[] {
  const fmt = detectFormat(doc);
  if (fmt === 'openapi') return enumerateOpenAPI(doc);
  if (fmt === 'asyncapi') return enumerateAsyncAPI(doc);
  if (fmt === 'arazzo') return enumerateArazzo(doc);
  if (fmt === 'jsonschema') return walkSchema(doc, '', 'schemas', []);
  return [];
}

function enumerateOpenAPI(doc: any): GovNode[] {
  const out: GovNode[] = [];
  const add = (pointer: string, section: Section, label: string) => out.push({ pointer, section, label });
  const swagger2 = !!doc.swagger;

  if (isObj(doc.info)) add('/info', 'info', 'info');
  (doc.servers || []).forEach((_: any, i: number) => add(`/servers/${i}`, 'servers', `server ${i}`));
  (doc.tags || []).forEach((t: any, i: number) => add(`/tags/${i}`, 'tags', `tag: ${t?.name ?? i}`));
  (doc.security || []).forEach((_: any, i: number) => add(`/security/${i}`, 'security', `security ${i}`));

  const schemaWalk = (schema: any, pointer: string) => out.push(...walkSchema(schema, pointer, 'schemas', []));

  const walkOperation = (op: any, opPtr: string) => {
    (op.parameters || []).forEach((p: any, i: number) => {
      add(`${opPtr}/parameters/${i}`, 'parameters', `param: ${p?.name ?? i}`);
      if (isObj(p?.schema)) schemaWalk(p.schema, `${opPtr}/parameters/${i}/schema`);
    });
    if (isObj(op.requestBody)) {
      add(`${opPtr}/requestBody`, 'requestBodies', 'requestBody');
      walkContent(op.requestBody.content, `${opPtr}/requestBody/content`);
    }
    if (isObj(op.responses)) {
      for (const code of Object.keys(op.responses)) {
        const rPtr = `${opPtr}/responses/${esc(code)}`;
        add(rPtr, 'responses', `response ${code}`);
        const resp = op.responses[code];
        if (isObj(resp?.headers)) for (const h of Object.keys(resp.headers)) add(`${rPtr}/headers/${esc(h)}`, 'headers', `header: ${h}`);
        if (isObj(resp?.content)) walkContent(resp.content, `${rPtr}/content`);
        if (swagger2 && isObj(resp?.schema)) schemaWalk(resp.schema, `${rPtr}/schema`);
        if (isObj(resp?.links)) for (const l of Object.keys(resp.links)) add(`${rPtr}/links/${esc(l)}`, 'links', `link: ${l}`);
      }
    }
  };
  const walkContent = (content: any, ptr: string) => {
    if (!isObj(content)) return;
    for (const ct of Object.keys(content)) {
      add(`${ptr}/${esc(ct)}`, 'mediaTypes', `media: ${ct}`);
      if (isObj(content[ct]?.schema)) schemaWalk(content[ct].schema, `${ptr}/${esc(ct)}/schema`);
    }
  };

  if (isObj(doc.paths)) {
    for (const path of Object.keys(doc.paths)) {
      const pPtr = `/paths/${esc(path)}`;
      add(pPtr, 'paths', `path: ${path}`);
      const item = doc.paths[path];
      if (!isObj(item)) continue;
      (item.parameters || []).forEach((p: any, i: number) => add(`${pPtr}/parameters/${i}`, 'parameters', `param: ${p?.name ?? i}`));
      for (const m of METHODS) if (isObj(item[m])) { add(`${pPtr}/${m}`, 'operations', `${m.toUpperCase()} ${path}`); walkOperation(item[m], `${pPtr}/${m}`); }
    }
  }
  // webhooks (3.1)
  if (isObj(doc.webhooks)) for (const w of Object.keys(doc.webhooks)) {
    const wPtr = `/webhooks/${esc(w)}`;
    add(wPtr, 'webhooks', `webhook: ${w}`);
    for (const m of METHODS) if (isObj(doc.webhooks[w]?.[m])) { add(`${wPtr}/${m}`, 'operations', `${m.toUpperCase()} ${w}`); walkOperation(doc.webhooks[w][m], `${wPtr}/${m}`); }
  }

  // components (3.x) / top-level definitions (2.0)
  const comps = doc.components || {};
  const schemaBag = swagger2 ? doc.definitions : comps.schemas;
  if (isObj(schemaBag)) for (const name of Object.keys(schemaBag)) { const sp = swagger2 ? `/definitions/${esc(name)}` : `/components/schemas/${esc(name)}`; add(sp, 'schemas', `schema: ${name}`); schemaWalk(schemaBag[name], sp); }
  const secBag = swagger2 ? doc.securityDefinitions : comps.securitySchemes;
  if (isObj(secBag)) for (const name of Object.keys(secBag)) add(swagger2 ? `/securityDefinitions/${esc(name)}` : `/components/securitySchemes/${esc(name)}`, 'securitySchemes', `securityScheme: ${name}`);
  if (isObj(comps.parameters)) for (const n of Object.keys(comps.parameters)) add(`/components/parameters/${esc(n)}`, 'parameters', `param: ${n}`);
  if (isObj(comps.responses)) for (const n of Object.keys(comps.responses)) add(`/components/responses/${esc(n)}`, 'responses', `response: ${n}`);
  if (isObj(comps.requestBodies)) for (const n of Object.keys(comps.requestBodies)) add(`/components/requestBodies/${esc(n)}`, 'requestBodies', `requestBody: ${n}`);
  if (isObj(comps.headers)) for (const n of Object.keys(comps.headers)) add(`/components/headers/${esc(n)}`, 'headers', `header: ${n}`);
  if (isObj(comps.examples)) for (const n of Object.keys(comps.examples)) add(`/components/examples/${esc(n)}`, 'examples', `example: ${n}`);

  return dedupe(out);
}

// Recurse a JSON Schema, enumerating each nested schema + property.
function walkSchema(schema: any, pointer: string, section: Section, seen: any[], depth = 0): GovNode[] {
  if (!isObj(schema) || depth > 12 || seen.includes(schema)) return [];
  if (schema.$ref) return []; // a $ref points at an already-enumerated schema
  const out: GovNode[] = [];
  const nextSeen = [...seen, schema];
  if (isObj(schema.properties)) {
    for (const prop of Object.keys(schema.properties)) {
      const pPtr = `${pointer}/properties/${esc(prop)}`;
      out.push({ pointer: pPtr, section: 'properties', label: `property: ${prop}` });
      out.push(...walkSchema(schema.properties[prop], pPtr, 'schemas', nextSeen, depth + 1));
    }
  }
  if (isObj(schema.items)) out.push(...walkSchema(schema.items, `${pointer}/items`, 'schemas', nextSeen, depth + 1));
  for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(schema[key])) schema[key].forEach((s: any, i: number) => out.push(...walkSchema(s, `${pointer}/${key}/${i}`, 'schemas', nextSeen, depth + 1)));
  if (isObj(schema.additionalProperties)) out.push(...walkSchema(schema.additionalProperties, `${pointer}/additionalProperties`, 'schemas', nextSeen, depth + 1));
  return out;
}

function enumerateAsyncAPI(doc: any): GovNode[] {
  const out: GovNode[] = [];
  if (isObj(doc.info)) out.push({ pointer: '/info', section: 'info', label: 'info' });
  if (isObj(doc.channels)) for (const c of Object.keys(doc.channels)) {
    out.push({ pointer: `/channels/${esc(c)}`, section: 'channels', label: `channel: ${c}` });
    for (const op of ['publish', 'subscribe']) if (isObj(doc.channels[c]?.[op])) {
      out.push({ pointer: `/channels/${esc(c)}/${op}`, section: 'operations', label: `${op} ${c}` });
      if (isObj(doc.channels[c][op].message)) out.push({ pointer: `/channels/${esc(c)}/${op}/message`, section: 'messages', label: `message ${c}.${op}` });
    }
  }
  const schemas = doc.components?.schemas;
  if (isObj(schemas)) for (const n of Object.keys(schemas)) { const sp = `/components/schemas/${esc(n)}`; out.push({ pointer: sp, section: 'schemas', label: `schema: ${n}` }); out.push(...walkSchema(schemas[n], sp, 'schemas', [])); }
  return dedupe(out);
}

function enumerateArazzo(doc: any): GovNode[] {
  const out: GovNode[] = [];
  if (isObj(doc.info)) out.push({ pointer: '/info', section: 'info', label: 'info' });
  (doc.sourceDescriptions || []).forEach((s: any, i: number) => out.push({ pointer: `/sourceDescriptions/${i}`, section: 'info', label: `source: ${s?.name ?? i}` }));
  (doc.workflows || []).forEach((w: any, i: number) => {
    out.push({ pointer: `/workflows/${i}`, section: 'workflows', label: `workflow: ${w?.workflowId ?? i}` });
    (w?.steps || []).forEach((st: any, j: number) => out.push({ pointer: `/workflows/${i}/steps/${j}`, section: 'steps', label: `step: ${st?.stepId ?? j}` }));
  });
  return dedupe(out);
}

function dedupe(nodes: GovNode[]): GovNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => (seen.has(n.pointer) ? false : (seen.add(n.pointer), true)));
}
