import type { Segment } from "./types";
import { addDays } from "./utils";

const CYCLE_ANCHOR = new Date("2026-01-05T00:00:00");
const CYCLE_DAYS = 14;

export interface Cycle {
  number: number;
  start: Date;
  end: Date;
  /** Batch PO submission cut-off: Friday of the second week */
  submitBy: Date;
  daysLeft: number;
}

export function currentCycle(now = new Date()): Cycle {
  const elapsed = Math.floor((now.getTime() - CYCLE_ANCHOR.getTime()) / 86400000);
  const idx = Math.max(0, Math.floor(elapsed / CYCLE_DAYS));
  const start = addDays(CYCLE_ANCHOR, idx * CYCLE_DAYS);
  const end = addDays(start, CYCLE_DAYS - 1);
  const submitBy = addDays(start, CYCLE_DAYS - 3);
  const daysLeft = Math.ceil((submitBy.getTime() - now.getTime()) / 86400000);
  return { number: idx + 1, start, end, submitBy, daysLeft };
}

export interface FestivalWindow {
  name: string;
  /** ISO date of the festival (indicative) */
  date: string;
  /** Weeks before the festival that buffer orders must be placed */
  leadWeeks: number;
  segments: Segment[];
  region: "Maharashtra" | "Goa" | "Both";
}

export const FESTIVALS: FestivalWindow[] = [
  { name: "Dhanteras", date: "2026-11-06", leadWeeks: 4, segments: ["Snack"], region: "Both" },
  { name: "Diwali", date: "2026-11-08", leadWeeks: 6, segments: ["Snack", "Staple"], region: "Both" },
  { name: "Bhai Dooj", date: "2026-11-11", leadWeeks: 4, segments: ["Snack"], region: "Both" },
  { name: "Christmas", date: "2026-12-25", leadWeeks: 5, segments: ["Staple", "Snack"], region: "Goa" },
  { name: "Makar Sankranti", date: "2027-01-14", leadWeeks: 4, segments: ["Snack", "Staple"], region: "Maharashtra" },
  { name: "Goa Carnival", date: "2027-02-06", leadWeeks: 3, segments: ["Snack", "Beverage"], region: "Goa" },
  { name: "Maha Shivratri", date: "2027-03-06", leadWeeks: 3, segments: ["Staple", "Snack"], region: "Both" },
  { name: "Eid al-Fitr", date: "2027-03-10", leadWeeks: 4, segments: ["Snack", "Staple"], region: "Both" },
  { name: "Holi", date: "2027-03-22", leadWeeks: 5, segments: ["Snack", "Staple"], region: "Both" },
  { name: "Goa Shigmo", date: "2027-03-24", leadWeeks: 3, segments: ["Snack", "Beverage"], region: "Goa" },
  { name: "Gudi Padwa", date: "2027-04-07", leadWeeks: 4, segments: ["Snack", "Staple"], region: "Maharashtra" },
  { name: "Ram Navami", date: "2027-04-15", leadWeeks: 3, segments: ["Snack", "Beverage"], region: "Both" },
  { name: "Eid al-Adha", date: "2027-05-17", leadWeeks: 4, segments: ["Staple", "Snack"], region: "Both" },
  { name: "Ashadhi Ekadashi", date: "2027-07-16", leadWeeks: 3, segments: ["Staple", "Snack"], region: "Maharashtra" },
  { name: "Raksha Bandhan", date: "2027-08-17", leadWeeks: 4, segments: ["Snack"], region: "Both" },
  { name: "Janmashtami", date: "2027-08-25", leadWeeks: 3, segments: ["Snack", "Beverage"], region: "Both" },
  { name: "Ganesh Chaturthi", date: "2027-09-05", leadWeeks: 6, segments: ["Snack", "Staple"], region: "Both" },
  { name: "Navratri", date: "2027-10-01", leadWeeks: 5, segments: ["Staple", "Snack", "Beverage"], region: "Both" },
];

/** Festival the uplift is attributed to: Diwali in Oct/Nov, Holi in March, otherwise the next on the calendar */
export function activeFestivalName(now = new Date()): string {
  const m = now.getMonth();
  if (m === 9 || m === 10) return "Diwali";
  if (m === 2) return "Holi";
  return upcomingFestivals(now)[0]?.name ?? "Festival";
}

export interface UpcomingFestival extends FestivalWindow {
  daysAway: number;
  orderBy: Date;
  windowOpen: boolean;
}

export function upcomingFestivals(now = new Date()): UpcomingFestival[] {
  return FESTIVALS.map((f) => {
    const date = new Date(f.date + "T00:00:00");
    const orderBy = addDays(date, -f.leadWeeks * 7);
    const daysAway = Math.ceil((date.getTime() - now.getTime()) / 86400000);
    return { ...f, daysAway, orderBy, windowOpen: now >= orderBy && daysAway >= 0 };
  })
    .filter((f) => f.daysAway >= 0)
    .sort((a, b) => a.daysAway - b.daysAway);
}
