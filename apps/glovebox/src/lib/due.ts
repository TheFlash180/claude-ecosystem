// Pure date + projection logic. No React, no Supabase — all of it unit-tested,
// because a reminder that fires on the wrong day is worse than no reminder.
import type { Person, Vehicle } from './config';

/** SAST calendar day as yyyy-mm-dd. Renewals are dates, not instants, so the
 *  whole app works in local calendar days rather than UTC timestamps. */
export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

/** Whole days from `today` to `date`. Negative = already past. */
export function daysUntil(date: string, today = sastDay()): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

/** Add whole days to a yyyy-mm-dd date. Midday anchor keeps DST and timezone
 *  rounding from ever shifting the result by a day. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add whole months, clamping to the end of a shorter month so 31 Jan + 1
 *  month is 28 Feb rather than rolling into March. */
export function addMonths(date: string, months: number): string {
  const d = new Date(date + 'T12:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

type ServiceInputs = Pick<
  Vehicle,
  'serviceIntervalKm' | 'serviceIntervalMonths' | 'lastServiceDate'
  | 'lastServiceKm' | 'odometer' | 'odometerAt'
>;

/** When the next service is due — the earlier of the time interval and the
 *  projected odometer interval, which is how service plans actually read
 *  ("15 000 km or 12 months, whichever comes first").
 *
 *  The km side is a projection: it needs a reading and the date it was taken,
 *  so it can work out km/day since the last service and extrapolate. With only
 *  one of the two intervals configured it returns that one; with neither, null.
 *  Returns null rather than guessing whenever the inputs cannot support a
 *  projection — a wrong date here becomes a wrong push. */
export function projectServiceDue(v: ServiceInputs): string | null {
  const byDate = v.lastServiceDate !== null && v.serviceIntervalMonths !== null
    && v.serviceIntervalMonths > 0
    ? addMonths(v.lastServiceDate, v.serviceIntervalMonths)
    : null;

  const byKm = projectByKm(v);

  if (byDate !== null && byKm !== null) return byDate < byKm ? byDate : byKm;
  return byDate ?? byKm;
}

function projectByKm(v: ServiceInputs): string | null {
  const { serviceIntervalKm: interval, lastServiceKm, lastServiceDate, odometer, odometerAt } = v;
  if (interval === null || interval <= 0) return null;
  if (lastServiceKm === null || lastServiceDate === null) return null;
  if (odometer === null || odometerAt === null) return null;

  const kmDone = odometer - lastServiceKm;
  // A reading below the last service is a typo or an odometer swap; refusing to
  // project beats inventing a date from a negative rate.
  if (kmDone < 0) return null;

  const kmLeft = interval - kmDone;
  if (kmLeft <= 0) return odometerAt; // already over the interval

  const elapsedDays = daysUntil(odometerAt, lastServiceDate);
  if (elapsedDays <= 0) return null;  // need two distinct points to get a rate

  const kmPerDay = kmDone / elapsedDays;
  if (kmPerDay <= 0) return null;     // parked since the last service

  return addDays(odometerAt, Math.ceil(kmLeft / kmPerDay));
}

export type DueKind = 'disc' | 'service' | 'licence';
export type DueStatus = 'overdue' | 'due' | 'soon' | 'ok';

export interface DueItem {
  /** Stable across renewals of the same thing, for React keys. */
  key: string;
  kind: DueKind;
  /** What is due — "Licence disc", "Service", "Driver's licence". */
  label: string;
  /** Whose or which vehicle's — the subject line of the reminder. */
  subject: string;
  date: string;
  daysLeft: number;
  status: DueStatus;
  /** True when the date is a projection rather than a printed expiry. */
  projected: boolean;
}

/** Anything past its date is overdue; inside the longest configured lead it is
 *  "due"; within 60 days it is "soon". Callers colour on this rather than
 *  re-deriving thresholds. */
export function statusFor(daysLeft: number, leads: number[]): DueStatus {
  if (daysLeft < 0) return 'overdue';
  const widest = leads.length > 0 ? Math.max(...leads) : 30;
  if (daysLeft <= widest) return 'due';
  if (daysLeft <= 60) return 'soon';
  return 'ok';
}

/** Every tracked renewal across vehicles and people, soonest first. Items with
 *  no date set are omitted: an unset field is not a deadline. */
export function dueItems(
  vehicles: Vehicle[],
  people: Person[],
  today = sastDay(),
): DueItem[] {
  const items: DueItem[] = [];

  for (const v of vehicles) {
    if (v.discExpiry) {
      items.push(build('disc', 'Licence disc', v.name, v.discExpiry, v.discLeads, today, `${v.id}:disc`, false));
    }
    if (v.serviceDue) {
      items.push(build('service', 'Service', v.name, v.serviceDue, v.serviceLeads, today, `${v.id}:service`, true));
    }
  }
  for (const p of people) {
    if (p.licenceExpiry) {
      items.push(build('licence', "Driver's licence", p.name, p.licenceExpiry, p.licenceLeads, today, `${p.id}:licence`, false));
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function build(
  kind: DueKind, label: string, subject: string, date: string,
  leads: number[], today: string, key: string, projected: boolean,
): DueItem {
  const daysLeft = daysUntil(date, today);
  return { key, kind, label, subject, date, daysLeft, status: statusFor(daysLeft, leads), projected };
}

/** "Overdue by 3 days" / "Today" / "Tomorrow" / "in 24 days" / "in 8 months" */
export function countdownLabel(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return `Overdue by ${n} day${n === 1 ? '' : 's'}`;
  }
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  if (daysLeft <= 45) return `in ${daysLeft} days`;
  const months = Math.round(daysLeft / 30.4);
  if (months <= 18) return `in ${months} month${months === 1 ? '' : 's'}`;
  const years = Math.round(daysLeft / 365);
  return `in ${years} year${years === 1 ? '' : 's'}`;
}

export function fmtDate(date: string): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
