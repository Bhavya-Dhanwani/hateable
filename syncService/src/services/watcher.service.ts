import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SYNCED_MARKER } from '../config/ignoredConstants.js';
import { WORK_FOLDER } from '../config/constants.js';
import { isIgnored } from '../utils/path.utils.js';
import { uploadToS3, deleteFromS3 } from './s3.service.js';
import logger from '../utils/logger.util.js';

export function startWatcher() {
  const watcher = chokidar.watch(WORK_FOLDER, {
    ignored: (filePath) => isIgnored(filePath),
    persistent: true,
    ignoreInitial: true // Crucial: don't sync existing files again
  });

  watcher
    .on('add', (filePath) => uploadToS3(filePath))
    .on('change', (filePath) => uploadToS3(filePath))
    .on('unlink', (filePath) => deleteFromS3(filePath))
    // only now is every write safe: open the file server's gate (express-file-server/src/app/app.ts)
    .on('ready', () => {
      fs.writeFile(path.join(WORK_FOLDER, SYNCED_MARKER), new Date().toISOString())
        .then(() => logger.info('Workspace synced, file server unlocked'))
        .catch((error) => logger.error(error, 'Failed to write the synced marker'));
    });

  logger.info(`Active and monitoring changes in ${WORK_FOLDER}...`);
}
