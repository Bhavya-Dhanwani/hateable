// Importing modules
import { Request, Response } from 'express';
import Project from '../../shared/models/project.model.js';
import DeploymentDao from '../../shared/dao/deployment.dao.js';
import NotFound from '../../shared/errors/NotFound.error.js';
import Forbidden from '../../shared/errors/Forbidden.error.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Ok from '../../shared/responses/Ok.response.js';
import Created from '../../shared/responses/Created.response.js';
import NoContent from '../../shared/responses/NoContent.response.js';
import slugify from '../../shared/utils/slugify.util.js';
import { snapshotPrefix, deletePrefix } from '../../shared/services/s3.service.js';
import {
  claimDeploymentWake,
  getDeploymentIdleRemaining,
  touchDeployment
} from '../../shared/services/activity.service.js';
import {
  deploymentPodName,
  deploymentUrl,
  snapshotPrefixOf,
  startDeployment,
  stopDeployment
} from '../../shared/services/deployment.service.js';
import { deleteAnalytics, getAnalytics } from '../../shared/services/analytics.service.js';
import {
  deleteDeploymentLogs,
  getDeploymentLogs,
  recordDeployEvent
} from '../../shared/services/logs.service.js';
import env from '../../shared/config/env.config.js';

// function to read the user id the auth middleware put on the request
const currentUserId = (req: Request) => {
  const user = (req as Request & { user?: { userId?: string; _id?: string } }).user;
  return user?.userId || user?._id || '';
};

// class to handle one-click deployments of a project
class DeploymentsController {
  deploymentDao: DeploymentDao;

  constructor() {
    // initializing the deployment dao
    this.deploymentDao = new DeploymentDao();
  }

  // function to load a project and make sure the caller owns it
  private findOwnedProject = async (req: Request) => {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      throw new NotFound('Project not found');
    }

    if (project.userId !== currentUserId(req)) {
      throw new Forbidden('You do not have permission to manage this project');
    }

    return project;
  };

  // function to pick a free subdomain, "shululu" or "shululu-1a2b3" when another project owns it
  private pickSlug = async (projectName: string, projectId: string) => {
    const slug = slugify(projectName);
    const owner = await this.deploymentDao.findBySlug(slug);

    return !owner || owner.projectId === projectId ? slug : `${slug}-${projectId.slice(-5)}`;
  };

  // function to shape a deployment for the frontend
  private present = async (deployment: { slug: string; [key: string]: unknown }) => {
    const idleRemainingMs = await getDeploymentIdleRemaining(deployment.slug);

    return {
      deployment,
      url: deploymentUrl(deployment.slug),
      status: idleRemainingMs > 0 ? 'live' : 'sleeping',
      idleRemainingMs,
      idleTimeoutMs: env.DEPLOY_IDLE_TTL_MS
    };
  };

  // get the deployment of a project, null when it was never deployed
  getDeployment = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);

    // finding the deployment using the deployment dao
    const deployment = await this.deploymentDao.findByProjectId(project._id.toString());

    // returning the deployment with its live status
    return Ok(
      res,
      'Deployment fetched successfully',
      deployment ? await this.present(deployment.toObject()) : { deployment: null }
    );
  };

  // deploy (or redeploy) the current files of a project in one click
  deploy = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);
    const projectId = project._id.toString();

    // keeping the subdomain of an earlier deploy, otherwise deriving it from the project name
    const existing = await this.deploymentDao.findByProjectId(projectId);
    const slug = existing?.slug || (await this.pickSlug(project.projectName || 'site', projectId));

    // freezing the current workspace files into the deployment snapshot
    const copied = await snapshotPrefix(`${projectId}/`, snapshotPrefixOf(slug));

    if (!copied) {
      throw new BadRequest('Nothing to deploy yet, open the workspace once so its files are saved');
    }

    // saving the deployment, a redeploy bumps its version
    const deployment = await this.deploymentDao.upsertDeployment(projectId, {
      slug,
      userId: currentUserId(req),
      projectType: project.projectType
    });

    // holding the 15 minute idle window, then (re)starting the pod on the new snapshot
    if (!(await touchDeployment(slug))) {
      await claimDeploymentWake(slug);
    }
    await startDeployment({ slug, projectType: project.projectType as string });
    await recordDeployEvent(slug, 'info', `Deployed v${deployment!.version} (${copied} files)`);

    // returning the deployment with its public url
    const body = await this.present(deployment!.toObject());

    return existing
      ? Ok(res, `Redeployed to ${body.url}`, body)
      : Created(res, `Deployed to ${body.url}`, body);
  };

  // take a deployment offline and free its subdomain
  undeploy = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);

    // deleting the deployment using the deployment dao
    const deployment = await this.deploymentDao.deleteByProjectId(project._id.toString());

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    // removing the pod, the snapshot and the analytics of the site
    await stopDeployment(deployment.slug);
    await deletePrefix(snapshotPrefixOf(deployment.slug));
    await deleteAnalytics(deployment.slug);
    await deleteDeploymentLogs(deployment.slug);

    return NoContent(res);
  };

  // get the optimized logs of a deployment: app output (live or last run) + lifecycle events
  getLogs = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);

    // finding the deployment using the deployment dao
    const deployment = await this.deploymentDao.findByProjectId(project._id.toString());

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    const awake = (await getDeploymentIdleRemaining(deployment.slug)) > 0;
    const logs = await getDeploymentLogs(
      deployment.slug,
      deploymentPodName(deployment.slug),
      deployment.projectType,
      awake
    );

    return Ok(res, 'Logs fetched successfully', logs);
  };

  // get the visitor analytics of a deployment
  getAnalytics = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);

    // finding the deployment using the deployment dao
    const deployment = await this.deploymentDao.findByProjectId(project._id.toString());

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    // reading the counters for the requested range (validated to 1-30 days)
    const days = Number(req.query.days || 14);
    const analytics = await getAnalytics(deployment.slug, days);

    return Ok(res, 'Analytics fetched successfully', {
      ...(await this.present(deployment.toObject())),
      analytics
    });
  };
}

export default DeploymentsController;
