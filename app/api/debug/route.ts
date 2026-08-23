import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatPrivateKey } from '@/lib/firebase-admin';

export async function GET() {
  let initError: any = null;
  let testQuerySuccess = false;
  let testQueryCount = 0;
  let formattedKeyPreview = '';

  const projectId = (process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();
  const rawKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').trim();

  try {
    const formattedKey = formatPrivateKey(rawKey);
    formattedKeyPreview = formattedKey.substring(0, 40) + '...' + formattedKey.substring(formattedKey.length - 30);

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
        }),
      });
    }

    const db = getFirestore(getApp());
    const snap = await db.collection('projects').get();
    testQuerySuccess = true;
    testQueryCount = snap.docs.length;
  } catch (e: any) {
    initError = {
      message: e?.message || String(e),
      stack: e?.stack || '',
      code: e?.code || '',
    };
  }

  return Response.json({
    testQuerySuccess,
    testQueryCount,
    initError,
    formattedKeyPreview,
    projectId,
    clientEmail,
    rawKeyLength: rawKey.length,
  });
}
