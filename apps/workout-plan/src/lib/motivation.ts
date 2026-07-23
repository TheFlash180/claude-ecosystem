// Curated motivational lines. Pure — pick(context, seed) is deterministic
// per (context, seed) so the same day shows a stable message.
export type MotiveContext =
  | 'open' | 'sessionStart' | 'sessionDone' | 'pb' | 'weightDown' | 'runDay' | 'restDay';

const LINES: Record<MotiveContext, string[]> = {
  open: [
    "Show up today — future you is watching.",
    "Small sessions, stacked daily, build the physique.",
    "You don't have to be extreme, just consistent.",
    "The plan works if you do. Let's move.",
    "Discipline beats motivation. But hey — here's both.",
  ],
  sessionStart: [
    "Own this one. Every rep counts.",
    "20 minutes of work. You've got this.",
    "Leave it all here — then get on with your day.",
    "Chase the pump, not perfection.",
  ],
  sessionDone: [
    "Session smashed. That's how it's built. 💥",
    "Done and logged. One brick closer to the goal.",
    "That's a deposit in the physique bank.",
    "Nailed it. Recover, refuel, repeat.",
  ],
  pb: [
    "NEW PB! You just beat your past self. 🏆",
    "Personal best — progressive overload in action!",
    "Stronger than last time. That's the whole game.",
  ],
  weightDown: [
    "Scale's trending your way. Trust the process.",
    "Down a notch — lean and mean. Keep it steady.",
    "Progress you can see. Nice work.",
  ],
  runDay: [
    "parkrun morning — lace up and chase that clock! 🏃",
    "5k of freedom. Run your own race.",
    "Every Saturday you get a little faster.",
  ],
  restDay: [
    "Rest is where the muscle is built. Take it.",
    "Recovery day — a gentle walk and good food.",
    "Nothing to prove today. Recharge.",
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
