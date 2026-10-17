export const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  '.turbo',
  'coverage'
]);

export const SYNCED_MARKER = '.hateable-synced';

export const IGNORED_FILES = new Set([
  SYNCED_MARKER,
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.DS_Store'
]);
