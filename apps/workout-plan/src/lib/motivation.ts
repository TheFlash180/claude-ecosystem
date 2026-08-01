// Curated motivational lines. Pure — motivate(context, seed) is deterministic
// per (context, seed) so the same day shows a stable message.
export type MotiveContext = 'open' | 'weightDown' | 'runPb';

const LINES: Record<MotiveContext, string[]> = {
  open: [
    "Show up today — future you is watching.",
    "Small sessions, stacked daily, build the physique.",
    "You don't have to be extreme, just consistent.",
    "The plan works if you do. Let's move.",
    "Discipline beats motivation. But hey — here's both.",
  ],
  weightDown: [
    "Scale's trending your way. Trust the process.",
    "Down a notch — lean and mean. Keep it steady.",
    "Progress you can see. Nice work.",
  ],
  runPb: [
    "NEW PB! You just beat your past self. 🏆",
    "Fastest one yet — every Saturday you get a little quicker.",
    "That's a personal best. Go and enjoy the coffee.",
  ],
};

export function motivate(ctx: MotiveContext, seed = 0): string {
  const list = LINES[ctx];
  return list[((seed % list.length) + list.length) % list.length];
}

/** A day-stable seed so the "open" line doesn't flicker on every render. */
export function daySeed(ymd: string): number {
  return ymd.split('-').reduce((a, p) => a + Number(p), 0);
}
