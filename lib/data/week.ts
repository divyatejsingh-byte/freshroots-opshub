/** ISO week helpers. Weeks are "YYYY-Www" strings that sort chronologically. */

export function isoWeekToDate(week: string): Date {
  const [y, w] = week.split("-W").map(Number);
  // Jan 4th is always in ISO week 1
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  return monday;
}

export function dateToIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

export function addWeeks(week: string, n: number): string {
  const d = isoWeekToDate(week);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return dateToIsoWeek(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The n weeks ending at `last`, oldest first */
export function weekWindow(last: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addWeeks(last, i - (n - 1)));
}

/** The most recent week that has fully ended as of `now` */
export function lastCompleteWeek(now: Date): string {
  return addWeeks(dateToIsoWeek(now), -1);
}

export function weeksBetween(a: string, b: string): number {
  return Math.round((isoWeekToDate(b).getTime() - isoWeekToDate(a).getTime()) / (7 * 86400000));
}
