// Importing modules
import { Request } from "express";
import { ParsedQs } from "qs";

// Create pod request query interface
export interface CreatePodRequestQuery extends ParsedQs {
    podName: string;
    projectId: string;
}

export type CreatePodRequest = Request<any, any, any, CreatePodRequestQuery>;
