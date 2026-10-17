// Importing modules
import Deployment from '../models/deployment.model.js';

// class to handle deployment data access operations
class DeploymentDao {
  DeploymentModel: typeof Deployment;

  constructor() {
    // initializing the deployment model
    this.DeploymentModel = Deployment;
  }

  // function to find the deployment of a project
  async findByProjectId(projectId: string) {
    return await this.DeploymentModel.findOne({ projectId: projectId });
  }

  // function to find a deployment by its subdomain
  async findBySlug(slug: string) {
    return await this.DeploymentModel.findOne({ slug: slug });
  }

  // function to create a deployment or bump the version of an existing one
  async upsertDeployment(projectId: string, deploymentData: Record<string, unknown>) {
    return await this.DeploymentModel.findOneAndUpdate(
      { projectId: projectId },
      {
        $set: { ...deploymentData, deployedAt: new Date() },
        $inc: { version: 1 }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false }
    );
  }

  // function to delete the deployment of a project
  async deleteByProjectId(projectId: string) {
    return await this.DeploymentModel.findOneAndDelete({ projectId: projectId });
  }
}

export default DeploymentDao;
