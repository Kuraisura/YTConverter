/**
 * R2 health checks and diagnostics
 */

import { S3Client, ListBucketsCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { logInfo, logError, ErrorType, getErrorMessage } from './error-handler';

/**
 * Create S3 client for health checks (utility function)
 */
function createHealthCheckClient(accountId: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({
    region: 'auto',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  });
}

export interface R2HealthCheckResult {
  healthy: boolean;
  checks: {
    credentials: { passed: boolean; message: string };
    connection: { passed: boolean; message: string };
    bucket: { passed: boolean; message: string };
    writeAccess: { passed: boolean; message: string };
  };
  timestamp: string;
}

/**
 * Perform comprehensive R2 health checks
 */
export async function checkR2Health(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string
): Promise<R2HealthCheckResult> {
  const result: R2HealthCheckResult = {
    healthy: true,
    checks: {
      credentials: { passed: false, message: '' },
      connection: { passed: false, message: '' },
      bucket: { passed: false, message: '' },
      writeAccess: { passed: false, message: '' },
    },
    timestamp: new Date().toISOString(),
  };

  try {
    // Check 1: Validate credentials are provided
    if (!accountId || !accessKeyId || !secretAccessKey) {
      result.checks.credentials.message = 'Missing credentials (account ID, access key, or secret key)';
      result.healthy = false;
      return result;
    }
    result.checks.credentials.passed = true;
    result.checks.credentials.message = 'Credentials are provided';

    // Check 2: Test connection
    const client = createHealthCheckClient(accountId, accessKeyId, secretAccessKey);
    try {
      const listCmd = new ListBucketsCommand({});
      await client.send(listCmd);
      result.checks.connection.passed = true;
      result.checks.connection.message = 'Connected to R2';
    } catch (error) {
      result.checks.connection.message = `Connection failed: ${getErrorMessage(error)}`;
      result.healthy = false;
      return result;
    }

    // Check 3: Verify bucket exists and is accessible
    try {
      const headCmd = new HeadBucketCommand({
        Bucket: bucketName,
      });
      await client.send(headCmd);
      result.checks.bucket.passed = true;
      result.checks.bucket.message = `Bucket "${bucketName}" is accessible`;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      result.checks.bucket.message = `Bucket check failed: ${errorMsg}`;
      result.healthy = false;
      return result;
    }

    // Check 4: Test write access with a test object
    try {
      const testKey = `.health-check-${Date.now()}.txt`;
      const putCmd = new PutObjectCommand({
        Bucket: bucketName,
        Key: testKey,
        Body: Buffer.from('health check'),
        ContentType: 'text/plain',
      });
      await client.send(putCmd);
      result.checks.writeAccess.passed = true;
      result.checks.writeAccess.message = `Successfully wrote test object to bucket`;

      // Clean up test object
      try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const delCmd = new (await import('@aws-sdk/client-s3')).DeleteObjectCommand({
          Bucket: bucketName,
          Key: testKey,
        });
        await client.send(delCmd);
      } catch (cleanupError) {
        logInfo('R2_HEALTH', 'Failed to clean up test object, but this is not critical', {
          testKey,
          error: getErrorMessage(cleanupError),
        });
      }
    } catch (error) {
      result.checks.writeAccess.message = `Write access test failed: ${getErrorMessage(error)}`;
      result.healthy = false;
    }

    return result;
  } catch (error) {
    result.healthy = false;
    logError(
      {
        type: ErrorType.R2_UPLOAD,
        details: { bucketName },
        originalError: error instanceof Error ? error : undefined,
      },
      'R2 health check failed',
      { error: getErrorMessage(error) }
    );
    return result;
  }
}

/**
 * Log health check results in human-readable format
 */
export function logHealthCheckResults(result: R2HealthCheckResult): void {
  const status = result.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY';
  console.log(`\n[R2 Health Check] ${status} at ${result.timestamp}`);
  console.log('─'.repeat(50));

  for (const [checkName, checkResult] of Object.entries(result.checks)) {
    const icon = checkResult.passed ? '✓' : '✗';
    console.log(`${icon} ${checkName.toUpperCase()}: ${checkResult.message}`);
  }

  console.log('─'.repeat(50) + '\n');
}

/**
 * Get diagnostic information about R2 configuration
 */
export function getR2Diagnostics(): Record<string, string | boolean> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;
  const hasAccessKey = !!process.env.R2_ACCESS_KEY_ID;
  const hasSecretKey = !!process.env.R2_SECRET_ACCESS_KEY;

  return {
    r2Endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : 'Not configured',
    r2Bucket: bucketName || 'Not configured',
    hasAccessKey,
    hasSecretKey,
    credentialsComplete: hasAccessKey && hasSecretKey,
    presignedExpirySeconds: process.env.R2_PRESIGNED_EXPIRES_SEC || '86400 (default)',
    cleanupDelayMs: process.env.CLEANUP_DELAY_MS || '60000 (default)',
  };
}
