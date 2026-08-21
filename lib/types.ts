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
  createdAt: any;
}

export interface Blocker {
  id: string;
  taskId: string;
  description: string;
  type: string;
  aiDiagnosis: { causes: string[]; fix: string } | null;
  resolved: boolean;
  createdAt: Date;
}

export interface SkillMap {
  userId: string;
  projectId: string;
  skills: string[];
  updatedAt: Date;
}
