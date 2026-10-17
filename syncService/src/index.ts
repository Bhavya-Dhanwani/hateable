import process from 'node:process';
import { syncOnStartup } from './services/startupSync.service.js';
import { startWatcher } from './services/watcher.service.js';
import { ensureBucketExists } from './utils/ensureBucket.util.js';
import logger from './utils/logger.util.js';

async function init() {
  try {
    await ensureBucketExists();
    await syncOnStartup();

    // deployment pods run this once as an init container to restore their snapshot, then exit
    if (process.env.SYNC_ONCE === 'true') {
      logger.info('SYNC_ONCE set, snapshot restored, exiting');
      process.exit(0);
    }

    startWatcher();
  } catch (error) {
    logger.error(error, 'Failed to start sync service');
    process.exit(1);
  }
}

init();
