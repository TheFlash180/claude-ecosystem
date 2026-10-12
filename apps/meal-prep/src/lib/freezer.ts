// The freezer shelf: recipes made now and eaten in the weeks after the baby
// arrives. Pure — no React, no Supabase — so it runs under node in tests.
//
// A freezer recipe is an ordinary recipe with a `freezer` block on it, so it
// keeps everything the book already does (serving sizes, the scaled method,
// the cook list and the shopping list) and adds the two things freezing needs:
// how to pack it, and how to get it from the freezer onto a plate.
import {
  FREEZER_COURSES, type FreezerCourse, type FreezerInfo, type Recipe,
} from './config';

const COURSES = new Set<string>(FREEZER_COURSES.map(c => c.key));

const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(s => typeof s === 'string') ? v : null;

/** The column as the database returns it, or undefined for anything that is
 *  not a usable freezer block. A malformed one hides the recipe from the
 *  freezer shelf rather than rendering a half-empty sheet. */
export function parseFreezer(raw: unknown): FreezerInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const freeze = strings(r.freeze);
  const reheat = strings(r.reheat);
  if (typeof r.course !== 'string' || !COURSES.has(r.course)) return undefined;
  if (typeof r.months !== 'number' || !(r.months > 0)) return undefined;
  if (!freeze || !reheat) return undefined;
  return { course: r.course as FreezerCourse, months: r.months, freeze, reheat };
}

export interface FreezerShelf {
  course: FreezerCourse;
  label: string;
  recipes: Recipe[];
}

/** Freezer recipes grouped by when you would eat them, in day order, names
 *  A–Z within each. Empty courses are left out; `only` narrows to one. */
export function freezerShelves(recipes: Recipe[], only: FreezerCourse | 'all' = 'all'): FreezerShelf[] {
  return FREEZER_COURSES
    .filter(c => only === 'all' || c.key === only)
    .map(c => ({
      course: c.key,
      label: c.label,
      recipes: recipes
        .filter(r => r.freezer?.course === c.key)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(s => s.recipes.length > 0);
}

/** Calendar months on a SAST day, clamped to the end of a shorter month:
 *  30 November + 3 months is 28 February, not 2 March. */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = (m - 1) + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Hand-rolled on purpose: toLocaleDateString's short months are "Sept" on Node
// and "Sep" in a browser (see CLAUDE.md, "Conventions that matter").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct 2026" from "2026-10-12". */
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** What to write on the bag. In three months nobody recognises a frozen
 *  orange slab, and "is this still good?" is not a question to answer at 3am. */
export function bagLabel(name: string, today: string, months: number): string {
  return `${name} · frozen ${shortDate(today)} · eat by ${shortDate(addMonths(today, months))}`;
}

/** Bought once, before the first batch day — added to the shopping list as
 *  extras by the Freezer tab. */
export const FREEZER_SUPPLIES = [
  'Freezer bags (1 litre)',
  'Freezer bags (3 litre)',
  'Foil containers with lids',
  'Baking paper',
  'Cling wrap',
  'Masking tape and a marker',
];

/** The supplies not already on the list, so a second tap adds nothing twice.
 *  Compared without case or spacing, the way a person would read the list. */
export function suppliesToAdd(onList: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const have = new Set(onList.map(norm));
  return FREEZER_SUPPLIES.filter(s => !have.has(norm(s)));
}

/** The rules that apply to every recipe on the shelf, said once rather than
 *  in every method. */
export const FREEZER_GUIDE: { title: string; body: string }[] = [
  {
    title: 'Cool it fast',
    body: 'Never put a hot pot in the freezer, and never leave food out to cool for hours either. '
      + 'Spread it into a wide dish, or stand the pot in a sink of cold water and stir. '
      + 'Everything should be in the freezer within 2 hours of cooking.',
  },
  {
    title: 'Pack it for two',
    body: 'Freeze in meal-sized portions for the two of you, so one bag is one meal. '
      + 'Squeeze the air out of bags and freeze them flat on a tray, then stand them up like files. '
      + 'Leave a little room at the top of soups and sauces: they expand as they freeze.',
  },
  {
    title: 'Label everything',
    body: 'The dish, the date and the eat-by date, on masking tape in marker. '
      + 'Every recipe here shows the exact line to write.',
  },
  {
    title: 'Thaw in the fridge',
    body: 'Move tomorrow\'s dinner from the freezer to the fridge before bed. Never thaw on the counter. '
      + 'In a hurry: the microwave\'s defrost setting, or a sealed bag in a bowl of cold water.',
  },
  {
    title: 'Reheat until steaming',
    body: 'Hot all the way through: bubbling at the edges and hot in the middle. '
      + 'Reheat once only, and never refreeze something you have thawed and reheated.',
  },
  {
    title: 'Rice and pasta: cook fresh',
    body: 'They take 12 minutes and freeze badly — pasta goes mushy, and cooked rice is the one leftover that is risky if it cools slowly. '
      + 'Microwave rice pouches are a fine shortcut for the first weeks.',
  },
  {
    title: 'Load-shedding',
    body: 'Keep the door shut. A full freezer stays frozen for about 48 hours, a half-full one about 24, '
      + 'which is one more reason to fill it. Food that still has ice crystals in it is fine.',
  },
  {
    title: 'Keeping it cheap',
    body: 'Buy mince and chicken in the large value packs or on promotion (PnP Smart Shopper, Checkers Xtra Savings, Woolies WRewards), '
      + 'and store brands for tins, flour and dairy. Thighs and drumsticks cost less than breast and stay moister after freezing. '
      + 'Frozen peas and veg are as good as fresh and never go off.',
  },
];
