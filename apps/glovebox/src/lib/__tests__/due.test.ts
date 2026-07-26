import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, countdownLabel, daysUntil, dueItems,
  projectServiceDue, statusFor,
} from '../due';
import {
  DEFAULT_DISC_LEADS, DEFAULT_LICENCE_LEADS, DEFAULT_SERVICE_LEADS,
  type Person, type Vehicle,
} from '../config';

const TODAY = '2026-07-26';

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1', name: 'Polo', makeModel: null, reg: null,
  discExpiry: null,
  serviceIntervalKm: null, serviceIntervalMonths: null,
  lastServiceDate: null, lastServiceKm: null,
  odometer: null, odometerAt: null, serviceDue: null,
  discLeads: DEFAULT_DISC_LEADS, serviceLeads: DEFAULT_SERVICE_LEADS,
  ...over,
});

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1', name: 'Me', licenceExpiry: null, licenceLeads: DEFAULT_LICENCE_LEADS,
  ...over,
});

describe('addMonths', () => {
  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
  });

  it('handles ordinary and year-crossing additions', () => {
    expect(addMonths('2026-07-26', 12)).toBe('2027-07-26');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('addDays / daysUntil', () => {
  it('round-trips', () => {
    expect(addDays('2026-07-26', 30)).toBe('2026-08-25');
    expect(daysUntil('2026-08-25', '2026-07-26')).toBe(30);
    expect(daysUntil('2026-07-20', TODAY)).toBe(-6);
  });
});

describe('projectServiceDue', () => {
  it('uses the time interval when only months are configured', () => {
    expect(projectServiceDue(vehicle({
      serviceIntervalMonths: 12, lastServiceDate: '2026-03-01',
    }))).toBe('2027-03-01');
  });

  it('projects a km due date from the driving rate', () => {
    // 5 000 km over 100 days = 50 km/day; 10 000 km left => 200 days.
    const due = projectServiceDue(vehicle({
      serviceIntervalKm: 15000,
      lastServiceDate: '2026-01-01', lastServiceKm: 20000,
      odometer: 25000, odometerAt: '2026-04-11',
    }));
    expect(due).toBe(addDays('2026-04-11', 200));
  });

  it('takes whichever of km and months comes first', () => {
    const base = {
      serviceIntervalKm: 15000, serviceIntervalMonths: 12,
      lastServiceDate: '2026-01-01', lastServiceKm: 20000,
    };
    // Heavy driver: km runs out well before the 12 months.
    // 14 000 km over 181 days = 77.35 km/day; 1 000 km left => ceil(12.9) = 13 days.
    expect(projectServiceDue(vehicle({
      ...base, odometer: 34000, odometerAt: '2026-07-01',
    }))).toBe('2026-07-14');
    // Light driver: the 12-month limit lands first.
    expect(projectServiceDue(vehicle({
      ...base, odometer: 21000, odometerAt: '2026-07-01',
    }))).toBe('2027-01-01');
  });

  it('reports due now when the interval is already exceeded', () => {
    expect(projectServiceDue(vehicle({
      serviceIntervalKm: 15000,
      lastServiceDate: '2026-01-01', lastServiceKm: 20000,
      odometer: 36000, odometerAt: '2026-07-01',
    }))).toBe('2026-07-01');
  });

  it('returns null rather than guessing when inputs cannot support it', () => {
    // Nothing configured at all.
    expect(projectServiceDue(vehicle())).toBeNull();
    // Odometer with no reading date — no rate is derivable.
    expect(projectServiceDue(vehicle({
      serviceIntervalKm: 15000, lastServiceDate: '2026-01-01',
      lastServiceKm: 20000, odometer: 25000, odometerAt: null,
    }))).toBeNull();
    // Reading below the last service (typo or replaced cluster).
    expect(projectServiceDue(vehicle({
      serviceIntervalKm: 15000, lastServiceDate: '2026-01-01',
      lastServiceKm: 20000, odometer: 19000, odometerAt: '2026-07-01',
    }))).toBeNull();
    // Reading taken on the service date itself — no elapsed time.
    expect(projectServiceDue(vehicle({
      serviceIntervalKm: 15000, lastServiceDate: '2026-01-01',
      lastServiceKm: 20000, odometer: 20500, odometerAt: '2026-01-01',
    }))).toBeNull();
    // Parked since the service: zero km covered, so no rate.
    expect(projectServiceDue(vehicle({
      serviceIntervalKm: 15000, lastServiceDate: '2026-01-01',
      lastServiceKm: 20000, odometer: 20000, odometerAt: '2026-07-01',
    }))).toBeNull();
  });
});

describe('statusFor', () => {
  it('grades against the widest configured lead', () => {
    expect(statusFor(-1, [30, 14])).toBe('overdue');
    expect(statusFor(0, [30, 14])).toBe('due');
    expect(statusFor(30, [30, 14])).toBe('due');
    expect(statusFor(31, [30, 14])).toBe('soon');
    expect(statusFor(61, [30, 14])).toBe('ok');
  });

  it('falls back to 30 days when no leads are set', () => {
    expect(statusFor(30, [])).toBe('due');
    expect(statusFor(31, [])).toBe('soon');
  });
});

describe('dueItems', () => {
  it('gathers discs, services and licences soonest first', () => {
    const items = dueItems(
      [vehicle({ id: 'v1', name: 'Polo', discExpiry: '2026-11-30', serviceDue: '2026-09-01' })],
      [person({ id: 'p1', name: 'Me', licenceExpiry: '2026-08-15' })],
      TODAY,
    );
    expect(items.map(i => i.date)).toEqual(['2026-08-15', '2026-09-01', '2026-11-30']);
    expect(items.map(i => i.kind)).toEqual(['licence', 'service', 'disc']);
  });

  it('omits anything with no date — an unset field is not a deadline', () => {
    const items = dueItems(
      [vehicle({ discExpiry: null, serviceDue: null })],
      [person({ licenceExpiry: null })],
      TODAY,
    );
    expect(items).toEqual([]);
  });

  it('marks the service as projected and the printed expiries as not', () => {
    const items = dueItems(
      [vehicle({ discExpiry: '2026-11-30', serviceDue: '2026-09-01' })],
      [person({ licenceExpiry: '2026-08-15' })],
      TODAY,
    );
    expect(items.find(i => i.kind === 'service')?.projected).toBe(true);
    expect(items.find(i => i.kind === 'disc')?.projected).toBe(false);
    expect(items.find(i => i.kind === 'licence')?.projected).toBe(false);
  });

  it('keeps each vehicle and person distinct, with stable keys', () => {
    const items = dueItems(
      [
        vehicle({ id: 'v1', name: 'Polo', discExpiry: '2026-09-30' }),
        vehicle({ id: 'v2', name: 'Fortuner', discExpiry: '2026-10-31' }),
      ],
      [
        person({ id: 'p1', name: 'Me', licenceExpiry: '2027-01-01' }),
        person({ id: 'p2', name: 'Wife', licenceExpiry: '2028-02-02' }),
      ],
      TODAY,
    );
    expect(items.map(i => i.subject)).toEqual(['Polo', 'Fortuner', 'Me', 'Wife']);
    expect(new Set(items.map(i => i.key)).size).toBe(4);
  });

  it('flags an expired disc as overdue', () => {
    const [item] = dueItems([vehicle({ discExpiry: '2026-07-01' })], [], TODAY);
    expect(item.status).toBe('overdue');
    expect(item.daysLeft).toBe(-25);
  });
});

describe('countdownLabel', () => {
  it('reads naturally either side of today', () => {
    expect(countdownLabel(-1)).toBe('Overdue by 1 day');
    expect(countdownLabel(-25)).toBe('Overdue by 25 days');
    expect(countdownLabel(0)).toBe('Today');
    expect(countdownLabel(1)).toBe('Tomorrow');
    expect(countdownLabel(24)).toBe('in 24 days');
    expect(countdownLabel(90)).toBe('in 3 months');
    expect(countdownLabel(730)).toBe('in 2 years');
  });
});
