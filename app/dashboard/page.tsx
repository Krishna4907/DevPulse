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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxMembers, setMaxMembers] = useState<number>(4);
  const [techInput, setTechInput] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
    setIsModalOpen(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !deadline || !user) return;
    setSubmitting(true);

    try {
      // Collect all tags including uncommitted text in techInput
      const remainingTags = techInput.split(',').map((t) => t.trim()).filter(Boolean);
      const finalTechStack = Array.from(new Set([...techStack, ...remainingTags]));

      // 1. Create the project document using client SDK
      const projectRef = await addDoc(collection(db, 'projects'), {
        name: projectName.trim(),
        description: description.trim(),
        deadline,
        techStack: finalTechStack,
        maxMembers: Number(maxMembers) || 4,
        leaderId: user.uid,
        leaderName: user.displayName || 'GitHub User',
        memberCount: 1,
        memberIds: [user.uid],
        webhookConfigured: false,
        createdAt: serverTimestamp(),
      });

      // 2. Add leader as first member in subcollection
      await setDoc(
        doc(db, 'projects', projectRef.id, 'members', user.uid),
        {
          userId: user.uid,
          name: user.displayName || 'GitHub User',
          email: user.email || '',
          image: user.photoURL || '',
          role: 'leader',
          skills: [],
          skillsSet: false,
          pendingSkills: [],
          joinedAt: serverTimestamp(),
        }
      );

      // 3. Add projectId to user's projectIds array
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        {
          projectIds: arrayUnion(projectRef.id),
        },
        { merge: true }
      );

      // Close modal and redirect immediately
      setIsModalOpen(false);
      setSubmitting(false);
      router.push(`/projects/${projectRef.id}`);
    } catch (err: any) {
      console.error('Error creating project:', err);
      alert(err.message || 'Error creating project. Please try again.');
      setSubmitting(false);
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
      {/* Background Decorative Glow */}
      <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/5 blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="z-10 border-b border-zinc-800 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-4">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User profile'}
              className="h-8 w-8 rounded-full border border-zinc-700"
            />
          )}
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 z-10 flex flex-col justify-start">
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

          <button
            onClick={openModal}
            className="self-start md:self-auto flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] active:scale-[0.98]"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span>Create Project</span>
          </button>
        </div>

        {/* Dashboard Projects State */}
        {loadingProjects ? (
          <div className="mt-16 flex justify-center items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
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
          /* Dashboard Empty State Placeholder */
          <div className="mt-12 flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-12 text-center bg-zinc-900/10">
            <div className="h-12 w-12 rounded-xl bg-zinc-800/50 flex items-center justify-center mb-4 text-zinc-500">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12.75V12A9 9 0 0 1 12 3v0a9 9 0 0 1 9 9v.75m-.75-3.75h.008v.008H21V9m-9 12a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-zinc-300">No active projects</h3>
            <p className="text-zinc-500 text-sm max-w-sm mt-1">
              Get started by creating a new project or request to join an existing team.
            </p>
          </div>
        )}
      </main>

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

              {/* Submit Action */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] disabled:opacity-50 active:scale-[0.98] cursor-pointer"
              >
                {submitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
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
