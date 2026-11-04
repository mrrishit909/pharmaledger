// Deterministic reconciliation engine for pharma-demo-1 input under pharma-reconcile-1.
import { parseInput, validateData, SCHEMA_VERSION, RULE_VERSION } from './schema.js';
import { RULE_PACK, RULE_IDS, SYNTHETIC_LABEL } from './rules.js';
import { checkedAdd, checkedSubtract, OverflowError } from './integers.js';
import { parseCalendarDate } from './dates.js';
import { deepFreeze, compareStrings } from './report.js';

const DUPLICATE_COMPARE_FIELDS = [
  'eventKey', 'memberId', 'siteId', 'evidenceId', 'dispenseDate', 'kind', 'quantityUnits', 'amountCents', 'reversesId',
];
const REVERSAL_MATCH_FIELDS = ['memberId', 'siteId', 'quantityUnits', 'amountCents'];

export function reconcileText(text) {
  const parsed = parseInput(text);
  if (!parsed.ok) return parsed;
  return reconcile(parsed.data);
}

export function reconcile(data) {
  const validated = validateData(data);
  if (!validated.ok) return validated;
  try {
    return buildReport(validated.data);
  } catch (err) {
    if (err instanceof OverflowError) {
      return { ok: false, errors: [{ code: err.code, path: '$.summary.totals', message: err.message }] };
    }
    throw err;
  }
}

function makeFinding(ruleId, tx, rowStatus, cites, message) {
  return {
    findingId: `${tx.transactionId}:${ruleId}`,
    ruleId,
    ruleVersion: RULE_VERSION,
    transactionId: tx.transactionId,
    rowStatus,
    message,
    cites: {
      transactionId: tx.transactionId,
      memberId: tx.memberId,
      siteId: tx.siteId,
      evidenceId: tx.evidenceId,
      duplicateOfTransactionId: null,
      ...cites,
    },
  };
}

function buildReport(data) {
  const sites = [...data.sites].sort((a, b) => compareStrings(a.siteId, b.siteId));
  const evidence = [...data.evidence].sort((a, b) => compareStrings(a.evidenceId, b.evidenceId));
  const transactions = [...data.transactions].sort((a, b) => compareStrings(a.transactionId, b.transactionId));
  const originalIndex = new Map(data.transactions.map((t, i) => [t.transactionId, i]));
  const pathOf = (tx, field) => `$.transactions[${originalIndex.get(tx.transactionId)}].${field}`;

  const siteMap = new Map(sites.map((s) => [s.siteId, s]));
  const evidenceMap = new Map(evidence.map((e) => [e.evidenceId, e]));
  const txMap = new Map(transactions.map((t) => [t.transactionId, t]));
  const errors = [];

  // 1. Duplicate eventKey groups (transactions already sorted lexicographically by ID).
  const groups = new Map();
  for (const tx of transactions) {
    const g = groups.get(tx.eventKey);
    if (g) g.push(tx); else groups.set(tx.eventKey, [tx]);
  }
  const duplicateOf = new Map();
  for (const [eventKey, group] of groups) {
    if (group.length < 2) continue;
    const first = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const tx = group[i];
      const differing = DUPLICATE_COMPARE_FIELDS.filter((f) => tx[f] !== first[f]);
      if (differing.length) {
        errors.push({
          code: 'CONFLICTING_DUPLICATE',
          path: pathOf(tx, 'eventKey'),
          message: `eventKey "${eventKey}" repeats on ${first.transactionId} and ${tx.transactionId} with different ${differing.join(', ')}`,
        });
      } else {
        duplicateOf.set(tx.transactionId, first.transactionId);
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  // 2. Reversal validity on accepted (non-duplicate) reversal rows.
  const reversedBy = new Map();
  for (const tx of transactions) {
    if (tx.kind !== 'reversal' || duplicateOf.has(tx.transactionId)) continue;
    const target = txMap.get(tx.reversesId);
    const path = pathOf(tx, 'reversesId');
    if (!target) {
      errors.push({ code: 'UNRESOLVED_REFERENCE', path, message: `reversesId "${tx.reversesId}" does not exist` });
      continue;
    }
    if (target.kind !== 'dispense') {
      errors.push({ code: 'INVALID_REVERSAL', path, message: `${tx.transactionId} reverses ${target.transactionId}, which is not a dispense` });
      continue;
    }
    if (duplicateOf.has(target.transactionId)) {
      errors.push({ code: 'INVALID_REVERSAL', path, message: `${tx.transactionId} reverses duplicate-flagged dispense ${target.transactionId}` });
      continue;
    }
    const mismatched = REVERSAL_MATCH_FIELDS.filter((f) => tx[f] !== target[f]);
    if (mismatched.length) {
      errors.push({ code: 'INVALID_REVERSAL', path, message: `${tx.transactionId} does not match ${target.transactionId} on ${mismatched.join(', ')}; partial reversals are not invented` });
    }
    if (tx.eventKey === target.eventKey) {
      errors.push({ code: 'INVALID_REVERSAL', path: pathOf(tx, 'eventKey'), message: `${tx.transactionId} must carry an eventKey distinct from ${target.transactionId}` });
    }
    if (reversedBy.has(target.transactionId)) {
      errors.push({ code: 'INVALID_REVERSAL', path, message: `${target.transactionId} is already reversed by ${reversedBy.get(target.transactionId)}; ${tx.transactionId} is a second reversal` });
    } else {
      reversedBy.set(target.transactionId, tx.transactionId);
    }
  }
  if (errors.length) return { ok: false, errors };

  // 3. Rows, findings and checked totals.
  const raw = { dispenseCents: 0, reversalCents: 0, dispenseUnits: 0, reversalUnits: 0 };
  const acc = { grossDispenseCents: 0, reversalCents: 0, grossUnits: 0, reversalUnits: 0 };
  const counts = { importedRows: transactions.length, duplicateRows: 0, acceptedRows: 0, acceptedDispenses: 0, acceptedReversals: 0, reversedDispenses: reversedBy.size, flaggedRows: 0, findings: 0 };
  const ruleCounts = {};
  for (const id of RULE_IDS) ruleCounts[id] = 0;
  const rows = [];
  const findings = [];

  for (const tx of transactions) {
    const isDuplicate = duplicateOf.has(tx.transactionId);
    if (tx.kind === 'dispense') {
      raw.dispenseCents = checkedAdd(raw.dispenseCents, tx.amountCents);
      raw.dispenseUnits = checkedAdd(raw.dispenseUnits, tx.quantityUnits);
    } else {
      raw.reversalCents = checkedAdd(raw.reversalCents, tx.amountCents);
      raw.reversalUnits = checkedAdd(raw.reversalUnits, tx.quantityUnits);
    }
    const status = isDuplicate ? 'duplicate' : reversedBy.has(tx.transactionId) ? 'reversed' : 'accepted';
    const rowFindings = [];

    if (isDuplicate) {
      counts.duplicateRows += 1;
      const keeper = duplicateOf.get(tx.transactionId);
      rowFindings.push(makeFinding('DUPLICATE_EVENT', tx, status, { duplicateOfTransactionId: keeper },
        `eventKey "${tx.eventKey}" repeats ${keeper}; ${tx.transactionId} is excluded from accepted totals and rule evaluation`));
    } else {
      counts.acceptedRows += 1;
      if (tx.kind === 'dispense') {
        counts.acceptedDispenses += 1;
        acc.grossDispenseCents = checkedAdd(acc.grossDispenseCents, tx.amountCents);
        acc.grossUnits = checkedAdd(acc.grossUnits, tx.quantityUnits);
        evaluateRules(tx, status, siteMap, evidenceMap, rowFindings);
      } else {
        counts.acceptedReversals += 1;
        acc.reversalCents = checkedAdd(acc.reversalCents, tx.amountCents);
        acc.reversalUnits = checkedAdd(acc.reversalUnits, tx.quantityUnits);
      }
    }
    // Per-row finding order matches the report-level order (ruleId within a transaction).
    rowFindings.sort((a, b) => compareStrings(a.ruleId, b.ruleId));
    if (rowFindings.length) counts.flaggedRows += 1;
    for (const f of rowFindings) ruleCounts[f.ruleId] += 1;
    rows.push({
      record: tx,
      status,
      accepted: !isDuplicate,
      flagged: rowFindings.length > 0,
      duplicateOf: duplicateOf.get(tx.transactionId) ?? null,
      reversedBy: reversedBy.get(tx.transactionId) ?? null,
      findingIds: rowFindings.map((f) => f.findingId),
    });
    findings.push(...rowFindings);
  }

  findings.sort((a, b) => compareStrings(a.transactionId, b.transactionId) || compareStrings(a.ruleId, b.ruleId));
  counts.findings = findings.length;

  const totals = {
    unit: 'cents and units are fixture transaction amounts, not savings or repayment',
    raw: {
      dispenseCents: raw.dispenseCents,
      reversalCents: raw.reversalCents,
      signedCents: checkedSubtract(raw.dispenseCents, raw.reversalCents),
      dispenseUnits: raw.dispenseUnits,
      reversalUnits: raw.reversalUnits,
      netUnits: checkedSubtract(raw.dispenseUnits, raw.reversalUnits),
    },
    accepted: {
      grossDispenseCents: acc.grossDispenseCents,
      reversalCents: acc.reversalCents,
      netCents: checkedSubtract(acc.grossDispenseCents, acc.reversalCents),
      grossUnits: acc.grossUnits,
      reversalUnits: acc.reversalUnits,
      netUnits: checkedSubtract(acc.grossUnits, acc.reversalUnits),
    },
  };

  const report = {
    schemaVersion: SCHEMA_VERSION,
    ruleVersion: RULE_VERSION,
    rulePack: RULE_PACK,
    syntheticData: true,
    syntheticLabel: SYNTHETIC_LABEL,
    acceptedMeaning: 'Accepted means structurally included in reconciliation, never 340B-eligible.',
    input: {
      schemaVersion: data.schemaVersion,
      ruleVersion: Object.prototype.hasOwnProperty.call(data, 'ruleVersion') ? data.ruleVersion : null,
      sites,
      evidence,
      transactions,
    },
    rows,
    findings,
    summary: { counts: { ...counts, ruleCounts }, totals },
  };
  return { ok: true, report: deepFreeze(report) };
}

function evaluateRules(tx, status, siteMap, evidenceMap, out) {
  const site = siteMap.get(tx.siteId);
  if (!site) {
    out.push(makeFinding('UNKNOWN_SITE', tx, status, {}, `site "${tx.siteId}" is absent from the supplied site list; no registration is guessed`));
  } else {
    const day = parseCalendarDate(tx.dispenseDate).dayNumber;
    const from = parseCalendarDate(site.validFrom).dayNumber;
    const through = parseCalendarDate(site.validThrough).dayNumber;
    if (day < from || day > through) {
      out.push(makeFinding('SITE_OUTSIDE_DEMO_WINDOW', tx, status, {}, `dispenseDate ${tx.dispenseDate} is outside site "${site.siteId}" demo window ${site.validFrom}..${site.validThrough} (inclusive)`));
    }
  }
  if (tx.evidenceId === null) {
    out.push(makeFinding('MISSING_EVIDENCE', tx, status, {}, 'evidenceId is null; evidence is unresolved, which is never automatically ineligible'));
    return;
  }
  const ev = evidenceMap.get(tx.evidenceId);
  if (ev.memberId !== tx.memberId) {
    out.push(makeFinding('EVIDENCE_MEMBER_MISMATCH', tx, status, {}, `evidence "${ev.evidenceId}" memberId "${ev.memberId}" differs from transaction memberId "${tx.memberId}"`));
  }
  if (ev.siteId !== tx.siteId) {
    out.push(makeFinding('EVIDENCE_SITE_MISMATCH', tx, status, {}, `evidence "${ev.evidenceId}" siteId "${ev.siteId}" differs from transaction siteId "${tx.siteId}"`));
  }
  if (ev.illustrativeEligibility === 'no') {
    out.push(makeFinding('ILLUSTRATIVE_INELIGIBLE', tx, status, {}, `supplied illustrativeEligibility for "${ev.evidenceId}" is "no" (fixture label, not a legal determination)`));
  } else if (ev.illustrativeEligibility === 'unknown') {
    out.push(makeFinding('ELIGIBILITY_UNRESOLVED', tx, status, {}, `supplied illustrativeEligibility for "${ev.evidenceId}" is "unknown"; remains unresolved`));
  }
}
