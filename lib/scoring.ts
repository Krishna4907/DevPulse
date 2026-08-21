export interface MemberScore {
  memberId: string;
  memberName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  taskType: 'safe' | 'stretch' | 'overload';
  hasActiveSkillConflict?: boolean;
  violatesSafeBeforeStretchRule?: boolean;
  warningMessage?: string;
}

export interface ScoringContext {
  taskHistory?: Record<string, number>; // memberId -> completed tasks with matching skills
  activeTasks?: { assigneeId: string | null; partnerId: string | null; skills: string[]; status: string; type: string }[];
}

export function scoreMembers(
  members: any[],
  taskSkills: string[],
  context: ScoringContext = {}
): MemberScore[] {
  const { taskHistory = {}, activeTasks = [] } = context;
  const primarySkill = taskSkills.length > 0 ? taskSkills[0] : null;

  return members.map((member) => {
    const memberSkills = member.skills || [];
    const matched = taskSkills.filter((s) => memberSkills.includes(s));
    const missing = taskSkills.filter((s) => !memberSkills.includes(s));
    const skillMatch = taskSkills.length > 0 ? matched.length / taskSkills.length : 1;
    const history = taskHistory[member.userId] || 0;

    const exploit = skillMatch * 0.6 + Math.min(history / 10, 1) * 0.4;
    const boostWeight = Math.max(0.5 - history * 0.04, 0.1);
    const learnBoost = history === 0 ? 1.0 : Math.max(1 - history * 0.12, 0.1);
    let finalScore = exploit * (1 - boostWeight) + learnBoost * boostWeight;

    const taskType: 'safe' | 'stretch' | 'overload' =
      missing.length === 0 ? 'safe' : missing.length === 1 ? 'stretch' : 'overload';

    // HARD RULE 1: If member already has an active task with the same primary/overlapping skill, deprioritise them
    const hasActiveSkillConflict = activeTasks.some((t) =>
      t.status !== 'done' &&
      (t.assigneeId === member.userId || t.partnerId === member.userId) &&
      ((primarySkill && t.skills.includes(primarySkill)) || t.skills.some((s) => taskSkills.includes(s)))
    );

    // HARD RULE 2: Every member must get at least 1 safe task before getting a 2nd stretch task
    const memberDoneSafeTasks = activeTasks.filter(
      (t) => t.status === 'done' && t.type === 'safe' && (t.assigneeId === member.userId || t.partnerId === member.userId)
    ).length;
    const memberActiveOrDoneStretchTasks = activeTasks.filter(
      (t) => t.type === 'stretch' && (t.assigneeId === member.userId || t.partnerId === member.userId)
    ).length;

    const violatesSafeBeforeStretchRule =
      taskType === 'stretch' && memberDoneSafeTasks === 0 && memberActiveOrDoneStretchTasks >= 1;

    const warnings: string[] = [];
    if (hasActiveSkillConflict) {
      finalScore = Math.max(finalScore * 0.25, 0.05); // Penalty
      warnings.push('Active task with overlapping skills in progress');
    }

    if (violatesSafeBeforeStretchRule) {
      finalScore = Math.max(finalScore * 0.4, 0.05);
      warnings.push('Must complete at least 1 Safe task before a 2nd Stretch task');
    }

    return {
      memberId: member.userId,
      memberName: member.name,
      score: Math.round(finalScore * 100),
      matchedSkills: matched,
      missingSkills: missing,
      taskType,
      hasActiveSkillConflict,
      violatesSafeBeforeStretchRule,
      warningMessage: warnings.join(' • '),
    };
  }).sort((a, b) => {
    // Deprioritised members move to bottom of suggestions
    if (a.hasActiveSkillConflict && !b.hasActiveSkillConflict) return 1;
    if (!a.hasActiveSkillConflict && b.hasActiveSkillConflict) return -1;
    return b.score - a.score;
  });
}
