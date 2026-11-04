import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, validateData, LIMITS, measureDepth, parseCalendarDate, toDayNumber, checkedAdd, checkedSubtract, OverflowError } from '../src/index.js';
import { golden, empty } from '../fixtures/index.js';
import { clone, text, expectReject, tx } from './helpers.js';

test('golden fixture parses and validates', () => {
  const r = parseInput(text(golden));
  assert.equal(r.ok, true);
  assert.equal(r.data.transactions.length, 6);
});

test('empty fixture validates', () => {
  assert.equal(parseInput(text(empty)).ok, true);
});

test('non-string input, invalid JSON and non-object root reject', () => {
  expectReject(parseInput(42), 'WRONG_TYPE');
  expectReject(parseInput('{not json'), 'INVALID_JSON');
  expectReject(parseInput('[]'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput('null'), 'ROOT_NOT_OBJECT');
  expectReject(parseInput('"pharma-demo-1"'), 'ROOT_NOT_OBJECT');
});

test('unknown schemaVersion and ruleVersion reject', () => {
  const a = clone(golden); a.schemaVersion = 'pharma-demo-2';
  expectReject(parseInput(text(a)), 'UNKNOWN_SCHEMA_VERSION', 'schemaVersion');
  const b = clone(golden); b.ruleVersion = 'pharma-reconcile-9';
  expectReject(parseInput(text(b)), 'UNKNOWN_RULE_VERSION', 'ruleVersion');
  const c = clone(golden); delete c.ruleVersion; // ruleVersion is optional when absent
  assert.equal(parseInput(text(c)).ok, true);
});

test('missing required keys and unknown keys reject with row-level paths', () => {
  const a = clone(golden); delete a.sites;
  expectReject(parseInput(text(a)), 'MISSING_KEY', '$.sites');
  const b = clone(golden); b.extra = 1;
  expectReject(parseInput(text(b)), 'UNKNOWN_KEY', '$.extra');
  const c = clone(golden); delete c.transactions[2].amountCents;
  expectReject(parseInput(text(c)), 'MISSING_KEY', '$.transactions[2].amountCents');
  const d = clone(golden); d.transactions[1].ndc = '123';
  expectReject(parseInput(text(d)), 'UNKNOWN_KEY', '$.transactions[1].ndc');
  const e = clone(golden); e.sites[0].notes = 'x';
  expectReject(parseInput(text(e)), 'UNKNOWN_KEY', '$.sites[0].notes');
});

test('wrong types and string coercions reject', () => {
  const a = clone(golden); a.transactions[0].quantityUnits = '10';
  expectReject(parseInput(text(a)), 'WRONG_TYPE', '$.transactions[0].quantityUnits');
  const b = clone(golden); b.transactions[0].amountCents = '10000';
  expectReject(parseInput(text(b)), 'WRONG_TYPE', '$.transactions[0].amountCents');
  const c = clone(golden); c.transactions[0].transactionId = 1;
  expectReject(parseInput(text(c)), 'WRONG_TYPE', '$.transactions[0].transactionId');
  const d = clone(golden); d.sites = {};
  expectReject(parseInput(text(d)), 'WRONG_TYPE', '$.sites');
  const e = clone(golden); e.transactions[0] = 'T1';
  expectReject(parseInput(text(e)), 'WRONG_TYPE', '$.transactions[0]');
  const f = clone(golden); f.transactions[0].evidenceId = 7;
  expectReject(parseInput(text(f)), 'WRONG_TYPE', '$.transactions[0].evidenceId');
});

test('duplicate primary IDs reject atomically', () => {
  const a = clone(golden); a.sites[1].siteId = 'H1';
  expectReject(parseInput(text(a)), 'DUPLICATE_ID', '$.sites[1].siteId');
  const b = clone(golden); b.evidence[1].evidenceId = 'E1';
  expectReject(parseInput(text(b)), 'DUPLICATE_ID', '$.evidence[1].evidenceId');
  const c = clone(golden); c.transactions[1].transactionId = 'T1';
  expectReject(parseInput(text(c)), 'DUPLICATE_ID', '$.transactions[1].transactionId');
});

test('unresolved references reject where the spec says schema error', () => {
  const a = clone(golden); a.transactions[0].evidenceId = 'E404';
  expectReject(parseInput(text(a)), 'UNRESOLVED_REFERENCE', '$.transactions[0].evidenceId');
  const b = clone(golden); b.evidence[0].siteId = 'H404';
  expectReject(parseInput(text(b)), 'UNRESOLVED_REFERENCE', '$.evidence[0].siteId');
  const c = clone(golden); c.transactions[5].reversesId = 'T404';
  expectReject(parseInput(text(c)), 'UNRESOLVED_REFERENCE', '$.transactions[5].reversesId');
});

test('transaction siteId is opaque: unknown site is not a schema error', () => {
  const r = parseInput(text(golden));
  assert.equal(r.ok, true);
  assert.equal(r.data.transactions[1].siteId, 'H9');
});

test('enum violations reject', () => {
  const a = clone(golden); a.evidence[0].illustrativeEligibility = 'maybe';
  expectReject(parseInput(text(a)), 'INVALID_ENUM', 'illustrativeEligibility');
  const b = clone(golden); b.transactions[0].kind = 'refund';
  expectReject(parseInput(text(b)), 'INVALID_ENUM', 'kind');
});

test('string length bounds: 200 characters allowed, 201 rejected; empty rejected', () => {
  const a = clone(golden); a.transactions[0].memberId = 'm'.repeat(200);
  assert.equal(parseInput(text(a)).ok, true);
  const b = clone(golden); b.transactions[0].memberId = 'm'.repeat(201);
  expectReject(parseInput(text(b)), 'STRING_TOO_LONG', '$.transactions[0].memberId');
  const c = clone(golden); c.sites[0].siteId = '';
  expectReject(parseInput(text(c)), 'EMPTY_STRING', '$.sites[0].siteId');
});

test('integer rules: fractional, negative, zero quantity, -0, over-limit, NaN/Infinity literals', () => {
  const a = clone(golden); a.transactions[0].quantityUnits = 1.5;
  expectReject(parseInput(text(a)), 'INVALID_INTEGER', 'quantityUnits');
  const b = clone(golden); b.transactions[0].quantityUnits = -1;
  expectReject(parseInput(text(b)), 'OUT_OF_RANGE', 'quantityUnits');
  const c = clone(golden); c.transactions[0].quantityUnits = 0;
  expectReject(parseInput(text(c)), 'OUT_OF_RANGE', 'quantityUnits');
  const d = clone(golden); d.transactions[0].amountCents = -1;
  expectReject(parseInput(text(d)), 'OUT_OF_RANGE', 'amountCents');
  const e = clone(golden); e.transactions[0].amountCents = 0.5;
  expectReject(parseInput(text(e)), 'INVALID_INTEGER', 'amountCents');
  const f = clone(golden); f.transactions[0].amountCents = LIMITS.maxAmountCents + 1;
  expectReject(parseInput(text(f)), 'OUT_OF_RANGE', 'amountCents');
  const g = clone(golden); g.transactions[0].quantityUnits = LIMITS.maxQuantityUnits + 1;
  expectReject(parseInput(text(g)), 'OUT_OF_RANGE', 'quantityUnits');
  const h = text(golden).replace('"amountCents":10000', '"amountCents":NaN');
  expectReject(parseInput(h), 'INVALID_JSON');
  const i = text(golden).replace('"amountCents":10000', '"amountCents":1e999');
  expectReject(parseInput(i), 'INVALID_INTEGER');
  const j = text(golden).replace('"amountCents":10000', '"amountCents":-0');
  expectReject(parseInput(j), 'INVALID_INTEGER');
  const k = clone(golden); k.transactions[0].amountCents = 0; // zero cents allowed
  assert.equal(parseInput(text(k)).ok, true);
  const l = clone(golden); l.transactions[0].amountCents = 9007199254740993;
  expectReject(parseInput(text(l)), 'INVALID_INTEGER');
});

test('calendar dates: real days only, leap years, UTC day arithmetic', () => {
  assert.equal(parseCalendarDate('2024-02-29').day, 29);
  assert.equal(parseCalendarDate('2026-02-29'), null);
  assert.equal(parseCalendarDate('2100-02-29'), null);
  assert.equal(parseCalendarDate('2000-02-29').day, 29);
  assert.equal(parseCalendarDate('2026-04-31'), null);
  assert.equal(parseCalendarDate('2026-13-01'), null);
  assert.equal(parseCalendarDate('2026-00-10'), null);
  assert.equal(parseCalendarDate('2026-1-1'), null);
  assert.equal(parseCalendarDate('2026-03-10T00:00:00Z'), null);
  assert.equal(toDayNumber(1970, 1, 1), 0);
  assert.equal(parseCalendarDate('2026-06-01').dayNumber - parseCalendarDate('2026-05-31').dayNumber, 1);
  assert.equal(parseCalendarDate('2027-01-01').dayNumber - parseCalendarDate('2026-01-01').dayNumber, 365);
  assert.equal(parseCalendarDate('2025-01-01').dayNumber - parseCalendarDate('2024-01-01').dayNumber, 366);
  const a = clone(golden); a.transactions[0].dispenseDate = '2026-02-30';
  expectReject(parseInput(text(a)), 'INVALID_DATE', '$.transactions[0].dispenseDate');
  const b = clone(golden); b.sites[0].validFrom = '2026-12-31'; b.sites[0].validThrough = '2026-01-01';
  expectReject(parseInput(text(b)), 'INVALID_DATE_RANGE', '$.sites[0].validThrough');
  const c = clone(golden); c.sites[0].validThrough = 'yesterday';
  expectReject(parseInput(text(c)), 'INVALID_DATE', '$.sites[0].validThrough');
});

test('reversesId shape: null for dispense, existing ID for reversal', () => {
  const a = clone(golden); a.transactions[0].reversesId = 'T2';
  expectReject(parseInput(text(a)), 'INVALID_REVERSAL', '$.transactions[0].reversesId');
  const b = clone(golden); b.transactions[5].reversesId = null;
  expectReject(parseInput(text(b)), 'WRONG_TYPE', '$.transactions[5].reversesId');
});

test('row limits: 5,000 transactions allowed, 5,001 rejected; sites and evidence limits enforced', () => {
  const ok = clone(empty);
  ok.sites = [{ siteId: 'H1', validFrom: '2026-01-01', validThrough: '2026-12-31' }];
  for (let i = 0; i < LIMITS.maxTransactions; i += 1) ok.transactions.push(tx(`T${String(i).padStart(5, '0')}`, `X${i}`, 'M1', 'H1', null, '2026-03-10', 'dispense', 1, 1));
  assert.equal(validateData(ok).ok, true);
  ok.transactions.push(tx('T99999', 'X99999', 'M1', 'H1', null, '2026-03-10', 'dispense', 1, 1));
  expectReject(validateData(ok), 'TOO_MANY_ROWS', '$.transactions');
  const s = clone(empty);
  for (let i = 0; i <= LIMITS.maxSites; i += 1) s.sites.push({ siteId: `H${i}`, validFrom: '2026-01-01', validThrough: '2026-12-31' });
  expectReject(validateData(s), 'TOO_MANY_ROWS', '$.sites');
  const e = clone(empty);
  e.sites = [{ siteId: 'H1', validFrom: '2026-01-01', validThrough: '2026-12-31' }];
  for (let i = 0; i <= LIMITS.maxEvidence; i += 1) e.evidence.push({ evidenceId: `E${i}`, memberId: 'M1', siteId: 'H1', illustrativeEligibility: 'yes' });
  expectReject(validateData(e), 'TOO_MANY_ROWS', '$.evidence');
});

test('raw text over 1 MiB of UTF-8 rejects before parsing (built in memory)', () => {
  const pad = 'x'.repeat(LIMITS.maxInputBytes);
  expectReject(parseInput(`{"schemaVersion":"pharma-demo-1","sites":[],"evidence":[],"transactions":[],"pad":"${pad}"}`), 'INPUT_TOO_LARGE');
  // Multi-byte characters count as UTF-8 bytes, not code units.
  const multi = 'é'.repeat(Math.floor(LIMITS.maxInputBytes / 2) + 1);
  expectReject(parseInput(`"${multi}"`), 'INPUT_TOO_LARGE');
  assert.ok(parseInput(`"${'é'.repeat(10)}"`).errors[0].code === 'ROOT_NOT_OBJECT');
});

test('nesting depth over 8 rejects; depth 8 reaches validation', () => {
  assert.equal(measureDepth(1), 1);
  assert.equal(measureDepth({}), 1);
  assert.equal(measureDepth(golden), 3);
  const deep = '['.repeat(9) + ']'.repeat(9);
  expectReject(parseInput(deep), 'NESTING_TOO_DEEP');
  const eight = '['.repeat(8) + ']'.repeat(8);
  expectReject(parseInput(eight), 'ROOT_NOT_OBJECT');
  const a = clone(golden); a.sites[0].siteId = JSON.parse('[[[[[[[[1]]]]]]]]');
  expectReject(parseInput(text(a)), 'NESTING_TOO_DEEP');
});

test('any error yields no partial data: errors array only, multiple errors reported', () => {
  const a = clone(golden);
  a.transactions[0].quantityUnits = -3;
  a.transactions[3].dispenseDate = '2026-04-31';
  const r = parseInput(text(a));
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2);
  assert.equal(r.data, undefined);
});

test('checked integer arithmetic rejects overflow and bad operands', () => {
  assert.equal(checkedAdd(1, 2), 3);
  assert.equal(checkedAdd(Number.MAX_SAFE_INTEGER - 1, 1), Number.MAX_SAFE_INTEGER);
  assert.throws(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1), OverflowError);
  assert.throws(() => checkedAdd(1, -1), OverflowError);
  assert.throws(() => checkedAdd(1.5, 1), OverflowError);
  assert.throws(() => checkedAdd(1, NaN), OverflowError);
  assert.throws(() => checkedAdd('1', 1), OverflowError);
  assert.equal(checkedSubtract(5, 7), -2);
  assert.throws(() => checkedSubtract(Number.MAX_SAFE_INTEGER, -1), OverflowError);
  try { checkedAdd(Number.MAX_SAFE_INTEGER, 1); } catch (e) { assert.equal(e.code, 'INTEGER_OVERFLOW'); }
});
