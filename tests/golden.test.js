import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, reconcileText, RULE_IDS } from '../src/index.js';
import { golden, clean, empty } from '../fixtures/index.js';
import { text } from './helpers.js';

const result = reconcile(golden);

test('golden fixture reconciles', () => {
  assert.equal(result.ok, true);
  assert.equal(result.report.schemaVersion, 'pharma-demo-1');
  assert.equal(result.report.ruleVersion, 'pharma-reconcile-1');
  assert.equal(result.report.rulePack.ruleVersion, 'pharma-reconcile-1');
  assert.match(result.report.rulePack.provenance.statement, /no legal, regulatory, clinical or 340B authority/);
  assert.match(result.report.rulePack.provenance.source, /PHARMALEDGER-VERTICAL-SLICE\.md/);
  assert.equal(result.report.syntheticData, true);
  assert.match(result.report.syntheticLabel, /SYNTHETIC DEMO DATA/);
});

test('oracle: 6 imported rows, 1 duplicate excluded, 5 accepted = 4 dispenses + 1 reversal', () => {
  const c = result.report.summary.counts;
  assert.equal(c.importedRows, 6);
  assert.equal(c.duplicateRows, 1);
  assert.equal(c.acceptedRows, 5);
  assert.equal(c.acceptedDispenses, 4);
  assert.equal(c.acceptedReversals, 1);
  assert.equal(c.reversedDispenses, 1);
});

test('oracle: four flagged rows, seven findings, each listed rule 1, EVIDENCE_SITE_MISMATCH 0', () => {
  const c = result.report.summary.counts;
  assert.equal(c.flaggedRows, 4);
  assert.equal(c.findings, 7);
  assert.equal(result.report.findings.length, 7);
  assert.deepEqual(c.ruleCounts, {
    DUPLICATE_EVENT: 1,
    UNKNOWN_SITE: 1,
    SITE_OUTSIDE_DEMO_WINDOW: 1,
    MISSING_EVIDENCE: 1,
    EVIDENCE_MEMBER_MISMATCH: 1,
    EVIDENCE_SITE_MISMATCH: 0,
    ILLUSTRATIVE_INELIGIBLE: 1,
    ELIGIBILITY_UNRESOLVED: 1,
  });
  assert.deepEqual(Object.keys(c.ruleCounts), [...RULE_IDS]);
});

test('oracle: expected findings per row, sorted by transactionId then ruleId', () => {
  const byRow = {};
  for (const f of result.report.findings) (byRow[f.transactionId] ||= []).push(f.ruleId);
  assert.deepEqual(byRow, {
    T2: ['MISSING_EVIDENCE', 'UNKNOWN_SITE'],
    T3: ['ILLUSTRATIVE_INELIGIBLE', 'SITE_OUTSIDE_DEMO_WINDOW'],
    T4: ['ELIGIBILITY_UNRESOLVED', 'EVIDENCE_MEMBER_MISMATCH'],
    T5: ['DUPLICATE_EVENT'],
  });
  assert.deepEqual(result.report.findings.map((f) => f.findingId), [
    'T2:MISSING_EVIDENCE', 'T2:UNKNOWN_SITE',
    'T3:ILLUSTRATIVE_INELIGIBLE', 'T3:SITE_OUTSIDE_DEMO_WINDOW',
    'T4:ELIGIBILITY_UNRESOLVED', 'T4:EVIDENCE_MEMBER_MISMATCH',
    'T5:DUPLICATE_EVENT',
  ]);
  for (const f of result.report.findings) assert.equal(f.ruleVersion, 'pharma-reconcile-1');
  assert.equal(result.report.findings.find((f) => f.findingId === 'T5:DUPLICATE_EVENT').cites.duplicateOfTransactionId, 'T1');
});

test('oracle: raw signed cents 27000, accepted signed cents 17000', () => {
  const t = result.report.summary.totals;
  assert.equal(t.raw.dispenseCents, 37000);
  assert.equal(t.raw.reversalCents, 10000);
  assert.equal(t.raw.signedCents, 27000);
  assert.equal(t.accepted.netCents, 17000);
});

test('oracle: accepted gross dispense cents 27000, reversals 10000, net 17000', () => {
  const a = result.report.summary.totals.accepted;
  assert.equal(a.grossDispenseCents, 27000);
  assert.equal(a.reversalCents, 10000);
  assert.equal(a.netCents, 17000);
});

test('oracle: accepted gross units 22, reversal units 10, net units 12; raw net units including duplicate 22', () => {
  const t = result.report.summary.totals;
  assert.equal(t.accepted.grossUnits, 22);
  assert.equal(t.accepted.reversalUnits, 10);
  assert.equal(t.accepted.netUnits, 12);
  assert.equal(t.raw.dispenseUnits, 32);
  assert.equal(t.raw.reversalUnits, 10);
  assert.equal(t.raw.netUnits, 22);
  assert.match(t.unit, /fixture transaction amounts, not savings or repayment/);
});

test('row statuses: T1 reversed (keeps accepted), T5 duplicate, T6 accepted reversal, findings retained for reversed dispenses', () => {
  const rows = Object.fromEntries(result.report.rows.map((r) => [r.record.transactionId, r]));
  assert.equal(rows.T1.status, 'reversed');
  assert.equal(rows.T1.accepted, true);
  assert.equal(rows.T1.reversedBy, 'T6');
  assert.equal(rows.T5.status, 'duplicate');
  assert.equal(rows.T5.accepted, false);
  assert.equal(rows.T5.duplicateOf, 'T1');
  assert.equal(rows.T6.status, 'accepted');
  assert.equal(rows.T6.record.kind, 'reversal');
  assert.deepEqual(rows.T6.findingIds, []);
  assert.deepEqual(rows.T2.findingIds, ['T2:MISSING_EVIDENCE', 'T2:UNKNOWN_SITE']);
  assert.match(result.report.acceptedMeaning, /never 340B-eligible/);
});

test('original input records are preserved untouched inside the report', () => {
  assert.deepEqual(result.report.input.transactions, [...golden.transactions]);
  assert.deepEqual(result.report.input.sites, [...golden.sites]);
  assert.deepEqual(result.report.input.evidence, [...golden.evidence]);
});

test('reconcileText on the golden text matches reconcile on the object', () => {
  const r = reconcileText(text(golden));
  assert.equal(r.ok, true);
  assert.deepEqual(r.report, result.report);
});

test('clean variant: two legitimate repeat fills, zero findings, totals 20000 cents and 20 units', () => {
  const r = reconcile(clean);
  assert.equal(r.ok, true);
  assert.equal(r.report.findings.length, 0);
  assert.equal(r.report.summary.counts.flaggedRows, 0);
  assert.equal(r.report.summary.counts.acceptedRows, 2);
  assert.equal(r.report.summary.totals.raw.signedCents, 20000);
  assert.equal(r.report.summary.totals.accepted.netCents, 20000);
  assert.equal(r.report.summary.totals.accepted.netUnits, 20);
  for (const row of r.report.rows) assert.equal(row.status, 'accepted');
});

test('empty fixture: zero rows, zero findings, zero totals', () => {
  const r = reconcile(empty);
  assert.equal(r.ok, true);
  assert.equal(r.report.rows.length, 0);
  assert.equal(r.report.findings.length, 0);
  assert.equal(r.report.summary.totals.raw.signedCents, 0);
  assert.equal(r.report.summary.totals.accepted.netCents, 0);
  assert.equal(r.report.input.ruleVersion, null);
});
