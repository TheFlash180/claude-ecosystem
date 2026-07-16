// SA Sport Watch: subscribable ICS calendar feed (copy of record — deployed
// as sport-calendar). Add the function URL to Google Calendar / Apple
// Calendar ("subscribe by URL") and every fixture — including F1 sessions
// auto-synced from Jolpica — appears and stays fresh.
// Icons and event durations come from the (dynamic) sport_categories table.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const [evRes, catRes] = await Promise.all([
    sb.from("sport_events")
      .select("id, sport, competition, home, away, event_date, venue, channel, note, result")
      .gte("event_date", from)
      .order("event_date"),
    sb.from("sport_categories").select("key, icon, live_minutes"),
  ]);

  if (evRes.error) {
    return new Response(JSON.stringify({ error: evRes.error.message }), { status: 500 });
  }

  const icons: Record<string, string> = {};
  const durations: Record<string, number> = {};
  for (const c of catRes.data ?? []) {
    icons[c.key] = c.icon;
    durations[c.key] = c.live_minutes * 60000;
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
  for (const ev of evRes.data ?? []) {
    if (!ev.event_date) continue;
    const start = new Date(ev.event_date);
    const end = new Date(start.getTime() + (durations[ev.sport] ?? 7200000));
    const icon = icons[ev.sport] ?? "\u{1F3C5}";
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
