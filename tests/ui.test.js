import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../src/index.js';
import { golden, clean, empty } from '../fixtures/index.js';
import { summaryCards, resultsState, STATE_TEXT, filterFindings, findingLabel, bytesToHex } from '../app/ui.js';

const goldenReport = reconcile(golden).report;

test('summaryCards reads the golden headline figures from the engine summary', () => {
  const cards = Object.fromEntries(summaryCards(goldenReport.summary));
  assert.equal(cards['Raw signed cents'], 27000);
  assert.equal(cards['Accepted net cents'], 17000);
  assert.equal(cards['Accepted net units'], 12);
  assert.equal(cards['Imported rows'], 6);
  assert.equal(cards['Duplicate rows excluded'], 1);
  assert.equal(cards['Findings'], 7);
  assert.ok(summaryCards(goldenReport.summary).every(([, v]) => Number.isSafeInteger(v)));
});

test('resultsState distinguishes initial, empty, zero-findings and findings', () => {
  assert.equal(resultsState(null), 'initial');
  assert.equal(resultsState(reconcile(empty).report), 'empty');
  assert.equal(resultsState(reconcile(clean).report), 'zero-findings');
  assert.equal(resultsState(goldenReport), 'findings');
  assert.notEqual(STATE_TEXT.empty, STATE_TEXT['zero-findings']);
  assert.doesNotMatch(STATE_TEXT['zero-findings'], /eligible|compliant|approved/i);
});

test('filterFindings filters by rule group, rule id, row status and decision', () => {
  const all = goldenReport.findings;
  assert.equal(filterFindings(all).length, all.length);
  const unresolved = filterFindings(all, { rule: 'unresolved-evidence' });
  assert.ok(unresolved.length > 0);
  assert.ok(unresolved.every((f) => ['MISSING_EVIDENCE', 'ELIGIBILITY_UNRESOLVED'].includes(f.ruleId)));
  assert.ok(filterFindings(all, { rule: 'DUPLICATE_EVENT' }).every((f) => f.ruleId === 'DUPLICATE_EVENT'));
  assert.deepEqual(filterFindings(all, { status: 'duplicate' }).map((f) => f.transactionId), ['T5']);
  const decided = new Map([[all[0].findingId, 'escalated']]);
  const decisionOf = (id) => decided.get(id) ?? 'unreviewed';
  assert.deepEqual(filterFindings(all, { decision: 'escalated' }, decisionOf), [all[0]]);
  assert.equal(filterFindings(all, { decision: 'unreviewed' }, decisionOf).length, all.length - 1);
  assert.equal(filterFindings(all, { rule: 'NOPE' }).length, 0);
});

test('findingLabel and bytesToHex are plain string helpers', () => {
  const f = goldenReport.findings[0];
  assert.equal(findingLabel(f, 'escalated'), `${f.transactionId} · ${f.ruleId} · ${f.rowStatus} · escalated`);
  assert.equal(bytesToHex(new Uint8Array([0, 1, 255]).buffer), '0001ff');
});
