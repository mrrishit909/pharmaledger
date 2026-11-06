// Pure calendar helpers. Dates are compared as proleptic-Gregorian day numbers
// computed arithmetically; no Date object and no local time zone is involved.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1];
}

// Days since 1970-01-01 (Howard Hinnant's days_from_civil algorithm).
export function toDayNumber(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Returns { year, month, day, dayNumber } for a real YYYY-MM-DD calendar day, else null.
export function parseCalendarDate(text) {
  if (typeof text !== 'string') return null;
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day, dayNumber: toDayNumber(year, month, day) };
}

export function isValidCalendarDate(text) {
  return parseCalendarDate(text) !== null;
}

// Compare two already-validated YYYY-MM-DD strings by calendar day number.
export function compareDateStrings(a, b) {
  return parseCalendarDate(a).dayNumber - parseCalendarDate(b).dayNumber;
}
