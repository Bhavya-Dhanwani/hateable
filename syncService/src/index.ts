import process from "node:process";
import { syncOnStartup } from "./services/startupSync.service.js";
import { startWatcher } from "./services/watcher.service.js";
import { ensureBucketExists } from "./utils/ensureBucket.util.js";
import logger from "./utils/logger.util.js";


async function init() {
  try {
    await ensureBucketExists();
    await syncOnStartup();
    startWatcher();
  } catch (error) {
    logger.error(error, "Failed to start sync service");
    process.exit(1);
  }
}

init();
