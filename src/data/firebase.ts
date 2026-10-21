import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Firebase web config. These values identify the project and are meant to be
// public; access is controlled by sign-in and the Firestore security rules.
const config = {
  apiKey: 'AIzaSyB-sXyD6WQqyWbkLkPCrfIv3KkzFdeK3MY',
  authDomain: 'camp-daniel.firebaseapp.com',
  projectId: 'camp-daniel',
  storageBucket: 'camp-daniel.firebasestorage.app',
  messagingSenderId: '881436677584',
  appId: '1:881436677584:web:e37534de5c4403134f15d5',
};

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

const EMAIL_KEY = 'camp-daniel:signin-email';

/** Signed-in email (lower case), or null when signed out. */
export function watchSignIn(cb: (email: string | null, name: string | null) => void) {
  return onAuthStateChanged(auth, (u) => cb(u?.email ? u.email.toLowerCase() : null, u?.displayName ?? null));
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

/** Emails a one-tap sign-in link that returns to this page. */
export async function sendEmailLink(email: string) {
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}${window.location.pathname}`,
    handleCodeInApp: true,
  });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

/** True when this page was opened from a sign-in email. */
export function arrivedFromEmailLink(): boolean {
  return isSignInWithEmailLink(auth, window.location.href);
}

export function rememberedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

/** True when a pasted link is a Camp Daniel sign-in link. */
export function isEmailLink(link: string): boolean {
  return isSignInWithEmailLink(auth, link);
}

/**
 * Finish signing in from the emailed link, then tidy the address bar.
 * `link` lets someone paste the link in, for when the email opened a
 * different browser than the home-screen app (iPhone keeps them separate).
 */
export async function completeEmailLink(email: string, link: string = window.location.href) {
  await signInWithEmailLink(auth, email, link);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, '', `${window.location.pathname}#/`);
}

export async function signOut() {
  await fbSignOut(auth);
  window.location.hash = '/';
}
