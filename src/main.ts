import './style.css';
import { parse as parseYaml } from 'yaml';
import { computeCoverage, type RuleDef, type CoverageResult } from './coverage';
import type { Section } from './openapi-nodes';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const pct = (n: number) => (n >= 80 ? 'var(--ok)' : n >= 50 ? 'var(--warn)' : 'var(--error)');

let catalog: Record<string, RuleDef[]> = {};
let sampleText = '';
let source: 'sample' | 'paste' | 'upload' = 'sample';

init();
async function init() {
  wire();
  try {
    const [rs, sample] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}rulesets.json`).then((r) => r.json()),
      fetch(`${import.meta.env.BASE_URL}sample-openapi.json`).then((r) => r.text()),
    ]);
    catalog = rs.rulesets;
    sampleText = sample;
    $('#doc-text').textContent = sample;
    ($('#doc-text') as HTMLTextAreaElement).value = sample;
    $('#doc-status').innerHTML = `catalog: <b>${rs.counts.openapi}</b> OpenAPI · <b>${rs.counts.asyncapi}</b> AsyncAPI · <b>${rs.counts.arazzo}</b> Arazzo rules`;
    measure();
  } catch (e) {
    $('#report').innerHTML = `<div class="loading">Couldn't load the rule catalog. ${esc((e as Error).message)}</div>`;
  }
}

function wire() {
  const setSrc = (s: typeof source, btn: string) => {
    source = s;
    document.querySelectorAll('.ctl .chip-btn').forEach((b) => b.classList.remove('is-active'));
    $(btn).classList.add('is-active');
  };
  $('#src-sample').addEventListener('click', () => { setSrc('sample', '#src-sample'); ($('#doc-text') as HTMLTextAreaElement).value = sampleText; ($('#input-drawer') as HTMLDetailsElement).open = false; measure(); });
  $('#src-paste').addEventListener('click', () => { setSrc('paste', '#src-paste'); ($('#input-drawer') as HTMLDetailsElement).open = true; ($('#doc-text') as HTMLTextAreaElement).focus(); });
  $('#src-upload').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { setSrc('upload', '#src-upload'); ($('#doc-text') as HTMLTextAreaElement).value = String(r.result); measure(); };
    r.readAsText(f);
  });
  $('#ruleset-select').addEventListener('change', (e) => {
    const custom = (e.target as HTMLSelectElement).value === 'custom';
    $('#custom-ruleset-wrap').hidden = !custom;
    if (custom) ($('#input-drawer') as HTMLDetailsElement).open = true;
  });
  $('#measure').addEventListener('click', measure);
  $('#engage-ae').addEventListener('click', () => {
    location.href = 'mailto:info@apievangelist.com?subject=' + encodeURIComponent('API governance — coverage of our rules') +
      '&body=' + encodeURIComponent("I measured our governance coverage and want help closing the blind spots.");
  });
  $('#nav-about').addEventListener('click', (e) => { e.preventDefault(); about(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('about-modal')?.remove(); });
}

function parseDoc(text: string): any {
  const t = text.trim();
  if (!t) throw new Error('No API description provided.');
  try { return JSON.parse(t); } catch { /* try yaml */ }
  return parseYaml(t);
}

// Flatten a pasted Spectral ruleset into RuleDef[] + an aliases map.
function parseCustomRuleset(text: string): { rules: RuleDef[]; aliases: Record<string, string[]> } {
  const rs = parseDoc(text);
  const rules: RuleDef[] = [];
  const aliases: Record<string, string[]> = {};
  if (rs && typeof rs.aliases === 'object') {
    for (const [name, def] of Object.entries<any>(rs.aliases)) {
      if (Array.isArray(def)) aliases[name] = def.map(String);
      else if (def && Array.isArray(def.targets)) aliases[name] = def.targets.flatMap((t: any) => (Array.isArray(t.given) ? t.given : [t.given])).map(String);
    }
  }
  const map = rs?.rules || {};
  for (const [id, r] of Object.entries<any>(map)) {
    if (!r || typeof r !== 'object' || r === true) continue;
    const given = (Array.isArray(r.given) ? r.given : r.given == null ? [] : [r.given]).map(String);
    if (!given.length) continue;
    rules.push({ id, given, field: r.then && !Array.isArray(r.then) ? r.then.field ?? null : null, formats: Array.isArray(r.formats) ? r.formats : [], tags: [], title: id });
  }
  return { rules, aliases };
}

function measure() {
  let doc: any, rules: RuleDef[], aliases: Record<string, string[]> = {};
  try { doc = parseDoc(($('#doc-text') as HTMLTextAreaElement).value); }
  catch (e) { return renderError(`Could not parse the API description: ${(e as Error).message}`); }

  const useCustom = ($('#ruleset-select') as HTMLSelectElement).value === 'custom';
  if (useCustom) {
    try { const parsed = parseCustomRuleset(($('#ruleset-text') as HTMLTextAreaElement).value); rules = parsed.rules; aliases = parsed.aliases; }
    catch (e) { return renderError(`Could not parse the ruleset: ${(e as Error).message}`); }
    if (!rules.length) return renderError('That ruleset has no rules with a `given` to measure.');
  } else {
    const fmt = doc.openapi || doc.swagger ? 'openapi' : doc.asyncapi ? 'asyncapi' : doc.arazzo ? 'arazzo' : 'openapi';
    rules = catalog[fmt] || [];
    if (!rules.length) return renderError(`No catalog rules for detected format "${fmt}".`);
  }

  const result = computeCoverage(doc, rules, aliases);
  render(result);
}

function renderError(msg: string) { $('#report').innerHTML = `<div class="cov-error">${esc(msg)}</div>`; }

function render(r: CoverageResult) {
  if (!r.totalNodes) return renderError('No governable nodes found — is this a supported API description (OpenAPI / AsyncAPI / Arazzo)?');
  const dead = r.deadRules.length;
  const report = `
    <div class="cov-hero">
      <div class="gauge">
        <div class="gauge-num" style="color:${pct(r.coveragePct)}">${r.coveragePct}<span>%</span></div>
        <div class="gauge-cap">of ${r.totalNodes} governable nodes<br>are reached by a rule</div>
      </div>
      <div class="hero-facts">
        <div class="fact ${r.totalNodes - r.coveredNodes ? 'warnf' : ''}"><b>${r.totalNodes - r.coveredNodes}</b><span>blind spots (0 rules)</span></div>
        <div class="fact ${r.thinNodes ? 'warnf' : ''}"><b>${r.thinNodes}</b><span>thinly governed (1 rule)</span></div>
        <div class="fact"><b>${r.avgRules.toFixed(1)}</b><span>avg rules / covered node</span></div>
        <div class="fact"><b>${r.activeRules}</b><span>active rules${r.gatedRules ? ` <span class="muted">(${r.gatedRules} gated out)</span>` : ''}</span></div>
        <div class="fact ${dead ? 'warnf' : ''}"><b>${dead}</b><span>dead rules (match nothing)</span></div>
      </div>
    </div>
    <p class="muted small hint">Reach is necessary, not sufficient. Against the full API Commons catalog most node types get touched — the real signal is <b>depth</b> (sections marked <span class="thin-tag">thin</span> lean on a single rule), the <b>dead rules</b> that don't apply here, and coverage of <b>your own</b> ruleset. Switch the ruleset above to <em>Paste your own</em> to find true blind spots.</p>

    <div class="cov-cols">
      <section class="panel">
        <h3>Coverage by section</h3>
        <p class="muted small">Each row: how many nodes of that kind a rule reaches, and how deep (avg rules per covered node). A 0% row is a blind spot.</p>
        <div class="sections">${r.sections.map(sectionRow).join('')}</div>
      </section>

      <section class="panel">
        <h3>Dead rules for this API <span class="muted">(${dead})</span></h3>
        <p class="muted small">Active rules whose <code>given</code> matches nothing in this document — governance you carry that doesn't apply here.</p>
        <div class="rule-list">${r.deadRules.slice(0, 200).map((d) => `<div class="rule-row"><span class="rid">${esc(d.id)}</span></div>`).join('') || '<div class="muted small">None — every active rule reaches something. 👏</div>'}${dead > 200 ? `<div class="muted small">…and ${dead - 200} more</div>` : ''}</div>

        <h3 style="margin-top:1.2rem">Per-rule reach <span class="muted">(top by nodes touched)</span></h3>
        <p class="muted small">How many governable nodes each active rule reaches — the top of this list is your broadest governance.</p>
        <div class="rule-list">${r.ruleReach.filter((x) => x.reach > 0).slice(0, 60).map((x) => `<div class="rule-row"><span class="rid">${esc(x.id)}</span><span class="reach">${x.reach}</span></div>`).join('')}</div>
      </section>
    </div>
    ${r.unresolvedGivens ? `<p class="muted small foot">${r.unresolvedGivens} rule given${r.unresolvedGivens > 1 ? 's' : ''} could not be resolved (unknown alias or unsupported JSONPath) and were skipped — coverage is measured over the rest.</p>` : ''}`;
  $('#report').innerHTML = report;
  $('#report').querySelectorAll<HTMLElement>('.section-row').forEach((el) => el.addEventListener('click', () => toggleSection(el, r)));
}

function sectionRow(s: { section: Section; total: number; covered: number; pct: number; avgRules: number }): string {
  const thin = s.pct === 100 && s.avgRules > 0 && s.avgRules < 2;
  return `<div class="section-row" data-section="${s.section}">
    <div class="sr-head">
      <span class="sr-name">${s.section}${thin ? ' <span class="thin-tag">thin</span>' : ''}</span>
      <span class="sr-stat">${s.covered}/${s.total} · <span class="muted">${s.avgRules ? s.avgRules.toFixed(1) + ' rules' : '—'}</span> · <b style="color:${pct(s.pct)}">${s.pct}%</b></span>
    </div>
    <div class="sr-bar"><span style="width:${s.pct}%;background:${pct(s.pct)}"></span></div>
    <div class="sr-nodes" hidden></div>
  </div>`;
}

function toggleSection(el: HTMLElement, r: CoverageResult) {
  const box = el.querySelector<HTMLElement>('.sr-nodes')!;
  if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
  const section = el.dataset.section as Section;
  const nodes = r.nodes.filter((n) => n.section === section);
  const rows = nodes.map((n) => {
    const rules = r.nodeRules.get(n.pointer) || [];
    const covered = rules.length > 0;
    return `<div class="nd ${covered ? '' : 'nd-blind'}"><span class="nd-label" title="${esc(n.pointer)}">${esc(n.label)}</span><span class="nd-count">${covered ? rules.length + ' rule' + (rules.length > 1 ? 's' : '') : 'blind spot'}</span></div>`;
  }).join('');
  box.innerHTML = rows;
  box.hidden = false;
}

function about() {
  const el = document.createElement('div');
  el.id = 'about-modal';
  el.innerHTML = `<div class="about-backdrop"></div><div class="about-card">
    <button class="detail-close" id="about-close">&times;</button>
    <h2>Coverage, borrowed from testing</h2>
    <p>Test coverage asks how much of your code your tests execute. <strong>Governance coverage</strong> asks the same question one altitude up: of all the addressable locations in your API description — every operation, parameter, response, schema, and property — how many does <em>any</em> rule actually look at?</p>
    <p>It works by resolving each rule's <code>given</code> JSONPath against your document and crediting every node the rule reaches (itself or anything inside it). A section at 0% is a blind spot: nothing in your governance inspects it. A rule that matches nothing is dead weight for <em>this</em> API.</p>
    <p>The honest caveat: coverage measures <em>reach</em>, not <em>quality</em>. A node touched by one broad <code>description</code> rule is "covered" but barely governed — which is why every section also shows depth (avg rules per covered node). Reach is necessary, not sufficient. Use it to find the parts of your API nobody wrote a rule for.</p>
    <p class="muted small">Runs entirely in your browser against the API Commons catalog (or your own pasted ruleset). Nothing you paste leaves the page.</p>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#about-close')!.addEventListener('click', () => el.remove());
  el.querySelector('.about-backdrop')!.addEventListener('click', () => el.remove());
}
