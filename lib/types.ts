export interface User {
  id: string;
  name: string;
  email: string;
  image: string;
  createdAt: Date;
  projectIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  techStack: string[];
  leaderId: string;
  leaderName?: string;
  memberCount?: number;
  maxMembers?: number;
  memberIds?: string[];
  webhookConfigured?: boolean;
  createdAt: any;
}

export interface ProjectMember {
  id: string;
  userId: string;
  projectId: string;
  role: 'leader' | 'member';
  skills: string[];
  skillsSet?: boolean;
  pendingSkills?: string[];
  name?: string;
  email?: string;
  image?: string;
  joinedAt?: any;
  createdAt: any;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  skills: string[];
  status: 'todo' | 'inprogress' | 'inreview' | 'done';
  type: 'safe' | 'stretch' | 'overload';
  branchName: string;
  projectId: string;
  assigneeId: string | null;
  partnerId: string | null;
  hasBlocker?: boolean;
  blockerCount?: number;
  lastCommit?: {
    message: string;
    author: string;
    timestamp: string;
    sha: string;
    url: string;
  };
  pr?: {
    url: string;
    title: string;
    number: number;
  };
  completedAt?: any;
  createdAt: any;
}

export interface Blocker {
  id: string;
  taskId: string;
  taskTitle?: string;
  projectId?: string;
  userId?: string;
  userName?: string;
  userImage?: string;
  description: string;
  type: string;
  notifyWhole?: boolean;
  aiDiagnosis?: {
    causes: string[];
    fix: string;
    resource?: string;
  } | null;
  resolved: boolean;
  createdAt?: any;
}

export interface SkillMap {
  userId: string;
  projectId: string;
  skills: string[];
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userImage: string;
  text: string;
  createdAt: any;
}

export interface Presence {
  userId: string;
  projectId?: string;
  online: boolean;
  lastSeen?: any;
  typing?: boolean;
  typingInProject?: string;
}

