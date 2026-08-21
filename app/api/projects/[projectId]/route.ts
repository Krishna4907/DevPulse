import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const projDoc = await db.collection('projects').doc(projectId).get();
    if (!projDoc.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projData = projDoc.data();
    const project = {
      id: projDoc.id,
      name: projData?.name || '',
      description: projData?.description || '',
      deadline: projData?.deadline || '',
      techStack: projData?.techStack || [],
      leaderId: projData?.leaderId || '',
      leaderName: projData?.leaderName || 'Team Leader',
      memberCount: projData?.memberCount || 1,
      maxMembers: projData?.maxMembers || 4,
      memberIds: projData?.memberIds || [],
      createdAt: projData?.createdAt ? projData.createdAt.toDate?.() || projData.createdAt : null,
    };

    // Fetch members subcollection
    const membersSnap = await db.collection('projects').doc(projectId).collection('members').get();
    const members = membersSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || doc.id,
        projectId,
        name: data.name || '',
        email: data.email || '',
        image: data.image || '',
        role: data.role || 'member',
        skills: data.skills || [],
        skillsSet: data.skillsSet ?? false,
        pendingSkills: data.pendingSkills || [],
        joinedAt: data.joinedAt ? data.joinedAt.toDate?.() || data.joinedAt : null,
      };
    });

    return NextResponse.json({ project, members });
  } catch (error: any) {
    console.error('Error in GET /api/projects/[projectId]:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
