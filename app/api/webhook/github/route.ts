import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';

// Verify GitHub webhook signature
function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return digest === signature;
}

// Parse task ID from commit message / PR text
// Looks for: closes #TASKID, fixes #TASKID, refs #TASKID, #TASKID
function extractTaskId(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /closes\s+#([a-zA-Z0-9_-]{10,35})/i,
    /fixes\s+#([a-zA-Z0-9_-]{10,35})/i,
    /refs\s+#([a-zA-Z0-9_-]{10,35})/i,
    /#([a-zA-Z0-9_-]{10,35})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Find task across all projects
async function findTask(taskId: string) {
  try {
    const projectsSnap = await getDocs(collection(db, 'projects'));
    for (const projectDoc of projectsSnap.docs) {
      const taskRef = doc(db, 'projects', projectDoc.id, 'tasks', taskId);
      const taskSnap = await getDoc(taskRef);
      if (taskSnap.exists()) {
        return {
          taskRef,
          taskData: taskSnap.data(),
          projectId: projectDoc.id,
        };
      }
    }
  } catch (err) {
    console.error('Error finding task in webhook:', err);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const event = request.headers.get('x-github-event') || '';

    // Verify signature
    if (process.env.GITHUB_WEBHOOK_SECRET && !verifySignature(payload, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(payload || '{}');

    // EVENT 1: Push — move card to In Progress
    if (event === 'push') {
      const commits = body.commits || [];
      for (const commit of commits) {
        const taskId = extractTaskId(commit.message);
        if (!taskId) continue;

        const result = await findTask(taskId);
        if (!result) continue;

        const { taskRef, taskData } = result;

        // Only move forward, never backward
        if (taskData.status === 'done') continue;

        await updateDoc(taskRef, {
          status: 'inprogress',
          lastCommit: {
            message: commit.message,
            author: commit.author?.name || 'Unknown',
            timestamp: commit.timestamp,
            sha: commit.id?.substring(0, 7) || '',
            url: commit.url || '',
          },
          updatedAt: serverTimestamp(),
        });
      }
    }

    // EVENT 2: Pull Request opened — move to In Review
    if (event === 'pull_request' && body.action === 'opened') {
      const pr = body.pull_request;
      const searchText = `${pr?.title || ''} ${pr?.body || ''}`;
      const taskId = extractTaskId(searchText);
      if (!taskId) return Response.json({ message: 'No task ID found in PR' });

      const result = await findTask(taskId);
      if (!result) return Response.json({ message: 'Task not found' });

      const { taskRef } = result;
      await updateDoc(taskRef, {
        status: 'inreview',
        pr: {
          url: pr.html_url || '',
          title: pr.title || '',
          number: pr.number || 0,
        },
        updatedAt: serverTimestamp(),
      });
    }

    // EVENT 3: Pull Request merged — move to Done + update skill map
    if (
      event === 'pull_request' &&
      body.action === 'closed' &&
      body.pull_request?.merged === true
    ) {
      const pr = body.pull_request;
      const searchText = `${pr?.title || ''} ${pr?.body || ''}`;
      const taskId = extractTaskId(searchText);
      if (!taskId) return Response.json({ message: 'No task ID found in PR' });

      const result = await findTask(taskId);
      if (!result) return Response.json({ message: 'Task not found' });

      const { taskRef, taskData, projectId } = result;

      // Move task to Done
      await updateDoc(taskRef, {
        status: 'done',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update skill maps for assignee and partner
      const taskSkills: string[] = taskData.skills || [];
      const assigneeId: string = taskData.assigneeId;
      const partnerId: string = taskData.partnerId;

      if (assigneeId && taskSkills.length > 0) {
        // Update member skills in project subcollection
        const memberRef = doc(db, 'projects', projectId, 'members', assigneeId);
        await updateDoc(memberRef, {
          skills: arrayUnion(...taskSkills),
          pendingSkills: [],
          updatedAt: serverTimestamp(),
        });

        // Update global skill map
        const skillMapRef = doc(db, 'skillMaps', `${assigneeId}_${projectId}`);
        await setDoc(
          skillMapRef,
          {
            userId: assigneeId,
            projectId,
            skills: arrayUnion(...taskSkills),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Same for partner (navigator in overload task)
      if (partnerId && taskSkills.length > 0) {
        const partnerRef = doc(db, 'projects', projectId, 'members', partnerId);
        await updateDoc(partnerRef, {
          skills: arrayUnion(...taskSkills),
          pendingSkills: [],
          updatedAt: serverTimestamp(),
        });

        const partnerSkillMapRef = doc(db, 'skillMaps', `${partnerId}_${projectId}`);
        await setDoc(
          partnerSkillMapRef,
          {
            userId: partnerId,
            projectId,
            skills: arrayUnion(...taskSkills),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return Response.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
