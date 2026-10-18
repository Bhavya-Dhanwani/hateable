// Plan limits enforced by projectService. The plan comes from the access token (authService
// puts the user's `plan` in it); anything missing or unknown is treated as free.
// ponytail: aiService keeps its own copy of its limits, move both to a shared package if they drift

export type Plan = 'free' | 'pro' | 'team';

export const PLAN_NAMES: Record<Plan, string> = { free: 'Hobby', pro: 'Pro', team: 'Team' };

export const PLAN_LIMITS: Record<Plan, { projectSlots: number; alwaysOn: boolean }> = {
  // 2 slots: 2 frontend, 2 backend, 1 of each, or 1 full-stack (which takes both)
  free: { projectSlots: 2, alwaysOn: false },
  pro: { projectSlots: 10, alwaysOn: true },
  team: { projectSlots: 10, alwaysOn: true }
};

export const planOf = (user: { plan?: unknown } | undefined): Plan =>
  user?.plan === 'pro' || user?.plan === 'team' ? user.plan : 'free';

// full-stack (mern) projects count as a frontend and a backend on the free plan
export const slotCost = (plan: Plan, projectType: string) =>
  plan === 'free' && projectType.startsWith('mern-') ? 2 : 1;
