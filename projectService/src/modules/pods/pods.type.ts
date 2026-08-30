// Importing modules
import { Request } from "express";
import { ParsedQs } from "qs";

export interface CreatePodRequestBody {
	name?: string;
}

export type CreatePodRequest = Request<Record<string, string>, unknown, CreatePodRequestBody, ParsedQs>;
