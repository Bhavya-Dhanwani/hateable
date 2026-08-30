import { Request, Response } from "express";
import ApiResponse from "../../shared/utils/ApiResponse.util.js";
import { createPod, createService, deletePod, deleteService } from "../../shared/services/k8s.service.js";
import { CreatePodRequest } from "./pods.type.js";
import { recordActivity } from "../../shared/services/activity.service.js";
import Project from "../../shared/models/project.model.js";
import NotFound from "../../shared/errors/NotFound.error.js";
import Forbidden from "../../shared/errors/Forbidden.error.js";
import { publishMessage } from "../../shared/services/broker.service.js";

class PodsController {

    createPod = async (req: CreatePodRequest, res: Response) => {

        const { name: projectName, projectType } = req.body;
        const user = (req as Request & { user?: { userId?: string; _id?: string } }).user;
        const userId = user?.userId || user?._id || "";

        const project = new Project({
            status: "starting",
            projectName: projectName as string,
            projectType: projectType as string,
            userId: userId
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

            project.status = "running";
            project.podName = podName;
            project.serviceName = serviceName;
            project.previewURL = `http://${uniqueId}.preview.localhost`;
            await project.save();

            await publishMessage("project.created", JSON.stringify({
                projectId: uniqueId,
                podName: podName,
                serviceName: serviceName,
                userId: userId,
            }));

            return ApiResponse(res, 201, `Pod ${podName} created successfully in namespace default.`, {
                previewURL: project.previewURL,
            });
        } catch (error) {
            project.status = "failed";
            await project.save();
            throw error;
        }

    }

    relaunchPod = async (req: Request, res: Response) => {

        const projectId = req.params.projectId as string;
        const user = (req as Request & { user?: { userId?: string; _id?: string } }).user;
        const currentUserId = user?.userId || user?._id || "";

        const project = await Project.findById(projectId);
        if (!project) {
            throw new NotFound("Project not found");
        }

        if (project.userId !== currentUserId) {
            throw new Forbidden("You do not have permission to relaunch this project");
        }

        // If the project is already running, just record activity and return
        if (project.status === "running") {
            await recordActivity(projectId);
            return ApiResponse(res, 200, `Pod nextjs-pod-${projectId} is already running.`, {
                previewURL: project.previewURL,
            });
        }

        project.status = "starting";
        await project.save();

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

            project.status = "running";
            project.podName = podName;
            project.serviceName = serviceName;
            project.previewURL = `http://${projectId}.preview.localhost`;
            await project.save();

            return ApiResponse(res, 200, `Pod ${podName} relaunched successfully.`, {
                previewURL: project.previewURL,
            });
        } catch (error) {
            project.status = "failed";
            await project.save();
            throw error;
        }

    }
    
} 

export default PodsController;