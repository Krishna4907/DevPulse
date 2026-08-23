// Demo seed script for DevPulse Phase 7
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Load environment variables from .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'FIREBASE_ADMIN_PRIVATE_KEY') {
        value = value.replace(/\\n/g, '\n');
      }
      process.env[key] = value;
    }
  });
}

function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  let key = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  if (!key.startsWith('-----')) {
    key = Buffer.from(key, 'base64').toString('utf-8');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
}

async function seed() {
  console.log('🚀 Seeding demo project: EduCollab App...');
  const app = getAdminApp();
  const db = app.firestore();

  const projectRef = db.collection('projects').doc();
  const projectId = projectRef.id;

  const projectData = {
    name: 'EduCollab App',
    description: 'Peer-to-peer interactive learning and skill exchange platform built with modern fullstack architecture.',
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    techStack: ['React', 'Node.js', 'PostgreSQL', 'JWT Auth', 'Docker', 'Git'],
    maxMembers: 4,
    leaderId: 'demo-leader',
    leaderName: 'Alex Rivers',
    memberCount: 1,
    memberIds: ['demo-leader'],
    webhookConfigured: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await projectRef.set(projectData);
  console.log('✓ Project created with ID:', projectId);

  const tasks = [
    {
      title: 'Build login API',
      description: 'Implement JWT authentication endpoints with bcrypt password hashing and token refresh.',
      skills: ['Node.js', 'JWT Auth'],
      status: 'done',
      type: 'safe',
      branchName: 'feat/auth-login-api',
      projectId,
      assigneeId: 'demo-leader',
      partnerId: null,
      hasBlocker: false,
      blockerCount: 0,
      lastCommit: {
        message: 'feat: add JWT auth middleware and login route closes #task-1',
        author: 'Alex Rivers',
        timestamp: new Date().toISOString(),
        sha: 'a8f3b219e4',
        url: 'https://github.com',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      title: 'Frontend dashboard',
      description: 'Build responsive Kanban board layout with Tailwind styling and live presence indicators.',
      skills: ['React'],
      status: 'inprogress',
      type: 'safe',
      branchName: 'feat/ui-dashboard',
      projectId,
      assigneeId: 'demo-leader',
      partnerId: null,
      hasBlocker: false,
      blockerCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      title: 'DB schema setup',
      description: 'Configure Prisma migrations, foreign keys, and indexes for projects, users, and tasks tables.',
      skills: ['PostgreSQL'],
      status: 'inreview',
      type: 'stretch',
      branchName: 'feat/db-schema',
      projectId,
      assigneeId: 'demo-leader',
      partnerId: null,
      hasBlocker: false,
      blockerCount: 0,
      pr: {
        title: 'feat: database schemas and indexing #3',
        url: 'https://github.com',
        number: 3,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const t of tasks) {
    await projectRef.collection('tasks').add(t);
  }

  console.log('✓ 4 Demo tasks seeded successfully!');
  console.log(`🎉 Demo Project URL: http://localhost:3000/projects/${projectId}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error seeding demo:', err);
  process.exit(1);
});
