// Offline queue for event logging. A 3am feed logged in a dead spot must
// never be lost: writes that fail because the device is offline are queued
// in localStorage (with their real timestamps — the DB defaults would stamp
// flush time, not event time) and flushed in order once connectivity is back.
//
// Queued rows carry a client-generated id and are readable back out via
// pendingFor(), so the UI can show them immediately. That is not cosmetic:
// a sleep you cannot see is a sleep you cannot stop, because stopping is an
// update against the started row's id. Without it, tapping "Start sleep"
// offline queued a row that never appeared, so the button stayed on "Start"
// and every further tap queued another open-ended sleep.
import { supabase } from './supabase';

const QUEUE_KEY = 'baby-logger:event-queue';

/** Fired on window whenever the queue length changes, so the UI can show
 *  "N saved events waiting to sync". */
export const QUEUE_EVENT = 'baby-queue-change';

interface QueuedOp {
  kind: 'insert' | 'update';
  table: string;
  payload: Record<string, unknown>;
  id?: string; // update target
  queuedAt: string;
}

/** crypto.randomUUID needs a secure context. The app is served over https, but
 *  a fallback keeps an insecure origin (or an old webview) from throwing at the
 *  exact moment someone is trying to log a feed. */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function loadQueue(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedOp[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* storage full — nothing sensible to do */ }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function queueLength(): number {
  return loadQueue().length;
}

function isNetworkError(err: { message?: string } | null): boolean {
  if (!navigator.onLine) return true;
  return Boolean(err?.message && /fetch|network|load failed|timeout/i.test(err.message));
}

/** Queued writes for one table, ready to merge into what the server returned.
 *  Updates are kept separate because they can target a row that is already on
 *  the server as well as one still sitting in the queue. */
export interface Pending {
  inserts: Record<string, unknown>[];
  updates: Map<string, Record<string, unknown>>;
}

export function pendingFor(table: string): Pending {
  const inserts: Record<string, unknown>[] = [];
  const updates = new Map<string, Record<string, unknown>>();

  for (const op of loadQueue()) {
    if (op.table !== table) continue;
    if (op.kind === 'insert') {
      inserts.push(op.payload);
    } else if (op.id) {
      // Later patches win, matching the order the server will apply them in.
      updates.set(op.id, { ...(updates.get(op.id) ?? {}), ...op.payload });
    }
  }
  return { inserts, updates };
}

/** Server rows plus anything still queued, with queued patches applied. Rows
 *  the server already returned take precedence over a queued insert with the
 *  same id, which happens in the window between a flush and the next refetch. */
export function mergePending<T extends { id: string }>(rows: T[], table: string): T[] {
  const { inserts, updates } = pendingFor(table);
  const byId = new Map<string, T>();

  for (const r of rows) byId.set(r.id, r);
  for (const ins of inserts) {
    const id = ins.id as string | undefined;
    if (!id || byId.has(id)) continue;
    byId.set(id, ins as unknown as T);
  }
  for (const [id, patch] of updates) {
    const existing = byId.get(id);
    if (existing) byId.set(id, { ...existing, ...patch });
  }
  return [...byId.values()];
}

export type SaveResult = 'saved' | 'queued' | 'error';

/** Insert an event row; if the device is offline (or the request dies on the
 *  network), queue it instead. The payload must carry its own timestamp
 *  column — never rely on DB defaults for queued events — and its own id, so
 *  a later update can target it whether or not it has reached the server. */
export async function saveEvent(
  table: string,
  payload: Record<string, unknown>,
): Promise<SaveResult> {
  // created_at is stamped here rather than left to the DB default so a queued
  // row has the same shape as a server one. The timeline sorts weight entries
  // on created_at, and a row missing it sorts as undefined — which throws
  // rather than merely ordering oddly.
  const row = { id: newId(), created_at: new Date().toISOString(), ...payload };

  if (!navigator.onLine) {
    enqueue({ kind: 'insert', table, payload: row, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  const { error } = await supabase().from(table).insert(row);
  if (!error) return 'saved';
  if (isNetworkError(error)) {
    enqueue({ kind: 'insert', table, payload: row, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  return 'error';
}

/** Update a row (sleep stop); same offline semantics as saveEvent. The id may
 *  belong to a row that is itself still queued — the queue is FIFO, so the
 *  insert lands first and the update finds it. */
export async function saveUpdate(
  table: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<SaveResult> {
  // A row that has not reached the server yet cannot be updated there; queue
  // the patch so it is applied after its insert rather than hitting zero rows.
  if (!navigator.onLine || isQueuedLocally(table, id)) {
    enqueue({ kind: 'update', table, id, payload, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  const { error } = await supabase().from(table).update(payload).eq('id', id);
  if (!error) return 'saved';
  if (isNetworkError(error)) {
    enqueue({ kind: 'update', table, id, payload, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  return 'error';
}

function isQueuedLocally(table: string, id: string): boolean {
  return loadQueue().some(op =>
    op.table === table && op.kind === 'insert' && op.payload.id === id);
}

function enqueue(op: QueuedOp) {
  const q = loadQueue();
  q.push(op);
  saveQueue(q);
}

/** Drop the op at the head of the queue and return what is left.
 *
 *  Always re-reads rather than slicing the caller's copy: an event logged
 *  while the flush was in flight is appended to the stored queue, and writing
 *  a stale copy back over it would throw that event away. Both exits from the
 *  flush loop need this — they used to differ, and the permanent-rejection
 *  path silently dropped whatever had been logged mid-flush. */
function dropHead(): QueuedOp[] {
  const next = loadQueue().slice(1);
  saveQueue(next);
  return next;
}

/** Only one flush at a time. Two overlapping flushes both read the same head
 *  of the queue and insert it twice — connectivity flapping is enough to
 *  trigger it, and a duplicated 3am feed is exactly the kind of quiet wrong
 *  data this app must not produce. */
let flushing = false;

/** Flush queued ops in order. Stops at the first network failure (still
 *  offline — retry later); drops ops the server permanently rejects so one
 *  bad row can never jam the queue. Returns how many rows were written. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    let q = loadQueue();
    if (q.length === 0) return 0;
    let flushed = 0;
    const sb = supabase();
    while (q.length > 0) {
      const op = q[0];
      const { error } =
        op.kind === 'insert'
          ? await sb.from(op.table).insert(op.payload)
          : await sb.from(op.table).update(op.payload).eq('id', op.id ?? '');
      if (error) {
        if (isNetworkError(error)) break;
        q = dropHead(); // permanent rejection — drop and continue
        continue;
      }
      flushed++;
      q = dropHead();
    }
    return flushed;
  } finally {
    flushing = false;
  }
}
