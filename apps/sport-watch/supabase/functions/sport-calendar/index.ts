// SA Sport Watch: subscribable ICS calendar feed (copy of record — deployed
// as sport-calendar). Add the function URL to Google Calendar / Apple
// Calendar ("subscribe by URL") and every fixture — including F1 sessions
// auto-synced from Jolpica — appears and stays fresh.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DURATIONS: Record<string, number> = { rugby: 2, f1: 2, mma: 5 }; // hours
const ICONS: Record<string, string> = { rugby: "\u{1F3C9}", mma: "\u{1F94A}", f1: "\u{1F3CE}️" };

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Everything from 30 days back (recent results stay visible) onward.
  const from = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: events, error } = await sb
    .from("sport_events")
    .select("id, sport, competition, home, away, event_date, venue, channel, note, result")
    .gte("event_date", from)
    .order("event_date");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SA Sport Watch//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:SA Sport Watch",
    "X-WR-TIMEZONE:Africa/Johannesburg",
  ];

  const stamp = icsDate(new Date());
  for (const ev of events ?? []) {
    if (!ev.event_date) continue;
    const start = new Date(ev.event_date);
    const end = new Date(start.getTime() + (DURATIONS[ev.sport] ?? 2) * 3600000);
    const icon = ICONS[ev.sport] ?? "";
    const summary = `${icon} ${ev.home}${ev.away ? ` vs ${ev.away}` : ""}`;
    const desc = [ev.competition, ev.channel ? `\u{1F4FA} ${ev.channel}` : null, ev.note, ev.result ? `Result: ${ev.result}` : null]
      .filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.id}@sa-sport-watch`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${esc(summary)}`,
      ...(ev.venue ? [`LOCATION:${esc(ev.venue)}`] : []),
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sa-sport-watch.ics"',
      "Cache-Control": "public, max-age=900",
    },
  });
});
