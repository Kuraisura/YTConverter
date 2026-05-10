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

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
  await redis.lpush('conversion:queue', id);

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

  console.log('[queue] completeJob', { id, fileUrl, filename, fileSize });

  job.status = 'completed';
  job.progress = 100;
  job.statusMessage = 'Completed';
  job.fileUrl = fileUrl;
  job.filename = filename;
  job.fileSize = fileSize;
  job.completedAt = Date.now();

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
}

export async function cleanupJobFile(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  job.fileUrl = undefined;
  job.filename = undefined;
  job.fileSize = undefined;
  job.statusMessage = 'Downloaded and storage freed';

  await redis.setex(`job:${id}`, JOB_EXPIRATION, JSON.stringify(job));
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
}

/**
 * Get next job from queue
 */
export async function getNextJob(): Promise<string | null> {
  const jobId = await redis.rpop('conversion:queue');
  console.log('[queue] getNextJob', { jobId });
  return jobId ? (jobId as string) : null;
}

/**
 * Add job back to queue (for retry)
 */
export async function requeueJob(id: string): Promise<void> {
  await redis.lpush('conversion:queue', id);
}

/**
 * Remove a job id from the queue list to avoid duplicates / stale entries.
 */
export async function removeJobFromQueue(id: string): Promise<number> {
  const removed = await redis.lrem('conversion:queue', 0, id);
  console.log('[queue] removeJobFromQueue', { id, removed });
  return removed as number;
}
