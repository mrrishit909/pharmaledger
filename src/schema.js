// Strict, atomic validation of pharma-demo-1 input. Any error means no data is returned.
import { parseCalendarDate } from './dates.js';
import { isSafeInteger } from './integers.js';

export const SCHEMA_VERSION = 'pharma-demo-1';
export const RULE_VERSION = 'pharma-reconcile-1';

export const LIMITS = Object.freeze({
  maxInputBytes: 1048576, // 1 MiB of UTF-8
  maxSites: 1000,
  maxEvidence: 2000,
  maxTransactions: 5000,
  maxIdLength: 200,
  maxNoteLength: 2000,
  maxExportBytes: 10485760, // 10 MiB
  maxDepth: 8,
  maxQuantityUnits: 1000000,
  maxAmountCents: 1000000000,
  maxErrors: 200,
});

export const ELIGIBILITY_VALUES = Object.freeze(['yes', 'no', 'unknown']);
export const KIND_VALUES = Object.freeze(['dispense', 'reversal']);

const ROOT_KEYS = ['schemaVersion', 'ruleVersion', 'sites', 'evidence', 'transactions'];
const SITE_KEYS = ['siteId', 'validFrom', 'validThrough'];
const EVIDENCE_KEYS = ['evidenceId', 'memberId', 'siteId', 'illustrativeEligibility'];
const TRANSACTION_KEYS = [
  'transactionId', 'eventKey', 'memberId', 'siteId', 'evidenceId',
  'dispenseDate', 'kind', 'quantityUnits', 'amountCents', 'reversesId',
];

export function utf8ByteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
}

// Iterative nesting depth: a scalar or the root container counts as depth 1.
export function measureDepth(value, stopAt = Infinity) {
  let deepest = 0;
  const stack = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop();
    if (d > deepest) deepest = d;
    if (deepest > stopAt) return deepest;
    if (v !== null && typeof v === 'object') {
      const children = Array.isArray(v) ? v : Object.values(v);
      for (const child of children) {
        if (child !== null && typeof child === 'object') stack.push([child, d + 1]);
      }
    }
  }
  return deepest;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class ErrorList {
  constructor() { this.errors = []; }
  add(code, path, message) {
    if (this.errors.length < LIMITS.maxErrors) this.errors.push({ code, path, message });
  }
  get length() { return this.errors.length; }
}

function checkKeys(obj, path, allowed, required, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.add('UNKNOWN_KEY', `${path}.${key}`, `unknown key "${key}"`);
  }
  let missing = false;
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      errors.add('MISSING_KEY', `${path}.${key}`, `required key "${key}" is missing`);
      missing = true;
    }
  }
  return !missing;
}

function checkIdString(value, path, errors, { allowNull = false } = {}) {
  if (value === null && allowNull) return true;
  if (typeof value !== 'string') {
    errors.add('WRONG_TYPE', path, `expected a string${allowNull ? ' or null' : ''}`);
    return false;
  }
  if (value.length === 0) { errors.add('EMPTY_STRING', path, 'string must not be empty'); return false; }
  if (value.length > LIMITS.maxIdLength) {
    errors.add('STRING_TOO_LONG', path, `string exceeds ${LIMITS.maxIdLength} characters`);
    return false;
  }
  return true;
}

function checkDate(value, path, errors) {
  if (typeof value !== 'string') { errors.add('WRONG_TYPE', path, 'expected a YYYY-MM-DD string'); return null; }
  const parsed = parseCalendarDate(value);
  if (!parsed) { errors.add('INVALID_DATE', path, `"${value}" is not a real calendar date in YYYY-MM-DD form`); return null; }
  return parsed;
}

function checkInteger(value, path, errors, { min, max }) {
  if (typeof value !== 'number') { errors.add('WRONG_TYPE', path, 'expected an integer number, not a string or other type'); return false; }
  if (!isSafeInteger(value)) { errors.add('INVALID_INTEGER', path, 'expected a safe integer (no fractions, NaN, Infinity or -0)'); return false; }
  if (value < min || value > max) { errors.add('OUT_OF_RANGE', path, `expected an integer between ${min} and ${max}`); return false; }
  return true;
}

function checkEnum(value, path, allowed, errors) {
  if (typeof value !== 'string') { errors.add('WRONG_TYPE', path, 'expected a string'); return false; }
  if (!allowed.includes(value)) { errors.add('INVALID_ENUM', path, `expected one of ${allowed.join('|')}`); return false; }
  return true;
}

function checkArray(value, path, max, errors) {
  if (!Array.isArray(value)) { errors.add('WRONG_TYPE', path, 'expected an array'); return false; }
  if (value.length > max) { errors.add('TOO_MANY_ROWS', path, `array exceeds the limit of ${max} rows`); return false; }
  return true;
}

// Validates an already-parsed value. Returns {ok:true,data} or {ok:false,errors}.
export function validateData(root) {
  const errors = new ErrorList();
  if (!isPlainObject(root)) {
    errors.add('ROOT_NOT_OBJECT', '$', 'root must be a JSON object');
    return { ok: false, errors: errors.errors };
  }
  if (root.schemaVersion !== SCHEMA_VERSION) {
    errors.add('UNKNOWN_SCHEMA_VERSION', '$.schemaVersion', `schemaVersion must be "${SCHEMA_VERSION}"`);
  }
  if (Object.prototype.hasOwnProperty.call(root, 'ruleVersion') && root.ruleVersion !== RULE_VERSION) {
    errors.add('UNKNOWN_RULE_VERSION', '$.ruleVersion', `ruleVersion, when present, must be "${RULE_VERSION}"`);
  }
  checkKeys(root, '$', ROOT_KEYS, ['schemaVersion', 'sites', 'evidence', 'transactions'], errors);
  if (errors.length) return { ok: false, errors: errors.errors };

  const sitesOk = checkArray(root.sites, '$.sites', LIMITS.maxSites, errors);
  const evidenceOk = checkArray(root.evidence, '$.evidence', LIMITS.maxEvidence, errors);
  const txOk = checkArray(root.transactions, '$.transactions', LIMITS.maxTransactions, errors);
  if (!sitesOk || !evidenceOk || !txOk) return { ok: false, errors: errors.errors };

  const siteIds = new Set();
  root.sites.forEach((site, i) => {
    const path = `$.sites[${i}]`;
    if (!isPlainObject(site)) { errors.add('WRONG_TYPE', path, 'site must be an object'); return; }
    if (!checkKeys(site, path, SITE_KEYS, SITE_KEYS, errors)) return;
    if (checkIdString(site.siteId, `${path}.siteId`, errors)) {
      if (siteIds.has(site.siteId)) errors.add('DUPLICATE_ID', `${path}.siteId`, `siteId "${site.siteId}" is not unique`);
      siteIds.add(site.siteId);
    }
    const from = checkDate(site.validFrom, `${path}.validFrom`, errors);
    const through = checkDate(site.validThrough, `${path}.validThrough`, errors);
    if (from && through && from.dayNumber > through.dayNumber) {
      errors.add('INVALID_DATE_RANGE', `${path}.validThrough`, 'validThrough must not be before validFrom');
    }
  });

  const evidenceIds = new Set();
  root.evidence.forEach((ev, i) => {
    const path = `$.evidence[${i}]`;
    if (!isPlainObject(ev)) { errors.add('WRONG_TYPE', path, 'evidence record must be an object'); return; }
    if (!checkKeys(ev, path, EVIDENCE_KEYS, EVIDENCE_KEYS, errors)) return;
    if (checkIdString(ev.evidenceId, `${path}.evidenceId`, errors)) {
      if (evidenceIds.has(ev.evidenceId)) errors.add('DUPLICATE_ID', `${path}.evidenceId`, `evidenceId "${ev.evidenceId}" is not unique`);
      evidenceIds.add(ev.evidenceId);
    }
    checkIdString(ev.memberId, `${path}.memberId`, errors);
    if (checkIdString(ev.siteId, `${path}.siteId`, errors) && !siteIds.has(ev.siteId)) {
      errors.add('UNRESOLVED_REFERENCE', `${path}.siteId`, `evidence siteId "${ev.siteId}" does not exist in sites`);
    }
    checkEnum(ev.illustrativeEligibility, `${path}.illustrativeEligibility`, ELIGIBILITY_VALUES, errors);
  });

  const transactionIds = new Set();
  root.transactions.forEach((tx, i) => {
    const path = `$.transactions[${i}]`;
    if (!isPlainObject(tx)) { errors.add('WRONG_TYPE', path, 'transaction must be an object'); return; }
    if (!checkKeys(tx, path, TRANSACTION_KEYS, TRANSACTION_KEYS, errors)) return;
    if (checkIdString(tx.transactionId, `${path}.transactionId`, errors)) {
      if (transactionIds.has(tx.transactionId)) errors.add('DUPLICATE_ID', `${path}.transactionId`, `transactionId "${tx.transactionId}" is not unique`);
      transactionIds.add(tx.transactionId);
    }
    checkIdString(tx.eventKey, `${path}.eventKey`, errors);
    checkIdString(tx.memberId, `${path}.memberId`, errors);
    checkIdString(tx.siteId, `${path}.siteId`, errors); // opaque: unknown site is a finding, not a schema error
    if (checkIdString(tx.evidenceId, `${path}.evidenceId`, errors, { allowNull: true }) && tx.evidenceId !== null && !evidenceIds.has(tx.evidenceId)) {
      errors.add('UNRESOLVED_REFERENCE', `${path}.evidenceId`, `evidenceId "${tx.evidenceId}" does not exist in evidence`);
    }
    checkDate(tx.dispenseDate, `${path}.dispenseDate`, errors);
    const kindOk = checkEnum(tx.kind, `${path}.kind`, KIND_VALUES, errors);
    checkInteger(tx.quantityUnits, `${path}.quantityUnits`, errors, { min: 1, max: LIMITS.maxQuantityUnits });
    checkInteger(tx.amountCents, `${path}.amountCents`, errors, { min: 0, max: LIMITS.maxAmountCents });
    if (kindOk) {
      if (tx.kind === 'dispense' && tx.reversesId !== null) {
        errors.add('INVALID_REVERSAL', `${path}.reversesId`, 'a dispense must carry reversesId null');
      } else if (tx.kind === 'reversal') {
        checkIdString(tx.reversesId, `${path}.reversesId`, errors);
      }
    } else if (tx.reversesId !== null) {
      checkIdString(tx.reversesId, `${path}.reversesId`, errors, { allowNull: true });
    }
  });

  // Reversal targets must exist (checked after all IDs are known).
  root.transactions.forEach((tx, i) => {
    if (isPlainObject(tx) && tx.kind === 'reversal' && typeof tx.reversesId === 'string' && !transactionIds.has(tx.reversesId)) {
      errors.add('UNRESOLVED_REFERENCE', `$.transactions[${i}].reversesId`, `reversesId "${tx.reversesId}" does not exist in transactions`);
    }
  });

  if (errors.length) return { ok: false, errors: errors.errors };
  return { ok: true, data: root };
}

// Full pipeline for raw text: size -> JSON.parse -> depth -> validate.
export function parseInput(text) {
  if (typeof text !== 'string') {
    return { ok: false, errors: [{ code: 'WRONG_TYPE', path: '$', message: 'input must be a string of JSON text' }] };
  }
  if (text.length > LIMITS.maxInputBytes || utf8ByteLength(text) > LIMITS.maxInputBytes) {
    return { ok: false, errors: [{ code: 'INPUT_TOO_LARGE', path: '$', message: `input exceeds ${LIMITS.maxInputBytes} bytes of UTF-8` }] };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [{ code: 'INVALID_JSON', path: '$', message: `input is not valid JSON: ${err.message}` }] };
  }
  if (measureDepth(value, LIMITS.maxDepth) > LIMITS.maxDepth) {
    return { ok: false, errors: [{ code: 'NESTING_TOO_DEEP', path: '$', message: `nesting depth exceeds ${LIMITS.maxDepth}` }] };
  }
  return validateData(value);
}
