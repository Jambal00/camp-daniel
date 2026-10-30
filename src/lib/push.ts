// Phone notifications for owners (standard Web Push).
// iPhone only allows them from the app added to the Home Screen (iOS 16.4+).

import { deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { MODE } from '../data';
import { db } from '../data/firebase';

export type PushSupport = 'ok' | 'needs-home-screen' | 'unsupported';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return 'needs-home-screen';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

async function registration() {
  return navigator.serviceWorker.register('./sw.js', { scope: './' });
}

async function subId(endpoint: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h)).slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Is this phone set to get notifications? */
export async function pushStatus(): Promise<{ on: boolean; blocked: boolean }> {
  if (pushSupport() !== 'ok') return { on: false, blocked: false };
  const blocked = Notification.permission === 'denied';
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { on: !!sub && Notification.permission === 'granted', blocked };
}

/** Ask permission (must run from a tap), subscribe, and save it for the server. */
export async function enablePush(personId: string) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'blocked' : 'dismissed');
  const keySnap = await getDoc(doc(db, 'secrets', 'push'));
  const publicKey = (keySnap.data() as { publicKey?: string } | undefined)?.publicKey;
  if (!publicKey) throw new Error('Notifications aren’t set up on the server yet.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const id = await subId(sub.endpoint);
  await setDoc(doc(db, 'pushSubs', id), {
    personId,
    sub: JSON.stringify(sub.toJSON()),
    device: navigator.userAgent.slice(0, 200),
    createdAt: new Date().toISOString(),
  });
}

export async function sendTestPush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) throw new Error('Notifications are off on this phone.');
  await updateDoc(doc(db, 'pushSubs', await subId(sub.endpoint)), { testAt: new Date().toISOString() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await deleteDoc(doc(db, 'pushSubs', await subId(sub.endpoint))).catch(() => undefined);
  await sub.unsubscribe();
}

/** Tapping a notification while the app is open: go to the screen it points at. */
export function listenForNotificationTaps() {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const on = (e: MessageEvent) => {
    if (e.data?.type === 'camp-daniel:navigate' && typeof e.data.hash === 'string') window.location.hash = e.data.hash;
  };
  navigator.serviceWorker.addEventListener('message', on);
  return () => navigator.serviceWorker.removeEventListener('message', on);
}

// ---------- Which notifications each person wants (notifyPrefs/{email}) ----------
// Anything not switched off is on. Choices follow the person, not the phone.


export type NotifyKey = 'request' | 'requestEmail' | 'question' | 'cancel' | 'doorCode' | 'headingOut' | 'approved' | 'answer' | 'codeReady' | 'tripSoon';
export type NotifyPrefs = Partial<Record<NotifyKey, boolean>>;

const LOCAL_PREFS = 'camp-daniel:notify-prefs';
const localListeners = new Set<() => void>();

function readLocal(personId: string): NotifyPrefs {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_PREFS) || '{}') as Record<string, NotifyPrefs>)[personId] ?? {};
  } catch {
    return {};
  }
}

export function watchNotifyPrefs(personId: string, cb: (p: NotifyPrefs) => void): () => void {
  if (MODE === 'local') {
    const send = () => cb(readLocal(personId));
    send();
    localListeners.add(send);
    return () => {
      localListeners.delete(send);
    };
  }
  return onSnapshot(
    doc(db, 'notifyPrefs', personId),
    (s) => cb((s.data() as NotifyPrefs | undefined) ?? {}),
    () => cb({}),
  );
}

export async function setNotifyPref(personId: string, key: NotifyKey, on: boolean) {
  if (MODE === 'local') {
    let all: Record<string, NotifyPrefs> = {};
    try {
      all = JSON.parse(localStorage.getItem(LOCAL_PREFS) || '{}');
    } catch {
      /* start fresh */
    }
    all[personId] = { ...(all[personId] ?? {}), [key]: on };
    localStorage.setItem(LOCAL_PREFS, JSON.stringify(all));
    localListeners.forEach((f) => f());
    return;
  }
  await setDoc(doc(db, 'notifyPrefs', personId), { [key]: on }, { merge: true });
}
