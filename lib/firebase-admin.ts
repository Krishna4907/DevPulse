import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

function formatPrivateKey(key: string): string {
  if (!key) return '';
  let formatted = key.trim();
  
  // Remove wrapping double or single quotes if pasted with them
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }

  // Convert literal string "\n" to real newline characters
  formatted = formatted.replace(/\\n/g, '\n');
  
  // Normalize Windows \r\n line breaks
  formatted = formatted.replace(/\r\n/g, '\n');

  return formatted;
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
      const privateKey = formatPrivateKey(privateKeyRaw);
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
