// Importing modules
import { Request } from 'express';
import { ParsedQs } from 'qs';

export interface CreatePodRequestBody {
  name?: string;
  projectType?: string;
  workspaceId?: string;
}

export type CreatePodRequest = Request<
  Record<string, string>,
  unknown,
  CreatePodRequestBody,
  ParsedQs
>;
