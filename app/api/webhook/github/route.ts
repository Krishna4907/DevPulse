import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { db as clientDb } from '@/lib/firebase';
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
  const secret = (process.env.GITHUB_WEBHOOK_SECRET || '').trim().replace(/^["']|["']$/g, '');
  if (!secret || !signature) return true;
  try {
    const hmac = createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return digest === signature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// Parse task ID from commit message / PR text
function extractTaskId(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /closes\s+#([a-zA-Z0-9]{10,25})/i,
    /fixes\s+#([a-zA-Z0-9]{10,25})/i,
    /refs\s+#([a-zA-Z0-9]{10,25})/i,
    /close\s+#([a-zA-Z0-9]{10,25})/i,
    /#([a-zA-Z0-9]{15,25})/,
    /\b([a-zA-Z0-9]{20})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const event = request.headers.get('x-github-event') || '';

    console.log('[Webhook] Received GitHub event:', event);

    // Verify signature
    if (process.env.GITHUB_WEBHOOK_SECRET && !verifySignature(payload, signature)) {
      console.warn('[Webhook] Signature verification failed');
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(payload || '{}');
    const admin = getAdminDb();

    // Helper to find task using Admin DB (bypasses security rules) or Client DB fallback
    const findTask = async (taskId: string) => {
      if (admin) {
        try {
          const projectsSnap = await admin.collection('projects').get();
          for (const projDoc of projectsSnap.docs) {
            const taskDoc = await admin
              .collection('projects')
              .doc(projDoc.id)
              .collection('tasks')
              .doc(taskId)
              .get();
            if (taskDoc.exists) {
              return {
                isAdmin: true,
                projectId: projDoc.id,
                taskRef: taskDoc.ref,
                taskData: taskDoc.data() || {},
              };
            }
          }
        } catch (adminErr) {
          console.error('[Webhook] Admin DB findTask error:', adminErr);
        }
      }

      // Client DB Fallback
      try {
        const projectsSnap = await getDocs(collection(clientDb, 'projects'));
        for (const projectDoc of projectsSnap.docs) {
          const taskRef = doc(clientDb, 'projects', projectDoc.id, 'tasks', taskId);
          const taskSnap = await getDoc(taskRef);
          if (taskSnap.exists()) {
            return {
              isAdmin: false,
              projectId: projectDoc.id,
              taskRef,
              taskData: taskSnap.data() || {},
            };
          }
        }
      } catch (clientErr) {
        console.error('[Webhook] Client DB findTask error:', clientErr);
      }

      return null;
    };

    // EVENT 1: Push — move card to In Progress
    if (event === 'push') {
      const commits = body.commits || [];
      console.log(`[Webhook] Processing ${commits.length} commits in push`);

      for (const commit of commits) {
        const taskId = extractTaskId(commit.message);
        console.log(`[Webhook] Commit: "${commit.message}" -> Extracted Task ID:`, taskId);
        if (!taskId) continue;

        const result = await findTask(taskId);
        if (!result) {
          console.warn('[Webhook] Task not found for ID:', taskId);
          continue;
        }

        const { isAdmin, taskRef, taskData } = result;

        if (taskData.status === 'done') {
          console.log('[Webhook] Task already done, skipping');
          continue;
        }

        console.log('[Webhook] Moving task to inprogress:', taskId);
        const lastCommit = {
          message: commit.message,
          author: commit.author?.name || 'Unknown',
          timestamp: commit.timestamp || new Date().toISOString(),
          sha: commit.id?.substring(0, 7) || '',
          url: commit.url || '',
        };

        if (isAdmin) {
          await (taskRef as any).update({
            status: 'inprogress',
            lastCommit,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await updateDoc(taskRef as any, {
            status: 'inprogress',
            lastCommit,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    // EVENT 2: Pull Request opened — move to In Review
    if (event === 'pull_request' && body.action === 'opened') {
      const pr = body.pull_request;
      const prTitle = pr?.title || '';
      const prBody = pr?.body || '';
      const prHead = pr?.head?.ref || '';
      const searchText = `${prTitle} ${prBody} ${prHead}`;

      console.log('PR opened event received');
      console.log('PR title:', prTitle);
      console.log('PR body:', prBody);
      console.log('PR head ref:', prHead);
      console.log('Search text:', searchText);
      const taskId = extractTaskId(searchText);
      console.log('Extracted task ID:', taskId);

      if (!taskId) return Response.json({ message: 'No task ID found in PR' });

      const result = await findTask(taskId);
      if (!result) return Response.json({ message: 'Task not found' });

      const { isAdmin, taskRef } = result;
      console.log('[Webhook] Moving task to inreview:', taskId);
      const prData = {
        url: pr.html_url || '',
        title: pr.title || '',
        number: pr.number || 0,
      };

      if (isAdmin) {
        await (taskRef as any).update({
          status: 'inreview',
          pr: prData,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await updateDoc(taskRef as any, {
          status: 'inreview',
          pr: prData,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // EVENT 3: Pull Request merged — move to Done + update skill map
    if (
      event === 'pull_request' &&
      body.action === 'closed' &&
      body.pull_request?.merged === true
    ) {
      const pr = body.pull_request;
      const prTitle = pr?.title || '';
      const prBody = pr?.body || '';
      const prHead = pr?.head?.ref || '';
      const searchText = `${prTitle} ${prBody} ${prHead}`;

      console.log('PR merged event received');
      console.log('PR title:', prTitle);
      console.log('PR body:', prBody);
      console.log('PR head ref:', prHead);
      console.log('Search text:', searchText);
      const taskId = extractTaskId(searchText);
      console.log('Extracted task ID:', taskId);

      if (!taskId) return Response.json({ message: 'No task ID found in PR' });

      const result = await findTask(taskId);
      if (!result) return Response.json({ message: 'Task not found' });

      const { isAdmin, taskRef, taskData, projectId } = result;
      console.log('[Webhook] Moving task to done and updating skills:', taskId);

      const taskSkills: string[] = taskData.skills || [];
      const assigneeId: string = taskData.assigneeId;
      const partnerId: string = taskData.partnerId;

      if (isAdmin && admin) {
        await (taskRef as any).update({
          status: 'done',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (assigneeId && taskSkills.length > 0) {
          const memberRef = admin.collection('projects').doc(projectId).collection('members').doc(assigneeId);
          await memberRef.set({
            skills: FieldValue.arrayUnion(...taskSkills),
            pendingSkills: [],
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          const skillMapRef = admin.collection('skillMaps').doc(`${assigneeId}_${projectId}`);
          await skillMapRef.set({
            userId: assigneeId,
            projectId,
            skills: FieldValue.arrayUnion(...taskSkills),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        if (partnerId && taskSkills.length > 0) {
          const partnerRef = admin.collection('projects').doc(projectId).collection('members').doc(partnerId);
          await partnerRef.set({
            skills: FieldValue.arrayUnion(...taskSkills),
            pendingSkills: [],
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          const partnerSkillMapRef = admin.collection('skillMaps').doc(`${partnerId}_${projectId}`);
          await partnerSkillMapRef.set({
            userId: partnerId,
            projectId,
            skills: FieldValue.arrayUnion(...taskSkills),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      } else {
        await updateDoc(taskRef as any, {
          status: 'done',
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (assigneeId && taskSkills.length > 0) {
          const memberRef = doc(clientDb, 'projects', projectId, 'members', assigneeId);
          await updateDoc(memberRef, {
            skills: arrayUnion(...taskSkills),
            pendingSkills: [],
            updatedAt: serverTimestamp(),
          });

          const skillMapRef = doc(clientDb, 'skillMaps', `${assigneeId}_${projectId}`);
          await setDoc(skillMapRef, {
            userId: assigneeId,
            projectId,
            skills: arrayUnion(...taskSkills),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        if (partnerId && taskSkills.length > 0) {
          const partnerRef = doc(clientDb, 'projects', projectId, 'members', partnerId);
          await updateDoc(partnerRef, {
            skills: arrayUnion(...taskSkills),
            pendingSkills: [],
            updatedAt: serverTimestamp(),
          });

          const partnerSkillMapRef = doc(clientDb, 'skillMaps', `${partnerId}_${projectId}`);
          await setDoc(partnerSkillMapRef, {
            userId: partnerId,
            projectId,
            skills: arrayUnion(...taskSkills),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      }
    }

    return Response.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    return Response.json({ error: error?.message || 'Webhook processing failed' }, { status: 500 });
  }
}
