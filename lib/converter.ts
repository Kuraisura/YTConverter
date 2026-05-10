import ffmpeg from 'fluent-ffmpeg';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';

/**
 * Convert audio stream to MP3 using fluent-ffmpeg with streaming
 * Pipes directly from input to output to minimize memory usage
 */
export async function convertAudioStreamToMP3(
  inputStream: Readable,
  outputPath: string,
  bitrate: string = '320k',
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputStream)
      .audioBitrate(bitrate)
      .audioCodec('libmp3lame')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('mp3')
      .output(outputPath);

    if (onProgress) {
      command = command.on('progress', (progress: any) => {
        // onProgress(progress.percent || 0);
      });
    }

    command
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err: any) => {
        reject(new Error(`FFmpeg conversion error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Convert video stream to MP4 using fluent-ffmpeg with streaming
 */
export async function convertVideoStreamToMP4(
  inputStream: Readable,
  outputPath: string,
  quality: string = '720',
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const heightMap: { [key: string]: number } = {
      '144': 144,
      '360': 360,
      '480': 480,
      '720': 720,
      '1080': 1080,
      '2160': 2160,
    };

    const height = heightMap[quality] || 720;
    const scale = `scale=-1:${height}`;

    let command = ffmpeg(inputStream)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(44100)
      .videoFilter(scale)
      // Use ffmpeg CLI preset option; fluent-ffmpeg .preset() expects preset modules.
      .outputOptions('-preset', 'fast')
      .format('mp4')
      .output(outputPath);

    if (onProgress) {
      command = command.on('progress', (progress: any) => {
        // onProgress(progress.percent || 0);
      });
    }

    command
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err: any) => {
        reject(new Error(`FFmpeg conversion error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Convert file to MP3 (file-based)
 */
export async function convertToMP3(
  inputPath: string,
  outputPath: string,
  bitrate: string = '320k'
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioBitrate(bitrate)
      .audioCodec('libmp3lame')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('mp3')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}

/**
 * Convert file to MP4 (file-based)
 */
export async function convertToMP4(
  inputPath: string,
  outputPath: string,
  quality: string = '720'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const heightMap: { [key: string]: number } = {
      '144': 144,
      '360': 360,
      '480': 480,
      '720': 720,
      '1080': 1080,
      '2160': 2160,
    };

    const height = heightMap[quality] || 720;
    const scale = `scale=-1:${height}`;

    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(44100)
      .videoFilter(scale)
      // Use ffmpeg CLI preset option; fluent-ffmpeg .preset() expects preset modules.
      .outputOptions('-preset', 'fast')
      .format('mp4')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: any) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fsPromises.stat(filePath);
    return stats.size;
  } catch (error) {
    throw new Error(`Failed to get file size: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Clean up temporary file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    // Ignore missing files; this can happen when conversion fails before output is created.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    console.warn(`Failed to cleanup temp file ${filePath}:`, err);
  }
}

/**
 * Create temp directory if it doesn't exist
 */
export async function ensureTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'youtube-converter');
  await fsPromises.mkdir(tempDir, { recursive: true });
  return tempDir;
}
