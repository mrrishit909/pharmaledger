// Pure, testable UI helpers for the PharmaLedger workbench. No DOM access here.

const UNRESOLVED_EVIDENCE = Object.freeze(['MISSING_EVIDENCE', 'ELIGIBILITY_UNRESOLVED']);

// Headline figures read straight from a report summary; the UI never hardcodes numbers.
export function summaryCards(summary) {
  const { totals: t, counts: c } = summary;
  return [
    ['Raw signed cents', t.raw.signedCents],
    ['Accepted net cents', t.accepted.netCents],
    ['Raw net units', t.raw.netUnits],
    ['Accepted net units', t.accepted.netUnits],
    ['Imported rows', c.importedRows],
    ['Duplicate rows excluded', c.duplicateRows],
    ['Findings', c.findings],
  ];
}

// 'initial' (no report yet), 'empty' (no rows imported), 'zero-findings' (rows, none flagged), 'findings'.
export function resultsState(report) {
  if (!report) return 'initial';
  if (report.summary.counts.importedRows === 0) return 'empty';
  return report.summary.counts.findings === 0 ? 'zero-findings' : 'findings';
}

export const STATE_TEXT = Object.freeze({
  initial: 'No report yet. Choose a synthetic seed and run the reconciliation.',
  empty: 'Empty input: this seed contains no transactions, so nothing was reconciled and nothing was flagged.',
  'zero-findings': 'Zero findings: every imported row reconciled structurally. This is not a 340B eligibility, compliance or savings approval.',
  'no-match': 'No findings match the current filters.',
});

// rule: '' | 'unresolved-evidence' | a rule id. status: '' | row status. decision: '' | a decision code.
export function filterFindings(findings, { rule = '', status = '', decision = '' } = {}, decisionOf = () => 'unreviewed') {
  return findings.filter((f) =>
    (rule === '' || (rule === 'unresolved-evidence' ? UNRESOLVED_EVIDENCE.includes(f.ruleId) : f.ruleId === rule))
    && (status === '' || f.rowStatus === status)
    && (decision === '' || decisionOf(f.findingId) === decision));
}

export function findingLabel(f, decision = 'unreviewed') {
  return `${f.transactionId} · ${f.ruleId} · ${f.rowStatus} · ${decision}`;
}

export function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}
