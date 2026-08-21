import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

function formatPrivateKey(key: string): string {
  // Remove wrapping quotes if present and convert literal \n to real newlines
  const cleanKey = key.replace(/^["']|["']$/g, '');
  return cleanKey.replace(/\\n/g, '\n');
}

function getAdminFirestore(): Firestore | null {
  if (
    !process.env.FIREBASE_ADMIN_PROJECT_ID ||
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    !process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return null;
  }

  if (!getApps().length) {
    try {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: formatPrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
        }),
      });
    } catch (e) {
      console.error('Firebase Admin init error:', e);
    }
  }

  return getApps().length ? getFirestore() : null;
}

export const adminDb = getAdminFirestore();
