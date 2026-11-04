import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, buildExport, serializeExport, roundTripExport, buildFindingsCsv, CSV_COLUMNS, LIMITS, EXPORT_VERSION } from '../src/index.js';
import { golden } from '../fixtures/index.js';
import { text, sha256Hex } from './helpers.js';

const { report } = reconcile(golden);
const meta = { generatedAt: '2026-11-04T02:00:00.000Z', sourceHash: sha256Hex(text(golden)) };

test('export carries versions, provenance, synthetic label, injected metadata, snapshot, summary and findings', () => {
  const exp = buildExport(report, meta);
  assert.equal(exp.exportVersion, EXPORT_VERSION);
  assert.equal(exp.schemaVersion, 'pharma-demo-1');
  assert.equal(exp.ruleVersion, 'pharma-reconcile-1');
  assert.equal(exp.rulePack.provenance.kind, 'fictional-demo-configuration');
  assert.equal(exp.syntheticData, true);
  assert.match(exp.syntheticLabel, /SYNTHETIC DEMO DATA/);
  assert.equal(exp.generatedAt, meta.generatedAt);
  assert.equal(exp.sourceHash, meta.sourceHash);
  assert.match(exp.sourceHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(exp.input, report.input);
  assert.deepEqual(exp.summary, report.summary);
  assert.deepEqual(exp.findings, report.findings);
  assert.deepEqual(exp.review, { notes: [], decisions: [] });
  assert.match(exp.disclaimer, /not savings or repayment/);
});

test('export requires caller-supplied generatedAt and sourceHash (never Date.now inside the engine)', () => {
  assert.throws(() => buildExport(report, { sourceHash: meta.sourceHash }), TypeError);
  assert.throws(() => buildExport(report, { generatedAt: 'today', sourceHash: meta.sourceHash }), TypeError);
  assert.throws(() => buildExport(report, { generatedAt: meta.generatedAt }), TypeError);
  assert.throws(() => buildExport(report, { generatedAt: meta.generatedAt, sourceHash: 'ABC' }), TypeError);
  assert.throws(() => buildExport({}, meta), TypeError);
});

test('JSON.stringify then reparse deep-equals findings and summary of the live report', () => {
  const exp = buildExport(report, meta);
  const parsed = JSON.parse(JSON.stringify(exp));
  assert.deepEqual(parsed.findings, report.findings);
  assert.deepEqual(parsed.summary, report.summary);
  assert.deepEqual(parsed.rows, report.rows);
  const rt = roundTripExport(exp);
  assert.equal(rt.ok, true);
  assert.deepEqual(rt.value.findings, report.findings);
  assert.deepEqual(rt.value.summary, report.summary);
});

test('serializeExport enforces the 10 MiB export limit (payload built in memory)', () => {
  const ok = serializeExport(buildExport(report, meta));
  assert.equal(ok.ok, true);
  assert.ok(ok.bytes > 0 && ok.bytes <= LIMITS.maxExportBytes);
  const tooBig = { ...buildExport(report, meta), pad: 'x'.repeat(LIMITS.maxExportBytes) };
  const r = serializeExport(tooBig);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'EXPORT_TOO_LARGE');
});

test('findings CSV: header, RFC 4180 CRLF, one row per finding, synthetic label, notes and decisions columns', () => {
  const csv = buildFindingsCsv(report, { notes: new Map([['T5:DUPLICATE_EVENT', 'dup, "quoted"']]), decisions: new Map([['T5:DUPLICATE_EVENT', 'escalated']]) });
  const lines = csv.split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.length, 1 + 7 + 1); // header + findings + trailing CRLF
  assert.ok(lines[1].startsWith('synthetic demo data,T2:MISSING_EVIDENCE,T2,MISSING_EVIDENCE,pharma-reconcile-1,accepted,'));
  const t5 = lines.find((l) => l.includes('T5:DUPLICATE_EVENT'));
  assert.ok(t5.includes('escalated,"dup, ""quoted"""'));
});
