// Offline queue for event logging. A 3am feed logged in a dead spot must
// never be lost: writes that fail because the device is offline are queued
// in localStorage (with their real timestamps — the DB defaults would stamp
// flush time, not event time) and flushed in order once connectivity is back.
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

export type SaveResult = 'saved' | 'queued' | 'error';

/** Insert an event row; if the device is offline (or the request dies on the
 *  network), queue it instead. The payload must carry its own timestamp
 *  column — never rely on DB defaults for queued events. */
export async function saveEvent(
  table: string,
  payload: Record<string, unknown>,
): Promise<SaveResult> {
  if (!navigator.onLine) {
    enqueue({ kind: 'insert', table, payload, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  const { error } = await supabase().from(table).insert(payload);
  if (!error) return 'saved';
  if (isNetworkError(error)) {
    enqueue({ kind: 'insert', table, payload, queuedAt: new Date().toISOString() });
    return 'queued';
  }
  return 'error';
}

/** Update a row (sleep stop); same offline semantics as saveEvent. */
export async function saveUpdate(
  table: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<SaveResult> {
  if (!navigator.onLine) {
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

function enqueue(op: QueuedOp) {
  const q = loadQueue();
  q.push(op);
  saveQueue(q);
}

/** Flush queued ops in order. Stops at the first network failure (still
 *  offline — retry later); drops ops the server permanently rejects so one
 *  bad row can never jam the queue. Returns how many rows were written. */
export async function flushQueue(): Promise<number> {
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
      q = q.slice(1); // permanent rejection — drop and continue
      saveQueue(q);
      continue;
    }
    flushed++;
    q = q.slice(1);
    saveQueue(q);
  }
  return flushed;
}
