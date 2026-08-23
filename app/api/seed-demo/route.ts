import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin DB not initialized' }, { status: 500 });
    }

    const { userId, userName, userEmail, userImage } = await request.json().catch(() => ({}));

    // 1. Create Demo Project document: "EduCollab App"
    const projectRef = adminDb.collection('projects').doc();
    const projectId = projectRef.id;

    const techStack = ['React', 'Node.js', 'PostgreSQL', 'JWT Auth', 'Docker', 'Git'];

    const projectData = {
      name: 'EduCollab App',
      description: 'Peer-to-peer interactive learning and skill exchange platform built with modern fullstack architecture.',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      techStack,
      maxMembers: 4,
      leaderId: userId || 'demo-leader-id',
      leaderName: userName || 'Lead Developer',
      memberCount: 1,
      memberIds: [userId || 'demo-leader-id'],
      webhookConfigured: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    await projectRef.set(projectData);

    // 2. Add Leader to members subcollection
    if (userId) {
      await projectRef.collection('members').doc(userId).set({
        userId,
        name: userName || 'Developer',
        email: userEmail || '',
        image: userImage || '',
        role: 'leader',
        skills: ['React', 'Git'],
        skillsSet: true,
        pendingSkills: ['Node.js'],
        joinedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // Update user's projectIds
      await adminDb.collection('users').doc(userId).set(
        {
          projectIds: FieldValue.arrayUnion(projectId),
        },
        { merge: true }
      );
    }

    // 3. Create 4 Demo Tasks
    const tasks = [
      {
        title: 'Build login API',
        description: 'Implement JWT authentication endpoints with bcrypt password hashing and token refresh.',
        skills: ['Node.js', 'JWT Auth'],
        status: 'done',
        type: 'safe',
        branchName: 'feat/auth-login-api',
        projectId,
        assigneeId: userId || null,
        partnerId: null,
        hasBlocker: false,
        blockerCount: 0,
        lastCommit: {
          message: 'feat: add JWT auth middleware and login route closes #task-1',
          author: userName || 'Developer',
          timestamp: new Date().toISOString(),
          sha: 'a8f3b219e4',
          url: 'https://github.com',
        },
        createdAt: FieldValue.serverTimestamp(),
      },
      {
        title: 'Frontend dashboard',
        description: 'Build responsive Kanban board layout with Tailwind styling and live presence indicators.',
        skills: ['React'],
        status: 'inprogress',
        type: 'safe',
        branchName: 'feat/ui-dashboard',
        projectId,
        assigneeId: userId || null,
        partnerId: null,
        hasBlocker: false,
        blockerCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      },
      {
        title: 'DB schema setup',
        description: 'Configure Prisma migrations, foreign keys, and indexes for projects, users, and tasks tables.',
        skills: ['PostgreSQL'],
        status: 'inreview',
        type: 'stretch',
        branchName: 'feat/db-schema',
        projectId,
        assigneeId: userId || null,
        partnerId: null,
        hasBlocker: false,
        blockerCount: 0,
        pr: {
          title: 'feat: database schemas and indexing #3',
          url: 'https://github.com',
          number: 3,
        },
        createdAt: FieldValue.serverTimestamp(),
      },
      {
        title: 'Docker configuration',
        description: 'Write multi-stage Dockerfile and docker-compose.yml for local development environment.',
        skills: ['Docker'],
        status: 'todo',
        type: 'stretch',
        branchName: 'feat/docker-compose',
        projectId,
        assigneeId: null,
        partnerId: null,
        hasBlocker: false,
        blockerCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      },
    ];

    for (const t of tasks) {
      await projectRef.collection('tasks').add(t);
    }

    return NextResponse.json({ success: true, projectId, project: projectData });
  } catch (err: any) {
    console.error('Error seeding demo data:', err);
    return NextResponse.json({ error: err.message || 'Failed to seed demo data' }, { status: 500 });
  }
}
