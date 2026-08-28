import { getS3Key } from "../utils/path.utils.js";
import { S3_BUCKET_NAME } from "../config/constants.js";
import { PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import { AWS_REGION, S3_ENDPOINT } from "../config/constants.js";
import logger from "../utils/logger.util.js";

export const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: !!S3_ENDPOINT,
});

export async function uploadToS3(filePath: string) {
  try {
    const fileContent = await fs.readFile(filePath);
    const key = getS3Key(filePath);
    await s3Client.send(new PutObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key, Body: fileContent }));
    logger.info(`Uploaded: ${key}`);
  } catch (error) {
    logger.error(error, `Failed to upload ${filePath}`);
  }
}

export async function deleteFromS3(filePath: string) {
  const key = getS3Key(filePath);
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
    logger.info(`Deleted: ${key}`);
  } catch (error) {
    logger.error(error, `Failed to delete key ${key}`);
  }
}
