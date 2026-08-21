import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; taskId: string }> }
) {
  try {
    const { projectId, taskId } = await context.params;
    const body = await request.json();
    const { assigneeId, partnerId, type, missingSkills, partnerMissingSkills } = body;

    if (!projectId || !taskId || !assigneeId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const batch = db.batch();

    // 1. Update task document
    const taskRef = db.collection('projects').doc(projectId).collection('tasks').doc(taskId);
    batch.update(taskRef, {
      assigneeId,
      partnerId: partnerId || null,
      type: type || 'safe',
      assignedAt: FieldValue.serverTimestamp(),
    });

    // 2. Update assignee pending skills
    if (Array.isArray(missingSkills) && missingSkills.length > 0) {
      const assigneeRef = db.collection('projects').doc(projectId).collection('members').doc(assigneeId);
      batch.set(
        assigneeRef,
        {
          pendingSkills: FieldValue.arrayUnion(...missingSkills),
        },
        { merge: true }
      );
    }

    // 3. Update partner pending skills if paired
    if (partnerId && Array.isArray(partnerMissingSkills) && partnerMissingSkills.length > 0) {
      const partnerRef = db.collection('projects').doc(projectId).collection('members').doc(partnerId);
      batch.set(
        partnerRef,
        {
          pendingSkills: FieldValue.arrayUnion(...partnerMissingSkills),
        },
        { merge: true }
      );
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/projects/[projectId]/tasks/[taskId]/assign:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
