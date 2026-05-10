import ffmpeg from 'fluent-ffmpeg';
import { promises as fsPromises } from 'fs';

/**
 * Convert audio to MP3 with specified bitrate
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
 * Convert video to MP4 with specified quality
 */
export async function convertToMP4(
  inputPath: string,
  outputPath: string,
  quality: string = '720'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const heightMap: { [key: string]: number } = {
      '360': 360,
      '480': 480,
      '720': 720,
      '1080': 1080,
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
      .preset('medium')
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
