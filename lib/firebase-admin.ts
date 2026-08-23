import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export function getPrivateKey(): string {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!key) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY missing');

  const trimmed = key.trim().replace(/^["']|["']$/g, '');

  // Check if it's Base64 encoded (no dashes at start)
  if (!trimmed.startsWith('-----')) {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
    return decoded;
  }

  // Handle escaped newlines
  if (trimmed.includes('\\n')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  return trimmed;
}

export function formatPrivateKey(key: string): string {
  return getPrivateKey();
}

export function getAdminDb(): Firestore | null {
  const projectId = (process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();

  try {
    const privateKey = getPrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      console.error('Firebase Admin missing environment variables:', {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
      });
      return null;
    }

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    return getFirestore(getApp());
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    try {
      if (getApps().length) {
        return getFirestore(getApp());
      }
    } catch {}
    return null;
  }
}

export const adminDb = getAdminDb();
