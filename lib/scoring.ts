interface MemberScore {
  memberId: string;
  memberName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  taskType: 'safe' | 'stretch' | 'overload';
}

export function scoreMembers(
  members: any[],
  taskSkills: string[],
  taskHistory: Record<string, number> // memberId -> similar tasks completed
): MemberScore[] {
  return members.map(member => {
    const memberSkills = member.skills || [];
    const matched = taskSkills.filter(s => memberSkills.includes(s));
    const missing = taskSkills.filter(s => !memberSkills.includes(s));
    const skillMatch = taskSkills.length > 0 ? matched.length / taskSkills.length : 1;
    const history = taskHistory[member.userId] || 0;
    const exploit = skillMatch * 0.6 + Math.min(history / 10, 1) * 0.4;
    const boostWeight = Math.max(0.5 - history * 0.04, 0.1);
    const learnBoost = history === 0 ? 1.0 : Math.max(1 - history * 0.12, 0.1);
    const finalScore = exploit * (1 - boostWeight) + learnBoost * boostWeight;
    const taskType: 'safe' | 'stretch' | 'overload' = missing.length === 0 ? 'safe' 
                   : missing.length === 1 ? 'stretch' 
                   : 'overload';
    return {
      memberId: member.userId,
      memberName: member.name,
      score: Math.round(finalScore * 100),
      matchedSkills: matched,
      missingSkills: missing,
      taskType
    };
  }).sort((a, b) => b.score - a.score);
}
