import { getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
  let adminError = null;
  let adminInitialized = false;

  try {
    const db = getAdminDb();
    adminInitialized = !!db;
  } catch (e: any) {
    adminError = e?.message || String(e);
  }

  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';

  return Response.json({
    adminInitialized,
    adminError,
    hasProjectId: !!(process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    hasPrivateKey: !!rawKey,
    privateKeyLength: rawKey.length,
    privateKeyStartsWithBegin: rawKey.includes('-----BEGIN PRIVATE KEY-----'),
    privateKeyEndsWithEnd: rawKey.includes('-----END PRIVATE KEY-----'),
    hasEscapedNewlines: rawKey.includes('\\n'),
    hasRealNewlines: rawKey.includes('\n'),
  });
}
