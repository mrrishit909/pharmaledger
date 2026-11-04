// SYNTHETIC DEMO DATA. Every identifier, date and amount here is invented fixture data.
// This file is the single source of truth for tests and the workbench UI.
import { deepFreeze } from '../src/report.js';

export const SYNTHETIC_FIXTURE_NOTICE =
  'Synthetic demo fixtures: invented sites, members, evidence and transactions. No patient, facility or 340B data.';

const site = (siteId, validFrom, validThrough) => ({ siteId, validFrom, validThrough });
const evidence = (evidenceId, memberId, siteId, illustrativeEligibility) => ({ evidenceId, memberId, siteId, illustrativeEligibility });
const tx = (transactionId, eventKey, memberId, siteId, evidenceId, dispenseDate, kind, quantityUnits, amountCents, reversesId = null) =>
  ({ transactionId, eventKey, memberId, siteId, evidenceId, dispenseDate, kind, quantityUnits, amountCents, reversesId });

// Golden fixture from the spec: 6 rows, 1 duplicate, 1 reversal, 7 findings.
export const golden = deepFreeze({
  schemaVersion: 'pharma-demo-1',
  ruleVersion: 'pharma-reconcile-1',
  sites: [site('H1', '2026-01-01', '2026-12-31'), site('H2', '2026-06-01', '2026-12-31')],
  evidence: [evidence('E1', 'M1', 'H1', 'yes'), evidence('E2', 'M2', 'H2', 'no'), evidence('E3', 'M9', 'H1', 'unknown')],
  transactions: [
    tx('T1', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 10000),
    tx('T2', 'X2', 'M3', 'H9', null, '2026-03-11', 'dispense', 5, 6000),
    tx('T3', 'X3', 'M2', 'H2', 'E2', '2026-05-31', 'dispense', 4, 8000),
    tx('T4', 'X4', 'M4', 'H1', 'E3', '2026-04-02', 'dispense', 3, 3000),
    tx('T5', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 10000),
    tx('T6', 'R1', 'M1', 'H1', 'E1', '2026-03-12', 'reversal', 10, 10000, 'T1'),
  ],
});

// Clean variant: two legitimate repeat fills (distinct eventKeys, identical member/date/amount), zero findings.
export const clean = deepFreeze({
  schemaVersion: 'pharma-demo-1',
  ruleVersion: 'pharma-reconcile-1',
  sites: [site('H1', '2026-01-01', '2026-12-31')],
  evidence: [evidence('E1', 'M1', 'H1', 'yes')],
  transactions: [
    tx('T1', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 10000),
    tx('T2', 'X2', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 10000),
  ],
});

export const empty = deepFreeze({
  schemaVersion: 'pharma-demo-1',
  sites: [],
  evidence: [],
  transactions: [],
});

// Valid schema, hostile strings: must render inert and export with neutralised CSV cells.
export const htmlPayload = deepFreeze({
  schemaVersion: 'pharma-demo-1',
  sites: [site('<img src=x onerror=alert(1)>', '2026-01-01', '2026-12-31')],
  evidence: [evidence('E<script>alert(1)</script>', 'M"1', '<img src=x onerror=alert(1)>', 'unknown')],
  transactions: [
    tx('T<b>1</b>', '=1+1', 'M"1', '<img src=x onerror=alert(1)>', 'E<script>alert(1)</script>', '2026-03-10', 'dispense', 1, 100),
    tx('T@2', '+SUM(A1:A9)', '-M2', 'H9', null, '2026-03-10', 'dispense', 1, 100),
  ],
});

// Small adversarial variants that must reject atomically.
export const adversarial = deepFreeze({
  conflictingDuplicate: {
    ...golden,
    transactions: [
      golden.transactions[0],
      tx('T5', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 10, 9999), // same eventKey, different cents
    ],
  },
  reversalOfReversal: {
    ...golden,
    transactions: [
      golden.transactions[0],
      golden.transactions[5],
      tx('T7', 'R2', 'M1', 'H1', 'E1', '2026-03-13', 'reversal', 10, 10000, 'T6'),
    ],
  },
  secondReversal: {
    ...golden,
    transactions: [
      golden.transactions[0],
      golden.transactions[5],
      tx('T7', 'R2', 'M1', 'H1', 'E1', '2026-03-13', 'reversal', 10, 10000, 'T1'),
    ],
  },
  reversalQuantityMismatch: {
    ...golden,
    transactions: [
      golden.transactions[0],
      tx('T6', 'R1', 'M1', 'H1', 'E1', '2026-03-12', 'reversal', 5, 10000, 'T1'),
    ],
  },
  invalidCalendarDate: {
    ...golden,
    transactions: [tx('T1', 'X1', 'M1', 'H1', 'E1', '2026-02-30', 'dispense', 10, 10000)],
  },
  fractionalQuantity: {
    ...golden,
    transactions: [tx('T1', 'X1', 'M1', 'H1', 'E1', '2026-03-10', 'dispense', 1.5, 10000)],
  },
});

export const FIXTURES = deepFreeze({
  golden: { name: 'golden', label: 'Golden (spec oracle: duplicate, reversal, 7 findings)', data: golden },
  clean: { name: 'clean', label: 'Clean (two legitimate repeat fills, no findings)', data: clean },
  empty: { name: 'empty', label: 'Empty (no rows)', data: empty },
  htmlPayload: { name: 'htmlPayload', label: 'Hostile strings (HTML and formula-leading cells)', data: htmlPayload },
});

export function fixtureText(data) {
  return JSON.stringify(data, null, 2);
}
