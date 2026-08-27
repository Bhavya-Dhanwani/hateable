import { Response } from "express";
import ApiResponse from "../../shared/utils/ApiResponse.util.js";
import { createPod, createService } from "../../shared/services/k8s.service.js";
import { CreatePodRequest } from "./pods.type.js";
import { v4 as uuid } from "uuid";
import { recordActivity } from "../../shared/services/activity.service.js";

class PodsController {

    createPod = async (req: CreatePodRequest, res: Response) => {

        const uniqueId = uuid();

        const podName = `nextjs-pod-${uniqueId}`;
        const serviceName = `nextjs-service-${uniqueId}`;
        const projectId = "projects"
        
        await createPod(podName, projectId);
        await createService(serviceName, podName);
        await recordActivity(uniqueId);
        
        return ApiResponse(res, 201, `Pod ${podName} created successfully in namespace default.`, {
            previewURL: `http://${uniqueId}.preview.localhost`,
        });

    }
    
} 

export default PodsController;