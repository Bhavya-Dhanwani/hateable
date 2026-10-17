import path from 'node:path';

export const PORT = Number(process.env.PORT ?? 8080);

export const WORK_FOLDER = path.resolve(process.env.WORK_FOLDER ?? '/app');

export const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  '.turbo',
  'coverage'
]);

// written by the sync container once the workspace is restored from S3 and watched
export const SYNCED_MARKER = '.hateable-synced';

export const IGNORED_FILES = new Set([
  SYNCED_MARKER,
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.DS_Store'
]);
