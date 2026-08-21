import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const { userId, name, email, image } = body;

    if (!projectId || !userId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const projRef = adminDb.collection('projects').doc(projectId);
    const projDoc = await projRef.get();

    if (!projDoc.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projData = projDoc.data();
    const memberCount = projData?.memberCount || 1;
    const maxMembers = projData?.maxMembers || 4;
    const memberIds: string[] = projData?.memberIds || [];

    // If already member, return success
    if (memberIds.includes(userId)) {
      return NextResponse.json({ success: true, message: 'Already a member' });
    }

    // Check capacity
    if (memberCount >= maxMembers) {
      return NextResponse.json({ error: 'Project is at maximum capacity' }, { status: 400 });
    }

    const batch = adminDb.batch();

    // 1. Member document
    const memberRef = projRef.collection('members').doc(userId);
    batch.set(memberRef, {
      userId,
      name: name || 'GitHub User',
      email: email || '',
      image: image || '',
      role: 'member',
      skills: [],
      skillsSet: false,
      joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Add projectId to user document
    const userRef = adminDb.collection('users').doc(userId);
    batch.set(
      userRef,
      {
        projectIds: FieldValue.arrayUnion(projectId),
      },
      { merge: true }
    );

    // 3. Update project metadata
    const updatedMemberIds = Array.from(new Set([...memberIds, userId]));
    batch.update(projRef, {
      memberCount: updatedMemberIds.length,
      memberIds: updatedMemberIds,
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/projects/[projectId]/join:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
