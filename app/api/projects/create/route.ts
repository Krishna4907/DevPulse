import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, deadline, techStack, maxMembers, leaderId, leaderName, email, image } = body;

    if (!name || !deadline || !leaderId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const batch = adminDb.batch();

    // 1. Create project document
    const projRef = adminDb.collection('projects').doc();
    const newProjectId = projRef.id;

    batch.set(projRef, {
      name: name.trim(),
      description: (description || '').trim(),
      deadline,
      techStack: Array.isArray(techStack) ? techStack : [],
      leaderId,
      leaderName: leaderName || 'Team Leader',
      createdAt: FieldValue.serverTimestamp(),
      memberCount: 1,
      maxMembers: Number(maxMembers) || 4,
      memberIds: [leaderId],
    });

    // 2. Create leader member subdocument
    const memberRef = projRef.collection('members').doc(leaderId);
    batch.set(memberRef, {
      userId: leaderId,
      name: leaderName || 'Team Leader',
      email: email || '',
      image: image || '',
      role: 'leader',
      skills: [],
      skillsSet: false,
      joinedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // 3. Update user document
    const userRef = adminDb.collection('users').doc(leaderId);
    batch.set(
      userRef,
      {
        projectIds: FieldValue.arrayUnion(newProjectId),
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({ success: true, projectId: newProjectId });
  } catch (error: any) {
    console.error('Error in POST /api/projects/create:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
