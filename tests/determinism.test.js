import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, buildExport, serializeExport } from '../src/index.js';
import { golden } from '../fixtures/index.js';
import { clone, text, sha256Hex } from './helpers.js';

// Deterministic pseudo-random shuffle so the test itself is reproducible.
function shuffle(array, seed) {
  let s = seed;
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test('shuffling input array order does not change the report', () => {
  const base = reconcile(golden).report;
  for (const seed of [1, 7, 42, 1337, 99991]) {
    const s = clone(golden);
    s.transactions = shuffle(s.transactions, seed);
    s.sites = shuffle(s.sites, seed + 1);
    s.evidence = shuffle(s.evidence, seed + 2);
    const r = reconcile(s);
    assert.equal(r.ok, true);
    assert.deepEqual(r.report, base);
    assert.equal(JSON.stringify(r.report), JSON.stringify(base));
  }
});

test('finding IDs are stable across runs and derived from transactionId and ruleId', () => {
  const a = reconcile(golden).report;
  const b = reconcile(clone(golden)).report;
  assert.deepEqual(a.findings.map((f) => f.findingId), b.findings.map((f) => f.findingId));
  for (const f of a.findings) assert.equal(f.findingId, `${f.transactionId}:${f.ruleId}`);
});

test('exports of shuffled inputs serialise byte-identically given the same injected metadata', () => {
  const s = clone(golden);
  s.transactions = shuffle(s.transactions, 5);
  const meta = { generatedAt: '2026-11-04T02:00:00Z', sourceHash: sha256Hex(text(golden)) };
  const a = serializeExport(buildExport(reconcile(golden).report, meta));
  const b = serializeExport(buildExport(reconcile(s).report, meta));
  assert.equal(a.ok, true);
  assert.equal(a.text, b.text);
});
