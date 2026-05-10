import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import { retryWithBackoff, logInfo, logError, logWarning, ErrorType, getErrorMessage } from './helpers';

// Validate environment variables on load
const r2BucketName = process.env.R2_BUCKET_NAME || '';
const r2AccountId = process.env.R2_ACCOUNT_ID || '';
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';

if (!r2BucketName || !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
  logWarning('R2_INIT', 'Missing R2 environment variables', {
    hasBucketName: !!r2BucketName,
    hasAccountId: !!r2AccountId,
    hasAccessKeyId: !!r2AccessKeyId,
    hasSecretAccessKey: !!r2SecretAccessKey,
  });
}

const s3Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
});

/**
 * Get content type based on file extension
 */
function getContentType(key: string): string {
  if (key.endsWith('.mp3')) return 'audio/mpeg';
  if (key.endsWith('.zip')) return 'application/zip';
  if (key.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

/**
 * Upload file to R2 with retry logic and comprehensive error handling
 */
export async function uploadFileToR2(
  filePath: string,
  key: string,
  expirationSeconds: number = Number(process.env.R2_PRESIGNED_EXPIRES_SEC) || 86400 // 24 hours
): Promise<string> {
  // Validate inputs
  if (!filePath || !key) {
    throw new Error('Missing required parameters: filePath and key must be provided');
  }

  if (!r2BucketName) {
    logError(
      { type: ErrorType.R2_UPLOAD, details: { filePath, key } },
      'R2_BUCKET_NAME environment variable not set'
    );
    throw new Error('R2 storage not configured: missing bucket name');
  }

  let stats: fs.Stats;
  try {
    stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('Path does not point to a file');
    }
  } catch (error) {
    logError(
      { type: ErrorType.R2_UPLOAD, details: { filePath, key }, originalError: error instanceof Error ? error : undefined },
      'Failed to stat file before upload'
    );
    throw new Error(`File not found or not accessible: ${filePath}`);
  }

  const contentType = getContentType(key);

  logInfo('R2_UPLOAD', 'Starting upload with retry logic', {
    filePath,
    key,
    bucket: r2BucketName,
    size: stats.size,
    contentType,
    expirationSeconds,
  });

  let uploadedUrl: string = '';

  try {
    // Retry logic for upload operation
    await retryWithBackoff(
      async () => {
        try {
          const fileContent = await fsPromises.readFile(filePath);

          const uploadCommand = new PutObjectCommand({
            Bucket: r2BucketName,
            Key: key,
            Body: fileContent,
            ContentType: contentType,
          });

          const response = await s3Client.send(uploadCommand);
          logInfo('R2_UPLOAD', 'File uploaded successfully to R2', {
            key,
            bucket: r2BucketName,
            etag: response.ETag,
            versionId: response.VersionId,
          });

          // Generate presigned URL
          const getCommand = new GetObjectCommand({
            Bucket: r2BucketName,
            Key: key,
          });

          uploadedUrl = await getSignedUrl(s3Client, getCommand, {
            expiresIn: expirationSeconds,
          });

          logInfo('R2_UPLOAD', 'Presigned URL generated', {
            key,
            expirationSeconds,
            urlLength: uploadedUrl.length,
          });

          return uploadedUrl;
        } catch (error) {
          logWarning('R2_UPLOAD', 'Upload attempt failed, will retry', {
            key,
            error: getErrorMessage(error),
          });
          throw error;
        }
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        onRetry: (attempt, error, nextDelayMs) => {
          logWarning('R2_UPLOAD', `Retry attempt ${attempt} after ${nextDelayMs}ms`, {
            key,
            error: getErrorMessage(error),
          });
        },
      }
    );

    return uploadedUrl;
  } catch (error) {
    logError(
      {
        type: ErrorType.R2_UPLOAD,
        details: { filePath, key, bucket: r2BucketName, fileSize: stats.size },
        originalError: error instanceof Error ? error : undefined,
      },
      'Failed to upload file to R2 after all retries',
      { finalError: getErrorMessage(error) }
    );
    throw new Error(`Failed to upload file to R2: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a presigned URL for an existing R2 object
 */
export async function getPresignedUrl(
  key: string,
  expirationSeconds: number = Number(process.env.R2_PRESIGNED_EXPIRES_SEC) || 86400
): Promise<string> {
  try {
    if (!r2BucketName) {
      throw new Error('R2 bucket not configured');
    }

    const command = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: expirationSeconds,
    });

    logInfo('R2_PRESIGNED_URL', 'Generated presigned URL', {
      key,
      expiresIn: expirationSeconds,
    });

    return presignedUrl;
  } catch (error) {
    logError(
      {
        type: ErrorType.R2_UPLOAD,
        details: { key, expirationSeconds },
        originalError: error instanceof Error ? error : undefined,
      },
      'Failed to generate presigned URL'
    );
    throw new Error(`Failed to generate presigned URL: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete an object from R2 with error handling
 */
export async function deleteObjectFromR2(key: string): Promise<void> {
  try {
    if (!r2BucketName) {
      throw new Error('R2 bucket not configured');
    }

    logInfo('R2_DELETE', 'Starting object deletion', { key, bucket: r2BucketName });

    const deleteCommand = new DeleteObjectCommand({
      Bucket: r2BucketName,
      Key: key,
    });

    const response = await s3Client.send(deleteCommand);

    logInfo('R2_DELETE', 'Object deleted successfully', {
      key,
      deleteMarker: response.DeleteMarker,
      versionId: response.VersionId,
    });
  } catch (error) {
    logError(
      {
        type: ErrorType.R2_DELETE,
        details: { key, bucket: r2BucketName },
        originalError: error instanceof Error ? error : undefined,
      },
      'Failed to delete object from R2'
    );
    throw new Error(`Failed to delete object from R2: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete all objects under a given prefix (folder) in R2
 */
export async function deleteObjectsByPrefix(prefix: string): Promise<void> {
  try {
    if (!r2BucketName) {
      throw new Error('R2 bucket not configured');
    }

    logInfo('R2_DELETE_PREFIX', 'Starting prefix deletion', { prefix, bucket: r2BucketName });

    // List objects with the prefix
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');

    const listCommand = new ListObjectsV2Command({
      Bucket: r2BucketName,
      Prefix: prefix,
    });

    const listed = await s3Client.send(listCommand as any);
    const listedAny: any = listed;
    const objects: any[] = listedAny.Contents || [];

    if (objects.length === 0) {
      logInfo('R2_DELETE_PREFIX', 'No objects found under prefix', { prefix });
      return;
    }

    logInfo('R2_DELETE_PREFIX', 'Found objects to delete', { prefix, count: objects.length });

    const deleteParams = {
      Bucket: r2BucketName,
      Delete: {
        Objects: objects.map((o: any) => ({ Key: o.Key })),
        Quiet: true,
      },
    } as any;

    const deleteCommand = new DeleteObjectsCommand(deleteParams);
    const deleteResponse = await s3Client.send(deleteCommand);

    logInfo('R2_DELETE_PREFIX', 'Batch deletion completed', {
      prefix,
      deletedCount: objects.length,
      deleteResponse: {
        deleted: (deleteResponse as any).Deleted?.length || 0,
        errors: (deleteResponse as any).Errors?.length || 0,
      },
    });
  } catch (error) {
    logError(
      {
        type: ErrorType.R2_DELETE,
        details: { prefix, bucket: r2BucketName },
        originalError: error instanceof Error ? error : undefined,
      },
      'Failed to delete objects by prefix'
    );
    throw new Error(`Failed to delete objects by prefix ${prefix}: ${getErrorMessage(error)}`);
  }
}

/**
 * Extract filename from R2 key
 */
export function getFilenameFromKey(key: string): string {
  return key.split('/').pop() || 'download';
}
