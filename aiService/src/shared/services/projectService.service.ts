// Importing modules
import env from '../config/env.config.js';
import ApiError from '../utils/ApiError.util.js';

/**
 * Calls projectService on behalf of the user: their own Authorization header is forwarded, so
 * projectService's ownership checks apply exactly as if the browser had made the call.
 */
export async function callProjectService<T = unknown>(
  authorization: string,
  route: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${env.PROJECT_SERVICE_URL}/api/projects${route}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: authorization }
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
  if (!res.ok) throw new ApiError(res.status, body.message || `projectService ${route} failed`);
  return body.data as T;
}
