import { Response } from "express";
import ApiResponse from "../../shared/utils/ApiResponse.util.js";
import createPod from "../../shared/services/k8s.service.js";
import { CreatePodRequest } from "./pods.type.js";

class PodsController {

    createPod = async (req: CreatePodRequest, res: Response) => {

        // const { podName, projectId } = req.query;

        const podName = "pod1";
        const projectId = "project1";
        
        await createPod(podName, projectId);
        
        return ApiResponse(res, 201, `Pod ${podName} created successfully in namespace default.`, null);

    }
    
} 

export default PodsController;