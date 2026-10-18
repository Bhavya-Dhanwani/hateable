// Importing modules
import ProjectDao from '../../../shared/dao/project.dao.js';
import {
  getCachedProject,
  cacheProject,
  CachedProject
} from '../../../shared/services/redis.service.js';
import NotFound from '../../../shared/errors/NotFound.error.js';
import Forbidden from '../../../shared/errors/Forbidden.error.js';

// function to resolve project metadata via cache or database fallback
export async function resolveProject(
  projectId: string,
  projectDao: ProjectDao
): Promise<CachedProject> {
  let project = await getCachedProject(projectId);

  if (!project) {
    const dbProject = await projectDao.findProjectById(projectId);

    if (!dbProject) {
      throw new NotFound(`Project with ID ${projectId} not found.`);
    }

    project = {
      projectId: dbProject.projectId,
      podName: dbProject.podName || undefined,
      serviceName: dbProject.serviceName || undefined,
      userId: dbProject.userId || undefined,
      workspaceId: dbProject.workspaceId || undefined
    };

    await cacheProject(project);
  }

  return project;
}

// the access token's user: authService puts the caller's workspaces (with their role) in it
export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type TokenUser = {
  userId?: unknown;
  _id?: unknown;
  plan?: unknown;
  workspaces?: Array<{ id: string; role: Role }>;
};

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

// the caller's role on a project: their workspace role in a workspace project, else owner when
// they created it (same rule as projectService's access.util.ts)
export function projectRole(
  user: TokenUser,
  project: { userId?: string; workspaceId?: string }
): Role | null {
  if (project.workspaceId)
    return user.workspaces?.find((w) => w.id === project.workspaceId)?.role || null;
  return project.userId && project.userId === String(user.userId || user._id || '')
    ? 'owner'
    : null;
}

// throws unless the caller has at least `min` on the project (chatting edits files: editor)
export function assertProjectAccess(
  user: TokenUser | undefined,
  project: CachedProject,
  min: Role
) {
  const role = projectRole(user || {}, project);
  if (!role || RANK[role] < RANK[min]) {
    throw new Forbidden(
      role
        ? `This needs ${min} access, you are a ${role}`
        : 'You do not have access to this project'
    );
  }
}
