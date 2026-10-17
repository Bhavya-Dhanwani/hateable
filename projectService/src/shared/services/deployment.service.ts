// Importing modules
import logger from '../config/logger.config.js';
import env from '../config/env.config.js';
import { createDeploymentPod, createService, deletePod, deleteService } from './k8s.service.js';
import { stopTrackingDeployment } from './activity.service.js';
import { unsealEnvVars } from '../utils/envVars.util.js';

// the slice of a Deployment document the runtime needs (env: encrypted, from .select('+env'))
interface DeploymentTarget {
  slug: string;
  projectType: string;
  env?: string | null;
}

// kubernetes names of the resources serving a deployment
export const deploymentPodName = (slug: string) => `deploy-pod-${slug}`;
export const deploymentServiceName = (slug: string) => `deploy-service-${slug}`;

// S3 prefix holding the frozen files of a deployment
export const snapshotPrefixOf = (slug: string) => `deployments/${slug}/`;

// public URL of a deployment, e.g. https://shululu.hateable.bhavyadhanwani.dev
export const deploymentUrl = (slug: string) =>
  `${env.DEPLOY_PROTOCOL}://${slug}.${env.DEPLOY_DOMAIN}`;

/**
 * (Re)starts the pod and service of a deployment from its snapshot.
 *
 * Any previous pod is deleted first, `deletePod` waits until it is really gone so the
 * recreated pod with the same name does not fail with 409 "object is being deleted".
 * The caller must already hold the idle window (claimDeploymentWake / touchDeployment).
 */
export async function startDeployment(deployment: DeploymentTarget) {
  const podName = deploymentPodName(deployment.slug);
  const serviceName = deploymentServiceName(deployment.slug);

  try {
    // removing the resources of the previous version
    await deleteService(serviceName);
    await deletePod(podName);

    // starting the pod on the snapshot (without the trailing slash, sync adds it)
    await createDeploymentPod(
      podName,
      snapshotPrefixOf(deployment.slug).slice(0, -1),
      deployment.projectType,
      unsealEnvVars(deployment.env)
    );
    await createService(serviceName, podName, deployment.projectType);

    logger.info(`Deployment ${deployment.slug} is starting`);
  } catch (error) {
    // dropping the idle window so the next visitor retries the wake
    await stopTrackingDeployment(deployment.slug);
    throw error;
  }
}

// function to take a deployment offline for good
export async function stopDeployment(slug: string) {
  await stopTrackingDeployment(slug);
  await deleteService(deploymentServiceName(slug));
  await deletePod(deploymentPodName(slug));
}
