// Importing modules
import ProjectDao from "../../../shared/dao/project.dao.js";
import { getCachedProject, cacheProject, CachedProject } from "../../../shared/services/redis.service.js";
import NotFound from "../../../shared/errors/NotFound.error.js";

// function to resolve project metadata via cache or database fallback
export async function resolveProject(projectId: string, projectDao: ProjectDao): Promise<CachedProject> {

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
		};

		await cacheProject(project);

	}

	return project;

}
