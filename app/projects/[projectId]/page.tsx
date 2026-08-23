'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  writeBatch,
  arrayUnion,
  increment,
  serverTimestamp,
  orderBy,
  limitToLast,
  getDoc,
} from 'firebase/firestore';
import { Project, ProjectMember, Task, ChatMessage, Presence, Blocker } from '@/lib/types';
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
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(true);

  // Phase 4: Chat & Presence state
  const [activePanelTab, setActivePanelTab] = useState<'team' | 'chat'>('team');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>({});
  const [lastReadTimestamp, setLastReadTimestamp] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Webhook Setup Modal state
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUpdating, setWebhookUpdating] = useState(false);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [copiedWebhookSecret, setCopiedWebhookSecret] = useState(false);
  const [copiedWebhookContentType, setCopiedWebhookContentType] = useState(false);

  // Phase 5 & 6: Leader Dashboard, Blockers & AI Diagnosis state
  const [viewMode, setViewMode] = useState<'board' | 'dashboard'>('board');
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [isBlockerModalOpen, setIsBlockerModalOpen] = useState(false);
  const [selectedBlockerTask, setSelectedBlockerTask] = useState<Task | null>(null);
  const [blockerDescription, setBlockerDescription] = useState('');
  const [blockerType, setBlockerType] = useState<'Technical error' | 'Unclear requirement' | 'Need review' | 'Waiting on teammate'>('Technical error');
  const [blockerNotifyWhole, setBlockerNotifyWhole] = useState(false);
  const [blockerSubmitting, setBlockerSubmitting] = useState(false);
  const [blockerSuccessMessage, setBlockerSuccessMessage] = useState<string | null>(null);
  const [recentAiDiagnosis, setRecentAiDiagnosis] = useState<{ causes: string[]; fix: string; resource?: string } | null>(null);
  const [resolvingBlockerId, setResolvingBlockerId] = useState<string | null>(null);

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

  // Phase 4: Presence Heartbeat & Visibility Lifecycle
  useEffect(() => {
    if (!user || !projectId) return;

    const userPresenceRef = doc(db, 'presence', user.uid);

    // Initial online presence
    setDoc(
      userPresenceRef,
      {
        userId: user.uid,
        projectId,
        online: true,
        lastSeen: serverTimestamp(),
        typing: false,
        typingInProject: '',
      },
      { merge: true }
    ).catch((err) => console.warn('Presence init notice:', err.message));

    const handleVisibility = () => {
      if (document.hidden) {
        updateDoc(userPresenceRef, {
          online: false,
          lastSeen: serverTimestamp(),
          typing: false,
        }).catch(() => {});
      } else {
        updateDoc(userPresenceRef, {
          online: true,
          projectId,
          lastSeen: serverTimestamp(),
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleVisibility);

    // Presence listener across team
    const unsubPresence = onSnapshot(
      collection(db, 'presence'),
      (snapshot) => {
        const pMap: Record<string, Presence> = {};
        snapshot.forEach((d) => {
          pMap[d.id] = { userId: d.id, ...d.data() } as Presence;
        });
        setPresenceMap(pMap);
      },
      (err) => console.warn('Presence listener notice:', err.message)
    );

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleVisibility);
      unsubPresence();
      updateDoc(userPresenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
        typing: false,
      }).catch(() => {});
    };
  }, [user, projectId]);

  // Phase 4: Real-time Messages Listener
  useEffect(() => {
    if (!projectId) return;

    const messagesQuery = query(
      collection(db, 'projects', projectId, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(100)
    );

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((d) => {
          msgs.push({ id: d.id, ...d.data() } as ChatMessage);
        });
        setMessages(msgs);
      },
      (err) => console.warn('Messages listener notice:', err.message)
    );

    return () => unsubMessages();
  }, [projectId]);

  // Phase 4: Last-read tracking listener
  useEffect(() => {
    if (!user || !projectId) return;
    const metaRef = doc(db, 'users', user.uid, 'projectMeta', projectId);
    const unsubMeta = onSnapshot(
      metaRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setLastReadTimestamp(docSnap.data()?.lastReadAt);
        }
      },
      (err) => console.warn('Project meta listener notice:', err.message)
    );
    return () => unsubMeta();
  }, [user, projectId]);

  // Phase 4: When Chat tab is active, mark read & scroll to bottom
  useEffect(() => {
    if (activePanelTab === 'chat' && user && projectId) {
      const metaRef = doc(db, 'users', user.uid, 'projectMeta', projectId);
      setDoc(metaRef, { lastReadAt: serverTimestamp() }, { merge: true }).catch(() => {});
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activePanelTab, messages, user, projectId]);

  // Compute unread count when on 'team' tab
  const unreadCount =
    activePanelTab === 'chat'
      ? 0
      : messages.filter((m) => {
          if (m.userId === user?.uid) return false;
          if (!lastReadTimestamp) return true;
          const msgTime = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : new Date(m.createdAt).getTime();
          const readTime = lastReadTimestamp?.toDate ? lastReadTimestamp.toDate().getTime() : new Date(lastReadTimestamp).getTime();
          return msgTime > readTime;
        }).length;

  // Typing users list
  const typingUsers = Object.values(presenceMap)
    .filter((p) => p.typing && p.typingInProject === projectId && p.userId !== user?.uid)
    .map((p) => {
      const member = members.find((m) => m.userId === p.userId);
      return member?.name || 'A team member';
    });

  // Message Send handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || sendingMessage || !user) return;
    const text = messageInput.trim();
    setMessageInput('');
    setSendingMessage(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    updateDoc(doc(db, 'presence', user.uid), { typing: false }).catch(() => {});

    try {
      await addDoc(collection(db, 'projects', projectId, 'messages'), {
        userId: user.uid,
        userName: user.displayName || 'Developer',
        userImage: user.photoURL || '',
        text,
        createdAt: serverTimestamp(),
      });

      setDoc(
        doc(db, 'users', user.uid, 'projectMeta', projectId),
        { lastReadAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    } catch (err: any) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Message Input Change & Typing Debounce
  const handleMessageInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    if (user) {
      const userPresenceRef = doc(db, 'presence', user.uid);
      updateDoc(userPresenceRef, {
        typing: true,
        typingInProject: projectId,
      }).catch(() => {});

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        updateDoc(userPresenceRef, { typing: false }).catch(() => {});
      }, 2000);
    }
  };

  // Handle Enter to Send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format Chat Timestamp
  const formatChatTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return timeStr;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  // Format Presence Last Seen
  const formatLastSeen = (timestamp: any) => {
    if (!timestamp) return 'Offline';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Offline';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Active just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  };

  // Phase 5: Blockers listener across all project tasks
  useEffect(() => {
    if (!projectId || tasks.length === 0) {
      setBlockers([]);
      return;
    }

    const unsubs: (() => void)[] = [];
    const taskBlockersMap: Record<string, Blocker[]> = {};

    tasks.forEach((task) => {
      const qBlockers = collection(db, 'projects', projectId, 'tasks', task.id, 'blockers');
      const unsub = onSnapshot(
        qBlockers,
        (snapshot) => {
          const list: Blocker[] = [];
          snapshot.forEach((d) => {
            list.push({
              id: d.id,
              taskId: task.id,
              taskTitle: task.title,
              projectId,
              ...d.data(),
            } as Blocker);
          });
          taskBlockersMap[task.id] = list;
          const allBlockers = Object.values(taskBlockersMap).flat();
          setBlockers(allBlockers);
        },
        (err) => console.warn(`Blockers listener notice for task ${task.id}:`, err.message)
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [projectId, tasks]);

  // Computed values for dashboard & blockers
  const unresolvedBlockers = blockers.filter((b) => !b.resolved);
  const tasksWithBlockerCount = tasks.filter(
    (t) => t.hasBlocker || blockers.some((b) => b.taskId === t.id && !b.resolved)
  ).length;

  const filteredTasks = filterMemberId
    ? tasks.filter((t) => t.assigneeId === filterMemberId || t.partnerId === filterMemberId)
    : tasks;

  // Open Blocker Modal
  const handleOpenBlockerModal = (task: Task) => {
    setSelectedBlockerTask(task);
    setBlockerDescription('');
    setBlockerType('Technical error');
    setBlockerNotifyWhole(false);
    setBlockerSuccessMessage(null);
    setRecentAiDiagnosis(null);
    setIsBlockerModalOpen(true);
  };

  // Submit Blocker with AI Diagnosis
  const handleRaiseBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlockerTask || !blockerDescription.trim() || blockerSubmitting || !user) return;

    setBlockerSubmitting(true);
    setBlockerSuccessMessage('Blocker raised. AI is diagnosing...');
    setRecentAiDiagnosis(null);

    const taskId = selectedBlockerTask.id;

    try {
      // 1. Save blocker document
      const blockerRef = await addDoc(
        collection(db, 'projects', projectId, 'tasks', taskId, 'blockers'),
        {
          userId: user.uid,
          userName: user.displayName || 'Developer',
          userImage: user.photoURL || '',
          description: blockerDescription.trim(),
          type: blockerType,
          notifyWhole: blockerNotifyWhole,
          resolved: false,
          aiDiagnosis: null,
          createdAt: serverTimestamp(),
        }
      );

      // 2. Update task hasBlocker flag & blockerCount
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, {
        hasBlocker: true,
        blockerCount: increment(1),
      });

      // 3. Call AI diagnosis API
      try {
        const diagRes = await fetch('/api/diagnose-blocker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskTitle: selectedBlockerTask.title,
            taskSkills: selectedBlockerTask.skills,
            blockerDescription: blockerDescription.trim(),
            blockerType,
          }),
        });

        if (diagRes.ok) {
          const diagData = await diagRes.json();
          if (diagData?.diagnosis) {
            setRecentAiDiagnosis(diagData.diagnosis);
            // Save diagnosis to blocker doc
            await updateDoc(blockerRef, {
              aiDiagnosis: diagData.diagnosis,
            });
          }
        }
      } catch (aiErr) {
        console.error('Error getting AI diagnosis:', aiErr);
      }

      setBlockerSuccessMessage('Blocker submitted and AI diagnosis generated!');
    } catch (err: any) {
      console.error('Error raising blocker:', err);
      alert('Failed to raise blocker. Please try again.');
      setBlockerSuccessMessage(null);
    } finally {
      setBlockerSubmitting(false);
    }
  };

  // Mark Blocker as Resolved
  const handleResolveBlocker = async (blocker: Blocker) => {
    if (!blocker.taskId || !blocker.id) return;
    setResolvingBlockerId(blocker.id);

    try {
      // 1. Mark blocker resolved
      const blockerRef = doc(db, 'projects', projectId, 'tasks', blocker.taskId, 'blockers', blocker.id);
      await updateDoc(blockerRef, {
        resolved: true,
      });

      // 2. Update task blocker count & flag
      const taskRef = doc(db, 'projects', projectId, 'tasks', blocker.taskId);
      const remainingForTask = blockers.filter((b) => b.taskId === blocker.taskId && !b.resolved && b.id !== blocker.id);

      await updateDoc(taskRef, {
        blockerCount: increment(-1),
        hasBlocker: remainingForTask.length > 0,
      });
    } catch (err: any) {
      console.error('Error resolving blocker:', err);
      alert('Failed to resolve blocker. Please try again.');
    } finally {
      setResolvingBlockerId(null);
    }
  };

  // Check if current user is a member or leader
  const currentMember = user ? members.find((m) => m.userId === user.uid) : undefined;
  const isMember = !!currentMember;
  const isLeader = Boolean(user && (project?.leaderId === user.uid || currentMember?.role === 'leader'));
  const maxCapacity = project?.maxMembers || 4;
  const currentMemberCount = members.length > 0 ? members.length : (project?.memberCount || 1);
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
      const batch = writeBatch(db);

      // 1. Create Member document in projects/{projectId}/members/{userId}
      const memberRef = doc(db, 'projects', projectId, 'members', user.uid);
      batch.set(memberRef, {
        userId: user.uid,
        name: user.displayName || 'GitHub User',
        email: user.email || '',
        image: user.photoURL || '',
        role: 'member',
        skills: [],
        skillsSet: false,
        pendingSkills: [],
        joinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      // 2. Add projectId to user's projectIds array
      const userRef = doc(db, 'users', user.uid);
      batch.set(
        userRef,
        { projectIds: arrayUnion(projectId) },
        { merge: true }
      );

      // 3. Update project metadata
      const projectRef = doc(db, 'projects', projectId);
      batch.update(projectRef, {
        memberCount: increment(1),
        memberIds: arrayUnion(user.uid),
      });

      await batch.commit();

      // Update local state reactively
      setProject((prev) =>
        prev
          ? {
              ...prev,
              memberCount: (prev.memberCount || 1) + 1,
              memberIds: Array.from(new Set([...(prev.memberIds || []), user.uid])),
            }
          : prev
      );

      setMembers((prev) => [
        ...prev.filter((m) => m.userId !== user.uid),
        {
          id: user.uid,
          userId: user.uid,
          projectId,
          name: user.displayName || 'GitHub User',
          email: user.email || '',
          image: user.photoURL || '',
          role: 'member',
          skills: [],
          skillsSet: false,
          pendingSkills: [],
          joinedAt: new Date(),
          createdAt: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error('Error joining project:', err);
      alert(err.message || 'Error joining project. Please try again.');
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

      // Direct client-side update
      const memberRef = doc(db, 'projects', projectId, 'members', user.uid);
      await updateDoc(memberRef, {
        skills: allSkills,
        skillsSet: true,
      });

      // Update local members state
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === user.uid ? { ...m, skills: allSkills, skillsSet: true } : m
        )
      );

      setIsOnboardingOpen(false);
    } catch (err: any) {
      console.error('Error saving onboarding skills:', err);
      alert(err.message || 'Error saving onboarding skills. Please try again.');
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

  // Open Assignment modal and prepare parameters (Team Leader only)
  const openAssignModal = (task: Task) => {
    if (!isLeader) return;

    // Calculate done tasks per member in this project that share at least one skill
    const taskHistory: Record<string, number> = {};
    members.forEach((m) => {
      const completedCount = tasks.filter(
        (t) =>
          t.status === 'done' &&
          (t.assigneeId === m.userId || t.partnerId === m.userId) &&
          t.skills.some((s) => task.skills.includes(s))
      ).length;
      taskHistory[m.userId] = completedCount;
    });

    const scored = scoreMembers(members, task.skills, { taskHistory, activeTasks: tasks });
    setSelectedTask(task);

    if (scored.length > 0) {
      const topDriver = scored[0];
      setAssigneeId(topDriver.memberId);

      if (topDriver.taskType === 'overload') {
        // Find Navigator: member with the most missing skills that this task covers
        const navCandidates = members.filter((m) => m.userId !== topDriver.memberId);
        const bestNav = navCandidates.sort((a, b) => {
          const aMissing = task.skills.filter((s) => !(a.skills || []).includes(s)).length;
          const bMissing = task.skills.filter((s) => !(b.skills || []).includes(s)).length;
          return bMissing - aMissing;
        })[0];
        setPartnerId(bestNav ? bestNav.userId : '');
      } else {
        setPartnerId('');
      }
    } else {
      setAssigneeId('');
      setPartnerId('');
    }

    setIsAssignOpen(true);
  };

  // Matched Member Scores computation
  const getTaskScoredMembers = () => {
    if (!selectedTask) return [];

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

    return scoreMembers(members, selectedTask.skills, { taskHistory, activeTasks: tasks });
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
      const finalPartnerId = isOverload && partnerId ? partnerId : null;

      const driverMissing = driverMatch?.missingSkills || [];
      const partnerMember = members.find((m) => m.userId === finalPartnerId);
      const partnerMissing = partnerMember
        ? selectedTask.skills.filter((s) => !(partnerMember.skills || []).includes(s))
        : [];

      // 1. Direct client update on Task Document
      const taskRef = doc(db, 'projects', projectId, 'tasks', selectedTask.id);
      await updateDoc(taskRef, {
        assigneeId,
        partnerId: finalPartnerId,
        type: taskType,
        assignedAt: serverTimestamp(),
      });

      // 2. Update assignee pending skills
      if (driverMissing.length > 0) {
        const assigneeRef = doc(db, 'projects', projectId, 'members', assigneeId);
        await updateDoc(assigneeRef, {
          pendingSkills: arrayUnion(...driverMissing),
        });
      }

      // 3. Update partner pending skills if paired
      if (finalPartnerId && partnerMissing.length > 0) {
        const partnerRef = doc(db, 'projects', projectId, 'members', finalPartnerId);
        await updateDoc(partnerRef, {
          pendingSkills: arrayUnion(...partnerMissing),
        });
      }

      // 4. Local reactive state update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? {
                ...t,
                assigneeId,
                partnerId: finalPartnerId,
                type: taskType,
              }
            : t
        )
      );

      // Update members pendingSkills locally
      if (driverMissing.length > 0 || partnerMissing.length > 0) {
        setMembers((prev) =>
          prev.map((m) => {
            if (m.userId === assigneeId && driverMissing.length > 0) {
              const currentPending = m.pendingSkills || [];
              return {
                ...m,
                pendingSkills: Array.from(new Set([...currentPending, ...driverMissing])),
              };
            }
            if (m.userId === finalPartnerId && partnerMissing.length > 0) {
              const currentPending = m.pendingSkills || [];
              return {
                ...m,
                pendingSkills: Array.from(new Set([...currentPending, ...partnerMissing])),
              };
            }
            return m;
          })
        );
      }

      setIsAssignOpen(false);
      setSelectedTask(null);
    } catch (err: any) {
      console.error('Error assigning task:', err);
      alert(err.message || 'Error assigning task. Please try again.');
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Mark Webhook as Configured/Active in Firestore
  const handleMarkWebhookActive = async () => {
    setWebhookUpdating(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      await updateDoc(projectRef, {
        webhookConfigured: true,
      });
      setProject((prev) => (prev ? { ...prev, webhookConfigured: true } : prev));
      setIsWebhookModalOpen(false);
    } catch (err: any) {
      console.error('Error configuring webhook:', err);
      alert('Failed to update webhook status. Please try again.');
    } finally {
      setWebhookUpdating(false);
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
      <header className="z-10 border-b border-zinc-800 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
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

        <div className="flex flex-wrap items-center gap-3">
          {/* Webhook Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-zinc-900/60 border-zinc-800 text-xs font-medium">
            {project.webhookConfigured ? (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-300 font-semibold">Webhook Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
                <span className="text-zinc-400">Webhook Not Set Up</span>
              </div>
            )}
          </div>

          {/* View Toggle (Leader only) */}
          {isLeader && (
            <div className="flex items-center bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h17.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
                <span>Board view</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('dashboard')}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'dashboard'
                    ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
                <span>Dashboard view</span>
                {unresolvedBlockers.length > 0 && (
                  <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>
            </div>
          )}

          {/* Setup Webhook Button (Leader only) */}
          {isLeader && (
            <button
              onClick={() => setIsWebhookModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 hover:border-violet-500/50 transition-all cursor-pointer shadow-[0_0_15px_rgba(124,58,237,0.15)]"
              title="Configure GitHub webhook for automated card moves"
            >
              <svg className="h-3.5 w-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <span>Setup Webhook</span>
            </button>
          )}

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
        <div className="flex-1 w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
          
          {/* Top Action & View Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">Kanban Board</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Organize, calibrate, and track real-time team progress
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Quick Add Task */}
              <button
                onClick={openAddTaskModal}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>New Task</span>
              </button>

              {/* Toggle Team Panel Button */}
              <button
                onClick={() => setIsTeamPanelOpen(!isTeamPanelOpen)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isTeamPanelOpen
                    ? 'bg-zinc-800/90 text-white border-zinc-700 hover:bg-zinc-800'
                    : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                }`}
                title={isTeamPanelOpen ? "Collapse Team Panel" : "Expand Team Panel"}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
                <span>Team ({members.length})</span>
                <span className="text-[10px] text-zinc-500 ml-0.5">{isTeamPanelOpen ? '▾' : '▸'}</span>
              </button>
            </div>
          </div>

          {/* Main Content: Flexible Board/Dashboard & Collapsible Team Panel */}
          <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full items-start">
            
            {/* MAIN CONTENT AREA: Either Leader Dashboard View OR Kanban Board */}
            <div className="flex-1 w-full min-w-0 flex flex-col gap-6">

              {/* ========================================================================= */}
              {/* LEADER DASHBOARD VIEW (Phase 5 Feature) */}
              {/* ========================================================================= */}
              {isLeader && viewMode === 'dashboard' ? (
                <div className="flex flex-col gap-6 w-full animate-fadeIn">
                  
                  {/* Alert Banner for Unresolved Blockers */}
                  {unresolvedBlockers.length > 0 && (
                    <div className="w-full bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex items-center justify-between gap-3 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <span className="text-xl animate-bounce">⚠️</span>
                        <div>
                          <p className="font-bold text-sm text-white">
                            {unresolvedBlockers.length} task(s) blocked — immediate attention needed
                          </p>
                          <p className="text-xs text-rose-400 mt-0.5">
                            Team members have encountered obstacles and AI diagnosis is available below.
                          </p>
                        </div>
                      </div>
                      <a
                        href="#blockers-section"
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] shrink-0 cursor-pointer"
                      >
                        Inspect Blockers
                      </a>
                    </div>
                  )}

                  {/* A) TEAM OVERVIEW STAT CARDS */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Total Tasks */}
                    <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 backdrop-blur-sm">
                      <span className="text-xs font-semibold text-zinc-400">Total Tasks</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-white">{tasks.length}</span>
                        <span className="text-[11px] text-zinc-500">in project</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-violet-500 h-full w-full"></div>
                      </div>
                    </div>

                    {/* Card 2: Done Tasks */}
                    <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 backdrop-blur-sm">
                      <span className="text-xs font-semibold text-zinc-400">Done</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-emerald-400">
                          {tasks.filter((t) => t.status === 'done').length}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {tasks.length > 0
                            ? `${Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100)}%`
                            : '0%'}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all"
                          style={{
                            width: `${
                              tasks.length > 0
                                ? (tasks.filter((t) => t.status === 'done').length / tasks.length) * 100
                                : 0
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* Card 3: In Progress */}
                    <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 backdrop-blur-sm">
                      <span className="text-xs font-semibold text-zinc-400">In Progress</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-blue-400">
                          {tasks.filter((t) => t.status === 'inprogress' || t.status === 'inreview').length}
                        </span>
                        <span className="text-[11px] text-zinc-500">active sprint</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all"
                          style={{
                            width: `${
                              tasks.length > 0
                                ? ((tasks.filter((t) => t.status === 'inprogress' || t.status === 'inreview').length) /
                                    tasks.length) *
                                  100
                                : 0
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* Card 4: Blocked */}
                    <div
                      className={`border p-4 rounded-2xl flex flex-col gap-1 backdrop-blur-sm transition-all ${
                        unresolvedBlockers.length > 0
                          ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                          : 'bg-zinc-900/60 border-zinc-800'
                      }`}
                    >
                      <span className="text-xs font-semibold text-zinc-400">Blocked</span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-extrabold ${
                            unresolvedBlockers.length > 0 ? 'text-rose-400' : 'text-zinc-300'
                          }`}
                        >
                          {unresolvedBlockers.length}
                        </span>
                        <span className="text-[11px] text-zinc-500">unresolved</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            unresolvedBlockers.length > 0 ? 'bg-rose-500' : 'bg-zinc-600'
                          }`}
                          style={{
                            width: `${
                              tasks.length > 0 ? Math.min(100, (unresolvedBlockers.length / tasks.length) * 100) : 0
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* B) UNRESOLVED BLOCKERS SECTION */}
                  <div id="blockers-section" className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                          </svg>
                        </div>
                        <h3 className="text-base font-bold text-white">Active Blockers & AI Diagnostics</h3>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {unresolvedBlockers.length} active issue{unresolvedBlockers.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {unresolvedBlockers.length === 0 ? (
                      <div className="py-8 flex flex-col items-center justify-center text-center text-zinc-500">
                        <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2 border border-emerald-500/20">
                          ✓
                        </div>
                        <p className="text-xs font-semibold text-zinc-300">No active blockers!</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">The team is progressing smoothly without impediments.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {unresolvedBlockers.map((blocker) => {
                          const task = tasks.find((t) => t.id === blocker.taskId);
                          const member = members.find((m) => m.userId === blocker.userId);

                          return (
                            <div
                              key={blocker.id}
                              className="bg-zinc-950/80 border border-rose-500/30 rounded-2xl p-4 flex flex-col gap-3 shadow-lg relative overflow-hidden"
                            >
                              {/* Top Bar */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {member?.image ? (
                                    <img src={member.image} alt={blocker.userName || ''} className="h-7 w-7 rounded-full border border-zinc-800 shrink-0" />
                                  ) : (
                                    <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                      {blocker.userName ? blocker.userName[0] : 'U'}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-white block truncate">{blocker.userName || 'Developer'}</span>
                                    <span className="text-[10px] text-zinc-500 block truncate">Task: {task?.title || blocker.taskTitle || blocker.taskId}</span>
                                  </div>
                                </div>

                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                                  {blocker.type}
                                </span>
                              </div>

                              {/* Blocker Description */}
                              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
                                &quot;{blocker.description}&quot;
                              </div>

                              {/* AI Diagnosis Block */}
                              {blocker.aiDiagnosis && (
                                <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-500/30 flex flex-col gap-2">
                                  <div className="flex items-center justify-between text-violet-300 font-bold text-xs">
                                    <span className="flex items-center gap-1.5">
                                      <span>✨ AI Diagnosis</span>
                                    </span>
                                  </div>

                                  {blocker.aiDiagnosis.causes && blocker.aiDiagnosis.causes.length > 0 && (
                                    <div>
                                      <span className="text-[10px] text-zinc-400 font-semibold">Probable Causes:</span>
                                      <ul className="list-decimal list-inside text-[11px] text-zinc-300 space-y-0.5 mt-0.5">
                                        {blocker.aiDiagnosis.causes.map((c: string, i: number) => (
                                          <li key={i}>{c}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {blocker.aiDiagnosis.fix && (
                                    <div className="p-2 rounded-lg bg-zinc-950 border border-violet-500/20 text-xs text-emerald-300 font-mono">
                                      💡 <strong className="text-emerald-200">Recommended Fix:</strong> {blocker.aiDiagnosis.fix}
                                    </div>
                                  )}

                                  {blocker.aiDiagnosis.resource && (
                                    <a
                                      href={blocker.aiDiagnosis.resource}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-violet-400 hover:text-violet-300 underline inline-flex items-center gap-1 mt-0.5"
                                    >
                                      <span>🔗 Reference Documentation</span>
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* Action: Mark Resolved */}
                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleResolveBlocker(blocker)}
                                  disabled={resolvingBlockerId === blocker.id}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-[0_0_12px_rgba(16,185,129,0.25)] flex items-center gap-1.5 cursor-pointer"
                                >
                                  {resolvingBlockerId === blocker.id ? (
                                    <>
                                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                      <span>Resolving...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>✓ Mark Resolved</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* C) MEMBER ACTIVITY LIST */}
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                          </svg>
                        </div>
                        <h3 className="text-base font-bold text-white">Member Activity & Progress</h3>
                      </div>
                      <span className="text-xs text-zinc-500">{members.length} team members</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {members.map((member) => {
                        const assignedTasks = tasks.filter((t) => t.assigneeId === member.userId || t.partnerId === member.userId);
                        const completedTasks = assignedTasks.filter((t) => t.status === 'done');
                        const hasActiveBlocker = assignedTasks.some((t) => blockers.some((b) => b.taskId === t.id && !b.resolved));
                        const isOnline = Boolean(presenceMap[member.userId]?.online);

                        // Find latest commit info
                        const latestCommitTask = assignedTasks.find((t) => t.lastCommit?.sha);

                        return (
                          <div key={member.id} className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-3">
                            {/* Member Top Bar */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {member.image ? (
                                  <img src={member.image} alt={member.name} className="h-8 w-8 rounded-full border border-zinc-800 shrink-0" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                    {member.name ? member.name[0] : 'U'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-white truncate">{member.name || 'Developer'}</span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider ${
                                        member.role === 'leader'
                                          ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                                          : 'bg-zinc-800 text-zinc-400'
                                      }`}
                                    >
                                      {member.role}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-zinc-500 block truncate">{member.email}</span>
                                </div>
                              </div>

                              {/* Status badge: Blocked / Active / Idle */}
                              {hasActiveBlocker ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping"></span>
                                  Blocked
                                </span>
                              ) : isOnline ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                  Active
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">
                                  Idle
                                </span>
                              )}
                            </div>

                            {/* Task Progress Bar */}
                            <div className="flex flex-col gap-1 mt-1">
                              <div className="flex justify-between text-[11px] text-zinc-400">
                                <span>Task Completion</span>
                                <span className="font-semibold text-zinc-200">
                                  {completedTasks.length} / {assignedTasks.length} ({assignedTasks.length > 0 ? Math.round((completedTasks.length / assignedTasks.length) * 100) : 0}%)
                                </span>
                              </div>
                              <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                                <div
                                  className="bg-gradient-to-r from-violet-500 to-emerald-400 h-full transition-all"
                                  style={{
                                    width: `${assignedTasks.length > 0 ? (completedTasks.length / assignedTasks.length) * 100 : 0}%`,
                                  }}
                                ></div>
                              </div>
                            </div>

                            {/* Latest Commit Snippet (if available) */}
                            {latestCommitTask?.lastCommit && (
                              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-zinc-500 shrink-0">Commit:</span>
                                  <span className="font-mono text-zinc-300 truncate">{latestCommitTask.lastCommit.message}</span>
                                </div>
                                <code className="text-[9px] text-violet-400 font-mono shrink-0">
                                  {latestCommitTask.lastCommit.sha.slice(0, 7)}
                                </code>
                              </div>
                            )}

                            {/* Skills Gained Tags */}
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-zinc-500 mr-1">Skills:</span>
                              {member.skills && member.skills.length > 0 ? (
                                member.skills.map((skill, skIdx) => (
                                  <span
                                    key={skIdx}
                                    className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-medium"
                                  >
                                    {skill}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-zinc-600 italic">No skills recorded yet</span>
                              )}
                            </div>

                            {/* View Tasks Action Button */}
                            <div className="flex justify-end pt-1 border-t border-zinc-800/40">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterMemberId(member.userId);
                                  setViewMode('board');
                                }}
                                className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                <span>View tasks ({assignedTasks.length}) →</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* D) SKILL COVERAGE MATRIX */}
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4 overflow-x-auto">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">Skill Coverage Matrix</h3>
                          <p className="text-xs text-zinc-500 mt-0.5">Instant team capability & tech stack gap analysis</p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400">
                            <th className="py-2.5 px-3 font-semibold">Team Member</th>
                            {project.techStack && project.techStack.map((tech, tIdx) => (
                              <th key={tIdx} className="py-2.5 px-3 font-semibold text-center">
                                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                  {tech}
                                </span>
                              </th>
                            ))}
                            <th className="py-2.5 px-3 font-semibold text-right">Total Skills</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {members.map((member) => (
                            <tr key={member.id} className="hover:bg-zinc-900/30 transition-colors">
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {member.image ? (
                                    <img src={member.image} alt={member.name} className="h-6 w-6 rounded-full border border-zinc-800" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">
                                      {member.name ? member.name[0] : 'U'}
                                    </div>
                                  )}
                                  <span className="font-semibold text-white truncate">{member.name}</span>
                                </div>
                              </td>
                              {project.techStack && project.techStack.map((tech, tIdx) => {
                                const hasSkill = (member.skills || []).includes(tech);
                                return (
                                  <td key={tIdx} className="py-3 px-3 text-center">
                                    {hasSkill ? (
                                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/40">
                                        ✓
                                      </span>
                                    ) : (
                                      <span className="text-zinc-600 font-bold">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-3 text-right font-semibold text-zinc-300">
                                {member.skills?.length || 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* ========================================================================= */
                /* KANBAN BOARD VIEW & MEMBER DASHBOARD */
                /* ========================================================================= */
                <div className="flex flex-col gap-6 w-full animate-fadeIn">
                  
                  {/* Member Task Filter Banner (when filterMemberId is active) */}
                  {filterMemberId && (
                    <div className="flex items-center justify-between bg-violet-950/30 border border-violet-500/30 px-4 py-2.5 rounded-xl text-xs">
                      <div className="flex items-center gap-2 text-violet-200">
                        <span>🎯 Filtering board for: <strong>{members.find((m) => m.userId === filterMemberId)?.name || 'Member'}</strong></span>
                      </div>
                      <button
                        onClick={() => setFilterMemberId(null)}
                        className="text-xs text-violet-400 hover:text-white font-bold underline cursor-pointer"
                      >
                        Clear Filter (Show All)
                      </button>
                    </div>
                  )}

                  {/* 4 Kanban Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 w-full">
                    {(['todo', 'inprogress', 'inreview', 'done'] as Task['status'][]).map((status) => {
                      const statusTasks = filteredTasks.filter((t) => t.status === status);
                      const columnName =
                        status === 'todo'
                          ? 'To Do'
                          : status === 'inprogress'
                          ? 'In Progress'
                          : status === 'inreview'
                          ? 'In Review'
                          : 'Done';

                      const columnColor =
                        status === 'todo'
                          ? 'border-zinc-800/80 bg-zinc-900/20'
                          : status === 'inprogress'
                          ? 'border-blue-900/30 bg-blue-950/10'
                          : status === 'inreview'
                          ? 'border-amber-900/30 bg-amber-950/10'
                          : 'border-emerald-900/30 bg-emerald-950/10';

                      const badgeColor =
                        status === 'todo'
                          ? 'bg-zinc-800 text-zinc-300'
                          : status === 'inprogress'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : status === 'inreview'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

                      return (
                        <div
                          key={status}
                          className={`flex flex-col border rounded-2xl p-4 min-h-[420px] transition-all backdrop-blur-sm ${columnColor}`}
                        >
                          {/* Column Header */}
                          <div className="flex items-center justify-between mb-4 border-b border-zinc-800/60 pb-3">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm text-zinc-200">{columnName}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}`}>
                                {statusTasks.length}
                              </span>
                            </div>

                            {status === 'todo' && (
                              <button
                                onClick={openAddTaskModal}
                                className="text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
                                title="Add task to To Do"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* Tasks list */}
                          <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                            {statusTasks.map((task) => {
                              const assignee = members.find((m) => m.userId === task.assigneeId);
                              const partner = members.find((m) => m.userId === task.partnerId);
                              const isMyTask = task.assigneeId === user?.uid;
                              const taskBlockers = blockers.filter((b) => b.taskId === task.id && !b.resolved);
                              const isTaskBlocked = task.hasBlocker || taskBlockers.length > 0;

                              return (
                                <div
                                  key={task.id}
                                  className={`bg-zinc-900/70 border ${
                                    isTaskBlocked ? 'border-rose-500/40 bg-rose-950/10' : 'border-zinc-800 hover:border-zinc-700'
                                  } p-4 rounded-xl shadow-lg transition-all flex flex-col gap-3 group text-left relative overflow-hidden`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                      <h4 className="font-bold text-white text-sm line-clamp-2 leading-snug break-words">
                                        {task.title}
                                      </h4>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {/* Blocker Alert Badge */}
                                        {isTaskBlocked && (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                            ⚠️ Blocked
                                          </span>
                                        )}
                                        {/* Task Type Badge */}
                                        {task.assigneeId && (
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                              task.type === 'safe'
                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                : task.type === 'stretch'
                                                ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                            }`}
                                          >
                                            {task.type}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Git Branch Name */}
                                    <div className="mt-1.5">
                                      <span
                                        title={task.branchName || `feat/${task.title.toLowerCase().trim().replace(/\s+/g, '-')}`}
                                        className="font-mono text-[10px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850 block truncate max-w-full"
                                      >
                                        {task.branchName || `feat/${task.title.toLowerCase().trim().replace(/\s+/g, '-')}`}
                                      </span>
                                    </div>

                                    {/* Task ID copy reference */}
                                    <div className="mt-1.5 flex items-center justify-between gap-1.5 bg-zinc-950/80 border border-zinc-800/80 px-2 py-1 rounded-lg text-[10px]">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-zinc-500 text-[9px] font-medium shrink-0">Task ID:</span>
                                        <code className="text-violet-300 font-mono text-[10px] truncate">{task.id}</code>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(task.id);
                                          setCopiedTaskId(task.id);
                                          setTimeout(() => setCopiedTaskId(null), 2000);
                                        }}
                                        className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                      >
                                        {copiedTaskId === task.id ? 'Copied!' : 'Copy'}
                                      </button>
                                    </div>

                                    <p className="text-zinc-400 text-xs mt-2 line-clamp-2 break-words">
                                      {task.description || 'No description provided.'}
                                    </p>
                                  </div>

                                  {/* Skill Tags */}
                                  {task.skills.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {task.skills.map((skill, sIdx) => (
                                        <span
                                          key={sIdx}
                                          className="bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-md text-[9px] font-medium"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* AI Diagnosis Snippet on Card (if blocker diagnosed) */}
                                  {taskBlockers.map((b) => b.aiDiagnosis && (
                                    <div key={b.id} className="p-2.5 rounded-xl bg-violet-950/20 border border-violet-500/30 text-xs flex flex-col gap-1.5">
                                      <div className="flex items-center justify-between text-violet-300 font-bold text-[11px]">
                                        <span>✨ AI Diagnosis</span>
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300">{b.type}</span>
                                      </div>
                                      {b.aiDiagnosis.fix && (
                                        <div className="p-1.5 rounded-lg bg-zinc-950/80 border border-violet-500/20 text-[10px] text-emerald-300 font-mono leading-tight">
                                          💡 {b.aiDiagnosis.fix}
                                        </div>
                                      )}
                                      {b.aiDiagnosis.resource && (
                                        <a
                                          href={b.aiDiagnosis.resource}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[10px] text-violet-400 hover:text-violet-300 underline inline-flex items-center gap-1"
                                        >
                                          <span>🔗 Resource Docs</span>
                                        </a>
                                      )}
                                    </div>
                                  ))}

                                  {/* Assignee / Partner information */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/50 pt-3 mt-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {task.assigneeId ? (
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <div className="flex -space-x-1.5 items-center shrink-0">
                                            {assignee?.image ? (
                                              <img
                                                src={assignee.image}
                                                alt={assignee.name}
                                                title={`Driver: ${assignee.name}`}
                                                className="h-6 w-6 rounded-full border border-zinc-800"
                                              />
                                            ) : (
                                              <div
                                                title={`Driver: ${assignee?.name || 'Developer'}`}
                                                className="h-6 w-6 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/30 flex items-center justify-center text-[10px] font-bold"
                                              >
                                                {assignee?.name ? assignee.name[0] : 'D'}
                                              </div>
                                            )}
                                            {partner && (
                                              partner.image ? (
                                                <img
                                                  src={partner.image}
                                                  alt={partner.name}
                                                  title={`Navigator: ${partner.name}`}
                                                  className="h-6 w-6 rounded-full border border-zinc-800"
                                                />
                                              ) : (
                                                <div
                                                  title={`Navigator: ${partner.name || 'Partner'}`}
                                                  className="h-6 w-6 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold"
                                                >
                                                  {partner.name ? partner.name[0] : 'N'}
                                                </div>
                                              )
                                            )}
                                          </div>
                                          <span className="text-[10px] text-zinc-300 font-medium truncate max-w-[90px]">
                                            {assignee?.name}
                                            {partner ? ` + ${partner.name}` : ''}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-zinc-500 italic bg-zinc-950/60 border border-zinc-800/80 px-2 py-0.5 rounded">
                                          Unassigned
                                        </span>
                                      )}

                                      {/* Leader Assign / Reassign Button */}
                                      {isLeader && (
                                        <button
                                          onClick={() => openAssignModal(task)}
                                          className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 hover:underline transition-colors flex items-center gap-0.5 cursor-pointer"
                                          title={task.assigneeId ? "Reassign Task" : "Assign Task"}
                                        >
                                          <span>{task.assigneeId ? 'Reassign' : 'Assign'}</span>
                                        </button>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 ml-auto">
                                      {/* Raise Blocker Button (Visible to assignee) */}
                                      {isMyTask && task.status !== 'done' && (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenBlockerModal(task)}
                                          className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2 py-1 rounded-lg transition-all cursor-pointer"
                                          title="Raise a blocker on this task"
                                        >
                                          ⚠️ Blocker
                                        </button>
                                      )}

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
                                </div>
                              );
                            })}

                            {statusTasks.length === 0 && (
                              <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-600 border border-dashed border-zinc-800/60 rounded-xl">
                                <span className="text-xs">No tasks</span>
                              </div>
                            )}
                          </div>

                          {/* Add Task Trigger (Only in To Do column) */}
                          {status === 'todo' && (
                            <button
                              onClick={openAddTaskModal}
                              className="mt-4 flex w-full items-center justify-center gap-1.5 border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30 rounded-xl py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-all font-semibold cursor-pointer"
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

                  {/* 6. MEMBER SIDE: "MY PROGRESS" SECTION */}
                  {currentMember && (
                    <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4 mt-2">
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.9m10-10.753a60.47 60.47 0 0 1-.49 6.347m-18 .003a3.375 3.375 0 0 0-3.375-3.375H4.83c-.06 3.003.079 6.006.418 8.975M22.007 10.14c.007-.122.012-.244.012-.368A4.498 4.498 0 0 0 17.5 5.25a4.498 4.498 0 0 0-4.5 4.5v.015m7.5-.015a8.607 8.607 0 0 1-7.5 0" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white">My Progress & Skill Growth</h3>
                            <p className="text-xs text-zinc-500">Your personalized calibration and project contributions</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Skills Gained */}
                        <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2">
                          <span className="text-xs font-semibold text-zinc-400">Skills Mastered</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {currentMember.skills && currentMember.skills.length > 0 ? (
                              currentMember.skills.map((s, idx) => (
                                <span key={idx} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  ✓ {s}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-zinc-500 italic">No skills registered</span>
                            )}
                          </div>
                        </div>

                        {/* 2. Pending Skills */}
                        <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2">
                          <span className="text-xs font-semibold text-zinc-400">Skills In Progress</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {currentMember.pendingSkills && currentMember.pendingSkills.length > 0 ? (
                              currentMember.pendingSkills.map((ps, idx) => (
                                <span key={idx} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-semibold animate-pulse">
                                  ⏳ {ps} (Active task)
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-zinc-500 italic">No pending skills</span>
                            )}
                          </div>
                        </div>

                        {/* 3. Task Completion */}
                        {(() => {
                          const myAssigned = tasks.filter((t) => t.assigneeId === user?.uid || t.partnerId === user?.uid);
                          const myDone = myAssigned.filter((t) => t.status === 'done');
                          const percent = myAssigned.length > 0 ? Math.round((myDone.length / myAssigned.length) * 100) : 0;

                          return (
                            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2">
                              <span className="text-xs font-semibold text-zinc-400">My Task Completion</span>
                              <div className="flex items-baseline justify-between">
                                <span className="text-xl font-extrabold text-white">{myDone.length} / {myAssigned.length}</span>
                                <span className="text-xs font-bold text-violet-400">{percent}%</span>
                              </div>
                              <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-zinc-800">
                                <div
                                  className="bg-gradient-to-r from-violet-500 to-emerald-400 h-full transition-all"
                                  style={{ width: `${percent}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT SIDE: Tabbed Team & Real-Time Chat Panel */}
            {isTeamPanelOpen && (
              <div className="w-full lg:w-[340px] xl:w-[380px] bg-zinc-900/30 border border-zinc-800/80 rounded-2xl flex flex-col self-start shrink-0 backdrop-blur-md transition-all animate-fadeIn overflow-hidden h-[620px] shadow-xl">
                {/* Panel Header & Tabs */}
                <div className="border-b border-zinc-800 bg-zinc-950/40 p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => setActivePanelTab('team')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activePanelTab === 'team'
                          ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                      </svg>
                      <span>Team ({members.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePanelTab('chat')}
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activePanelTab === 'chat'
                          ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.3)]'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.741Z" />
                      </svg>
                      <span>Chat</span>
                      {unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-extrabold text-white animate-pulse">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {activePanelTab === 'team' && (
                      <button
                        onClick={handleCopyInviteLink}
                        className="text-[11px] font-semibold bg-violet-600/10 text-violet-300 border border-violet-500/20 hover:bg-violet-600/20 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="Copy project invite link"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                        </svg>
                        <span>{copiedLink ? 'Copied' : 'Invite'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setIsTeamPanelOpen(false)}
                      className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                      title="Hide panel"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* TAB 1: TEAM MEMBERS LIST */}
                {activePanelTab === 'team' && (
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
                    <div className="flex items-center justify-between text-xs text-zinc-500 pb-1 border-b border-zinc-800/40">
                      <span>{currentMemberCount} of {maxCapacity} slots filled</span>
                      <span className="text-[11px] text-zinc-400 font-medium">Live Presence</span>
                    </div>

                    {members.map((member) => {
                      const presence = presenceMap[member.userId];
                      const isOnline = Boolean(presence?.online);

                      return (
                        <div key={member.id} className="flex gap-3 items-start border-b border-zinc-800/40 pb-3 last:border-0 last:pb-0">
                          {/* Member Avatar with Presence Dot */}
                          <div className="relative shrink-0 mt-0.5">
                            {member.image ? (
                              <img src={member.image} alt={member.name} className="h-8 w-8 rounded-full border border-zinc-800" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-white">
                                {member.name ? member.name[0] : 'U'}
                              </div>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c0c0e] ${
                                isOnline ? 'bg-emerald-500' : 'bg-zinc-500'
                              }`}
                              title={isOnline ? 'Active now' : formatLastSeen(presence?.lastSeen)}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-bold text-xs text-zinc-200 truncate">{member.name || 'Developer'}</span>
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

                            {/* Presence status text */}
                            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                              <span className={isOnline ? 'text-emerald-400 font-medium' : 'text-zinc-500'}>
                                {isOnline ? 'Active now' : formatLastSeen(presence?.lastSeen)}
                              </span>
                            </div>

                            {/* Skills tags */}
                            <div className="mt-1.5 flex flex-wrap gap-1">
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
                      );
                    })}
                  </div>
                )}

                {/* TAB 2: REAL-TIME TEAM CHAT */}
                {activePanelTab === 'chat' && (
                  <div className="flex-1 flex flex-col h-full min-h-0 bg-zinc-950/40">
                    {/* Message List */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                      {messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto text-zinc-500">
                          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 mb-2">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a.75.75 0 0 1-.76-.84c.08-.667.14-1.341.18-2.022C3.12 16.63 2 14.437 2 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                            </svg>
                          </div>
                          <p className="text-xs font-semibold text-zinc-300">No messages yet</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">Start the conversation with your team!</p>
                        </div>
                      ) : (
                        messages.map((msg) => {
                          const isMe = msg.userId === user?.uid;

                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse self-end' : 'flex-row self-start'} max-w-[88%]`}
                            >
                              {!isMe && (
                                <div className="shrink-0 mb-0.5">
                                  {msg.userImage ? (
                                    <img src={msg.userImage} alt={msg.userName} className="h-7 w-7 rounded-full border border-zinc-800" />
                                  ) : (
                                    <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">
                                      {msg.userName ? msg.userName[0] : 'U'}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} min-w-0`}>
                                {!isMe && (
                                  <span className="text-[10px] font-semibold text-zinc-400 mb-1 ml-1 truncate max-w-[180px]">
                                    {msg.userName}
                                  </span>
                                )}

                                <div
                                  className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words max-w-full ${
                                    isMe
                                      ? 'bg-[#7F77DD] text-white rounded-br-xs shadow-[0_2px_12px_rgba(127,119,221,0.25)]'
                                      : 'bg-zinc-800/90 text-zinc-100 rounded-bl-xs border border-zinc-700/60'
                                  }`}
                                >
                                  {msg.text}
                                </div>

                                <span className="text-[9px] text-zinc-500 mt-1 px-1">
                                  {formatChatTimestamp(msg.createdAt)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Typing Indicator */}
                    {typingUsers.length > 0 && (
                      <div className="px-4 py-1.5 text-[11px] text-violet-400 flex items-center gap-1.5 animate-fadeIn">
                        <span className="flex gap-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </span>
                        <span className="italic font-medium">
                          {typingUsers.length === 1 ? `${typingUsers[0]} is typing...` : 'Multiple team members are typing...'}
                        </span>
                      </div>
                    )}

                    {/* Chat Input Bar */}
                    <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-end gap-2">
                      <textarea
                        value={messageInput}
                        onChange={handleMessageInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message... (Enter to send)"
                        rows={1}
                        className="flex-1 resize-none bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none max-h-24 min-h-[38px] transition-all"
                      />
                      <button
                        type="submit"
                        disabled={!messageInput.trim() || sendingMessage}
                        className="h-[38px] w-[38px] shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-[0_0_12px_rgba(124,58,237,0.3)] cursor-pointer"
                        title="Send message"
                      >
                        {sendingMessage ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                          </svg>
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
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

            <div className="flex items-center gap-2 mb-1">
              <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Scoring Engine
              </span>
              <h3 className="text-xl font-bold text-white">Assign Task</h3>
            </div>
            
            <p className="text-sm font-semibold text-zinc-200 mt-1">{selectedTask.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-2 mb-5">
              <span className="text-xs text-zinc-500 mr-1 self-center">Required Skills:</span>
              {selectedTask.skills.map((s) => (
                <span key={s} className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded text-xs font-medium">
                  {s}
                </span>
              ))}
              {selectedTask.skills.length === 0 && (
                <span className="text-xs text-zinc-600 italic">No specific skills requested</span>
              )}
            </div>

            {/* Recommendation list */}
            <div className="flex flex-col gap-3.5 max-h-[42vh] overflow-y-auto pr-1 mb-5 scrollbar-thin">
              {scoredMembersList.map((scored) => {
                const memberDetails = members.find((m) => m.userId === scored.memberId);
                const isSelected = assigneeId === scored.memberId;

                return (
                  <div
                    key={scored.memberId}
                    onClick={() => {
                      setAssigneeId(scored.memberId);
                      if (scored.taskType === 'overload') {
                        // Auto suggest complementary partner
                        const navCandidates = members.filter((m) => m.userId !== scored.memberId);
                        const bestNav = navCandidates.sort((a, b) => {
                          const aMissing = selectedTask.skills.filter((s) => !(a.skills || []).includes(s)).length;
                          const bMissing = selectedTask.skills.filter((s) => !(b.skills || []).includes(s)).length;
                          return bMissing - aMissing;
                        })[0];
                        setPartnerId(bestNav ? bestNav.userId : '');
                      } else {
                        setPartnerId('');
                      }
                    }}
                    className={`flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-violet-600/10 border-violet-500/60 shadow-[0_0_20px_rgba(124,58,237,0.15)] ring-1 ring-violet-500/40'
                        : 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-950/70 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-violet-500 bg-violet-600' : 'border-zinc-700'}`}>
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white"></div>}
                        </div>
                        {memberDetails?.image ? (
                          <img src={memberDetails.image} alt={scored.memberName} className="h-8 w-8 rounded-full border border-zinc-800" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                            {scored.memberName ? scored.memberName[0] : 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-200">{scored.memberName}</span>
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">
                              {memberDetails?.role}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 block">Match Calibration</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Task Type Tag */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                            scored.taskType === 'safe'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : scored.taskType === 'stretch'
                              ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {scored.taskType === 'safe'
                            ? 'Safe'
                            : scored.taskType === 'stretch'
                            ? 'Stretch'
                            : 'Overload — Pair Required'}
                        </span>
                        <span className="font-mono text-xs font-bold text-violet-400">{scored.score}%</span>
                      </div>
                    </div>

                    {/* Progress suitability bar */}
                    <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          scored.taskType === 'safe'
                            ? 'bg-emerald-500'
                            : scored.taskType === 'stretch'
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-500'
                            : 'bg-gradient-to-r from-amber-500 to-orange-500'
                        }`}
                        style={{ width: `${scored.score}%` }}
                      ></div>
                    </div>

                    {/* Matched vs Missing Skills indicators */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {scored.matchedSkills.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-emerald-400 text-[10px] font-semibold">Matched:</span>
                          {scored.matchedSkills.map((s) => (
                            <span key={s} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {scored.missingSkills.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-zinc-500 text-[10px] font-semibold">Missing:</span>
                          {scored.missingSkills.map((s) => (
                            <span key={s} className="bg-zinc-800 text-zinc-400 border border-zinc-700/60 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hard Rule Warning Alert */}
                    {scored.warningMessage && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg mt-0.5">
                        <svg className="h-3 w-3 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <span>{scored.warningMessage}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overload Pairing Section (Driver + Navigator) */}
            {selectedDriverMatch && selectedDriverMatch.taskType === 'overload' && (
              <div className="flex flex-col gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-5 text-left animate-slideDown">
                <div className="flex items-center gap-2 text-amber-400">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                    />
                  </svg>
                  <h4 className="font-bold text-sm">Overload Task Calibration (Pair Programming)</h4>
                </div>
                <p className="text-xs text-zinc-400">
                  This task represents an overload (missing 2+ skills). Assign a <strong className="text-white">Driver</strong> (Lead developer) and a <strong className="text-white">Navigator</strong> (Partner learning missing skills).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                      1. Driver (Lead)
                    </label>
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 outline-none px-3 py-2 rounded-lg text-xs text-white"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.userId}>
                          {m.name} ({scoredMembersList.find((s) => s.memberId === m.userId)?.score || 0}% match)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                      2. Navigator (Partner)
                    </label>
                    <select
                      value={partnerId}
                      onChange={(e) => setPartnerId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 outline-none px-3 py-2 rounded-lg text-xs text-white"
                    >
                      <option value="">-- Choose Navigator --</option>
                      {members
                        .filter((m) => m.userId !== assigneeId)
                        .map((m) => {
                          const toLearn = selectedTask.skills.filter((s) => !(m.skills || []).includes(s));
                          return (
                            <option key={m.id} value={m.userId}>
                              {m.name} (Learns: {toLearn.length > 0 ? toLearn.join(', ') : 'None'})
                            </option>
                          );
                        })}
                    </select>
                  </div>
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
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssignment}
                disabled={assignSubmitting || !assigneeId}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] hover:shadow-[0_0_15px_rgba(124,58,237,0.2)] cursor-pointer"
              >
                {assignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WEBHOOK SETUP MODAL (Leader only) */}
      {/* ========================================================================= */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0c0c0e] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white">GitHub Webhook Integration</h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Connect your repository to auto-move Kanban cards and calibrate skills on PR merges.
                </p>
              </div>
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Steps Container */}
            <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  1
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Open GitHub Webhook Settings</p>
                  <p className="text-zinc-400 mt-0.5">
                    Go to your repository on GitHub → <strong className="text-zinc-200">Settings</strong> → <strong className="text-zinc-200">Webhooks</strong> → Click <strong className="text-zinc-200">&quot;Add webhook&quot;</strong>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  2
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Payload URL</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    <code className="font-mono text-violet-300 text-[11px] break-all">
                      https://devpulse-collab.vercel.app/api/webhook/github
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://devpulse-collab.vercel.app/api/webhook/github');
                        setCopiedWebhookUrl(true);
                        setTimeout(() => setCopiedWebhookUrl(false), 2000);
                      }}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      {copiedWebhookUrl ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  3
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Content Type</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    <code className="font-mono text-emerald-300 text-[11px]">
                      application/json
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('application/json');
                        setCopiedWebhookContentType(true);
                        setTimeout(() => setCopiedWebhookContentType(false), 2000);
                      }}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      {copiedWebhookContentType ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  4
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Secret</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    <code className="font-mono text-amber-300 text-[11px]">
                      devpulse_github_secret_2026
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('devpulse_github_secret_2026');
                        setCopiedWebhookSecret(true);
                        setTimeout(() => setCopiedWebhookSecret(false), 2000);
                      }}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      {copiedWebhookSecret ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  5
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Select Individual Events</p>
                  <p className="text-zinc-400 mt-0.5">
                    Select <strong className="text-zinc-200">&quot;Let me select individual events&quot;</strong> and check both:
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px]">
                      ✓ Pushes
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px]">
                      ✓ Pull requests
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 text-xs font-bold border border-violet-500/30">
                  6
                </div>
                <div className="flex-1 text-xs text-zinc-300">
                  <p className="font-semibold text-white">Click &quot;Add webhook&quot;</p>
                  <p className="text-zinc-400 mt-0.5">
                    Save the webhook on GitHub, then click the button below to activate the live indicator.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-2">
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleMarkWebhookActive}
                disabled={webhookUpdating}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer"
              >
                {webhookUpdating ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Activating...</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-white"></span>
                    <span>Mark as Active</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RAISE BLOCKER MODAL (Member side + AI Diagnosis) */}
      {/* ========================================================================= */}
      {isBlockerModalOpen && selectedBlockerTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0c0c0e] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-400">
                    <span className="text-base">⚠️</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">Raise a Blocker</h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Task: <strong className="text-zinc-200">{selectedBlockerTask.title}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBlockerModalOpen(false);
                  setSelectedBlockerTask(null);
                  setBlockerSuccessMessage(null);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form & AI Feedback */}
            <form onSubmit={handleRaiseBlocker} className="flex flex-col gap-4 py-4">
              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  What are you stuck on? <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={blockerDescription}
                  onChange={(e) => setBlockerDescription(e.target.value)}
                  placeholder="Describe the error, confusing requirement, or missing dependency in detail..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                />
              </div>

              {/* Blocker Type Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300">Blocker Type:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Technical error',
                    'Unclear requirement',
                    'Need review',
                    'Waiting on teammate',
                  ].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBlockerType(type as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                        blockerType === type
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notify Selector */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <span className="text-xs font-semibold text-zinc-300 block">Notification Scope</span>
                  <span className="text-[10px] text-zinc-500">
                    {blockerNotifyWhole ? 'Notify whole team in chat & dashboard' : 'Notify project leader only'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockerNotifyWhole(!blockerNotifyWhole)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    blockerNotifyWhole
                      ? 'bg-violet-600 text-white shadow-[0_0_10px_rgba(124,58,237,0.3)]'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {blockerNotifyWhole ? 'Whole Team' : 'Leader Only'}
                </button>
              </div>

              {/* Success / AI Diagnosing Status Alert */}
              {blockerSuccessMessage && (
                <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-500/40 text-xs text-violet-300 flex items-center gap-2 animate-fadeIn">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent shrink-0" />
                  <span>{blockerSuccessMessage}</span>
                </div>
              )}

              {/* Live AI Diagnosis Display (if returned) */}
              {recentAiDiagnosis && (
                <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/40 flex flex-col gap-2 animate-fadeIn">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
                    <span>✨ Instant AI Diagnosis</span>
                  </div>

                  {recentAiDiagnosis.causes && recentAiDiagnosis.causes.length > 0 && (
                    <div>
                      <span className="text-[10px] text-zinc-400 font-semibold">Top Causes:</span>
                      <ul className="list-decimal list-inside text-[11px] text-zinc-300 space-y-0.5 mt-0.5">
                        {recentAiDiagnosis.causes.map((c: string, idx: number) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {recentAiDiagnosis.fix && (
                    <div className="p-2 rounded-lg bg-zinc-950 border border-violet-500/20 text-xs text-emerald-300 font-mono">
                      💡 {recentAiDiagnosis.fix}
                    </div>
                  )}

                  {recentAiDiagnosis.resource && (
                    <a
                      href={recentAiDiagnosis.resource}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-violet-400 hover:text-violet-300 underline inline-flex items-center gap-1"
                    >
                      <span>🔗 Reference Link</span>
                    </a>
                  )}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsBlockerModalOpen(false);
                    setSelectedBlockerTask(null);
                    setBlockerSuccessMessage(null);
                  }}
                  className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {recentAiDiagnosis ? 'Done' : 'Cancel'}
                </button>

                {!recentAiDiagnosis && (
                  <button
                    type="submit"
                    disabled={blockerSubmitting || !blockerDescription.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(244,63,94,0.3)] cursor-pointer"
                  >
                    {blockerSubmitting ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Submitting & Diagnosing...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Blocker</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

