import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export function formatPrivateKey(key: string): string {
  if (!key) return '';
  let clean = key.trim().replace(/^["']|["']$/g, '');

  // 1. Check if it's base64-encoded (100% resilient across Vercel environments)
  try {
    const decoded = Buffer.from(clean, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN PRIVATE KEY-----')) {
      clean = decoded;
    }
  } catch {}

  // 2. Replace escaped and Windows newlines
  clean = clean.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  // 3. Ensure trailing newline
  if (!clean.endsWith('\n')) {
    clean += '\n';
  }

  return clean;
}

export function getAdminDb(): Firestore | null {
  const projectId = (process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error('Firebase Admin missing environment variables:', {
      hasProjectId: !!projectId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKeyRaw,
    });
    return null;
  }

  try {
    if (!getApps().length) {
      const formattedKey = formatPrivateKey(privateKeyRaw);
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
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
