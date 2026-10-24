import { usageError } from "./usage.js";

export const DATE_RANGES = ["THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "THIS_YEAR", "LAST_YEAR", "CUSTOM"];
export const GROUPINGS = ["PROJECT", "CLIENT", "TAG", "DATE", "USER", "TASK"];
const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export function assertOneOf(value: string, allowed: string[], flag: string): void {
  if (!allowed.includes(value)) {
    throw usageError(`Unknown ${flag} value "${value}"`, [`Valid values: ${allowed.join(", ")}`]);
  }
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * ponytail: day/month/year boundaries are computed in UTC, not the user's
 * real time zone - close enough for THIS_WEEK/LAST_MONTH style reports, but
 * entries within a few hours of midnight in the user's zone can land in the
 * adjacent bucket. Upgrade path: shift `now` by the cached `timeZone` offset
 * if that precision ever matters.
 */
export function computeDateRange(range: string, weekStart: string | undefined, from?: string, to?: string): { start: string; end: string } {
  if (range === "CUSTOM") {
    if (!from || !to) throw usageError("--range CUSTOM requires --from and --to", ["clockify-axi report summary --range CUSTOM --from 2026-09-01 --to 2026-09-15"]);
    return { start: new Date(from).toISOString(), end: new Date(to).toISOString() };
  }

  const now = new Date();
  const startDow = DAY_NAMES.indexOf((weekStart ?? "MONDAY").toUpperCase());
  const weekStartDow = startDow >= 0 ? startDow : 1;

  if (range === "THIS_WEEK" || range === "LAST_WEEK") {
    const today = startOfDayUTC(now);
    const diff = (today.getUTCDay() - weekStartDow + 7) % 7;
    const weekStartDate = new Date(today);
    weekStartDate.setUTCDate(today.getUTCDate() - diff);
    if (range === "LAST_WEEK") weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 7);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 7);
    return { start: weekStartDate.toISOString(), end: weekEndDate.toISOString() };
  }

  if (range === "THIS_MONTH" || range === "LAST_MONTH") {
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    if (range === "LAST_MONTH") {
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }
    return { start: new Date(Date.UTC(year, month, 1)).toISOString(), end: new Date(Date.UTC(year, month + 1, 1)).toISOString() };
  }

  // THIS_YEAR / LAST_YEAR
  const year = range === "LAST_YEAR" ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return { start: new Date(Date.UTC(year, 0, 1)).toISOString(), end: new Date(Date.UTC(year + 1, 0, 1)).toISOString() };
}
