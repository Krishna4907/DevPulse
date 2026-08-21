import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }
    const userDoc = await db.collection('users').doc(userId).get();
    const userProjectIds: string[] = userDoc.data()?.projectIds || [];

    // Query projects where memberIds array contains userId as dual-backup
    const memberProjectsSnap = await db
      .collection('projects')
      .where('memberIds', 'array-contains', userId)
      .get();

    const memberProjectIds = memberProjectsSnap.docs.map((d) => d.id);
    const allProjectIds = Array.from(new Set([...userProjectIds, ...memberProjectIds]));

    if (allProjectIds.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const projects = await Promise.all(
      allProjectIds.map(async (pid) => {
        try {
          const docSnap = await db.collection('projects').doc(pid).get();
          if (docSnap.exists) {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data?.name || '',
              description: data?.description || '',
              deadline: data?.deadline || '',
              techStack: data?.techStack || [],
              leaderId: data?.leaderId || '',
              leaderName: data?.leaderName || '',
              memberCount: data?.memberCount || 1,
              maxMembers: data?.maxMembers || 4,
              memberIds: data?.memberIds || [],
              createdAt: data?.createdAt ? data.createdAt.toDate?.() || data.createdAt : null,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({ projects: projects.filter(Boolean) });
  } catch (error: any) {
    console.error('Error in GET /api/projects/user/[userId]:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
