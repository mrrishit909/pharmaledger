import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, RULE_PACK } from '../src/index.js';
import { golden, FIXTURES } from '../fixtures/index.js';

test('report snapshot is deep-frozen; mutation attempts throw in strict mode', () => {
  const { report } = reconcile(golden);
  assert.ok(Object.isFrozen(report));
  assert.throws(() => { report.summary.counts.findings = 0; }, TypeError);
  assert.throws(() => { report.findings.push({}); }, TypeError);
  assert.throws(() => { report.findings[0].ruleId = 'X'; }, TypeError);
  assert.throws(() => { report.rows[0].status = 'accepted'; }, TypeError);
  assert.throws(() => { report.input.transactions[0].amountCents = 1; }, TypeError);
  assert.throws(() => { report.summary.totals.accepted.netCents = 0; }, TypeError);
  assert.throws(() => { delete report.findings[0].message; }, TypeError);
  assert.throws(() => { report.extra = 1; }, TypeError);
  assert.equal(report.summary.counts.findings, 7);
});

test('rule pack and fixtures are deep-frozen', () => {
  assert.throws(() => { RULE_PACK.rules[0].ruleId = 'HACK'; }, TypeError);
  assert.throws(() => { golden.transactions[0].amountCents = 0; }, TypeError);
  assert.throws(() => { FIXTURES.golden.data.sites.push({}); }, TypeError);
});
