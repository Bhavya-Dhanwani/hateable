import { s3Client } from "../services/s3.service.js";
import { HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET_NAME } from "../config/constants.js";
import logger from "./logger.util.js";

export async function ensureBucketExists() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
    logger.info(`Bucket "${S3_BUCKET_NAME}" already exists.`);
  } catch (error) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (s3Error.name === "NotFound" || s3Error.$metadata?.httpStatusCode === 404) {
      logger.info(`Bucket "${S3_BUCKET_NAME}" not found. Creating it...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET_NAME }));
      logger.info(`Bucket "${S3_BUCKET_NAME}" created successfully.`);
    } else {
      throw error;
    }
  }
}