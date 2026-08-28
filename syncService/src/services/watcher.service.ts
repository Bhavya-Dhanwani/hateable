import chokidar from "chokidar";
import { WORK_FOLDER } from "../config/constants.js";
import { isIgnored } from "../utils/path.utils.js";
import { uploadToS3, deleteFromS3 } from "./s3.service.js";
import logger from "../utils/logger.util.js";

export function startWatcher() {
  const watcher = chokidar.watch(WORK_FOLDER, {
    ignored: (filePath) => isIgnored(filePath),
    persistent: true,
    ignoreInitial: true, // Crucial: don't sync existing files again
  });

  watcher
    .on("add", (filePath) => uploadToS3(filePath))
    .on("change", (filePath) => uploadToS3(filePath))
    .on("unlink", (filePath) => deleteFromS3(filePath));

  logger.info(`Active and monitoring changes in ${WORK_FOLDER}...`);
}

