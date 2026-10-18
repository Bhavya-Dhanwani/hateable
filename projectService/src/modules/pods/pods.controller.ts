import { Request, Response } from 'express';
import ApiResponse from '../../shared/utils/ApiResponse.util.js';
import {
  createPod,
  createService,
  deletePod,
  deleteService
} from '../../shared/services/k8s.service.js';
import { CreatePodRequest } from './pods.type.js';
import { recordActivity } from '../../shared/services/activity.service.js';
import Project from '../../shared/models/project.model.js';
import Forbidden from '../../shared/errors/Forbidden.error.js';
import { publishMessage } from '../../shared/services/broker.service.js';
import { Writable } from 'node:stream';
import { followPreviewLogs } from '../../shared/services/logs.service.js';
import {
  PLAN_LIMITS,
  PLAN_NAMES,
  planOf,
  slotCost
} from '../../shared/constants/plans.constants.js';

import {
  findProjectFor,
  projectRole,
  userIdOf,
  userOf,
  workspaceRole,
  atLeast
} from '../../shared/utils/access.util.js';

class PodsController {
  // ?workspaceId= lists a workspace's shared projects, otherwise the caller's personal ones
  listProjects = async (req: Request, res: Response) => {
    const user = userOf(req);
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (workspaceId && !workspaceRole(user, workspaceId)) {
      throw new Forbidden('You are not a member of this workspace');
    }
    const projects = await Project.find(
      workspaceId ? { workspaceId } : { userId: userIdOf(user), workspaceId: null }
    ).sort({ updatedAt: -1 });
    return ApiResponse(res, 200, 'Projects fetched successfully', {
      projects: projects.map((p) => ({ ...p.toObject(), role: projectRole(user, p) }))
    });
  };

  getProject = async (req: Request, res: Response) => {
    const project = await findProjectFor(req, 'viewer');
    return ApiResponse(res, 200, 'Project fetched successfully', {
      project: { ...project.toObject(), role: projectRole(userOf(req), project) }
    });
  };

  createPod = async (req: CreatePodRequest, res: Response) => {
    const { name: projectName, projectType, workspaceId } = req.body;
    const user = userOf(req);
    const userId = userIdOf(user);

    // a shared project needs editor access to the workspace, and counts against its pool
    if (workspaceId && !atLeast(workspaceRole(user, workspaceId), 'editor')) {
      throw new Forbidden('You need editor access to create projects in this workspace');
    }

    // plan limit: every project takes slots (a full-stack one takes two on the free plan)
    // ponytail: count-then-create, two creates at the same instant can both squeeze in
    const plan = workspaceId ? 'team' : planOf(user);
    const existing = await Project.find(
      workspaceId ? { workspaceId } : { userId, workspaceId: null },
      { projectType: 1 }
    );
    const used = existing.reduce((n, p) => n + slotCost(plan, p.projectType), 0);
    const limit = PLAN_LIMITS[plan].projectSlots;
    if (used + slotCost(plan, projectType as string) > limit) {
      throw new Forbidden(
        plan === 'free'
          ? `The Hobby plan allows 2 projects: 2 frontend, 2 backend, 1 of each, or 1 full-stack. Upgrade to Pro for 10.`
          : `The ${PLAN_NAMES[plan]} plan allows ${limit} projects.`
      );
    }

    const project = new Project({
      status: 'starting',
      projectName: projectName as string,
      projectType: projectType as string,
      userId: userId,
      workspaceId: workspaceId || undefined
    });
    await project.save();

    const uniqueId = project._id.toString();

    const podName = `nextjs-pod-${uniqueId}`;
    const serviceName = `nextjs-service-${uniqueId}`;
    const projectId = uniqueId;

    try {
      await createPod(podName, projectId, projectType as string);
      await createService(serviceName, podName, projectType as string);
      await recordActivity(uniqueId);

      project.status = 'running';
      project.podName = podName;
      project.serviceName = serviceName;
      project.previewURL = `http://${uniqueId}.preview.localhost`;
      await project.save();

      await publishMessage(
        'project.created',
        JSON.stringify({
          projectId: uniqueId,
          podName: podName,
          serviceName: serviceName,
          userId: userId,
          workspaceId: workspaceId || undefined
        })
      );

      return ApiResponse(res, 201, `Pod ${podName} created successfully in namespace default.`, {
        previewURL: project.previewURL,
        project
      });
    } catch (error) {
      project.status = 'failed';
      await project.save();
      throw error;
    }
  };

  relaunchPod = async (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    // viewers open the preview too, so they may wake it
    const project = await findProjectFor(req, 'viewer');

    // If the project is already running, just record activity and return
    if (project.status === 'running') {
      await recordActivity(projectId);
      return ApiResponse(res, 200, `Pod nextjs-pod-${projectId} is already running.`, {
        previewURL: project.previewURL
      });
    }

    // Atomically claim the relaunch so concurrent requests (two tabs, React StrictMode) don't
    // race each other into 409s. A 'starting' older than 3 minutes is treated as stuck.
    const claimed = await Project.findOneAndUpdate(
      {
        _id: projectId,
        $or: [
          { status: { $nin: ['running', 'starting'] } },
          { status: 'starting', updatedAt: { $lt: new Date(Date.now() - 3 * 60 * 1000) } }
        ]
      },
      { $set: { status: 'starting' } }
    );
    if (!claimed) {
      return ApiResponse(res, 202, `Pod nextjs-pod-${projectId} is already starting.`, {
        previewURL: project.previewURL
      });
    }

    const podName = `nextjs-pod-${projectId}`;
    const serviceName = `nextjs-service-${projectId}`;

    try {
      // Delete existing resources first to prevent conflict errors
      await deletePod(podName);
      await deleteService(serviceName);

      // Recreate Kubernetes pod and service
      await createPod(podName, projectId, project.projectType as string);
      await createService(serviceName, podName, project.projectType as string);
      await recordActivity(projectId);

      project.status = 'running';
      project.podName = podName;
      project.serviceName = serviceName;
      project.previewURL = `http://${projectId}.preview.localhost`;
      await project.save();

      return ApiResponse(res, 200, `Pod ${podName} relaunched successfully.`, {
        previewURL: project.previewURL
      });
    } catch (error) {
      project.status = 'failed';
      await project.save();
      throw error;
    }
  };

  // stream the raw output of the preview's app containers (server-sent events, one line per event)
  streamLogs = async (req: Request, res: Response) => {
    const project = await findProjectFor(req, 'viewer');

    // set before flushing so the compression filter sees the event-stream type
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // ingress-nginx would otherwise hold the stream back
    res.flushHeaders();

    // chunks can end mid-line: send whole lines only
    let partial = '';
    const out = new Writable({
      write(chunk, _encoding, done) {
        const lines = (partial + chunk.toString()).split('\n');
        partial = lines.pop() ?? '';
        lines.forEach((line) => res.write(`data: ${JSON.stringify(line)}\n\n`));
        done();
      }
    });

    const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000);
    let stop = () => {};
    req.on('close', () => {
      clearInterval(keepAlive);
      stop();
    });

    try {
      stop = await followPreviewLogs(
        `nextjs-pod-${project._id}`,
        project.projectType as string,
        out
      );
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify('The project is not running')}\n\n`);
      res.end();
    }
  };
}

export default PodsController;
