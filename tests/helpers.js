import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export function clone(value) {
  return structuredClone(value);
}

export function text(value) {
  return JSON.stringify(value);
}

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function expectReject(result, code, pathFragment) {
  assert.equal(result.ok, false, `expected rejection with ${code}, got ok`);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'errors must be a non-empty array');
  assert.ok(result.errors.some((e) => e.code === code), `expected code ${code}, got ${result.errors.map((e) => e.code).join(',')}`);
  if (pathFragment) {
    assert.ok(result.errors.some((e) => e.code === code && e.path.includes(pathFragment)), `expected a ${code} error path containing ${pathFragment}`);
  }
  assert.equal(result.report, undefined, 'no partial report on rejection');
  assert.equal(result.data, undefined, 'no partial data on rejection');
}

export function tx(transactionId, eventKey, memberId, siteId, evidenceId, dispenseDate, kind, quantityUnits, amountCents, reversesId = null) {
  return { transactionId, eventKey, memberId, siteId, evidenceId, dispenseDate, kind, quantityUnits, amountCents, reversesId };
}
