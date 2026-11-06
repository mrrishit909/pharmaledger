// Checked integer arithmetic. Every ledger total goes through these helpers so an
// overflow rejects the whole batch instead of silently producing a wrong number.

export class OverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OverflowError';
    this.code = 'INTEGER_OVERFLOW';
  }
}

export function isSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0);
}

export function isNonNegativeSafeInteger(value) {
  return isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value) {
  return isSafeInteger(value) && value > 0;
}

// Adds b to a. Requires both safe integers, b >= 0 and b <= MAX_SAFE_INTEGER - a.
export function checkedAdd(a, b) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    b < 0 ||
    b > Number.MAX_SAFE_INTEGER - a
  ) {
    throw new OverflowError(`checked addition rejected: ${String(a)} + ${String(b)}`);
  }
  return a + b;
}

// Subtracts b from a. Both must be safe integers and so must the result.
export function checkedSubtract(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a - b)) {
    throw new OverflowError(`checked subtraction rejected: ${String(a)} - ${String(b)}`);
  }
  return a - b;
}
