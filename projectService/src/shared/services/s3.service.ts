// Importing modules
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client
} from '@aws-sdk/client-s3';
import env from '../config/env.config.js';

// the same bucket the per-project sync containers write to
const s3Client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

// function to walk every key under a prefix, one page (max 1000 keys) at a time
async function* listKeyPages(prefix: string) {
  let continuationToken: string | undefined;

  do {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    yield (page.Contents || []).map((object) => object.Key).filter(Boolean) as string[];
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
}

// function to delete every object under a prefix
export async function deletePrefix(prefix: string) {
  for await (const keys of listKeyPages(prefix)) {
    if (!keys.length) continue;

    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET_NAME,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: true }
      })
    );
  }
}

/**
 * Freezes the current files of a project into a deployment snapshot.
 *
 * The workspace keeps changing while the user edits, so a deployment serves a
 * server-side copy instead: `<projectId>/...` is copied to `deployments/<slug>/...`.
 * The old snapshot is cleared first so files deleted in the workspace disappear too.
 *
 * @returns the number of files copied, 0 means the project has nothing synced yet.
 */
export async function snapshotPrefix(source: string, destination: string) {
  await deletePrefix(destination);

  let copied = 0;

  // ponytail: sequential copies, fine for source trees (node_modules is never synced); batch with Promise.all if deploys get slow
  for await (const keys of listKeyPages(source)) {
    for (const key of keys) {
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          CopySource: `${env.S3_BUCKET_NAME}/${key.split('/').map(encodeURIComponent).join('/')}`,
          Key: `${destination}${key.slice(source.length)}`
        })
      );
      copied++;
    }
  }

  return copied;
}
