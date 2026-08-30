// Importing modules
import Project from "../models/project.model.js";

// class to handle project data access operations
class ProjectDao {

	ProjectModel: typeof Project;

	constructor() {
		// initializing the project model
		this.ProjectModel = Project;
	}

	// function to find a project by projectId
	async findProjectById(projectId: string) {
		return await this.ProjectModel.findOne({ projectId });
	}

	// function to upsert a project
	async upsertProject(projectId: string, updateData: Record<string, unknown>) {
		return await this.ProjectModel.findOneAndUpdate(
			{ projectId },
			updateData,
			{ upsert: true, new: true }
		);
	}

}

export default ProjectDao;
