#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { Redis } = require('@upstash/redis');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

function loadLocalEnvironment() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/);
    if (!match) continue;
    const name = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}

async function deleteConversionObjects() {
  const bucket = process.env.R2_BUCKET_NAME;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 cleanup credentials are not configured');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  let continuationToken;
  let deleted = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'conversions/',
      ContinuationToken: continuationToken,
    }));
    const objects = (page.Contents || []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []);
    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
      deleted += objects.length;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

async function scanKeys(redis, pattern) {
  let cursor = '0';
  const keys = [];
  do {
    const result = await redis.scan(cursor, { match: pattern, count: 200 });
    cursor = String(result[0]);
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys;
}

async function clearConversionState() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Upstash Redis cleanup credentials are not configured');

  const redis = new Redis({ url, token });
  const patterns = ['job:*', 'conversion:job-owner:*', 'conversion:client:*:active', 'rate:convert:*'];
  const discovered = [];
  for (const pattern of patterns) discovered.push(...await scanKeys(redis, pattern));

  const fixedKeys = ['conversion:queue', 'conversion:processing', 'cleanup:queue', 'cleanup:failed'];
  const keys = [...new Set([...fixedKeys, ...discovered])];
  for (let index = 0; index < keys.length; index += 100) {
    await redis.del(...keys.slice(index, index + 100));
  }
  return keys.length;
}

async function cleanupOnShutdown() {
  loadLocalEnvironment();
  console.log('[local-server] Clearing conversion queue and temporary R2 files...');
  const [deletedObjects, deletedRedisKeys] = await Promise.all([
    deleteConversionObjects(),
    clearConversionState(),
  ]);
  console.log(`[local-server] Shutdown cleanup complete (${deletedObjects} R2 objects, ${deletedRedisKeys} Redis keys).`);
}

if (require.main === module) {
  cleanupOnShutdown().catch((error) => {
    console.error('[local-server] Shutdown cleanup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { cleanupOnShutdown, loadLocalEnvironment };
