// iCalendar helpers: per-event "add to calendar" files, plus the URL of the
// live subscribable feed served by the sport-calendar edge function.
import { catOf, type CatMap, type SportEvent } from './config';

export const CALENDAR_FEED_URL =
  'https://objkdeagyltvgcuxsnxu.supabase.co/functions/v1/sport-calendar';

export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** A single-event .ics file (RFC 5545). Returns null for date-TBC events.
 *  Icon and event duration come from the (dynamic) category. */
export function buildEventIcs(ev: SportEvent, cats: CatMap): string | null {
  if (!ev.date) return null;
  const cat = catOf(cats, ev.sport);
  const end = new Date(ev.date.getTime() + cat.liveMinutes * 60000);
  const summary = `${cat.icon} ${ev.home}${ev.away ? ` vs ${ev.away}` : ''}`;
  const desc = [ev.competition, ev.channel ? `📺 ${ev.channel}` : null, ev.note]
    .filter(Boolean)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SA Sport Watch//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@sa-sport-watch`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.date)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    ...(ev.venue ? [`LOCATION:${icsEscape(ev.venue)}`] : []),
    ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Trigger a download of the event as an .ics file the OS hands to the
 *  calendar app. */
export function downloadEventIcs(ev: SportEvent, cats: CatMap): boolean {
  const ics = buildEventIcs(ev, cats);
  if (!ics) return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.home.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
