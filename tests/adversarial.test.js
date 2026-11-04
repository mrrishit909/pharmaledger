// The eight adversarial/invalid/security cases from the spec, by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, reconcileText, buildExport, buildFindingsCsv, csvCell, LIMITS, parseInput } from '../src/index.js';
import { golden, clean, htmlPayload, adversarial } from '../fixtures/index.js';
import { clone, text, expectReject, tx, sha256Hex } from './helpers.js';

test('case 1: duplicate primary IDs, unknown evidence link, conflicting repeated eventKey reject atomically', () => {
  const a = clone(golden); a.transactions[1].transactionId = 'T1';
  expectReject(reconcile(a), 'DUPLICATE_ID');
  const b = clone(golden); b.transactions[0].evidenceId = 'E404';
  expectReject(reconcile(b), 'UNRESOLVED_REFERENCE');
  expectReject(reconcile(adversarial.conflictingDuplicate), 'CONFLICTING_DUPLICATE', '$.transactions[1].eventKey');
  const c = clone(golden); c.transactions[4].dispenseDate = '2026-03-11'; // T5 differs from T1 on date only
  expectReject(reconcile(c), 'CONFLICTING_DUPLICATE');
});

test('case 1: identical duplicate eventKey records yield exactly one flag per later row regardless of ordering', () => {
  const a = clone(golden);
  a.transactions.push(tx('T0', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 10000)); // sorts before T1
  // T0 becomes the kept record, so T1 is duplicate-flagged. The spec requires a reversal to reference one
  // nonduplicate dispense (duplicate target rejects), so the golden reversal T6 must point at T0 here.
  a.transactions[5].reversesId = 'T0';
  const r = reconcile(a);
  assert.equal(r.ok, true);
  const dups = r.report.findings.filter((f) => f.ruleId === 'DUPLICATE_EVENT');
  assert.deepEqual(dups.map((f) => f.transactionId), ['T1', 'T5']);
  assert.ok(dups.every((f) => f.cites.duplicateOfTransactionId === 'T0'));
  const reversed = clone(a); reversed.transactions.reverse();
  assert.deepEqual(reconcile(reversed).report, r.report);
  assert.equal(r.report.summary.counts.duplicateRows, 2);
});

test('case 2: distinct eventKeys with identical member/date/amount are legitimate separate fills', () => {
  const r = reconcile(clean);
  assert.equal(r.ok, true);
  assert.equal(r.report.findings.length, 0);
  assert.equal(r.report.summary.totals.accepted.grossDispenseCents, 20000);
});

test('case 3: unknown site flags without guessing; inclusive endpoints pass, adjacent dates fail; invalid date rejects', () => {
  const base = clone(clean);
  base.sites = [{ siteId: 'H2', validFrom: '2026-06-01', validThrough: '2026-12-31' }];
  base.evidence = [];
  const make = (date) => ({ ...base, transactions: [tx('T1', 'X1', 'M1', 'H2', null, date, 'dispense', 1, 100)] });
  const rules = (date) => reconcile(make(date)).report.findings.map((f) => f.ruleId);
  assert.deepEqual(rules('2026-06-01'), ['MISSING_EVIDENCE']);
  assert.deepEqual(rules('2026-12-31'), ['MISSING_EVIDENCE']);
  assert.deepEqual(rules('2026-05-31'), ['MISSING_EVIDENCE', 'SITE_OUTSIDE_DEMO_WINDOW']);
  assert.deepEqual(rules('2027-01-01'), ['MISSING_EVIDENCE', 'SITE_OUTSIDE_DEMO_WINDOW']);
  const unknown = { ...base, transactions: [tx('T1', 'X1', 'M1', 'H404', null, '2026-07-01', 'dispense', 1, 100)] };
  const ur = reconcile(unknown).report.findings.map((f) => f.ruleId);
  assert.deepEqual(ur, ['MISSING_EVIDENCE', 'UNKNOWN_SITE']); // not SITE_OUTSIDE_DEMO_WINDOW
  expectReject(reconcile(adversarial.invalidCalendarDate), 'INVALID_DATE');
  expectReject(reconcile(make('2026-02-29')), 'INVALID_DATE');
});

test('case 4: reversal of reversal, unknown/duplicate target, second reversal and mismatches reject; no partial reversals', () => {
  expectReject(reconcile(adversarial.reversalOfReversal), 'INVALID_REVERSAL', '$.transactions[2].reversesId');
  expectReject(reconcile(adversarial.secondReversal), 'INVALID_REVERSAL');
  expectReject(reconcile(adversarial.reversalQuantityMismatch), 'INVALID_REVERSAL');
  const unknownTarget = clone(golden); unknownTarget.transactions[5].reversesId = 'T404';
  expectReject(reconcile(unknownTarget), 'UNRESOLVED_REFERENCE');
  const dupTarget = clone(golden); dupTarget.transactions[5].reversesId = 'T5'; // T5 is the duplicate-flagged copy
  expectReject(reconcile(dupTarget), 'INVALID_REVERSAL');
  for (const [field, value] of [['amountCents', 9999], ['memberId', 'M2'], ['siteId', 'H2']]) {
    const m = clone(golden); m.transactions[5][field] = value;
    expectReject(reconcile(m), 'INVALID_REVERSAL', '$.transactions[5]');
  }
  const self = clone(golden); self.transactions[5].reversesId = 'T6';
  expectReject(reconcile(self), 'INVALID_REVERSAL');
  const sameKey = clone(golden); sameKey.transactions[5].eventKey = 'X1';
  assert.equal(reconcile(sameKey).ok, false); // conflicting duplicate group or distinct-eventKey rule
  // Reversal rows produce no findings and the reversed dispense keeps status reversed.
  const ok = reconcile(golden).report;
  assert.equal(ok.findings.some((f) => f.transactionId === 'T6'), false);
  assert.equal(ok.rows.find((r) => r.record.transactionId === 'T1').status, 'reversed');
});

test('case 5: no/unknown eligibility stay illustrative; missing evidence is unresolved; mismatch remains visible', () => {
  const r = reconcile(golden).report;
  const t3 = r.findings.find((f) => f.findingId === 'T3:ILLUSTRATIVE_INELIGIBLE');
  assert.match(t3.message, /fixture label, not a legal determination/);
  const t4 = r.findings.find((f) => f.findingId === 'T4:ELIGIBILITY_UNRESOLVED');
  assert.match(t4.message, /unresolved/);
  const t2 = r.findings.find((f) => f.findingId === 'T2:MISSING_EVIDENCE');
  assert.match(t2.message, /never automatically ineligible/);
  assert.ok(r.findings.find((f) => f.findingId === 'T4:EVIDENCE_MEMBER_MISMATCH'));
  // Flagged rows remain accepted in totals: findings do not alter accepted ledger totals.
  assert.equal(r.summary.totals.accepted.grossDispenseCents, 27000);
  // Site mismatch is produced when evidence site differs from transaction site.
  // T5 repeats T1's eventKey and must stay field-identical (spec: conflicting duplicates reject),
  // and the reversal T6 must still match T1's site, so all three rows move to H2.
  const s = clone(golden); s.transactions[0].siteId = 'H2'; s.transactions[4].siteId = 'H2'; s.transactions[5].siteId = 'H2';
  const sr = reconcile(s).report;
  assert.ok(sr.findings.some((f) => f.findingId === 'T1:EVIDENCE_SITE_MISMATCH'));
});

test('case 6: fractional/negative quantity, noninteger/negative cents, overflow and string coercions reject', () => {
  expectReject(reconcile(adversarial.fractionalQuantity), 'INVALID_INTEGER');
  const a = clone(golden); a.transactions[0].quantityUnits = -10;
  expectReject(reconcile(a), 'OUT_OF_RANGE');
  const b = clone(golden); b.transactions[0].amountCents = 100.25;
  expectReject(reconcile(b), 'INVALID_INTEGER');
  const c = clone(golden); c.transactions[0].amountCents = -100;
  expectReject(reconcile(c), 'OUT_OF_RANGE');
  const d = clone(golden); d.transactions[0].amountCents = Number.MAX_SAFE_INTEGER;
  expectReject(reconcile(d), 'OUT_OF_RANGE');
  const e = clone(golden); e.transactions[0].amountCents = '10000';
  expectReject(reconcile(e), 'WRONG_TYPE');
  const f = clone(golden); f.transactions[0].quantityUnits = true;
  expectReject(reconcile(f), 'WRONG_TYPE');
  // Bounded per-row limits keep 5,000 maximal rows inside safe-integer totals.
  assert.ok(Number.isSafeInteger(LIMITS.maxTransactions * LIMITS.maxAmountCents));
});

test('case 7: HTML/script payloads stay inert strings; formula-leading CSV cells neutralised', () => {
  const r = reconcile(htmlPayload);
  assert.equal(r.ok, true);
  const csv = buildFindingsCsv(r.report);
  assert.ok(csv.includes('<script>'), 'raw string retained as data');
  for (const line of csv.split('\r\n').filter(Boolean)) {
    for (const cell of line.split(',')) assert.doesNotMatch(cell, /^[=+\-@\t\r]/, `formula-leading cell: ${cell}`);
  }
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('\tx'), "\"'\tx\"");
  assert.equal(csvCell('\rx'), "\"'\rx\"");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(12), '12');
  const exp = buildExport(r.report, { generatedAt: '2026-11-04T00:00:00Z', sourceHash: sha256Hex(text(htmlPayload)) });
  assert.equal(exp.findings[0].transactionId, 'T<b>1</b>');
  assert.equal(exp.syntheticData, true);
});

test('case 8: size, nesting and row limits reject without partial data', () => {
  const big = clone(golden);
  big.transactions = [];
  for (let i = 0; i <= LIMITS.maxTransactions; i += 1) big.transactions.push(tx(`T${i}`, `X${i}`, 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 1, 1));
  expectReject(reconcile(big), 'TOO_MANY_ROWS');
  const huge = `{"schemaVersion":"pharma-demo-1","sites":[],"evidence":[],"transactions":[],"pad":"${'p'.repeat(LIMITS.maxInputBytes)}"}`;
  expectReject(reconcileText(huge), 'INPUT_TOO_LARGE');
  expectReject(reconcileText('['.repeat(20) + ']'.repeat(20)), 'NESTING_TOO_DEEP');
  // Reviewer changes never reach the frozen report (see immutability and notes tests); no network or tenant layer exists.
  const r = parseInput(huge);
  assert.equal(r.ok, false);
  assert.equal(r.data, undefined);
});
