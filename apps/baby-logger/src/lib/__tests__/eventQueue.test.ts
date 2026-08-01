import { describe, it, expect, beforeEach, vi } from 'vitest';

// The queue talks to localStorage, window and navigator.onLine, and to a
// Supabase client. All four are stubbed here so the offline paths — the ones
// that only ever run in a dead spot at 3am — can actually be exercised.

interface Op { table: string; kind: 'insert' | 'update'; row: Record<string, unknown>; id?: string }

let store: Record<string, string>;
let online: boolean;
/** Every write the fake server accepted, in order. */
let applied: Op[];
/** Rows the fake server holds, by table then id. */
let serverRows: Map<string, Map<string, Record<string, unknown>>>;
/** Force the next N writes to fail as network errors. */
let failNetwork: number;
/** Tables the fake server rejects outright (constraint violation, bad column
 *  — anything that will never succeed no matter how long we retry). */
let rejectTables: Set<string>;

function tableOf(t: string) {
  if (!serverRows.has(t)) serverRows.set(t, new Map());
  return serverRows.get(t)!;
}

vi.mock('../supabase', () => ({
  supabase: () => ({
    from(table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          if (rejectTables.has(table)) return { error: { message: 'column "x" does not exist' } };
          if (!online || failNetwork > 0) { failNetwork--; return { error: { message: 'Failed to fetch' } }; }
          applied.push({ table, kind: 'insert', row });
          tableOf(table).set(String(row.id), { ...row });
          return { error: null };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, id: string) {
              if (!online || failNetwork > 0) { failNetwork--; return { error: { message: 'Failed to fetch' } }; }
              applied.push({ table, kind: 'update', row: patch, id });
              const existing = tableOf(table).get(id);
              // Mirrors PostgREST: updating a missing row is not an error, it
              // simply affects nothing. That silence is what made the original
              // sleep bug invisible.
              if (existing) tableOf(table).set(id, { ...existing, ...patch });
              return { error: null };
            },
          };
        },
      };
    },
  }),
}));

beforeEach(async () => {
  store = {};
  online = true;
  applied = [];
  serverRows = new Map();
  failNetwork = 0;
  rejectTables = new Set();

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.stubGlobal('navigator', { get onLine() { return online; } });
  vi.stubGlobal('Event', class { constructor(public type: string) {} });
  vi.resetModules();
});

async function load() {
  return await import('../eventQueue');
}

describe('saveEvent', () => {
  it('writes straight through when online', async () => {
    const { saveEvent, queueLength } = await load();
    expect(await saveEvent('feed_events', { baby_id: 'b', started_at: 't' })).toBe('saved');
    expect(queueLength()).toBe(0);
    expect(applied).toHaveLength(1);
  });

  it('queues instead of losing the event when offline', async () => {
    online = false;
    const { saveEvent, queueLength } = await load();
    expect(await saveEvent('feed_events', { baby_id: 'b', started_at: 't' })).toBe('queued');
    expect(queueLength()).toBe(1);
    expect(applied).toHaveLength(0);
  });

  it('gives every row an id up front, so a later update can find it', async () => {
    online = false;
    const { saveEvent, pendingFor } = await load();
    await saveEvent('sleep_events', { started_at: 't' });
    const [row] = pendingFor('sleep_events').inserts;
    expect(typeof row.id).toBe('string');
    expect((row.id as string).length).toBeGreaterThan(10);
  });

  it('stamps created_at, which the timeline sorts weights on', async () => {
    online = false;
    const { saveEvent, pendingFor } = await load();
    await saveEvent('weight_events', { weight_g: 3200, measured_at: 't' });
    expect(pendingFor('weight_events').inserts[0].created_at).toBeTruthy();
  });
});

describe('offline sleep round trip', () => {
  it('shows a queued sleep as active so it can be stopped', async () => {
    online = false;
    const { saveEvent, mergePending } = await load();
    await saveEvent('sleep_events', { baby_id: 'b', started_at: '2026-08-01T01:00:00Z' });

    const sleeps = mergePending<{ id: string; ended_at?: string | null }>([], 'sleep_events');
    expect(sleeps).toHaveLength(1);
    // This is the whole bug: without the queued row here, activeSleep is null,
    // the button still reads "Start sleep", and the nap can never be ended.
    expect(sleeps.find(s => !s.ended_at)).toBeTruthy();
  });

  it('applies a queued stop to the queued start, in order, on flush', async () => {
    online = false;
    const { saveEvent, saveUpdate, mergePending, flushQueue } = await load();

    await saveEvent('sleep_events', { baby_id: 'b', started_at: '2026-08-01T01:00:00Z' });
    const id = mergePending<{ id: string }>([], 'sleep_events')[0].id;
    expect(await saveUpdate('sleep_events', id, { ended_at: '2026-08-01T03:00:00Z' })).toBe('queued');

    // Stopped in the UI immediately, before any network.
    const merged = mergePending<{ id: string; ended_at?: string | null }>([], 'sleep_events');
    expect(merged[0].ended_at).toBe('2026-08-01T03:00:00Z');

    online = true;
    expect(await flushQueue()).toBe(2);
    expect(applied.map(a => a.kind)).toEqual(['insert', 'update']);
    expect(serverRows.get('sleep_events')!.get(id)!.ended_at).toBe('2026-08-01T03:00:00Z');
  });

  it('queues a stop for a row that is still queued even while online', async () => {
    const { saveEvent, saveUpdate, mergePending } = await load();
    online = false;
    await saveEvent('sleep_events', { started_at: 't' });
    const id = mergePending<{ id: string }>([], 'sleep_events')[0].id;

    // Connectivity returns between starting and stopping. The insert has still
    // not reached the server, so updating there would hit zero rows and be
    // silently dropped.
    online = true;
    expect(await saveUpdate('sleep_events', id, { ended_at: 'x' })).toBe('queued');
    expect(applied).toHaveLength(0);
  });
});

describe('mergePending', () => {
  it('prefers the server row once a queued insert has landed', async () => {
    const { mergePending } = await load();
    const rows = mergePending<{ id: string; notes: string }>(
      [{ id: 'a', notes: 'from server' }], 'feed_events');
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('from server');
  });

  it('applies a queued patch to a row already on the server', async () => {
    online = false;
    const { saveUpdate, mergePending } = await load();
    await saveUpdate('sleep_events', 'server-1', { ended_at: 'later' });
    const rows = mergePending<{ id: string; ended_at: string | null }>(
      [{ id: 'server-1', ended_at: null }], 'sleep_events');
    expect(rows[0].ended_at).toBe('later');
  });

  it('is idempotent when re-merging an already-merged list', async () => {
    // PostBirthView re-merges over its previous state when a refetch fails
    // offline. Doing that twice must not duplicate the queued row.
    online = false;
    const { saveEvent, mergePending } = await load();
    await saveEvent('feed_events', { started_at: 't' });

    const once = mergePending<{ id: string }>([], 'feed_events');
    const twice = mergePending<{ id: string }>(once, 'feed_events');
    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
    expect(twice[0].id).toBe(once[0].id);
  });

  it('keeps tables separate', async () => {
    online = false;
    const { saveEvent, mergePending } = await load();
    await saveEvent('feed_events', { started_at: 't' });
    expect(mergePending([], 'sleep_events')).toHaveLength(0);
  });
});

describe('flushQueue', () => {
  it('sends queued rows in the order they were logged', async () => {
    online = false;
    const { saveEvent, flushQueue } = await load();
    await saveEvent('feed_events', { started_at: '1' });
    await saveEvent('feed_events', { started_at: '2' });
    await saveEvent('feed_events', { started_at: '3' });

    online = true;
    expect(await flushQueue()).toBe(3);
    expect(applied.map(a => a.row.started_at)).toEqual(['1', '2', '3']);
  });

  it('stops at a network failure and keeps the rest queued', async () => {
    online = false;
    const { saveEvent, flushQueue, queueLength } = await load();
    await saveEvent('feed_events', { started_at: '1' });
    await saveEvent('feed_events', { started_at: '2' });

    online = true;
    failNetwork = 1; // first write dies
    expect(await flushQueue()).toBe(0);
    expect(queueLength()).toBe(2); // nothing lost
  });

  it('never sends the same row twice when two flushes overlap', async () => {
    online = false;
    const { saveEvent, flushQueue } = await load();
    await saveEvent('feed_events', { started_at: '1' });
    await saveEvent('feed_events', { started_at: '2' });

    online = true;
    // Connectivity flapping fires the effect twice; both flushes previously
    // read the same queue head and inserted it.
    const [a, b] = await Promise.all([flushQueue(), flushQueue()]);
    expect(a + b).toBe(2);
    expect(applied).toHaveLength(2);
  });

  it('drops a row the server permanently rejects rather than jamming', async () => {
    online = false;
    const { saveEvent, flushQueue, queueLength } = await load();
    await saveEvent('bad_table', { started_at: '1' });
    await saveEvent('feed_events', { started_at: '2' });

    online = true;
    // The first row can never succeed. It must be discarded rather than
    // retried forever, or every event logged after it is stuck behind it.
    rejectTables.add('bad_table');

    expect(await flushQueue()).toBe(1);
    expect(queueLength()).toBe(0);
    expect(applied).toHaveLength(1);
    expect(applied[0].row.started_at).toBe('2');
  });

  it('does not discard a row that failed only because the network died', async () => {
    online = false;
    const { saveEvent, flushQueue, queueLength } = await load();
    await saveEvent('feed_events', { started_at: '1' });

    online = true;
    failNetwork = 1;
    await flushQueue();
    expect(queueLength()).toBe(1);

    // Retried once the connection is back.
    expect(await flushQueue()).toBe(1);
    expect(queueLength()).toBe(0);
  });
});
