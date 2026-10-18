// Importing modules
import { Request } from 'express';
import Project from '../models/project.model.js';
import NotFound from '../errors/NotFound.error.js';
import Forbidden from '../errors/Forbidden.error.js';
import { Plan, planOf } from '../constants/plans.constants.js';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

// the access token's user: authService puts the caller's workspaces (with their role) in it
export type TokenUser = {
  userId?: string;
  _id?: string;
  plan?: unknown;
  workspaces?: Array<{ id: string; role: Role }>;
};

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export const userOf = (req: Request) =>
  ((req as Request & { user?: TokenUser }).user || {}) as TokenUser;
export const userIdOf = (user: TokenUser) => String(user.userId || user._id || '');

// the caller's role in a workspace, null when they are not in it
export const workspaceRole = (user: TokenUser, workspaceId?: string | null) =>
  (workspaceId && user.workspaces?.find((w) => w.id === workspaceId)?.role) || null;

/**
 * The caller's role on a project: in a workspace project their workspace role (so removing a
 * member also takes away the projects they created there), otherwise owner when they created
 * it, else null (no access).
 */
export function projectRole(
  user: TokenUser,
  project: { userId?: string | null; workspaceId?: string | null }
): Role | null {
  if (project.workspaceId) return workspaceRole(user, project.workspaceId);
  return project.userId && project.userId === userIdOf(user) ? 'owner' : null;
}

export const atLeast = (role: Role | null, min: Role) => !!role && RANK[role] >= RANK[min];

// workspace projects run on the Team plan's limits whoever touches them
export const planFor = (user: TokenUser, project: { workspaceId?: string | null }): Plan =>
  project.workspaceId ? 'team' : planOf(user);

/**
 * Loads req.params.projectId and checks the caller has at least `min` on it: viewers read,
 * editors change files, deploy and push, owners and admins manage everything.
 */
export async function findProjectFor(req: Request, min: Role) {
  const project = await Project.findById(req.params.projectId);
  if (!project) throw new NotFound('Project not found');

  const role = projectRole(userOf(req), project);
  if (!role) throw new Forbidden('You do not have access to this project');
  if (!atLeast(role, min)) throw new Forbidden(`This needs ${min} access, you are a ${role}`);

  return project;
}
