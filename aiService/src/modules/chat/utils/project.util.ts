// Importing modules
import ProjectDao from '../../../shared/dao/project.dao.js';
import {
  getCachedProject,
  cacheProject,
  CachedProject
} from '../../../shared/services/redis.service.js';
import NotFound from '../../../shared/errors/NotFound.error.js';
import Forbidden from '../../../shared/errors/Forbidden.error.js';
import { callProjectService } from '../../../shared/services/projectService.service.js';

// function to resolve project metadata via cache, database, then projectService. The database
// copy arrives through the broker's project.created event, which can lag a just-created project
// (the landing-page prompt is sent right after creation), so ask projectService as the caller.
export async function resolveProject(
  projectId: string,
  projectDao: ProjectDao,
  authorization?: string
): Promise<CachedProject> {
  let project = await getCachedProject(projectId);

  if (!project) {
    let dbProject = await projectDao.findProjectById(projectId);

    if (!dbProject && authorization) {
      // projectService checks the caller may see it; a 403/404 from it surfaces as is
      const { project: live } = await callProjectService<{
        project: { podName?: string; serviceName?: string; userId?: string; workspaceId?: string };
      }>(authorization, `/${projectId}`);
      if (live?.serviceName) {
        dbProject = await projectDao.upsertProject(projectId, {
          projectId,
          podName: live.podName,
          serviceName: live.serviceName,
          userId: live.userId,
          workspaceId: live.workspaceId || null
        });
      }
    }

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
