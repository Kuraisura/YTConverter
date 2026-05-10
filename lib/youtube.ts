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

function getYtDlpAuthArgs(): string[] {
  const args: string[] = ['--js-runtimes', 'node'];
  const configuredPath = process.env.YOUTUBE_COOKIES_PATH;
  const candidatePaths = [
    configuredPath,
    '/etc/secrets/youtube-cookies.txt',
    '/etc/secrets/cookies.txt',
  ].filter((candidate): candidate is string => Boolean(candidate));
  const cookiesPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

  if (cookiesPath) {
    args.push(
      '--cookies', cookiesPath,
      '--extractor-args', 'youtube:player_client=default,web_embedded'
    );
  }

  return args;
}

async function fetchYtDlpMetadata(videoUrl: string, isPlaylist: boolean): Promise<VideoMetadata> {
  const args = [
    '-m', 'yt_dlp',
    ...getYtDlpAuthArgs(),
    '--dump-single-json',
    '--skip-download',
    '--quiet',
    '--no-warnings',
    ...(isPlaylist ? ['--flat-playlist'] : ['--no-playlist']),
    videoUrl,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(findPython(), args);
    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || `yt-dlp metadata exited with code ${code}`));
        return;
      }

      try {
        const info = JSON.parse(output);
        resolve({
          title: info.title || 'Unknown',
          thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || '',
          duration: Number(info.duration) || 0,
          author: info.uploader || info.channel || 'Unknown',
          isPlaylist,
          itemCount: isPlaylist && Array.isArray(info.entries) ? info.entries.length : undefined,
        });
      } catch (error) {
        reject(new Error(`Unable to parse yt-dlp metadata: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

async function getYouTubeClient(): Promise<YouTubeClient> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create();
  }

  return innertubePromise;
}

function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const isVideoId = (value: string | null | undefined): value is string =>
      Boolean(value && /^[A-Za-z0-9_-]{11}$/.test(value));

    if (hostname === 'youtu.be') {
      return isVideoId(segments[0]) ? segments[0] : null;
    }

    const queryId = urlObj.searchParams.get('v');
    if (isVideoId(queryId)) return queryId;

    // YouTube uses path-based IDs for Shorts, embeds, and live links.
    if (['shorts', 'embed', 'live'].includes(segments[0]) && isVideoId(segments[1])) {
      return segments[1];
    }

    return null;
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

function parseIso8601Duration(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return 0;

  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return Math.round(
    Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  );
}

async function fetchYouTubeDataApiMetadata(
  videoUrl: string,
  isPlaylist: boolean
): Promise<VideoMetadata> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');

  if (isPlaylist) {
    const playlistId = extractPlaylistId(videoUrl);
    if (!playlistId) throw new Error('Missing playlist id');

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: playlistId,
      key: apiKey,
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${params}`);
    if (!response.ok) throw new Error(`YouTube Data API returned HTTP ${response.status}`);
    const data = await response.json();
    const item = data.items?.[0];
    if (!item) throw new Error('Playlist was not found by YouTube Data API');

    const thumbnails = item.snippet?.thumbnails;
    return {
      title: item.snippet?.title || 'Unknown Playlist',
      thumbnail: thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || '',
      duration: 0,
      author: item.snippet?.channelTitle || 'Unknown',
      isPlaylist: true,
      itemCount: Number(item.contentDetails?.itemCount) || undefined,
    };
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) throw new Error('Missing video id');
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    id: videoId,
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!response.ok) throw new Error(`YouTube Data API returned HTTP ${response.status}`);
  const data = await response.json();
  const item = data.items?.[0];
  if (!item) throw new Error('Video was not found by YouTube Data API');

  const thumbnails = item.snippet?.thumbnails;
  return {
    title: item.snippet?.title || 'Unknown Title',
    thumbnail: thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || '',
    duration: parseIso8601Duration(item.contentDetails?.duration),
    author: item.snippet?.channelTitle || 'Unknown',
    isPlaylist: false,
    itemCount: undefined,
  };
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

    if (!preservePlaylist) {
      const videoId = extractVideoId(url);
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }

    return urlObj.toString();
  } catch {
    return url;
  }
}

function buildFallbackMetadata(videoUrl: string, isPlaylist: boolean): VideoMetadata {
  try {
    const urlObj = new URL(videoUrl);
    const videoId = extractVideoId(videoUrl);
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
    const metadata = await fetchYouTubeDataApiMetadata(cleanUrl, isPlaylist);
    console.log('[youtube.ts] Successfully fetched metadata with YouTube Data API:', {
      title: metadata.title,
      duration: metadata.duration,
    });
    return metadata;
  } catch (dataApiError) {
    console.warn('[youtube.ts] YouTube Data API metadata unavailable:', {
      error: dataApiError instanceof Error ? dataApiError.message : String(dataApiError),
    });
  }

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

    try {
      const metadata = await fetchYtDlpMetadata(cleanUrl, isPlaylist);
      console.log('[youtube.ts] Successfully fetched metadata with yt-dlp:', {
        title: metadata.title,
        duration: metadata.duration,
      });
      return metadata;
    } catch (ytDlpError) {
      console.warn('[youtube.ts] yt-dlp metadata fallback failed:', {
        error: ytDlpError instanceof Error ? ytDlpError.message : String(ytDlpError),
      });
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
      ...getYtDlpAuthArgs(),
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
      ...getYtDlpAuthArgs(),
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
      ...getYtDlpAuthArgs(),
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
      ...getYtDlpAuthArgs(),
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
