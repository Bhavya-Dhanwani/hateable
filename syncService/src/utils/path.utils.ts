import path from "node:path";
import { WORK_FOLDER, PROJECT_ID } from "../config/constants.js";
import { IGNORED_DIRS, IGNORED_FILES } from "../config/ignoredConstants.js";

export function getS3Key(localPath: string): string {
  const relativePath = path.relative(WORK_FOLDER, localPath).split(path.sep).join("/");
  return `${PROJECT_ID}/${relativePath}`;
}

export function isIgnored(filePath: string): boolean {
  const relative = path.relative(WORK_FOLDER, filePath);
  const parts = relative.split(path.sep);
  return parts.some((part) => IGNORED_DIRS.has(part) || IGNORED_FILES.has(part));
}

export function getLocalPathFromS3Key(s3Key: string): string {
  const relativePath = s3Key.substring(PROJECT_ID.length + 1);
  return path.join(WORK_FOLDER, relativePath);
}
