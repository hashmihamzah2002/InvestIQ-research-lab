/**
 * UTC date helpers. All lib/db code works in UTC; format for humans only at
 * the UI edge. Months are 1-12 here (not JS Date's 0-11).
 */

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** YYYY-MM-DD (UTC). */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** End of the calendar quarter containing the date (Mar/Jun/Sep/Dec). */
export function quarterEnd(date: Date): Date {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3);
  const month = q * 3 + 3; // 3, 6, 9, 12
  return utcDate(y, month, lastDayOfMonth(y, month));
}

/** Most recent quarter end strictly before the date. */
export function prevQuarterEnd(date: Date): Date {
  const firstOfQuarter = utcDate(
    date.getUTCFullYear(),
    Math.floor(date.getUTCMonth() / 3) * 3 + 1,
    1,
  );
  // The day before the first day of this quarter is the previous quarter end.
  return addDays(firstOfQuarter, -1);
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** Today's UTC midnight. */
export function todayUtc(now: Date = new Date()): Date {
  return utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}
