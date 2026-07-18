// Pregnancy week math + week-by-week size data, extracted from PreBirthView
// so the date logic is unit-testable (it had none, and date math is where
// this app can quietly go wrong).

export interface WeekInfo {
  size: string;
  emoji: string;
  lengthCm: number;
  weightG: number;
  milestone: string;
}

export const WEEK_DATA: Record<number, WeekInfo> = {
  // Which animal is baby this week? (SA-flavoured where nature allows.)
  4:  { size: 'Ant',               emoji: '🐜', lengthCm: 0.1,  weightG: 0,     milestone: 'The embryo has implanted — tiny but mighty.' },
  5:  { size: 'Ladybird',          emoji: '🐞', lengthCm: 0.2,  weightG: 0,     milestone: 'Heart tube is forming and will start beating soon.' },
  6:  { size: 'Honeybee',          emoji: '🐝', lengthCm: 0.6,  weightG: 0,     milestone: 'Neural tube closing — brain and spinal cord taking shape.' },
  7:  { size: 'Little snail',      emoji: '🐌', lengthCm: 1.3,  weightG: 0,     milestone: 'Arms and legs are budding; face features starting.' },
  8:  { size: 'Dung beetle',       emoji: '🪲', lengthCm: 1.6,  weightG: 1,     milestone: 'Fingers and toes beginning to form.' },
  9:  { size: 'Grasshopper',       emoji: '🦗', lengthCm: 2.3,  weightG: 2,     milestone: 'All essential organs are in place.' },
  10: { size: 'Prawn',             emoji: '🦐', lengthCm: 3.1,  weightG: 4,     milestone: 'Officially a fetus! Bones are starting to harden.' },
  11: { size: 'Baby mouse',        emoji: '🐭', lengthCm: 4.1,  weightG: 7,     milestone: 'Baby can open and close fists.' },
  12: { size: 'Goldfish',          emoji: '🐠', lengthCm: 5.4,  weightG: 14,    milestone: 'Reflexes developing — baby can squint and swallow.' },
  13: { size: 'Rain frog',         emoji: '🐸', lengthCm: 7.4,  weightG: 23,    milestone: 'Vocal cords forming; fingerprints appearing.' },
  14: { size: 'Hamster',           emoji: '🐹', lengthCm: 8.7,  weightG: 43,    milestone: 'Baby can make facial expressions now.' },
  15: { size: 'Chameleon',         emoji: '🦎', lengthCm: 10.1, weightG: 70,    milestone: 'Legs are now longer than arms; moving a lot.' },
  16: { size: 'Bushbaby',          emoji: '🐒', lengthCm: 11.6, weightG: 100,   milestone: 'Baby can hear sounds from outside!' },
  17: { size: 'Squirrel',          emoji: '🐿️', lengthCm: 13.0, weightG: 140,   milestone: 'Skeleton hardening from cartilage to bone.' },
  18: { size: 'Hedgehog',          emoji: '🦔', lengthCm: 14.2, weightG: 190,   milestone: 'You might start feeling kicks soon.' },
  19: { size: 'Otter pup',         emoji: '🦦', lengthCm: 15.3, weightG: 240,   milestone: 'Vernix caseosa coating protects baby\'s skin.' },
  20: { size: 'Turtle dove',       emoji: '🕊️', lengthCm: 16.4, weightG: 300,   milestone: 'Halfway there! Baby can taste amniotic fluid.' },
  21: { size: 'Bunny',             emoji: '🐰', lengthCm: 26.7, weightG: 360,   milestone: 'Eyebrows and eyelids are fully formed.' },
  22: { size: 'Duck',              emoji: '🦆', lengthCm: 27.8, weightG: 430,   milestone: 'Grip is strong enough to grab the umbilical cord.' },
  23: { size: 'Penguin chick',     emoji: '🐧', lengthCm: 28.9, weightG: 501,   milestone: 'Lungs are developing surfactant for breathing.' },
  24: { size: 'Kitten',            emoji: '🐱', lengthCm: 30.0, weightG: 600,   milestone: 'Baby has a regular sleep-wake cycle now.' },
  25: { size: 'Puppy',             emoji: '🐶', lengthCm: 34.6, weightG: 660,   milestone: 'Nostrils open; practicing breathing movements.' },
  26: { size: 'Vervet monkey',     emoji: '🐵', lengthCm: 35.6, weightG: 760,   milestone: 'Eyes opening for the first time.' },
  27: { size: 'Rooster',           emoji: '🐓', lengthCm: 36.6, weightG: 875,   milestone: 'Brain is very active — dreaming may begin.' },
  28: { size: 'Spotted eagle-owl', emoji: '🦉', lengthCm: 37.6, weightG: 1005,  milestone: 'Third trimester! Baby can blink and has eyelashes.' },
  29: { size: 'Piglet',            emoji: '🐷', lengthCm: 38.6, weightG: 1153,  milestone: 'Muscles and lungs maturing rapidly.' },
  30: { size: 'Lamb',              emoji: '🐑', lengthCm: 39.9, weightG: 1319,  milestone: 'Baby is running out of room — movements feel different.' },
  31: { size: 'Hare',              emoji: '🐇', lengthCm: 41.1, weightG: 1502,  milestone: 'All five senses are working now.' },
  32: { size: 'Fox cub',           emoji: '🦊', lengthCm: 42.4, weightG: 1702,  milestone: 'Toenails and fingernails have grown in.' },
  33: { size: 'Lion cub',          emoji: '🦁', lengthCm: 43.7, weightG: 1918,  milestone: 'Bones hardening, but skull stays flexible for birth.' },
  34: { size: 'Honey badger',      emoji: '🦡', lengthCm: 45.0, weightG: 2146,  milestone: 'Lungs are nearly mature.' },
  35: { size: 'Jackal pup',        emoji: '🐺', lengthCm: 46.2, weightG: 2383,  milestone: 'Baby is plumping up — gaining 200g+ per week.' },
  36: { size: 'Caracal',           emoji: '🐈', lengthCm: 47.4, weightG: 2622,  milestone: 'Baby is likely head-down getting ready.' },
  37: { size: 'Springbok lamb',    emoji: '🦌', lengthCm: 48.6, weightG: 2859,  milestone: 'Full term! Baby could arrive any day.' },
  38: { size: 'Cheetah cub',       emoji: '🐆', lengthCm: 49.8, weightG: 3083,  milestone: 'Organs fully mature and ready for the world.' },
  39: { size: 'African penguin',   emoji: '🐧', lengthCm: 50.7, weightG: 3288,  milestone: 'Baby is shedding vernix and lanugo.' },
  40: { size: 'Cape fur seal pup', emoji: '🦭', lengthCm: 51.2, weightG: 3462,  milestone: 'Due date! Your baby is ready to meet you.' },
};

export function getWeekInfo(week: number): WeekInfo {
  const clamped = Math.max(4, Math.min(40, week));
  if (WEEK_DATA[clamped]) return WEEK_DATA[clamped];
  const keys = Object.keys(WEEK_DATA).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((prev, curr) => Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev);
  return WEEK_DATA[nearest];
}

export interface PregnancyInfo {
  daysUntilDue: number;
  daysPregnant: number;
  weeksPregnant: number;
  daysIntoWeek: number;
  trimester: number;
  progress: number;
}

export function getPregnancyInfo(
  dueDate: string,
  weekAnchor: string | null,
  now: Date = new Date(),
): PregnancyInfo {
  const due = new Date(dueDate + 'T00:00:00');
  const msUntilDue = due.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(msUntilDue / 86400000);
  const totalDays = 280;

  // The week counter prefers the clinic-set anchor: scans date pregnancies
  // a few days off naive 280-days-before-due-date arithmetic, and parents
  // know exactly which week they're in. Countdown stays due-date based.
  let daysPregnant: number;
  if (weekAnchor) {
    const anchor = new Date(weekAnchor + 'T00:00:00');
    daysPregnant = Math.floor((now.getTime() - anchor.getTime()) / 86400000);
  } else {
    daysPregnant = totalDays - daysUntilDue;
  }

  const weeksPregnant = Math.floor(daysPregnant / 7);
  const daysIntoWeek = daysPregnant % 7;
  const trimester = weeksPregnant < 13 ? 1 : weeksPregnant < 27 ? 2 : 3;
  const progress = Math.max(0, Math.min(1, daysPregnant / totalDays));

  return { daysUntilDue, daysPregnant, weeksPregnant, daysIntoWeek, trimester, progress };
}
