import archiver from 'archiver';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { getNextJob, getJob, updateJobStatus, completeJob, failJob, removeJobFromQueue, requeueJob } from '@/lib/queue';
import type { ConversionJob as QueueJob } from '@/lib/queue';
import { downloadAudioStream, downloadAudioPlaylist, downloadVideoStream, downloadVideoPlaylist, cleanupTempFile } from '@/lib/youtube';
import { convertToMP3, convertToMP4, getFileSize, cleanupTempFile as cleanupTempFileConverter, ensureTempDir } from '@/lib/converter';
import { uploadFileToR2 } from '@/lib/r2-storage';
import { scheduleCleanup } from '@/lib/cleanup-scheduler';

async function zipFiles(outputPath: string, files: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err: Error) => reject(err));

    archive.pipe(output);
    for (const file of files) {
      archive.file(file, { name: path.basename(file) });
    }
    archive.finalize();
  });
}

async function cleanupTempFolder(folderPath: string): Promise<void> {
  try {
    await fsPromises.rm(folderPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[processor] Failed to cleanup temp folder ${folderPath}:`, err);
  }
}

export interface ProcessJobResult {
  jobId: string | null;
  status: 'processed' | 'empty' | 'failed';
  message: string;
  httpStatus: number;
}

async function processJobInternal(jobId: string, job: QueueJob): Promise<ProcessJobResult> {
  let tempDir: string | null = null;
  let downloadedFile: string | null = null;
  let outputFile: string | null = null;
  let playlistDir: string | null = null;

  try {
    tempDir = await ensureTempDir();
    console.log('[processor] Temp dir ready:', tempDir);

    console.log(`[processor] Processing job ${jobId}`, {
      format: job.format,
      isPlaylist: job.isPlaylist,
      audioQuality: job.audioQuality,
      videoQuality: job.videoQuality,
      title: job.title,
    });

    try {
      await updateJobStatus(jobId, 'processing', 10, 'Extracting video...');
      console.log('[processor] Job status updated -> processing 10%');

      downloadedFile = path.join(tempDir, `${jobId}-original`);
      if (!job.format) {
        throw new Error('Format not specified');
      }

      if (job.isPlaylist) {
        playlistDir = path.join(tempDir, `${jobId}-playlist`);
        await fsPromises.mkdir(playlistDir, { recursive: true });
        let playlistFiles: string[] = [];

        if (job.format === 'mp3') {
          await updateJobStatus(jobId, 'processing', 20, 'Downloading playlist audio...');
          console.log('[processor] Downloading playlist audio:', job.url);
          playlistFiles = await downloadAudioPlaylist(job.url, playlistDir);
        } else {
          await updateJobStatus(jobId, 'processing', 20, 'Downloading playlist video...');
          console.log('[processor] Downloading playlist video:', job.url, 'quality=', job.videoQuality || '720');
          playlistFiles = await downloadVideoPlaylist(job.url, playlistDir, job.videoQuality || '720');
        }

        await updateJobStatus(jobId, 'processing', 50, 'Packaging playlist...');
        console.log('[processor] Zipping playlist files:', playlistFiles.length);
        outputFile = path.join(tempDir, `${jobId}-playlist.zip`);
        await zipFiles(outputFile, playlistFiles);
        await cleanupTempFolder(playlistDir);
      } else {
        if (job.format === 'mp3') {
          await updateJobStatus(jobId, 'processing', 20, 'Downloading audio...');
          console.log('[processor] Downloading audio stream:', job.url);
          downloadedFile = await downloadAudioStream(job.url, downloadedFile);
        } else {
          await updateJobStatus(jobId, 'processing', 20, 'Downloading video...');
          console.log('[processor] Downloading video stream:', job.url, 'quality=', job.videoQuality || '720');
          downloadedFile = await downloadVideoStream(job.url, downloadedFile, job.videoQuality || '720');
        }

        await updateJobStatus(jobId, 'processing', 40, 'Converting...');
        console.log('[processor] Converting job:', jobId);

        const extension = job.format === 'mp3' ? 'mp3' : 'mp4';
        outputFile = path.join(tempDir, `${jobId}-final.${extension}`);

        if (job.format === 'mp3') {
          const bitrate = (job.audioQuality || '320') + 'k';
          const downloadedFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith(jobId) && f.includes('original'));
          const actualDownloaded = downloadedFiles.length > 0
            ? path.join(tempDir, downloadedFiles[0])
            : downloadedFile;
          console.log('[processor] Converting to MP3:', actualDownloaded, '->', outputFile, 'bitrate=', bitrate);
          await convertToMP3(actualDownloaded, outputFile, bitrate);
        } else {
          console.log('[processor] Converting to MP4:', downloadedFile, '->', outputFile, 'quality=', job.videoQuality || '720');
          await convertToMP4(downloadedFile, outputFile, job.videoQuality || '720');
        }

        if (downloadedFile) {
          await cleanupTempFile(downloadedFile);
          downloadedFile = null;
        }
      }

      await updateJobStatus(jobId, 'processing', 70, 'Uploading to storage...');
      console.log('[processor] Job status updated -> uploading 70%');

      if (!outputFile) {
        throw new Error('Missing output file after conversion');
      }

      const fileSize = await getFileSize(outputFile);
      const extension = job.isPlaylist ? 'zip' : job.format === 'mp3' ? 'mp3' : 'mp4';
      const r2Key = `conversions/${jobId}/result.${extension}`;
      console.log('[processor] Uploading to R2:', { outputFile, r2Key, fileSize });

      const presignedExpiresSec = Number(process.env.R2_PRESIGNED_EXPIRES_SEC) || 86400 * 2;
      const presignedUrl = await uploadFileToR2(outputFile, r2Key, presignedExpiresSec);
      console.log('[processor] R2 upload complete:', { jobId, r2Key, presignedExpiresSec });

      if (outputFile) {
        await cleanupTempFileConverter(outputFile);
        outputFile = null;
      }

      const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'youtube';
      const filename = `${sanitizeFilename(job.title || 'youtube')}.${extension}`;
      console.log('[processor] Completing job in Redis:', { jobId, filename, fileSize });
      await completeJob(jobId, presignedUrl, filename, fileSize);
      console.log('[processor] Job marked completed in Redis:', jobId);

      try {
        const cleanupDelayMs = Number(process.env.CLEANUP_DELAY_MS) || 60000;
        await scheduleCleanup(jobId, cleanupDelayMs);
        console.log('[processor] Scheduled cleanup for job:', jobId, 'delayMs=', cleanupDelayMs);
      } catch (error) {
        console.error('[processor] Failed to schedule cleanup for job:', jobId, error);
      }

      console.log('[processor] Job fully processed:', jobId, 'size=', fileSize);
      return { jobId, status: 'processed', message: 'Job processed successfully', httpStatus: 200 };
    } catch (jobError) {
      console.error('[processor] Job error for', jobId, jobError);
      await failJob(jobId, jobError instanceof Error ? jobError.message : 'Unknown error');
      return { jobId, status: 'failed', message: jobError instanceof Error ? jobError.message : 'Job processing failed', httpStatus: 500 };
    }
  } catch (error) {
    console.error('[processor] Fatal processing error:', error);
    return { jobId: null, status: 'failed', message: error instanceof Error ? error.message : 'Internal server error', httpStatus: 500 };
  } finally {
    if (downloadedFile) {
      await cleanupTempFile(downloadedFile).catch((err) => console.warn('[processor] Failed to cleanup download file:', err));
    }
    if (outputFile) {
      await cleanupTempFileConverter(outputFile).catch((err) => console.warn('[processor] Failed to cleanup output file:', err));
    }
    if (playlistDir) {
      await cleanupTempFolder(playlistDir).catch((err) => console.warn('[processor] Failed to cleanup playlist folder:', err));
    }
  }
}

export async function processNextJobOnce(): Promise<ProcessJobResult> {
  try {
    const jobId = await getNextJob();
    if (!jobId) {
      console.log('[processor] No jobs in queue');
      return { jobId: null, status: 'empty', message: 'No jobs in queue', httpStatus: 204 };
    }

    const job = await getJob(jobId);
    if (!job) {
      console.warn('[processor] Job not found:', jobId);
      return { jobId, status: 'failed', message: 'Job not found', httpStatus: 404 };
    }
    return processJobInternal(jobId, job);
  } catch (error) {
    console.error('[processor] Fatal processing error:', error);
    return { jobId: null, status: 'failed', message: error instanceof Error ? error.message : 'Internal server error', httpStatus: 500 };
  }
}

export async function processJobById(jobId: string): Promise<ProcessJobResult> {
  console.log('[processor] Processing explicit jobId:', jobId);
  await removeJobFromQueue(jobId);

  const job = await getJob(jobId);
  if (!job) {
    console.warn('[processor] Explicit job not found:', jobId);
    return { jobId, status: 'failed', message: 'Job not found', httpStatus: 404 };
  }

  return processJobInternal(jobId, job);
}
