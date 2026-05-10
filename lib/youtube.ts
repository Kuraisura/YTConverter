import { Innertube } from 'youtubei.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promises as fsPromises } from 'fs';

export interface VideoMetadata {
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  isPlaylist?: boolean;
  itemCount?: number;
}

type YouTubeClient = Awaited<ReturnType<typeof Innertube.create>>;

let innertubePromise: Promise<YouTubeClient> | null = null;

async function getYouTubeClient(): Promise<YouTubeClient> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create();
  }

  return innertubePromise;
}

function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.split('/').filter(Boolean)[0] || null;
    }

    return urlObj.searchParams.get('v');
  } catch {
    return null;
  }
}

function extractPlaylistId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('list');
  } catch {
    return null;
  }
}

function findPython(): string {
  const possiblePaths = [
    'python',
    'python3',
    'C:\\Users\\MarkB\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
  ];

  for (const p of possiblePaths) {
    if (p === 'python' || p === 'python3') return p;
    if (fs.existsSync(p)) return p;
  }

  return 'python';
}

function findYtDlpScript(): string {
  return 'yt-dlp';
}

function extractCleanUrl(url: string, preservePlaylist: boolean = false): string {
  try {
    const urlObj = new URL(url);
    const listId = urlObj.searchParams.get('list');

    if (preservePlaylist && listId) {
      return `https://www.youtube.com/playlist?list=${listId}`;
    }

    if (!preservePlaylist && urlObj.searchParams.has('v')) {
      return `https://www.youtube.com/watch?v=${urlObj.searchParams.get('v')}`;
    }

    return urlObj.toString();
  } catch {
    return url;
  }
}

function buildFallbackMetadata(videoUrl: string, isPlaylist: boolean): VideoMetadata {
  try {
    const urlObj = new URL(videoUrl);
    const videoId = urlObj.searchParams.get('v');
    const listId = urlObj.searchParams.get('list');
    const titleSource = isPlaylist ? listId : videoId || urlObj.pathname.split('/').filter(Boolean).pop();

    return {
      title: titleSource ? `YouTube ${isPlaylist ? 'Playlist' : 'Video'} ${titleSource}` : `YouTube ${isPlaylist ? 'Playlist' : 'Video'}`,
      thumbnail: '',
      duration: 0,
      author: 'Unknown',
      isPlaylist,
      itemCount: undefined,
    };
  } catch {
    return {
      title: `YouTube ${isPlaylist ? 'Playlist' : 'Video'}`,
      thumbnail: '',
      duration: 0,
      author: 'Unknown',
      isPlaylist,
      itemCount: undefined,
    };
  }
}

function parsePlaylistItemCount(totalItems: string | undefined): number | undefined {
  if (!totalItems) return undefined;
  const match = totalItems.replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

async function fetchYouTubeMetadata(videoUrl: string, isPlaylist: boolean): Promise<VideoMetadata> {
  const client = await getYouTubeClient();

  if (isPlaylist) {
    const playlistId = extractPlaylistId(videoUrl);
    if (!playlistId) {
      throw new Error('Missing playlist id');
    }

    const playlist = await client.getPlaylist(playlistId);
    const info = playlist.info;

    return {
      title: info.title || info.subtitle?.toString() || 'Unknown Playlist',
      thumbnail: info.thumbnails?.[0]?.url || '',
      duration: 0,
      author: info.author?.name || 'Unknown',
      isPlaylist: true,
      itemCount: parsePlaylistItemCount(info.total_items),
    };
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('Missing video id');
  }

  const video = await client.getBasicInfo(videoId);
  const basicInfo = video.basic_info;

  return {
    title: basicInfo.title || 'Unknown Title',
    thumbnail: basicInfo.thumbnail?.[0]?.url || '',
    duration: basicInfo.duration || 0,
    author: basicInfo.channel?.name || basicInfo.author || 'Unknown',
    isPlaylist: false,
    itemCount: undefined,
  };
}

/**
 * Check if we're running on Vercel (deployment environment)
 */
function isVercelEnvironment(): boolean {
  return process.env.VERCEL === '1' || !!process.env.VERCEL_URL;
}

export async function getVideoMetadata(videoUrl: string, isPlaylist: boolean = false): Promise<VideoMetadata> {
  const cleanUrl = extractCleanUrl(videoUrl, isPlaylist);
  const isVercel = isVercelEnvironment();

  console.log('[youtube.ts] Fetching metadata for:', cleanUrl, { isPlaylist, environment: isVercel ? 'Vercel' : 'Local' });

  try {
    const metadata = await fetchYouTubeMetadata(cleanUrl, isPlaylist);
    console.log('[youtube.ts] Successfully fetched metadata:', { title: metadata.title, duration: metadata.duration });
    return metadata;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[youtube.ts] Failed to fetch metadata:', {
      error: errorMsg,
      environment: isVercel ? 'Vercel' : 'Local',
      url: cleanUrl,
      isPlaylist,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // On Vercel, metadata extraction failures are expected - use fallback with warning
    if (isVercel) {
      console.warn('[youtube.ts] Using fallback metadata due to Vercel environment limitations');
    }

    return buildFallbackMetadata(cleanUrl, isPlaylist);
  }
}

export async function downloadAudioPlaylist(
  playlistUrl: string,
  outputFolder: string
): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    const cleanUrl = extractCleanUrl(playlistUrl, true);
    const outputTemplate = path.join(outputFolder, '%(playlist_index)s-%(title)s.%(ext)s').replace(/\\/g, '/');
    const args = [
      '-m', 'yt_dlp',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--yes-playlist',
      '--quiet',
      '--no-warnings',
      '-o', outputTemplate,
      cleanUrl,
    ];

    console.log('[youtube.ts] Downloading playlist audio to:', outputFolder);
    const proc = spawn(findPython(), args);
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      console.log('[yt-dlp]', line.trim());
      errorOutput += line;
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        console.error('[youtube.ts] yt-dlp playlist audio error:', errorOutput);
        reject(new Error(`Playlist audio download failed: ${errorOutput}`));
        return;
      }

      try {
        const files = (await fsPromises.readdir(outputFolder))
          .filter((file) => file.toLowerCase().endsWith('.mp3'))
          .map((file) => path.join(outputFolder, file));

        if (files.length === 0) {
          reject(new Error('No mp3 files were downloaded for the playlist.'));
          return;
        }

        resolve(files);
      } catch (err) {
        reject(new Error(`Failed to read playlist audio folder: ${err}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`python/yt-dlp not found: ${err.message}`));
    });
  });
}

export async function downloadVideoPlaylist(
  playlistUrl: string,
  outputFolder: string,
  quality: string = '720'
): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    const cleanUrl = extractCleanUrl(playlistUrl, true);
    const outputTemplate = path.join(outputFolder, '%(playlist_index)s-%(title)s.%(ext)s').replace(/\\/g, '/');
    const args = [
      '-m', 'yt_dlp',
      '-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]/best`,
      '--merge-output-format', 'mp4',
      '--yes-playlist',
      '--quiet',
      '--no-warnings',
      '-o', outputTemplate,
      cleanUrl,
    ];

    console.log('[youtube.ts] Downloading playlist video to:', outputFolder);
    const proc = spawn(findPython(), args);
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      console.log('[yt-dlp]', line.trim());
      errorOutput += line;
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        console.error('[youtube.ts] yt-dlp playlist video error:', errorOutput);
        reject(new Error(`Playlist video download failed: ${errorOutput}`));
        return;
      }

      try {
        const files = (await fsPromises.readdir(outputFolder))
          .filter((file) => file.toLowerCase().endsWith('.mp4'))
          .map((file) => path.join(outputFolder, file));

        if (files.length === 0) {
          reject(new Error('No mp4 files were downloaded for the playlist.'));
          return;
        }

        resolve(files);
      } catch (err) {
        reject(new Error(`Failed to read playlist video folder: ${err}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`python/yt-dlp not found: ${err.message}`));
    });
  });
}

export async function downloadAudioStream(
  videoUrl: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanUrl = extractCleanUrl(videoUrl);
    const baseOutput = outputPath.replace('.webm', '');
    const args = [
      '-m', 'yt_dlp',
      '-f', 'bestaudio[ext=webm]/bestaudio/best',
      '--extract-audio',
      '--audio-format', 'm4a',
      '-o', baseOutput + '.%(ext)s',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      cleanUrl
    ];

    console.log('[youtube.ts] Running yt-dlp for audio download');
    const proc = spawn(findPython(), args);
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      console.log('[yt-dlp]', line.trim());
      errorOutput += line;
    });

    proc.on('close', (code) => {
      const actualPath = baseOutput + '.m4a';
      if (code === 0 && fs.existsSync(actualPath)) {
        console.log('[youtube.ts] Audio downloaded successfully to:', actualPath);
        resolve(actualPath);
      } else if (code === 0 && fs.existsSync(outputPath)) {
        console.log('[youtube.ts] Audio downloaded successfully');
        resolve(outputPath);
      } else {
        console.error('[youtube.ts] yt-dlp audio error:', errorOutput);
        reject(new Error(`Download failed: ${errorOutput}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`python/yt-dlp not found: ${err.message}`));
    });
  });
}

export async function downloadVideoStream(
  videoUrl: string,
  outputPath: string,
  quality: string = '720'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanUrl = extractCleanUrl(videoUrl);
    const parsedOutput = path.parse(outputPath);
    const baseOutput = parsedOutput.ext
      ? path.join(parsedOutput.dir, parsedOutput.name)
      : outputPath;
    const outputTemplate = `${baseOutput}.%(ext)s`;

    const args = [
      '-m', 'yt_dlp',
      '-f', `bestvideo[height<=${quality}]+bestaudio/bestvideo[height<=${quality}]/best`,
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      cleanUrl
    ];

    console.log('[youtube.ts] Running yt-dlp for video download');
    const proc = spawn(findPython(), args);
    let stdOutput = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      stdOutput += data.toString();
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      console.log('[yt-dlp]', line.trim());
      errorOutput += line;
    });

    proc.on('close', (code) => {
      const candidates = [
        `${baseOutput}.mp4`,
        `${baseOutput}.mkv`,
        `${baseOutput}.webm`,
        outputPath,
      ];

      const downloadedPath = candidates.find((candidate) => fs.existsSync(candidate));
      if (code === 0 && downloadedPath) {
        console.log('[youtube.ts] Video downloaded successfully to:', downloadedPath);
        resolve(downloadedPath);
        return;
      }

      const combinedError = `${errorOutput}\n${stdOutput}`.trim();
      console.error('[youtube.ts] yt-dlp video error:', combinedError || `Exited with code ${code}`);
      reject(new Error(`Download failed: ${combinedError || `yt-dlp exited with code ${code}`}`));
    });

    proc.on('error', (err) => {
      reject(new Error(`python/yt-dlp not found: ${err.message}`));
    });
  });
}

export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fsPromises.unlink(filePath);
    }
  } catch (error) {
    console.error(`Failed to cleanup temp file: ${filePath}`, error);
  }
}
