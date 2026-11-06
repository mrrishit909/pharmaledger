// Report helpers: deep freeze, export object, size-checked serialisation, safe CSV.
import { LIMITS, utf8ByteLength } from './schema.js';

export const EXPORT_VERSION = 'pharmaledger-export-1';
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;
const NEEDS_QUOTES_RE = /[",\r\n\t]/;

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
  return value;
}

export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Accepts a Map, an array of {findingId, ...} entries, or a plain object; returns sorted entries.
function toEntries(source, valueKey) {
  const out = [];
  if (!source) return out;
  if (source instanceof Map) {
    for (const [findingId, v] of source) out.push({ findingId, [valueKey]: v });
  } else if (Array.isArray(source)) {
    for (const e of source) if (e && typeof e.findingId === 'string') out.push({ findingId: e.findingId, [valueKey]: e[valueKey] });
  } else if (typeof source === 'object') {
    for (const findingId of Object.keys(source)) out.push({ findingId, [valueKey]: source[findingId] });
  }
  out.sort((a, b) => compareStrings(a.findingId, b.findingId));
  return out;
}

// Pure: generatedAt and sourceHash are injected by the caller (never computed here).
export function buildExport(report, options = {}) {
  const { generatedAt, sourceHash, notes, decisions } = options;
  if (!report || typeof report !== 'object' || !Array.isArray(report.findings) || !report.summary) {
    throw new TypeError('buildExport requires a reconciliation report');
  }
  if (typeof generatedAt !== 'string' || !ISO_UTC_RE.test(generatedAt)) {
    throw new TypeError('generatedAt must be an ISO-8601 UTC timestamp string supplied by the caller');
  }
  if (typeof sourceHash !== 'string' || !SHA256_HEX_RE.test(sourceHash)) {
    throw new TypeError('sourceHash must be a lowercase SHA-256 hex digest of the raw input text, supplied by the caller');
  }
  return {
    exportVersion: EXPORT_VERSION,
    schemaVersion: report.schemaVersion,
    ruleVersion: report.ruleVersion,
    rulePack: report.rulePack,
    syntheticData: true,
    syntheticLabel: report.syntheticLabel,
    generatedAt,
    sourceHash,
    sourceHashAlgorithm: 'SHA-256 over the raw UTF-8 input text',
    input: report.input,
    summary: report.summary,
    rows: report.rows,
    findings: report.findings,
    review: {
      notes: toEntries(notes, 'text'),
      decisions: toEntries(decisions, 'decision'),
    },
    disclaimer:
      'Synthetic demo export. "Accepted" means structurally included in reconciliation, never 340B-eligible. ' +
      'Monetary values are fixture transaction amounts, not savings or repayment. Not a compliance, audit or legal determination.',
  };
}

export function serializeExport(exportObject) {
  const text = JSON.stringify(exportObject, null, 2);
  const bytes = utf8ByteLength(text);
  if (bytes > LIMITS.maxExportBytes) {
    return { ok: false, error: { code: 'EXPORT_TOO_LARGE', path: '$', message: `export of ${bytes} bytes exceeds ${LIMITS.maxExportBytes} bytes` } };
  }
  return { ok: true, text, bytes };
}

// Round-trip helper used by tests and the UI: stringify then reparse.
export function roundTripExport(exportObject) {
  const serialized = serializeExport(exportObject);
  if (!serialized.ok) return serialized;
  return { ok: true, value: JSON.parse(serialized.text), bytes: serialized.bytes };
}

// RFC 4180 field with spreadsheet-formula neutralisation.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMULA_LEAD_RE.test(s)) s = `'${s}`;
  if (NEEDS_QUOTES_RE.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const CSV_COLUMNS = Object.freeze([
  'dataLabel', 'findingId', 'transactionId', 'ruleId', 'ruleVersion', 'rowStatus',
  'memberId', 'siteId', 'evidenceId', 'duplicateOfTransactionId', 'message', 'decision', 'note',
]);

export function buildFindingsCsv(report, review = {}) {
  const notes = new Map(toEntries(review.notes, 'text').map((e) => [e.findingId, e.text]));
  const decisions = new Map(toEntries(review.decisions, 'decision').map((e) => [e.findingId, e.decision]));
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const f of report.findings) {
    lines.push([
      'synthetic demo data',
      f.findingId, f.transactionId, f.ruleId, f.ruleVersion, f.rowStatus,
      f.cites.memberId, f.cites.siteId, f.cites.evidenceId, f.cites.duplicateOfTransactionId,
      f.message, decisions.get(f.findingId) ?? 'unreviewed', notes.get(f.findingId) ?? '',
    ].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
