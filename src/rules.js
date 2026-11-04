// Fictional, versioned rule pack. This is demo configuration transcribed from the
// PharmaLedger vertical-slice specification. It carries no legal, regulatory,
// clinical or 340B authority.
import { deepFreeze } from './report.js';

export const RULE_VERSION = 'pharma-reconcile-1';
export const SCHEMA_VERSION = 'pharma-demo-1';

export const SYNTHETIC_LABEL =
  'SYNTHETIC DEMO DATA. Every record, finding and total here is invented fixture data; nothing is a 340B eligibility, compliance, savings or repayment determination.';

export const RULE_IDS = Object.freeze([
  'DUPLICATE_EVENT',
  'UNKNOWN_SITE',
  'SITE_OUTSIDE_DEMO_WINDOW',
  'MISSING_EVIDENCE',
  'EVIDENCE_MEMBER_MISMATCH',
  'EVIDENCE_SITE_MISMATCH',
  'ILLUSTRATIVE_INELIGIBLE',
  'ELIGIBILITY_UNRESOLVED',
]);

export const RULE_PACK = deepFreeze({
  ruleVersion: RULE_VERSION,
  schemaVersion: SCHEMA_VERSION,
  provenance: {
    kind: 'fictional-demo-configuration',
    source: 'atlas/docs/specs/PHARMALEDGER-VERTICAL-SLICE.md (section "Minimal schema and deterministic contract")',
    statement:
      'Fictional, versioned demo rule configuration transcribed from the PharmaLedger vertical-slice specification. ' +
      'It is not derived from HRSA, state Medicaid or manufacturer policy and carries no legal, regulatory, clinical or 340B authority.',
  },
  rules: [
    { ruleId: 'DUPLICATE_EVENT', appliesTo: 'any imported row', description: 'Exact eventKey repetition flags the later lexicographic transactionIds; flagged rows stay visible but are excluded from accepted totals and from rule evaluation.' },
    { ruleId: 'UNKNOWN_SITE', appliesTo: 'accepted dispense rows', description: 'The transaction siteId is absent from the supplied site list. No registration is guessed.' },
    { ruleId: 'SITE_OUTSIDE_DEMO_WINDOW', appliesTo: 'accepted dispense rows', description: 'The site exists but dispenseDate falls outside its inclusive validFrom..validThrough demo window.' },
    { ruleId: 'MISSING_EVIDENCE', appliesTo: 'accepted dispense rows', description: 'evidenceId is null. Unresolved, never automatically ineligible.' },
    { ruleId: 'EVIDENCE_MEMBER_MISMATCH', appliesTo: 'accepted dispense rows with linked evidence', description: 'Linked evidence memberId differs from the transaction memberId (exact comparison).' },
    { ruleId: 'EVIDENCE_SITE_MISMATCH', appliesTo: 'accepted dispense rows with linked evidence', description: 'Linked evidence siteId differs from the transaction siteId (exact comparison).' },
    { ruleId: 'ILLUSTRATIVE_INELIGIBLE', appliesTo: 'accepted dispense rows with linked evidence', description: 'Supplied illustrativeEligibility is "no". A fixture label, not a legal determination.' },
    { ruleId: 'ELIGIBILITY_UNRESOLVED', appliesTo: 'accepted dispense rows with linked evidence', description: 'Supplied illustrativeEligibility is "unknown". Remains unresolved.' },
  ],
});

export function ruleById(ruleId) {
  return RULE_PACK.rules.find((r) => r.ruleId === ruleId) || null;
}
