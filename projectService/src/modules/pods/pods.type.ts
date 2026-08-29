// Importing modules
import { Request } from "express";
import { ParsedQs } from "qs";

export interface CreatePodRequestBody {
    name?: string;
}

export type CreatePodRequest = Request<any, any, CreatePodRequestBody, any>;
