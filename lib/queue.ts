import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export interface ConversionJob {
  id: string;
  url: string;
  format: 'mp3' | 'mp4';
  audioQuality?: string;
  videoQuality?: string;
  title?: string;
  isPlaylist?: boolean;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  statusMessage: string;
  fileUrl?: string;
  filename?: string;
  fileSize?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

const JOB_EXPIRATION = Number(process.env.JOB_EXPIRATION_SEC) || 86400 * 2; // seconds (default 2 days)
const PROCESSING_LEASES_KEY = 'conversion:processing';
const PROCESSING_LEASE_MS = Math.max(60000, Number(process.env.PROCESSING_LEASE_MS) || 10 * 60 * 1000);
const MAX_ACTIVE_JOBS_PER_CLIENT = Math.max(1, Number(process.env.MAX_ACTIVE_JOBS_PER_CLIENT) || 5);
const MAX_QUEUE_DEPTH = Math.max(1, Number(process.env.MAX_QUEUE_DEPTH) || 30);
const CLIENT_JOB_TTL_SECONDS = Math.max(600, Number(process.env.CLIENT_JOB_TTL_SEC) || 7200);
const MAX_QUEUE_WAIT_MS = Math.max(10000, Number(process.env.MAX_QUEUE_WAIT_MS) || 30000);
let lastRecoveryCheck = 0;

export class QueueAdmissionError extends Error {
  constructor(public readonly reason: 'client-limit' | 'queue-full') {
    super(reason);
  }
}

/**
 * Create a new conversion job
 */
export async function createJob(
  id: string,
  url: string,
  format: 'mp3' | 'mp4',
  audioQuality?: string,
  videoQuality?: string,
  title?: string,
  isPlaylist?: boolean,
  clientId?: string,
): Promise<ConversionJob> {
  const job: ConversionJob = {
    id,
    url,
    format,
    audioQuality,
    videoQuality,
    title,
    isPlaylist,
    status: 'queued',
    progress: 0,
    statusMessage: 'Queued',
    createdAt: Date.now(),
  };

  console.log('[queue] Creating job', { id, url, format, audioQuality, videoQuality, title, isPlaylist });

  const activeKey = `conversion:client:${clientId || 'anonymous'}:active`;
  const ownerKey = `conversion:job-owner:${id}`;
  const admission = await redis.eval<number>(
    `redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[1])
     if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[2]) then return -1 end
     if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[3]) then return -2 end
     redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[5])
     redis.call('LPUSH', KEYS[2], ARGV[6])
     redis.call('ZADD', KEYS[4], ARGV[7], ARGV[6])
     redis.call('EXPIRE', KEYS[4], ARGV[8])
     redis.call('SET', KEYS[5], KEYS[4], 'EX', ARGV[5])
     return redis.call('LLEN', KEYS[2])`,
    [`job:${id}`, 'conversion:queue', PROCESSING_LEASES_KEY, activeKey, ownerKey],
    [
      (Date.now() - CLIENT_JOB_TTL_SECONDS * 1000).toString(),
      MAX_ACTIVE_JOBS_PER_CLIENT.toString(),
      MAX_QUEUE_DEPTH.toString(),
      JSON.stringify(job),
      JOB_EXPIRATION.toString(),
      id,
      Date.now().toString(),
      CLIENT_JOB_TTL_SECONDS.toString(),
    ],
  );

  if (admission === -1) throw new QueueAdmissionError('client-limit');
  if (admission === -2) throw new QueueAdmissionError('queue-full');

  console.log('[queue] Job queued', { id, key: `job:${id}`, queue: 'conversion:queue' });

  return job;
}

/**
 * Get job by ID
 */
export async function getJob(id: string): Promise<ConversionJob | null> {
  const jobData = await redis.get(`job:${id}`);
  if (!jobData) return null;
  if (typeof jobData === 'object') return jobData as ConversionJob;
  return JSON.parse(jobData as string) as ConversionJob;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  id: string,
  status: ConversionJob['status'],
  progress: number = 0,
  statusMessage: string = ''
): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  console.log('[queue] updateJobStatus', { id, status, progress, statusMessage });

  job.status = status;
  job.progress = progress;
  job.statusMessage = statusMessage;

  if (status === 'processing' && !job.startedAt) {
    job.startedAt = Date.now();
  }
  if (status === 'completed' || status === 'failed') {
    job.completedAt = Date.now();
  }

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
}

/**
 * Complete job with file details
 */
export async function completeJob(
  id: string,
  fileUrl: string,
  filename: string,
  fileSize: number
): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  console.log('[queue] Job completed', { id, filename, fileSize });

  job.status = 'completed';
  job.progress = 100;
  job.statusMessage = 'Completed';
  job.fileUrl = fileUrl;
  job.filename = filename;
  job.fileSize = fileSize;
  job.completedAt = Date.now();

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
  await releaseClientJob(id);
}

export async function cleanupJobFile(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  job.fileUrl = undefined;
  job.filename = undefined;
  job.fileSize = undefined;
  job.statusMessage = 'Downloaded and storage freed';

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
  await releaseClientJob(id);
}

async function releaseClientJob(id: string): Promise<void> {
  const ownerKey = `conversion:job-owner:${id}`;
  const activeKey = await redis.get<string>(ownerKey);
  if (!activeKey) return;
  await redis.zrem(activeKey, id);
}

/**
 * Fail job with error message
 */
export async function failJob(id: string, error: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  console.log('[queue] failJob', { id, error });

  job.status = 'failed';
  job.statusMessage = 'Failed';
  job.error = error;
  job.completedAt = Date.now();

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
  await releaseClientJob(id);
}

/**
 * Get next job from queue
 */
export async function getNextJob(): Promise<string | null> {
  await recoverStalledJobs();
  const jobId = await redis.eval<string | null>(
    `local id = redis.call('RPOP', KEYS[1])
     if id then
       redis.call('ZADD', KEYS[2], ARGV[1], id)
     end
     return id`,
    ['conversion:queue', PROCESSING_LEASES_KEY],
    [Date.now().toString()],
  );
  if (jobId) {
    console.log('[queue] Job claimed', { jobId });
  }
  return jobId;
}

/** Record that a worker owns a job. The timestamp is refreshed while it runs. */
export async function touchJobLease(id: string): Promise<void> {
  await redis.zadd(PROCESSING_LEASES_KEY, { score: Date.now(), member: id });
}

/** Remove a job from the active set after either success or failure. */
export async function releaseJobLease(id: string): Promise<void> {
  await redis.zrem(PROCESSING_LEASES_KEY, id);
}

/**
 * Atomically expire a job only if it is still waiting in the queue. A worker
 * claim and this cancellation cannot both win because both run inside Redis.
 */
export async function expireQueuedJob(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job || job.status !== 'queued' || Date.now() - job.createdAt < MAX_QUEUE_WAIT_MS) return false;

  const removed = await redis.eval<number>(
    `if redis.call('ZSCORE', KEYS[2], ARGV[1]) then return 0 end
     local count = redis.call('LREM', KEYS[1], 0, ARGV[1])
     if count > 0 then return 1 end
     return 0`,
    ['conversion:queue', PROCESSING_LEASES_KEY],
    [id],
  );

  if (removed !== 1) return false;
  await failJob(id, 'Please try again later.');
  return true;
}

/** Register a specifically-triggered job without allowing another worker to claim it. */
export async function claimJobById(id: string): Promise<void> {
  await redis.lrem('conversion:queue', 0, id);
  await touchJobLease(id);
}

/** Return jobs abandoned by a stopped worker to the FIFO queue. */
export async function recoverStalledJobs(): Promise<number> {
  const now = Date.now();
  if (now - lastRecoveryCheck < 60000) return 0;
  lastRecoveryCheck = now;

  const cutoff = now - PROCESSING_LEASE_MS;
  const stalledIds = await redis.zrange<string[]>(PROCESSING_LEASES_KEY, 0, cutoff, {
    byScore: true,
    offset: 0,
    count: 20,
  });

  let recovered = 0;
  for (const id of stalledIds) {
    const removed = await redis.eval<number>(
      `local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
       if score and tonumber(score) <= tonumber(ARGV[2]) then
         return redis.call('ZREM', KEYS[1], ARGV[1])
       end
       return 0`,
      [PROCESSING_LEASES_KEY],
      [id, cutoff.toString()],
    );

    if (removed !== 1) continue;
    const job = await getJob(id);
    if (!job || job.status === 'completed' || job.status === 'failed') continue;

    job.status = 'queued';
    job.progress = 0;
    job.statusMessage = 'Queued again after worker interruption';
    job.startedAt = undefined;
    await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
    await redis.lpush('conversion:queue', id);
    recovered += 1;
  }

  if (recovered > 0) console.log('[queue] Recovered interrupted jobs', { recovered });
  return recovered;
}

/**
 * Add job back to queue (for retry)
 */
export async function requeueJob(id: string): Promise<void> {
  await redis.lpush('conversion:queue', id);
}

export async function retryJob(id: string, clientId: string): Promise<ConversionJob | null> {
  const job = await getJob(id);
  if (!job || job.status === 'processing' || job.status === 'completed') return null;

  job.status = 'queued';
  job.progress = 0;
  job.statusMessage = 'Queued';
  job.error = undefined;
  job.startedAt = undefined;
  job.completedAt = undefined;
  const activeKey = `conversion:client:${clientId}:active`;
  const ownerKey = `conversion:job-owner:${id}`;
  const admission = await redis.eval<number>(
    `redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[1])
     if not redis.call('ZSCORE', KEYS[4], ARGV[5]) and redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[2]) then return -1 end
     if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[3]) then return -2 end
     redis.call('LREM', KEYS[2], 0, ARGV[5])
     redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[6])
     redis.call('LPUSH', KEYS[2], ARGV[5])
     redis.call('ZADD', KEYS[4], ARGV[7], ARGV[5])
     redis.call('EXPIRE', KEYS[4], ARGV[8])
     redis.call('SET', KEYS[5], KEYS[4], 'EX', ARGV[6])
     return 1`,
    [`job:${id}`, 'conversion:queue', PROCESSING_LEASES_KEY, activeKey, ownerKey],
    [
      (Date.now() - CLIENT_JOB_TTL_SECONDS * 1000).toString(),
      MAX_ACTIVE_JOBS_PER_CLIENT.toString(),
      MAX_QUEUE_DEPTH.toString(),
      JSON.stringify(job),
      id,
      JOB_EXPIRATION.toString(),
      Date.now().toString(),
      CLIENT_JOB_TTL_SECONDS.toString(),
    ],
  );
  if (admission === -1) throw new QueueAdmissionError('client-limit');
  if (admission === -2) throw new QueueAdmissionError('queue-full');
  return job;
}

/**
 * Remove a job id from the queue list to avoid duplicates / stale entries.
 */
export async function removeJobFromQueue(id: string): Promise<number> {
  const removed = await redis.lrem('conversion:queue', 0, id);
  console.log('[queue] removeJobFromQueue', { id, removed });
  return removed as number;
}
