import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GithubAuthProvider } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mock-auth-domain",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mock-project-id",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use initializeFirestore with experimentalAutoDetectLongPolling to prevent WebChannel network hangs in browsers
function getOrInitFirestore() {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch (e) {
    return getFirestore(app);
  }
}

export const db = getOrInitFirestore();
export const githubProvider = new GithubAuthProvider();
