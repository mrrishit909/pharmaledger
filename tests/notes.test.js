import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, createReviewLayer, setNote, setDecision, DECISIONS, LIMITS, buildExport } from '../src/index.js';
import { golden } from '../fixtures/index.js';
import { text, sha256Hex } from './helpers.js';

test('adding notes and decisions leaves the validation output byte-identical', () => {
  const { report } = reconcile(golden);
  const before = JSON.stringify(report);
  let layer = createReviewLayer();
  let r = setNote(layer, report, 'T4:EVIDENCE_MEMBER_MISMATCH', 'Member mismatch confirmed against synthetic evidence E3.');
  assert.equal(r.ok, true); layer = r.layer;
  r = setDecision(layer, report, 'T4:EVIDENCE_MEMBER_MISMATCH', 'confirmed-exception');
  assert.equal(r.ok, true); layer = r.layer;
  r = setNote(layer, report, 'T5:DUPLICATE_EVENT', '<script>alert(1)</script>');
  assert.equal(r.ok, true); layer = r.layer;
  assert.equal(JSON.stringify(report), before);
  assert.equal(layer.notes.size, 2);
  assert.equal(layer.decisions.get('T4:EVIDENCE_MEMBER_MISMATCH'), 'confirmed-exception');
  assert.equal(report.findings.length, 7, 'original findings never removed');
  assert.equal('note' in report.findings[0], false);
});

test('review layer is bounded and validated', () => {
  const { report } = reconcile(golden);
  const layer = createReviewLayer();
  assert.equal(setNote(layer, report, 'T9:NOPE', 'x').error.code, 'UNKNOWN_FINDING');
  assert.equal(setNote(layer, report, 'T5:DUPLICATE_EVENT', 'x'.repeat(LIMITS.maxNoteLength)).ok, true);
  assert.equal(setNote(layer, report, 'T5:DUPLICATE_EVENT', 'x'.repeat(LIMITS.maxNoteLength + 1)).error.code, 'NOTE_TOO_LONG');
  assert.equal(setNote(layer, report, 'T5:DUPLICATE_EVENT', 42).error.code, 'WRONG_TYPE');
  assert.equal(setDecision(layer, report, 'T5:DUPLICATE_EVENT', 'approved').error.code, 'INVALID_ENUM');
  assert.equal(setDecision(layer, report, 'T9:NOPE', 'escalated').error.code, 'UNKNOWN_FINDING');
  assert.deepEqual([...DECISIONS], ['unreviewed', 'confirmed-exception', 'explained-no-action', 'escalated']);
  assert.ok(Object.isFrozen(layer));
  assert.equal(layer.notes.size, 0, 'setters return new layers, never mutate the old one');
});

test('export carries notes and decisions as sorted entries, separate from findings', () => {
  const { report } = reconcile(golden);
  let layer = createReviewLayer();
  layer = setNote(layer, report, 'T5:DUPLICATE_EVENT', 'later note').layer;
  layer = setNote(layer, report, 'T2:UNKNOWN_SITE', 'earlier note').layer;
  layer = setDecision(layer, report, 'T2:UNKNOWN_SITE', 'escalated').layer;
  const exp = buildExport(report, { generatedAt: '2026-11-04T02:00:00Z', sourceHash: sha256Hex(text(golden)), notes: layer.notes, decisions: layer.decisions });
  assert.deepEqual(exp.review.notes, [
    { findingId: 'T2:UNKNOWN_SITE', text: 'earlier note' },
    { findingId: 'T5:DUPLICATE_EVENT', text: 'later note' },
  ]);
  assert.deepEqual(exp.review.decisions, [{ findingId: 'T2:UNKNOWN_SITE', decision: 'escalated' }]);
  assert.deepEqual(exp.findings, report.findings);
});
