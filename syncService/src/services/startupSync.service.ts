import { s3Client, uploadToS3 } from "./s3.service.js";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { WORK_FOLDER, PROJECT_ID, S3_BUCKET_NAME } from "../config/constants.js";
import { isIgnored, getLocalPathFromS3Key } from "../utils/path.utils.js";
import logger from "../utils/logger.util.js";

export async function syncOnStartup() {
  logger.info(`Checking for existing S3 files under: ${PROJECT_ID}/`);

  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: `${PROJECT_ID}/`,
    })
  );

  const filesInS3 = listResponse.Contents || [];

  if (filesInS3.length > 0) {
    logger.info(`Found ${filesInS3.length} existing files on S3. Syncing to local disk...`);

    for (const file of filesInS3) {
      if (!file.Key) continue;

      const localPath = getLocalPathFromS3Key(file.Key);

      if (isIgnored(localPath)) continue;

      // Download file content
      const downloadResponse = await s3Client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: file.Key })
      );

      if (downloadResponse.Body) {
        const bytes = await downloadResponse.Body.transformToByteArray();
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, bytes);
        logger.info(`Restored: ${file.Key}`);
      }
    }
    logger.info("Local workspace is now fully synced with previous S3 state.");
  } else {
    logger.info("No files found in S3. Syncing initial local folder to S3...");
    await uploadInitialLocalFolder(WORK_FOLDER);
  }
}

// Walk the local directory recursively to upload everything initially
async function uploadInitialLocalFolder(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isIgnored(fullPath)) continue;

    if (entry.isDirectory()) {
      await uploadInitialLocalFolder(fullPath);
    } else if (entry.isFile()) {
      await uploadToS3(fullPath);
    }
  }
}
