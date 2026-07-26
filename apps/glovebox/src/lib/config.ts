// Glovebox: types + visual identity. Deliberately its own look — a cool
// slate-blue instrument panel, distinct from Sport Watch's green and Marvel's
// crimson, so the hub tile and the app agree.

/** A tracked vehicle. Every date field is yyyy-mm-dd; null means "not set yet",
 *  which is different from "expired" and must never render as a due item. */
export interface Vehicle {
  id: string;
  name: string;
  makeModel: string | null;
  reg: string | null;
  /** Licence disc expiry, renewed annually. */
  discExpiry: string | null;
  serviceIntervalKm: number | null;
  serviceIntervalMonths: number | null;
  lastServiceDate: string | null;
  lastServiceKm: number | null;
  odometer: number | null;
  /** The date the odometer reading was taken — without it a reading is
   *  useless, because the km/day rate needs two points in time. */
  odometerAt: string | null;
  /** Projected service due date, computed on save (see projectServiceDue) and
   *  stored so the push sender never has to redo the projection. */
  serviceDue: string | null;
  discLeads: number[];
  serviceLeads: number[];
}

/** A licence holder. Separate from vehicles: a driver's licence belongs to a
 *  person, not a car, and two people can share one car. */
export interface Person {
  id: string;
  name: string;
  licenceExpiry: string | null;
  licenceLeads: number[];
}

export const G = {
  bg:      '#080B12',
  surface: '#111826',
  raised:  '#17203055',
  border:  '#232D40',
  text:    '#EDF1F8',
  sub:     '#A6B2C6',
  muted:   '#77839A',
  blue:    '#5B8DEF',
  green:   '#46B27E',
  amber:   '#E5A64B',
  red:     '#E2574C',
  display: "'Barlow Condensed', 'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};

/** Lead options offered in the UI, in days. Licences get longer leads than
 *  discs on purpose: a driver's licence renewal means a DLTC booking, while a
 *  disc can be done online or at the post office. */
export const LEAD_OPTIONS = [
  { days: 90, label: '3 months' },
  { days: 60, label: '2 months' },
  { days: 30, label: '1 month' },
  { days: 14, label: '2 weeks' },
  { days: 7, label: '1 week' },
  { days: 1, label: '1 day' },
];

export const DEFAULT_DISC_LEADS = [30, 14, 7];
export const DEFAULT_SERVICE_LEADS = [30, 14];
export const DEFAULT_LICENCE_LEADS = [90, 60, 30];
