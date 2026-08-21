'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, collection, query, onSnapshot, addDoc, updateDoc, setDoc, writeBatch, arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { Project, ProjectMember, Task } from '@/lib/types';
import { scoreMembers } from '@/lib/scoring';
import Link from 'next/link';

export default function ProjectPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || '';
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Firestore state
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [joining, setJoining] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Modal controls
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Onboarding Form state
  const [selectedOnboardSkills, setSelectedOnboardSkills] = useState<string[]>([]);
  const [additionalSkills, setAdditionalSkills] = useState<string[]>([]);
  const [additionalSkillInput, setAdditionalSkillInput] = useState('');
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Add Task Form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskTechInput, setTaskTechInput] = useState('');
  const [taskTechStack, setTaskTechStack] = useState<string[]>([]);
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  // Assignment Modal Form state
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [partnerId, setPartnerId] = useState<string>('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Project details and members fetcher with API fallback
  useEffect(() => {
    if (!projectId) return;

    let isSubscribed = true;

    // Initial fetch from Server API (bypasses any client security rule restrictions for non-members)
    const fetchProjectData = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          if (isSubscribed && data.project) {
            setProject(data.project);
            if (Array.isArray(data.members)) {
              setMembers(data.members);
            }
            setLoadingProject(false);
            setLoadingMembers(false);
          }
        } else {
          if (isSubscribed) {
            setLoadingProject(false);
          }
        }
      } catch (err) {
        console.warn('API fetch error for project preview:', err);
      }
    };

    fetchProjectData();

    // Client onSnapshot listener for real-time updates when permitted
    const unsubProj = onSnapshot(doc(db, 'projects', projectId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (isSubscribed) {
          setProject({ id: docSnap.id, ...data } as Project);
          setLoadingProject(false);
        }
      }
    }, (err) => {
      console.warn('Client onSnapshot notice (falling back to server data):', err.message);
      if (isSubscribed) setLoadingProject(false);
    });

    const qMembers = collection(db, 'projects', projectId, 'members');
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      const memList: ProjectMember[] = [];
      snapshot.forEach((d) => {
        memList.push({ id: d.id, ...d.data() } as ProjectMember);
      });
      if (isSubscribed) {
        setMembers(memList);
        setLoadingMembers(false);
      }
    }, (err) => {
      console.warn('Client members listener notice:', err.message);
      if (isSubscribed) setLoadingMembers(false);
    });

    const qTasks = collection(db, 'projects', projectId, 'tasks');
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tList: Task[] = [];
      snapshot.forEach((d) => {
        tList.push({ id: d.id, ...d.data() } as Task);
      });
      if (isSubscribed) {
        setTasks(tList);
        setLoadingTasks(false);
      }
    }, (err) => {
      console.warn('Client tasks listener notice:', err.message);
      if (isSubscribed) setLoadingTasks(false);
    });

    return () => {
      isSubscribed = false;
      unsubProj();
      unsubMembers();
      unsubTasks();
    };
  }, [projectId]);

  // Check if current user is a member
  const currentMember = user ? members.find((m) => m.userId === user.uid) : undefined;
  const isMember = !!currentMember;
  const maxCapacity = project?.maxMembers || 4;
  const currentMemberCount = project?.memberCount || members.length;
  const isProjectFull = currentMemberCount >= maxCapacity;

  // Control onboarding modal visibility (only for members who haven't calibrated skills)
  useEffect(() => {
    if (user && isMember && currentMember) {
      if (currentMember.skillsSet === false) {
        setIsOnboardingOpen(true);
      } else {
        setIsOnboardingOpen(false);
      }
    } else {
      setIsOnboardingOpen(false);
    }
  }, [user, isMember, currentMember]);

  // Copy Invite Link to Clipboard
  const handleCopyInviteLink = () => {
    if (typeof window !== 'undefined') {
      const inviteUrl = `${window.location.origin}/projects/${projectId}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Join Project Action for non-members
  const handleJoinProject = async () => {
    if (!user || !project || isProjectFull) return;
    setJoining(true);
    try {
      // 1. Call Server API join route (guaranteed to succeed with admin SDK)
      const res = await fetch(`/api/projects/${projectId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          name: user.displayName || 'GitHub User',
          email: user.email || '',
          image: user.photoURL || '',
        }),
      });

      // 2. Also execute client-side batch write
      try {
        const batch = writeBatch(db);
        const memberRef = doc(db, 'projects', projectId, 'members', user.uid);
        batch.set(memberRef, {
          userId: user.uid,
          name: user.displayName || 'GitHub User',
          email: user.email || '',
          image: user.photoURL || '',
          role: 'member',
          skills: [],
          skillsSet: false,
          joinedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        const userRef = doc(db, 'users', user.uid);
        batch.set(
          userRef,
          { projectIds: arrayUnion(projectId) },
          { merge: true }
        );

        const projectRef = doc(db, 'projects', projectId);
        batch.update(projectRef, {
          memberCount: increment(1),
          memberIds: arrayUnion(user.uid),
        });

        await batch.commit();
      } catch (clientErr) {
        console.warn('Client batch write note (server API handled join):', clientErr);
      }

      // Re-fetch updated project and member data
      const refreshRes = await fetch(`/api/projects/${projectId}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData.project) setProject(refreshData.project);
        if (refreshData.members) setMembers(refreshData.members);
      }
    } catch (err) {
      console.error('Error joining project:', err);
    } finally {
      setJoining(false);
    }
  };

  // Onboarding Skills toggle (Project Tech Stack)
  const handleToggleOnboardSkill = (skill: string) => {
    if (selectedOnboardSkills.includes(skill)) {
      setSelectedOnboardSkills(selectedOnboardSkills.filter((s) => s !== skill));
    } else {
      setSelectedOnboardSkills([...selectedOnboardSkills, skill]);
    }
  };

  // Additional Skills handlers
  const handleAddAdditionalSkill = () => {
    const trimmed = additionalSkillInput.trim();
    if (trimmed) {
      const tokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
      const updated = Array.from(new Set([...additionalSkills, ...tokens]));
      setAdditionalSkills(updated);
      setAdditionalSkillInput('');
    }
  };

  const handleRemoveAdditionalSkill = (skill: string) => {
    setAdditionalSkills(additionalSkills.filter((s) => s !== skill));
  };

  // Submit Onboarding Skills
  const handleSaveOnboardSkills = async () => {
    if (!user) return;
    setOnboardingSubmitting(true);
    try {
      const remainingTokens = additionalSkillInput.split(',').map((t) => t.trim()).filter(Boolean);
      const allSkills = Array.from(new Set([...selectedOnboardSkills, ...additionalSkills, ...remainingTokens]));

      // 1. Call Server API skills route
      await fetch(`/api/projects/${projectId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          skills: allSkills,
        }),
      });

      // 2. Also update client-side member doc
      try {
        const memberRef = doc(db, 'projects', projectId, 'members', user.uid);
        await updateDoc(memberRef, {
          skills: allSkills,
          skillsSet: true,
        });
      } catch (clientErr) {
        console.warn('Client updateDoc note (server API handled skills):', clientErr);
      }

      // Update local members state
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === user.uid ? { ...m, skills: allSkills, skillsSet: true } : m
        )
      );

      setIsOnboardingOpen(false);
    } catch (err) {
      console.error('Error saving onboarding skills:', err);
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  // Add Task Skills Input
  const handleAddTaskTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = taskTechInput.trim();
      if (tag && !taskTechStack.includes(tag)) {
        setTaskTechStack([...taskTechStack, tag]);
      }
      setTaskTechInput('');
    }
  };

  const handleRemoveTaskTag = (tag: string) => {
    setTaskTechStack(taskTechStack.filter((t) => t !== tag));
  };

  const openAddTaskModal = () => {
    setTaskTitle('');
    setTaskDesc('');
    setTaskTechInput('');
    setTaskTechStack([]);
    setIsAddTaskOpen(true);
  };

  // Create Task Submission
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !user) return;
    setTaskSubmitting(true);

    try {
      const branchName = "feat/" + taskTitle.toLowerCase().trim().replace(/\s+/g, '-');
      await addDoc(collection(db, 'projects', projectId, 'tasks'), {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        skills: taskTechStack,
        branchName,
        status: 'todo',
        type: 'safe',
        projectId,
        assigneeId: null,
        partnerId: null,
        createdAt: serverTimestamp(),
      });

      setIsAddTaskOpen(false);
    } catch (err) {
      console.error('Error creating task:', err);
    } finally {
      setTaskSubmitting(false);
    }
  };

  // Task Status Update
  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, { status: newStatus });
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  // Open Assignment modal and prepare parameters
  const openAssignModal = (task: Task) => {
    setSelectedTask(task);
    setAssigneeId('');
    setPartnerId('');
    setIsAssignOpen(true);
  };

  // Matched Member Scores computation
  const getTaskScoredMembers = () => {
    if (!selectedTask) return [];

    // Calculate done tasks per member in this project that share at least one skill
    const taskHistory: Record<string, number> = {};
    members.forEach((m) => {
      const completedCount = tasks.filter(
        (t) =>
          t.status === 'done' &&
          (t.assigneeId === m.userId || t.partnerId === m.userId) &&
          t.skills.some((s) => selectedTask.skills.includes(s))
      ).length;
      taskHistory[m.userId] = completedCount;
    });

    return scoreMembers(members, selectedTask.skills, taskHistory);
  };

  const scoredMembersList = getTaskScoredMembers();
  const selectedDriverMatch = scoredMembersList.find((m) => m.memberId === assigneeId);

  // Submit Assignment details
  const handleConfirmAssignment = async () => {
    if (!selectedTask || !assigneeId) return;
    setAssignSubmitting(true);

    try {
      const driverMatch = scoredMembersList.find((m) => m.memberId === assigneeId);
      const isOverload = driverMatch?.taskType === 'overload';
      const taskType = driverMatch?.taskType || 'safe';

      const taskRef = doc(db, 'projects', projectId, 'tasks', selectedTask.id);
      await updateDoc(taskRef, {
        assigneeId,
        partnerId: isOverload && partnerId ? partnerId : null,
        type: taskType,
        status: 'todo',
      });

      // Update assignee pending skills
      if (driverMatch && driverMatch.missingSkills.length > 0) {
        const assigneeMember = members.find((m) => m.userId === assigneeId);
        if (assigneeMember) {
          const currentPending = assigneeMember.pendingSkills || [];
          const updatedPending = Array.from(new Set([...currentPending, ...driverMatch.missingSkills]));
          const memberRef = doc(db, 'projects', projectId, 'members', assigneeId);
          await updateDoc(memberRef, { pendingSkills: updatedPending });
        }
      }

      // Update partner pending skills (if any match is overload and navigator is selected)
      if (isOverload && partnerId) {
        const partnerScored = scoredMembersList.find((m) => m.memberId === partnerId);
        if (partnerScored && partnerScored.missingSkills.length > 0) {
          const partnerMember = members.find((m) => m.userId === partnerId);
          if (partnerMember) {
            const currentPending = partnerMember.pendingSkills || [];
            const updatedPending = Array.from(new Set([...currentPending, ...partnerScored.missingSkills]));
            const partnerRef = doc(db, 'projects', projectId, 'members', partnerId);
            await updateDoc(partnerRef, { pendingSkills: updatedPending });
          }
        }
      }

      setIsAssignOpen(false);
      setSelectedTask(null);
    } catch (err) {
      console.error('Error assigning task:', err);
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Helper selectors for cards mapping
  const tasksByStatus = (status: Task['status']) => {
    return tasks.filter((t) => t.status === status);
  };

  if (authLoading || loadingProject || (project && loadingMembers)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-[#fafafa]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
          <p className="text-zinc-400 animate-pulse font-medium">Loading project workspace...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] text-[#fafafa] p-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">Project Not Found</h2>
        <p className="text-zinc-400 text-sm mt-2 max-w-sm">
          This project may have been deleted, or the invite link is invalid.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)]"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#09090b] text-[#fafafa] font-sans flex flex-col">
      {/* Background Decorative Glow */}
      <div className="absolute top-0 left-0 h-[300px] w-[300px] rounded-full bg-violet-600/5 blur-[80px] pointer-events-none"></div>

      {/* Header */}
      <header className="z-10 border-b border-zinc-800 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <svg
              className="h-4 w-4 text-zinc-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
          </Link>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white">{project.name}</h1>
            <p className="text-[11px] text-zinc-500">Project Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Share Invite Link Button */}
          <button
            onClick={handleCopyInviteLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              copiedLink
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700 hover:border-zinc-600'
            }`}
            title="Copy invite link to share with team members"
          >
            {copiedLink ? (
              <>
                <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span>Invite Link Copied!</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                <span>Share Invite Link</span>
              </>
            )}
          </button>

          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt="User profile"
              className="h-8 w-8 rounded-full border border-zinc-700"
            />
          )}
        </div>
      </header>

      {/* CASE B: User is NOT a member yet -> Show Join Project page */}
      {!isMember ? (
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 z-10 flex flex-col items-center justify-center text-center">
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center">
            <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-[0_0_20px_rgba(124,58,237,0.3)]">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                />
              </svg>
            </div>

            <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
              Project Invitation
            </span>

            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              {project.name}
            </h2>

            <p className="text-zinc-400 text-sm mt-3 max-w-md leading-relaxed">
              {project.description || 'You have been invited to collaborate on this project.'}
            </p>

            {/* Tech Stack tags */}
            {project.techStack && project.techStack.length > 0 && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-zinc-500">Project Tech Stack</span>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {project.techStack.map((tech, idx) => (
                    <span
                      key={idx}
                      className="bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2.5 py-1 rounded-lg text-xs font-medium"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Details & Capacity */}
            <div className="mt-6 flex items-center justify-center gap-6 text-xs text-zinc-500 border-t border-b border-zinc-800/80 py-3 w-full max-w-sm">
              {project.leaderName && (
                <div>
                  <span className="text-zinc-600 block">Lead:</span>
                  <span className="text-zinc-300 font-medium">{project.leaderName}</span>
                </div>
              )}
              <div>
                <span className="text-zinc-600 block">Team Capacity:</span>
                <span className={`font-semibold ${isProjectFull ? 'text-rose-400' : 'text-zinc-300'}`}>
                  {currentMemberCount} / {maxCapacity}
                </span>
              </div>
              {project.deadline && (
                <div>
                  <span className="text-zinc-600 block">Deadline:</span>
                  <span className="text-zinc-300 font-medium">{new Date(project.deadline).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Capacity Warning If Full */}
            {isProjectFull && (
              <div className="mt-4 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium max-w-sm">
                This project has reached its maximum group capacity of {maxCapacity} members.
              </div>
            )}

            {/* Join Button */}
            <button
              onClick={handleJoinProject}
              disabled={joining || isProjectFull}
              className={`mt-8 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all ${
                isProjectFull
                  ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                  : 'bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_25px_rgba(124,58,237,0.3)] disabled:opacity-50 active:scale-[0.98] cursor-pointer'
              }`}
            >
              {joining ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : isProjectFull ? (
                'Group is Full'
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>Join as Member</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* CASE A: User IS already a member -> Kanban Board & Team Panel */
        <div className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8">
          
          {/* LEFT (70%): Kanban Board */}
          <div className="flex-1 lg:w-[70%] flex flex-col">
            <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white tracking-tight">Kanban Board</h2>
            <p className="text-xs text-zinc-500">Real-time task synchronization enabled</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1">
            {/* Columns definition */}
            {(['todo', 'inprogress', 'inreview', 'done'] as Task['status'][]).map((status) => {
              const statusTasks = tasksByStatus(status);
              const columnName =
                status === 'todo'
                  ? 'To Do'
                  : status === 'inprogress'
                  ? 'In Progress'
                  : status === 'inreview'
                  ? 'In Review'
                  : 'Done';

              return (
                <div
                  key={status}
                  className="flex flex-col bg-zinc-900/10 border border-zinc-800/80 rounded-2xl p-4 min-h-[400px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                    <h3 className="font-bold text-sm text-zinc-300">{columnName}</h3>
                    <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      {statusTasks.length}
                    </span>
                  </div>

                  {/* Tasks list */}
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[60vh] scrollbar-thin">
                    {statusTasks.map((task) => {
                      const assignee = members.find((m) => m.userId === task.assigneeId);
                      const partner = members.find((m) => m.userId === task.partnerId);

                      return (
                        <div
                          key={task.id}
                          className="bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-xl shadow-md transition-all flex flex-col gap-3 group text-left"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="font-bold text-white text-sm line-clamp-2 leading-snug">
                                {task.title}
                              </h4>
                              {/* Task Type Badge */}
                              {task.assigneeId && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                    task.type === 'safe'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : task.type === 'stretch'
                                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}
                                >
                                  {task.type}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-400 text-xs mt-1.5 line-clamp-2">
                              {task.description || 'No description provided.'}
                            </p>
                          </div>

                          {/* Skill Tags */}
                          {task.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.skills.map((skill, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="bg-zinc-800 text-zinc-500 border border-zinc-800/60 px-1.5 py-0.5 rounded-md text-[9px]"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Assignee / Partner information */}
                          <div className="flex items-center justify-between border-t border-zinc-800/40 pt-3 mt-1">
                            <div className="flex items-center gap-1.5">
                              {task.assigneeId ? (
                                <div className="flex -space-x-1.5 items-center">
                                  {assignee?.image && (
                                    <img
                                      src={assignee.image}
                                      alt={assignee.name}
                                      title={`Driver: ${assignee.name}`}
                                      className="h-5.5 w-5.5 rounded-full border border-zinc-800"
                                    />
                                  )}
                                  {partner?.image && (
                                    <img
                                      src={partner.image}
                                      alt={partner.name}
                                      title={`Navigator: ${partner.name}`}
                                      className="h-5.5 w-5.5 rounded-full border border-zinc-800"
                                    />
                                  )}
                                  <span className="text-[10px] text-zinc-400 ml-2 font-medium">
                                    {assignee?.name}
                                    {partner ? ` + ${partner.name}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => openAssignModal(task)}
                                  className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 hover:underline transition-colors cursor-pointer"
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
                                      d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z"
                                    />
                                  </svg>
                                  <span>Assign Task</span>
                                </button>
                              )}
                            </div>

                            {/* Status mover selection */}
                            <select
                              value={task.status}
                              onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as Task['status'])}
                              className="bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded outline-none transition-colors"
                            >
                              <option value="todo">To Do</option>
                              <option value="inprogress">In Progress</option>
                              <option value="inreview">In Review</option>
                              <option value="done">Done</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Task Trigger (Only in To Do column) */}
                  {status === 'todo' && (
                    <button
                      onClick={openAddTaskModal}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/10 rounded-xl py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-all font-semibold cursor-pointer"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span>Add Task</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT (30%): Team Panel */}
        <div className="w-full lg:w-[30%] bg-zinc-900/10 border border-zinc-800/80 rounded-2xl p-6 flex flex-col self-start">
          <div className="border-b border-zinc-800 pb-4 mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Team Members</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {currentMemberCount} of {maxCapacity} slots filled
              </p>
            </div>

            <button
              onClick={handleCopyInviteLink}
              className="text-[11px] font-semibold bg-violet-600/10 text-violet-300 border border-violet-500/20 hover:bg-violet-600/20 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy project invite link"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              <span>{copiedLink ? 'Copied' : 'Invite'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {members.map((member) => (
              <div key={member.id} className="flex gap-3 items-start border-b border-zinc-900 pb-4 last:border-0 last:pb-0">
                {member.image ? (
                  <img src={member.image} alt={member.name} className="h-9 w-9 rounded-full border border-zinc-800 mt-0.5" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold text-white mt-0.5">
                    {member.name ? member.name[0] : 'U'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-zinc-200 line-clamp-1">{member.name || 'Developer'}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                        member.role === 'leader'
                          ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>

                  {/* Skills tags */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {member.skills && member.skills.map((skill, skIdx) => (
                      <span
                        key={skIdx}
                        className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                    {member.pendingSkills && member.pendingSkills.map((pskill, pskIdx) => (
                      <span
                        key={`p-${pskIdx}`}
                        className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full text-[9px] font-medium animate-pulse"
                        title="Pending Acquisition (learning from assigned task)"
                      >
                        {pskill}*
                      </span>
                    ))}
                    {(!member.skills || member.skills.length === 0) && (!member.pendingSkills || member.pendingSkills.length === 0) && (
                      <span className="text-[10px] text-zinc-600 italic">No skills registered</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

      {/* SKILL ONBOARDING MODAL */}
      {isOnboardingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl flex flex-col items-center text-center max-h-[90vh] overflow-y-auto">
            {/* Onboarding Header */}
            <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-bounce">
              <svg
                className="h-7 w-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.9m10-10.753a60.47 60.47 0 0 1-.49 6.347m-18 .003a3.375 3.375 0 0 0-3.375-3.375H4.83c-.06 3.003.079 6.006.418 8.975M22.007 10.14c.007-.122.012-.244.012-.368A4.498 4.498 0 0 0 17.5 5.25a4.498 4.498 0 0 0-4.5 4.5v.015m7.5-.015a8.607 8.607 0 0 1-7.5 0"
                />
              </svg>
            </div>

            <h3 className="text-2xl font-extrabold text-white">What do you already know?</h3>
            <p className="text-zinc-400 text-xs mt-1.5 max-w-sm">
              Calibrate your profile by selecting project skills and adding any additional expertise.
            </p>

            {/* Section 1: Project Tech Stack */}
            <div className="mt-6 w-full text-left">
              <label className="text-xs font-semibold text-zinc-300 block mb-2">
                1. Select from Project Tech Stack:
              </label>
              <div className="flex flex-wrap gap-2 w-full max-h-[140px] overflow-y-auto p-2.5 border border-zinc-800 rounded-xl bg-zinc-950/50">
                {project.techStack && project.techStack.map((tech) => {
                  const isSelected = selectedOnboardSkills.includes(tech);
                  return (
                    <button
                      key={tech}
                      type="button"
                      onClick={() => handleToggleOnboardSkill(tech)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      {tech} {isSelected ? '✓' : '+'}
                    </button>
                  );
                })}
                {(!project.techStack || project.techStack.length === 0) && (
                  <p className="text-xs text-zinc-500 italic p-1">No specific tech stack listed for this project.</p>
                )}
              </div>
            </div>

            {/* Section 2: Additional Skills */}
            <div className="mt-5 w-full text-left">
              <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                2. Additional Skills / Tools you know:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Docker, Tailwind, AWS, GraphQL..."
                  value={additionalSkillInput}
                  onChange={(e) => setAdditionalSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddAdditionalSkill();
                    }
                  }}
                  className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-3 py-2 rounded-xl text-xs text-white placeholder-zinc-600 transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddAdditionalSkill}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Added additional skill badges */}
              {additionalSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5 p-2 bg-zinc-950/40 rounded-xl border border-zinc-800">
                  {additionalSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-300 border border-violet-500/30 pl-2.5 pr-1 py-0.5 rounded-lg text-xs font-medium"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleRemoveAdditionalSkill(skill)}
                        className="text-violet-400 hover:text-violet-200 p-0.5 rounded"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSaveOnboardSkills}
              disabled={onboardingSubmitting}
              className="mt-7 w-full flex items-center justify-center rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-zinc-100 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {onboardingSubmitting ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
              ) : (
                'Save and Continue to Workspace'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ADD TASK MODAL */}
      {isAddTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setIsAddTaskOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-2xl font-bold text-white mb-6">Create New Task</h3>

            <form onSubmit={handleCreateTask} className="flex flex-col gap-5">
              {/* Task Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement User Authentication"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-600 transition-all"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">Description</label>
                <textarea
                  placeholder="Details and implementation scope..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={4}
                  className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none px-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-600 transition-all resize-none"
                />
              </div>

              {/* Skill Tags */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">
                  Required Skills <span className="text-xs text-zinc-500 font-normal">(Press Enter to add)</span>
                </label>
                <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 min-h-[46px]">
                  {taskTechStack.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center gap-1 bg-violet-600/20 text-violet-300 border border-violet-600/30 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-medium"
                    >
                      {tech}
                      <button
                        type="button"
                        onClick={() => handleRemoveTaskTag(tech)}
                        className="text-violet-400 hover:text-violet-200 transition-colors p-0.5 rounded"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={taskTechStack.length === 0 ? "e.g. Firebase, React" : ""}
                    value={taskTechInput}
                    onChange={(e) => setTaskTechInput(e.target.value)}
                    onKeyDown={handleAddTaskTag}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-zinc-600 px-1 py-0.5"
                  />
                </div>
              </div>

              {/* Readonly Generated Branch Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-300">Git Branch Name</label>
                <div className="bg-zinc-950 border border-zinc-850 px-4 py-2.5 rounded-xl text-xs text-zinc-500 font-mono select-all">
                  {"feat/" + (taskTitle.toLowerCase().trim().replace(/\s+/g, '-') || "task-title-placeholder")}
                </div>
              </div>

              {/* Submit Action */}
              <button
                type="submit"
                disabled={taskSubmitting}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] disabled:opacity-50 active:scale-[0.98]"
              >
                {taskSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  'Create Task'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TASK ASSIGNMENT MODAL */}
      {isAssignOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsAssignOpen(false);
                setSelectedTask(null);
              }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-2xl font-bold text-white mb-2">Assign Task</h3>
            <p className="text-xs text-zinc-500 mb-6">
              Task requires: {selectedTask.skills.join(', ') || 'No skills requested'}
            </p>

            {/* Recommendation list */}
            <div className="flex flex-col gap-4 max-h-[40vh] overflow-y-auto pr-1 mb-6">
              {scoredMembersList.map((scored) => {
                const memberDetails = members.find((m) => m.userId === scored.memberId);
                const isSelectedDriver = assigneeId === scored.memberId;

                return (
                  <div
                    key={scored.memberId}
                    onClick={() => {
                      setAssigneeId(scored.memberId);
                      // Clear partner if match type is not overload
                      if (scored.taskType !== 'overload') {
                        setPartnerId('');
                      }
                    }}
                    className={`flex flex-col gap-3 p-4 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelectedDriver
                        ? 'bg-violet-600/10 border-violet-500/50 hover:bg-violet-600/15'
                        : 'bg-zinc-950/40 border-zinc-800 hover:bg-zinc-950/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {memberDetails?.image ? (
                          <img src={memberDetails.image} alt={scored.memberName} className="h-8 w-8 rounded-full border border-zinc-800" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                            {scored.memberName[0]}
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-sm text-zinc-200">{scored.memberName}</span>
                          <span className="text-[10px] text-zinc-500 block">Suitability Match</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Task Type Tag */}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                            scored.taskType === 'safe'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              : scored.taskType === 'stretch'
                              ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {scored.taskType}
                        </span>
                        <span className="font-mono text-xs font-bold text-violet-400">{scored.score}%</span>
                      </div>
                    </div>

                    {/* Progress suitability bar */}
                    <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-300"
                        style={{ width: `${scored.score}%` }}
                      ></div>
                    </div>

                    {/* Matched vs Missing Skills indicators */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-zinc-500">
                      {scored.matchedSkills.length > 0 && (
                        <div>
                          <span className="text-emerald-500 font-semibold">Matched:</span>{' '}
                          {scored.matchedSkills.join(', ')}
                        </div>
                      )}
                      {scored.missingSkills.length > 0 && (
                        <div>
                          <span className="text-rose-400 font-semibold">Missing:</span>{' '}
                          {scored.missingSkills.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overload double-selectors option */}
            {selectedDriverMatch && selectedDriverMatch.taskType === 'overload' && (
              <div className="flex flex-col gap-2 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl mb-6 text-left animate-slideDown">
                <div className="flex items-center gap-2 text-amber-400">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                  <h4 className="font-bold text-sm">Overload Task Calibration</h4>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  This task represents an overload for {selectedDriverMatch.memberName} (missing 2+ skills). 
                  Assign a Navigator (partner) to support them.
                </p>

                <div className="mt-3 flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Navigator (Partner)</label>
                  <select
                    value={partnerId}
                    onChange={(e) => setPartnerId(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 focus:border-violet-500 outline-none px-3 py-2 rounded-lg text-xs text-white"
                  >
                    <option value="">-- Choose Navigator (Unassigned) --</option>
                    {members
                      .filter((m) => m.userId !== assigneeId)
                      .map((m) => (
                        <option key={m.id} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Confirm Assignment Actions */}
            <div className="flex gap-3 justify-end border-t border-zinc-800 pt-4">
              <button
                onClick={() => {
                  setIsAssignOpen(false);
                  setSelectedTask(null);
                }}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssignment}
                disabled={assignSubmitting || !assigneeId}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] hover:shadow-[0_0_15px_rgba(124,58,237,0.2)]"
              >
                {assignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
