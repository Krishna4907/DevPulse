'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, writeBatch, arrayUnion, serverTimestamp, addDoc } from 'firebase/firestore';
import { Project } from '@/lib/types';
import Link from 'next/link';

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Page Title & Toast Notification State
  useEffect(() => {
    document.title = 'Dashboard | DevPulse';
  }, []);

  interface ToastMessage {
    id: string;
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  }
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinLinkInput, setJoinLinkInput] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxMembers, setMaxMembers] = useState<number>(4);
  const [techInput, setTechInput] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Listen to current user's doc from "users/{userId}" and fetch projects in real-time
  useEffect(() => {
    if (!user) return;
    setLoadingProjects(true);

    const userDocRef = doc(db, 'users', user.uid);
    let unsubProjects: (() => void)[] = [];

    const unsubUser = onSnapshot(
      userDocRef,
      (userSnap) => {
        // Clean up any previously attached project listeners
        unsubProjects.forEach((unsub) => unsub());
        unsubProjects = [];

        if (!userSnap.exists()) {
          setProjects([]);
          setLoadingProjects(false);
          return;
        }

        const userData = userSnap.data();
        const projectIds: string[] = userData?.projectIds || [];

        if (projectIds.length === 0) {
          setProjects([]);
          setLoadingProjects(false);
          return;
        }

        // Fetch via API to guarantee immediate render
        fetch(`/api/projects/user/${user.uid}`)
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data.projects) && data.projects.length > 0) {
              setProjects(data.projects);
              setLoadingProjects(false);
            }
          })
          .catch((err) => console.warn('API fetch notice for dashboard:', err));

        // Store loaded projects keyed by ID for reactive updates
        const projectsMap = new Map<string, Project>();
        let loadedCount = 0;

        projectIds.forEach((pid) => {
          const projRef = doc(db, 'projects', pid);
          const unsubProj = onSnapshot(
            projRef,
            (projSnap) => {
              if (projSnap.exists()) {
                const data = projSnap.data();
                projectsMap.set(pid, {
                  id: projSnap.id,
                  name: data.name,
                  description: data.description,
                  deadline: data.deadline,
                  techStack: data.techStack || [],
                  leaderId: data.leaderId,
                  leaderName: data.leaderName,
                  memberCount: data.memberCount || 1,
                  maxMembers: data.maxMembers || 4,
                  memberIds: data.memberIds || [],
                  createdAt: data.createdAt,
                });
              } else {
                projectsMap.delete(pid);
              }

              // Maintain consistent ordering matching user's projectIds
              const orderedProjects: Project[] = [];
              for (const id of projectIds) {
                const p = projectsMap.get(id);
                if (p) orderedProjects.push(p);
              }
              if (orderedProjects.length > 0) {
                setProjects(orderedProjects);
              }
              setLoadingProjects(false);
            },
            (err) => {
              console.warn(`Real-time listener note for project ${pid}:`, err);
              loadedCount++;
              if (loadedCount === projectIds.length) {
                setLoadingProjects(false);
              }
            }
          );
          unsubProjects.push(unsubProj);
        });
      },
      (err) => {
        console.warn('Error listening to user document, using API fallback:', err);
        fetch(`/api/projects/user/${user.uid}`)
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data.projects)) {
              setProjects(data.projects);
            }
          })
          .finally(() => setLoadingProjects(false));
      }
    );

    return () => {
      unsubUser();
      unsubProjects.forEach((unsub) => unsub());
    };
  }, [user]);

  // Sign out redirect
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const addTagsFromString = (str: string) => {
    const tokens = str.split(',').map((t) => t.trim()).filter(Boolean);
    if (tokens.length > 0) {
      setTechStack((prev) => Array.from(new Set([...prev, ...tokens])));
    }
  };

  const handleTechInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      const toAdd = parts.slice(0, -1).map((t) => t.trim()).filter(Boolean);
      if (toAdd.length > 0) {
        setTechStack((prev) => Array.from(new Set([...prev, ...toAdd])));
      }
      setTechInput(parts[parts.length - 1]);
    } else {
      setTechInput(val);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (techInput.trim()) {
        addTagsFromString(techInput);
        setTechInput('');
      }
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTechStack(techStack.filter((t) => t !== tag));
  };

  const openModal = () => {
    setProjectName('');
    setDescription('');
    setDeadline('');
    setMaxMembers(4);
    setTechInput('');
    setTechStack([]);
    setCreateError(null);
    setIsModalOpen(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // 1. Verify authenticated user
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[DevPulse] auth.currentUser is null during project creation');
      setCreateError('Please sign in again.');
      alert('Please sign in again.');
      router.push('/');
      return;
    }

    if (!projectName.trim() || !deadline) {
      setCreateError('Please provide a project name and deadline.');
      return;
    }

    setSubmitting(true);

    try {
      // 25-Second Timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Failed to create project. Please try again (operation timed out).')),
          25000
        )
      );

      const createOperation = async () => {
        // Collect all tags including uncommitted text in techInput
        const remainingTags = techInput.split(',').map((t) => t.trim()).filter(Boolean);
        const finalTechStack = Array.from(new Set([...techStack, ...remainingTags]));

        console.log('[DevPulse] 1. Starting project creation for user:', currentUser.uid, currentUser.displayName);

        // A. Create project document
        console.log('[DevPulse] 2. Writing project document to Firestore...');
        const projectRef = await addDoc(collection(db, 'projects'), {
          name: projectName.trim(),
          description: description.trim(),
          deadline,
          techStack: finalTechStack,
          maxMembers: Number(maxMembers) || 4,
          leaderId: currentUser.uid,
          leaderName: currentUser.displayName || 'GitHub User',
          memberCount: 1,
          memberIds: [currentUser.uid],
          webhookConfigured: false,
          createdAt: serverTimestamp(),
        });
        console.log('[DevPulse] Project doc created with ID:', projectRef.id);

        // B. Add leader as first member in subcollection
        console.log('[DevPulse] 3. Adding leader to members subcollection...');
        await setDoc(
          doc(db, 'projects', projectRef.id, 'members', currentUser.uid),
          {
            userId: currentUser.uid,
            name: currentUser.displayName || 'GitHub User',
            email: currentUser.email || '',
            image: currentUser.photoURL || '',
            role: 'leader',
            skills: [],
            skillsSet: false,
            pendingSkills: [],
            joinedAt: serverTimestamp(),
          }
        );
        console.log('[DevPulse] Leader member doc added successfully');

        // C. Add projectId to user's projectIds array
        console.log('[DevPulse] 4. Updating user projectIds...');
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(
          userRef,
          {
            projectIds: arrayUnion(projectRef.id),
          },
          { merge: true }
        );
        console.log('[DevPulse] User doc updated with projectId successfully');

        return projectRef.id;
      };

      // Race between creation and 10s timeout
      const createdId = (await Promise.race([createOperation(), timeoutPromise])) as string;

      console.log('[DevPulse] Project creation completely finished! Redirecting to:', createdId);
      setIsModalOpen(false);
      setSubmitting(false);
      showToast('Project created successfully', 'success');
      router.push(`/projects/${createdId}`);
    } catch (err: any) {
      console.error('[DevPulse] Error creating project:', err);
      setCreateError(err?.message || 'Failed to create project. Please try again.');
      showToast(err?.message || 'Failed to create project', 'error');
      setSubmitting(false);
    }
  };

  const handleJoinWithLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinLinkInput.trim()) return;

    let targetId = joinLinkInput.trim();
    const match = targetId.match(/projects\/([a-zA-Z0-9_-]+)/);
    if (match) {
      targetId = match[1];
    }

    showToast('Redirecting to project workspace...', 'info');
    router.push(`/projects/${targetId}`);
  };

  const handleSeedDemoData = async () => {
    setSeedingDemo(true);
    try {
      const res = await fetch('/api/seed-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid,
          userName: user?.displayName || 'Demo Leader',
          userEmail: user?.email || '',
          userImage: user?.photoURL || '',
        }),
      });
      const data = await res.json();
      if (data.success && data.projectId) {
        showToast('Demo project "EduCollab App" seeded successfully!', 'success');
        router.push(`/projects/${data.projectId}`);
      } else {
        showToast(data.error || 'Failed to seed demo data', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error seeding demo data', 'error');
    } finally {
      setSeedingDemo(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-[#fafafa]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
          <p className="text-zinc-400 animate-pulse font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#09090b] text-[#fafafa] font-sans flex flex-col">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2.5 transition-all animate-in slide-in-from-bottom-5 duration-200 border ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
                : toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/40'
                : 'bg-violet-950/90 text-violet-200 border-violet-500/40'
            }`}
          >
            <span>
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'warning' && '⚠️'}
              {toast.type === 'info' && '✨'}
            </span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Background Decorative Glow */}
      <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/5 blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="z-10 border-b border-zinc-800 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-[0_0_10px_rgba(124,58,237,0.2)]">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              DevPulse
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User profile'}
              className="h-8 w-8 rounded-full border border-zinc-700"
            />
          )}
          <button
            onClick={() => signOut(auth)}
            className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 z-10 flex flex-col justify-start">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-zinc-800/80 pb-8">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Welcome, {user.displayName || user.email || 'Developer'}
            </h2>
            <p className="text-zinc-400 text-sm mt-1">
              Here is what is happening with your student team collaborations today.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
            >
              <span>🔗 Join with Link</span>
            </button>

            <button
              onClick={openModal}
              className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] active:scale-[0.98] cursor-pointer"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Create Project</span>
            </button>
          </div>
        </div>

        {/* Dashboard Projects State */}
        {loadingProjects ? (
          /* SKELETON LOADERS */
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 animate-pulse h-[240px] flex flex-col justify-between"
              >
                <div className="flex flex-col gap-3">
                  <div className="h-5 w-2/3 bg-zinc-800 rounded-lg"></div>
                  <div className="h-3 w-full bg-zinc-800/60 rounded"></div>
                  <div className="h-3 w-4/5 bg-zinc-800/60 rounded"></div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="h-4 w-12 bg-zinc-800 rounded"></div>
                    <div className="h-4 w-12 bg-zinc-800 rounded"></div>
                  </div>
                  <div className="h-4 w-full bg-zinc-800/40 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="mt-10">
            <h3 className="text-lg font-bold text-zinc-300 mb-6">Active Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex flex-col justify-between p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md hover:bg-zinc-900/50 hover:border-zinc-700/80 hover:shadow-[0_0_30px_rgba(124,58,237,0.05)] transition-all cursor-pointer h-[240px]"
                >
                  <div>
                    <h4 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors line-clamp-1">
                      {project.name}
                    </h4>
                    <p className="text-zinc-400 text-sm mt-2 line-clamp-3">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>

                  <div>
                    {/* Tech tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4 max-h-[32px] overflow-hidden">
                      {project.techStack.map((tech, idx) => (
                        <span
                          key={idx}
                          className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>

                    {/* Footer Info */}
                    <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800/60 pt-3">
                      <div className="flex items-center gap-1.5">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A2.25 2.25 0 0 1 12.75 21.5h-1.5a2.25 2.25 0 0 1-2.25-2.263V19.13m4.5-.002v-.003a9.702 9.702 0 0 0-4.5 0v.003M12 18.75h-.008v.008H12V18.75Zm-2.25-3c0-1.854 1.007-3.473 2.5-4.33a4.502 4.502 0 0 1 6 0c1.493.857 2.5 2.476 2.5 4.33H9.75Zm5.25-6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 18.75a.75.75 0 0 1-.75-.75 3.75 3.75 0 0 1 5.09-3.53A4.505 4.505 0 0 0 9 15.75H9a4.5 4.5 0 0 0 1.25 3.029.75.75 0 0 1-.5 1.221H6.75A3.75 3.75 0 0 1 6 18.75Zm-1.5-6a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0Z"
                          />
                        </svg>
                        <span>{project.memberCount}/{project.maxMembers || 4} members</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                          />
                        </svg>
                        <span>Due {new Date(project.deadline).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="mt-12 flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-12 text-center bg-zinc-900/10">
            <div className="h-14 w-14 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4 text-violet-400 shadow-[0_0_20px_rgba(124,58,237,0.15)]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">No projects yet</h3>
            <p className="text-zinc-400 text-xs sm:text-sm max-w-md mt-1.5 leading-relaxed">
              Create your first project or join a team with an invite link.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={openModal}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] active:scale-95 cursor-pointer"
              >
                Create Project
              </button>
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:text-white text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              >
                Join with Link
              </button>
              <button
                onClick={handleSeedDemoData}
                disabled={seedingDemo}
                className="px-4 py-2.5 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-300 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                {seedingDemo ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                    <span>Seeding Demo...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Seed Demo Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* JOIN WITH LINK MODAL */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">Join Project Team</h3>
              <button
                onClick={() => setIsJoinModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleJoinWithLink} className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Project Link or ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste invite link or projectId..."
                  value={joinLinkInput}
                  onChange={(e) => setJoinLinkInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold shadow-[0_0_15px_rgba(124,58,237,0.3)] cursor-pointer"
                >
                  Join Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <h3 className="text-2xl font-bold text-white mb-6">Create New Project</h3>

            <form onSubmit={handleCreateProject} className="flex flex-col gap-5">
              {/* Project Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Portfolio Builder"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-600 transition-all"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">Description</label>
                <textarea
                  placeholder="Summarize your project goals and scope..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-600 transition-all resize-none"
                />
              </div>

              {/* Deadline & Max Members Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-300">Deadline</label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white transition-all [color-scheme:dark]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-300">
                    Group Size <span className="text-xs text-zinc-500 font-normal">(Max members)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-600 transition-all"
                  />
                </div>
              </div>

              {/* Tech Stack tags */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">
                  Tech Stack <span className="text-xs text-zinc-500 font-normal">(Type comma or press Enter to add)</span>
                </label>
                <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 min-h-[46px]">
                  {techStack.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center gap-1 bg-violet-600/20 text-violet-300 border border-violet-600/30 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-medium"
                    >
                      {tech}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tech)}
                        className="text-violet-400 hover:text-violet-200 transition-colors p-0.5 rounded"
                      >
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={techStack.length === 0 ? "e.g. Next.js, React, Node, Python" : "Add more..."}
                    value={techInput}
                    onChange={handleTechInputChange}
                    onKeyDown={handleAddTag}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-zinc-600 px-1 py-0.5 min-w-[120px]"
                  />
                </div>
              </div>

              {/* Error Message Display */}
              {createError && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-in fade-in duration-200">
                  <svg
                    className="h-4 w-4 shrink-0 text-rose-400 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                    />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-rose-200">Project Creation Failed</span>
                    <span>{createError}</span>
                  </div>
                </div>
              )}

              {/* Submit Action */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] disabled:opacity-50 active:scale-[0.98] cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  'Create Project'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
// testing phase 3 github weebhook//

// again testing phase 3 // 