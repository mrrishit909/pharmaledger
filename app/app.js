// PharmaLedger synthetic workbench. Wires the real engine in ../src to the page.
// Seeded synthetic fixtures ONLY: no file import, no paste, no network. All DOM text is set
// through textContent/createElement; no innerHTML, no eval.
import {
  reconcileText, buildExport, serializeExport, buildFindingsCsv,
  createReviewLayer, setNote, setDecision, DECISIONS, RULE_IDS, ruleById,
} from '../src/index.js';
import { FIXTURES, fixtureText, SYNTHETIC_FIXTURE_NOTICE } from '../fixtures/index.js';
import { summaryCards, resultsState, STATE_TEXT, filterFindings, bytesToHex } from './ui.js';

const $ = (id) => document.getElementById(id);
const PANELS = ['totals-panel', 'rows-panel', 'worklist-panel', 'export-panel'];
const state = { report: null, sourceText: '', layer: createReviewLayer(), selected: null, opener: null };

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}
const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
const fmt = (n) => Number(n).toLocaleString('en-US');

function message(kind, title, items = []) {
  const box = $('messages');
  clear(box);
  box.className = `messages ${kind}`;
  box.append(el('strong', { text: title }));
  if (items.length) box.append(el('ul', {}, items.map((t) => el('li', { text: t }))));
}

// 1. Seed selection (bundled synthetic fixtures only) ----------------------------
function selectedFixture() { return FIXTURES[$('fixture-select').value] ?? FIXTURES.golden; }
function initFixtures() {
  const select = $('fixture-select');
  for (const f of Object.values(FIXTURES)) select.append(el('option', { value: f.name, text: f.label }));
  select.addEventListener('change', previewFixture);
  previewFixture();
}
function previewFixture() {
  const f = selectedFixture();
  $('seed-preview').textContent = fixtureText(f.data);
  message('', `Selected synthetic seed "${f.name}". ${SYNTHETIC_FIXTURE_NOTICE}`);
}
function run() {
  const f = selectedFixture();
  const text = fixtureText(f.data);
  const result = reconcileText(text);
  closeDetail(false);
  for (const id of PANELS) $(id).hidden = !result.ok;
  if (!result.ok) {
    state.report = null;
    message('error', `Seed "${f.name}" rejected atomically (${result.errors.length} error${result.errors.length === 1 ? '' : 's'}); no partial report was produced.`,
      result.errors.map((e) => `${e.code} at ${e.path}: ${e.message}`));
    return;
  }
  state.report = result.report;
  state.sourceText = text;
  state.layer = createReviewLayer();
  state.selected = null;
  const c = result.report.summary.counts;
  message('', `Reconciled seed "${f.name}": ${c.importedRows} imported rows under ${result.report.ruleVersion}; ${c.acceptedRows} accepted, ${c.duplicateRows} duplicate, ${c.findings} findings on ${c.flaggedRows} rows. ${result.report.syntheticLabel}`);
  renderCards();
  renderTotals();
  renderRows();
  renderFindings();
}

// 2. Totals ------------------------------------------------------------------
function renderCards() {
  const box = $('cards');
  clear(box);
  for (const [label, value] of summaryCards(state.report.summary)) {
    box.append(el('div', {}, [el('dt', { text: label }), el('dd', { text: fmt(value) })]));
  }
}
function ledgerColumn(title, lines) {
  const dl = el('dl');
  for (const [label, value, total] of lines) {
    dl.append(el('dt', { text: label, class: total ? 'total' : '' }), el('dd', { text: fmt(value), class: total ? 'total' : '' }));
  }
  return el('section', {}, [el('h3', { text: title }), dl]);
}
function renderTotals() {
  const { totals, counts } = state.report.summary;
  $('totals-unit').textContent = `Unit: ${totals.unit}. ${state.report.acceptedMeaning}`;
  const ledger = $('totals-ledger');
  clear(ledger);
  ledger.append(
    ledgerColumn('Raw (all imported rows, duplicate included)', [
      ['Dispense cents', totals.raw.dispenseCents], ['Reversal cents', totals.raw.reversalCents], ['Signed cents', totals.raw.signedCents, true],
      ['Dispense units', totals.raw.dispenseUnits], ['Reversal units', totals.raw.reversalUnits], ['Net units', totals.raw.netUnits, true],
    ]),
    ledgerColumn('Accepted (after deduplication)', [
      ['Gross dispense cents', totals.accepted.grossDispenseCents], ['Reversal cents', totals.accepted.reversalCents], ['Net cents', totals.accepted.netCents, true],
      ['Gross units', totals.accepted.grossUnits], ['Reversal units', totals.accepted.reversalUnits], ['Net units', totals.accepted.netUnits, true],
    ]),
  );
  const dl = $('counts');
  clear(dl);
  const entries = [
    ['Imported rows', counts.importedRows], ['Duplicate rows excluded', counts.duplicateRows], ['Accepted rows', counts.acceptedRows],
    ['Accepted dispenses', counts.acceptedDispenses], ['Accepted reversals', counts.acceptedReversals], ['Reversed dispenses', counts.reversedDispenses],
    ['Flagged rows', counts.flaggedRows], ['Findings', counts.findings],
    ...RULE_IDS.map((id) => [id, counts.ruleCounts[id]]),
  ];
  for (const [k, v] of entries) dl.append(el('div', {}, [el('dt', { text: k }), el('dd', { text: fmt(v) })]));
}

// 3. Rows ---------------------------------------------------------------------
function statusPill(status) {
  return el('span', { class: `status-pill status-${status}`, text: status });
}
function renderRows() {
  const tbody = $('rows-table').querySelector('tbody');
  clear(tbody);
  for (const row of state.report.rows) {
    const t = row.record;
    const lineage = row.duplicateOf ? `duplicate of ${row.duplicateOf}` : row.reversedBy ? `reversed by ${row.reversedBy}` : t.reversesId ? `reverses ${t.reversesId}` : '';
    tbody.append(el('tr', { class: row.status }, [
      el('td', { text: t.transactionId, class: 'mono' }), el('td', { text: t.eventKey, class: 'mono' }), el('td', { text: t.kind }),
      el('td', { text: t.memberId, class: 'mono' }), el('td', { text: t.siteId, class: 'mono' }), el('td', { text: t.evidenceId ?? 'null', class: 'mono' }),
      el('td', { text: t.dispenseDate, class: 'mono' }), el('td', { text: fmt(t.quantityUnits), class: 'num' }), el('td', { text: fmt(t.amountCents), class: 'num' }),
      el('td', { class: 'status' }, [statusPill(row.status)]), el('td', { text: lineage, class: 'lineage' }), el('td', { text: String(row.findingIds.length), class: 'num' }),
    ]));
  }
}

// 4. Worklist -----------------------------------------------------------------
function initFilters() {
  const rule = $('filter-rule');
  rule.append(el('option', { value: '', text: 'any rule' }), el('option', { value: 'unresolved-evidence', text: 'unresolved evidence (MISSING_EVIDENCE + ELIGIBILITY_UNRESOLVED)' }));
  for (const id of RULE_IDS) rule.append(el('option', { value: id, text: id }));
  const decision = $('filter-decision');
  decision.append(el('option', { value: '', text: 'any decision' }));
  for (const d of DECISIONS) decision.append(el('option', { value: d, text: d }));
  for (const id of ['filter-rule', 'filter-status', 'filter-decision']) $(id).addEventListener('change', renderFindings);
}
function decisionOf(findingId) { return state.layer.decisions.get(findingId) ?? 'unreviewed'; }
function syncExpanded() {
  for (const b of $('findings-list').querySelectorAll('button.finding')) {
    const on = b.dataset.findingId === state.selected;
    b.setAttribute('aria-expanded', String(on));
    if (on) state.opener = b;
  }
}
function renderFindings() {
  if (!state.report) return;
  const list = $('findings-list');
  clear(list);
  const kind = resultsState(state.report);
  const filters = { rule: $('filter-rule').value, status: $('filter-status').value, decision: $('filter-decision').value };
  const visible = kind === 'findings' ? filterFindings(state.report.findings, filters, decisionOf) : [];
  $('filter-count').textContent = `${visible.length} of ${state.report.findings.length} findings shown`;
  const stateBox = $('results-state');
  stateBox.dataset.state = kind;
  stateBox.textContent = kind !== 'findings' ? STATE_TEXT[kind] : visible.length ? '' : STATE_TEXT['no-match'];
  stateBox.hidden = stateBox.textContent === '';
  for (const f of visible) {
    const btn = el('button', { type: 'button', class: 'finding', 'data-finding-id': f.findingId, 'aria-controls': 'detail', 'aria-expanded': 'false' }, [
      el('span', { class: 'mono', text: `${f.transactionId} · ${f.rowStatus} · ${decisionOf(f.findingId)}` }),
      el('span', { class: 'rule', text: f.ruleId }),
      el('span', { class: 'msg', text: f.message }),
    ]);
    btn.addEventListener('click', () => openDetail(f, btn));
    list.append(el('li', {}, [btn]));
  }
  syncExpanded();
}
function openDetail(f, opener) {
  state.selected = f.findingId;
  state.opener = opener;
  syncExpanded();
  renderDrilldown(f);
  const panel = $('detail');
  panel.hidden = false;
  panel.focus();
}
function closeDetail(restoreFocus = true) {
  const panel = $('detail');
  if (panel.hidden) return;
  panel.hidden = true;
  state.selected = null;
  const opener = state.opener;
  state.opener = null;
  syncExpanded();
  if (restoreFocus) (opener?.isConnected ? opener : $('filter-rule')).focus();
}
function recordList(record, keys) {
  const dl = el('dl');
  for (const k of keys) dl.append(el('dt', { text: k }), el('dd', { text: record[k] === null || record[k] === undefined ? 'null' : String(record[k]) }));
  return dl;
}
const TX_KEYS = ['transactionId', 'eventKey', 'memberId', 'siteId', 'evidenceId', 'dispenseDate', 'kind', 'quantityUnits', 'amountCents', 'reversesId'];
function renderDrilldown(f) {
  const box = $('detail-body');
  clear(box);
  $('detail-title').textContent = f.findingId;
  const { input, rows } = state.report;
  const row = rows.find((r) => r.record.transactionId === f.transactionId);
  const rule = ruleById(f.ruleId);
  box.append(el('p', { text: f.message }));
  box.append(el('h4', { text: `Rule ${f.ruleId} (${f.ruleVersion}, fictional demo configuration)` }), el('p', { class: 'muted', text: rule ? `${rule.description} Applies to: ${rule.appliesTo}.` : 'Rule text unavailable.' }));
  box.append(el('h4', { text: 'Cited transaction (supplied record, unmodified)' }), recordList(row.record, TX_KEYS));
  box.append(el('h4', { text: 'Row status and lineage' }), recordList({ status: row.status, accepted: row.accepted, duplicateOf: row.duplicateOf, reversedBy: row.reversedBy }, ['status', 'accepted', 'duplicateOf', 'reversedBy']));
  const ev = row.record.evidenceId === null ? null : input.evidence.find((e) => e.evidenceId === row.record.evidenceId);
  box.append(el('h4', { text: 'Linked evidence (supplied fixture label, never a legal determination)' }));
  box.append(ev ? recordList(ev, ['evidenceId', 'memberId', 'siteId', 'illustrativeEligibility']) : el('p', { class: 'muted', text: 'evidenceId is null: unresolved, not automatically ineligible.' }));
  const site = input.sites.find((s) => s.siteId === row.record.siteId);
  box.append(el('h4', { text: 'Site demo window' }));
  box.append(site ? recordList(site, ['siteId', 'validFrom', 'validThrough']) : el('p', { class: 'muted', text: `Site "${row.record.siteId}" is absent from the supplied list; no registration is guessed.` }));

  // Review layer: separate from the frozen report; setters return new layers. Notes render as text only.
  const decision = el('select', { id: 'decision-select', 'aria-label': 'Decision' });
  for (const d of DECISIONS) decision.append(el('option', { value: d, text: d, ...(decisionOf(f.findingId) === d ? { selected: '' } : {}) }));
  const note = el('textarea', { id: 'note-text', rows: '3', maxlength: '2000', 'aria-label': 'Reviewer note (max 2,000 characters)', placeholder: 'Reviewer note (stored beside the report, never inside it)' });
  note.value = state.layer.notes.get(f.findingId) ?? '';
  const apply = el('button', { type: 'button', text: 'Record decision and note' });
  const status = el('p', { class: 'muted', role: 'status' });
  apply.addEventListener('click', () => {
    const d = setDecision(state.layer, state.report, f.findingId, decision.value);
    if (!d.ok) { status.textContent = `${d.error.code}: ${d.error.message}`; return; }
    const n = setNote(d.layer, state.report, f.findingId, note.value);
    if (!n.ok) { status.textContent = `${n.error.code}: ${n.error.message}`; return; }
    state.layer = n.layer;
    status.textContent = `Recorded for ${f.findingId}. Source report unchanged (frozen).`;
    renderFindings();
  });
  box.append(el('div', { class: 'review' }, [el('h4', { text: 'Review decision (does not modify source)' }), decision, note, apply, status]));
}

// 5. Export -------------------------------------------------------------------
async function sha256Hex(text) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function exportJson() {
  if (!state.report) return;
  const generatedAt = new Date().toISOString();
  const sourceHash = await sha256Hex(state.sourceText);
  const serialized = serializeExport(buildExport(state.report, { generatedAt, sourceHash, notes: state.layer.notes, decisions: state.layer.decisions }));
  if (!serialized.ok) { message('error', `${serialized.error.code}: ${serialized.error.message}`); return; }
  download('pharmaledger-synthetic-reconciliation.json', serialized.text, 'application/json');
  message('', `Exported ${fmt(serialized.bytes)} bytes of JSON (synthetic demo export, SHA-256 ${sourceHash.slice(0, 12)}...).`);
}
function exportCsv() {
  if (!state.report) return;
  const csv = buildFindingsCsv(state.report, state.layer);
  download('pharmaledger-synthetic-findings.csv', csv, 'text/csv');
  message('', `Exported ${state.report.findings.length} findings as formula-safe CSV (synthetic demo data column included).`);
}

initFixtures();
initFilters();
$('run').addEventListener('click', run);
$('detail-close').addEventListener('click', () => closeDetail());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
$('export-json').addEventListener('click', () => { exportJson().catch((err) => message('error', `Export failed: ${err.message}`)); });
$('export-csv').addEventListener('click', exportCsv);
