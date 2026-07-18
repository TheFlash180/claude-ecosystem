// Web Push primitives shared by sport-watch and marvel-watch. Each app keeps
// its own VAPID public key, RPC wrappers, and token storage key — these are
// the pieces that were previously copy-pasted between the two.

/** One random token per device+app, kept in localStorage — proof that
 *  reminder changes come from the device that owns the subscription. */
export function deviceToken(storageKey: string): string {
  let token = localStorage.getItem(storageKey);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(storageKey, token);
  }
  return token;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return false;
  const cur = new Uint8Array(current);
  if (cur.length !== wanted.length) return false;
  for (let i = 0; i < cur.length; i++) if (cur[i] !== wanted[i]) return false;
  return true;
}

/** Get (or create) this device's push subscription for the given VAPID
 *  public key. A subscription created under a DIFFERENT key (after a key
 *  rotation) is unsubscribed and replaced — subscribing over it would throw
 *  InvalidStateError and the old one can't receive the app's pushes anyway. */
export async function ensurePushSubscription(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.pushManager) return null;
    const wanted = urlBase64ToUint8Array(vapidPublicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, wanted)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: wanted.buffer as ArrayBuffer,
      });
    }
    return sub;
  } catch {
    return null;
  }
}
