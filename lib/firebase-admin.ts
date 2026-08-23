import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export function formatPrivateKey(key: string): string {
  if (!key) return '';
  let clean = key.trim().replace(/^["']|["']$/g, '');

  // 1. If it already has escaped \n, replace them
  clean = clean.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  // 2. If it is all on one single line with spaces instead of real newlines
  if (!clean.includes('\n')) {
    const beginTag = '-----BEGIN PRIVATE KEY-----';
    const endTag = '-----END PRIVATE KEY-----';

    if (clean.includes(beginTag) && clean.includes(endTag)) {
      const startIdx = clean.indexOf(beginTag) + beginTag.length;
      const endIdx = clean.indexOf(endTag);
      const base64Body = clean.substring(startIdx, endIdx).replace(/\s+/g, '');
      const chunked = base64Body.match(/.{1,64}/g)?.join('\n') || base64Body;
      return `${beginTag}\n${chunked}\n${endTag}\n`;
    }
  }

  // 3. Ensure trailing newline
  if (!clean.endsWith('\n')) {
    clean += '\n';
  }

  return clean;
}

export function getAdminDb(): Firestore | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

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
