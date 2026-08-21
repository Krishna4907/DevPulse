import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const { userId, skills } = body;

    if (!projectId || !userId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const memberRef = db.collection('projects').doc(projectId).collection('members').doc(userId);
    await memberRef.set(
      {
        skills: Array.isArray(skills) ? skills : [],
        skillsSet: true,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/projects/[projectId]/skills:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
