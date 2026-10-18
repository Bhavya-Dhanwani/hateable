// Importing modules
import { Request, Response } from 'express';
import { PLAN_LIMITS } from '../../shared/constants/plans.constants.js';
import { findProjectFor, planFor, Role, userOf } from '../../shared/utils/access.util.js';
import DeploymentDao from '../../shared/dao/deployment.dao.js';
import NotFound from '../../shared/errors/NotFound.error.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Ok from '../../shared/responses/Ok.response.js';
import Created from '../../shared/responses/Created.response.js';
import NoContent from '../../shared/responses/NoContent.response.js';
import slugify from '../../shared/utils/slugify.util.js';
import { randomBytes } from 'node:crypto';
import CustomDomain from '../../shared/models/customDomain.model.js';
import Conflict from '../../shared/errors/Conflict.error.js';
import { normalizeDomain } from '../../shared/utils/domain.util.js';
import { checkDns, dnsInstructions, forgetHost } from '../../shared/services/domain.service.js';
import { sealEnvVars, unsealEnvVars, validateEnvVars } from '../../shared/utils/envVars.util.js';
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

// how many custom domains one site may have
const MAX_DOMAINS = 5;

// class to handle one-click deployments of a project
class DeploymentsController {
  deploymentDao: DeploymentDao;

  constructor() {
    // initializing the deployment dao
    this.deploymentDao = new DeploymentDao();
  }

  // function to load a project the caller has at least `min` access to (viewers only read)
  private findOwnedProject = (req: Request, min: Role = 'editor') => findProjectFor(req, min);

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
      status: deployment.alwaysOn || idleRemainingMs > 0 ? 'live' : 'sleeping',
      idleRemainingMs,
      idleTimeoutMs: env.DEPLOY_IDLE_TTL_MS
    };
  };

  // get the deployment of a project, null when it was never deployed
  getDeployment = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req, 'viewer');

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
      projectType: project.projectType,
      alwaysOn: PLAN_LIMITS[planFor(userOf(req), project)].alwaysOn
    });

    // holding the 15 minute idle window, then (re)starting the pod on the new snapshot
    if (!(await touchDeployment(slug))) {
      await claimDeploymentWake(slug);
    }
    // a redeploy keeps the env vars set on the deployment
    const withEnv = await this.deploymentDao.findWithEnvByProjectId(projectId);
    await startDeployment({ slug, projectType: project.projectType as string, env: withEnv?.env });
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

    // the custom domains stop pointing anywhere useful, free them for other projects
    const domains = await CustomDomain.find({ slug: deployment.slug });
    await CustomDomain.deleteMany({ slug: deployment.slug });
    domains.forEach((d) => forgetHost(d.domain));

    return NoContent(res);
  };

  // function to shape a custom domain for the dashboard, with the DNS records to create
  private presentDomain = (d: {
    domain: string;
    slug: string;
    token: string;
    verified: boolean;
    verifiedAt?: Date | null;
  }) => ({
    domain: d.domain,
    verified: d.verified,
    verifiedAt: d.verifiedAt ?? null,
    url: `${env.DEPLOY_PROTOCOL}://${d.domain}`,
    records: dnsInstructions(d.domain, d.slug, d.token)
  });

  // function to load the deployment of a project the caller owns
  private findOwnedDeployment = async (req: Request, min: Role = 'editor') => {
    const project = await this.findOwnedProject(req, min);
    const deployment = await this.deploymentDao.findByProjectId(project._id.toString());

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    return deployment;
  };

  // get the custom domains of a deployment
  listDomains = async (req: Request, res: Response) => {
    const deployment = await this.findOwnedDeployment(req, 'viewer');
    const domains = await CustomDomain.find({ slug: deployment.slug }).sort({ createdAt: 1 });

    return Ok(res, 'Domains fetched successfully', { domains: domains.map(this.presentDomain) });
  };

  // connect a custom domain: it stays pending until its TXT record is verified
  addDomain = async (req: Request, res: Response) => {
    const deployment = await this.findOwnedDeployment(req);

    // normalizing what the user typed (a pasted URL works too)
    const checked = normalizeDomain(req.body?.domain);
    if ('error' in checked) {
      throw new BadRequest(checked.error);
    }

    if ((await CustomDomain.countDocuments({ slug: deployment.slug })) >= MAX_DOMAINS) {
      throw new BadRequest(`A site can have at most ${MAX_DOMAINS} custom domains`);
    }

    const existing = await CustomDomain.findOne({ domain: checked.domain });
    if (existing) {
      throw new Conflict(
        existing.slug === deployment.slug
          ? 'This domain is already connected to this site'
          : 'This domain is connected to another site'
      );
    }

    const domain = await CustomDomain.create({
      domain: checked.domain,
      slug: deployment.slug,
      projectId: deployment.projectId,
      userId: currentUserId(req),
      token: randomBytes(16).toString('hex')
    });

    return Created(res, 'Domain added, create the DNS records to verify it', {
      domain: this.presentDomain(domain)
    });
  };

  // check the DNS of a custom domain; it starts serving the site once ownership is proven
  verifyDomain = async (req: Request, res: Response) => {
    const deployment = await this.findOwnedDeployment(req);
    const domain = await CustomDomain.findOne({ domain: req.params.domain, slug: deployment.slug });

    if (!domain) {
      throw new NotFound('Domain not found on this site');
    }

    const dns = await checkDns(domain.domain, domain.slug, domain.token);

    if (dns.ownership && !domain.verified) {
      domain.verified = true;
      domain.verifiedAt = new Date();
      await domain.save();
      forgetHost(domain.domain);
      await recordDeployEvent(deployment.slug, 'info', `Custom domain ${domain.domain} connected`);
    }

    return Ok(res, domain.verified ? 'Domain verified' : 'TXT record not found yet', {
      domain: this.presentDomain(domain),
      dns
    });
  };

  // disconnect a custom domain
  removeDomain = async (req: Request, res: Response) => {
    const deployment = await this.findOwnedDeployment(req);
    const removed = await CustomDomain.findOneAndDelete({
      domain: req.params.domain,
      slug: deployment.slug
    });

    if (!removed) {
      throw new NotFound('Domain not found on this site');
    }

    forgetHost(removed.domain);
    await recordDeployEvent(deployment.slug, 'info', `Custom domain ${removed.domain} removed`);

    return NoContent(res);
  };

  // get the environment variables of a deployment (owner only, decrypted)
  getEnv = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);

    // finding the deployment with its encrypted env
    const deployment = await this.deploymentDao.findWithEnvByProjectId(project._id.toString());

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    return Ok(res, 'Environment variables fetched successfully', {
      vars: unsealEnvVars(deployment.env)
    });
  };

  // replace the environment variables of a deployment; an awake site restarts to pick them up
  updateEnv = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req);
    const projectId = project._id.toString();

    // validating names, sizes and reserved keys
    const checked = validateEnvVars(req.body?.vars);
    if ('error' in checked) {
      throw new BadRequest(checked.error);
    }

    // saving them encrypted using the deployment dao
    const deployment = await this.deploymentDao.updateEnv(projectId, sealEnvVars(checked.vars));

    if (!deployment) {
      throw new NotFound('This project is not deployed');
    }

    // env is read at process start, so a running site must restart; a sleeping one gets it on wake
    const count = Object.keys(checked.vars).length;
    const awake = await touchDeployment(deployment.slug);
    if (awake) {
      await startDeployment(deployment);
    }
    await recordDeployEvent(
      deployment.slug,
      'info',
      `Environment variables updated (${count})${awake ? ', restarting the site' : ''}`
    );

    return Ok(res, awake ? 'Saved, the site is restarting' : 'Saved, used on the next visit', {
      vars: checked.vars,
      restarted: awake
    });
  };

  // get the optimized logs of a deployment: app output (live or last run) + lifecycle events
  getLogs = async (req: Request, res: Response) => {
    // checking the project belongs to the user
    const project = await this.findOwnedProject(req, 'viewer');

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
    const project = await this.findOwnedProject(req, 'viewer');

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
