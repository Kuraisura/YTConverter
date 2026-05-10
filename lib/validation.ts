import { z } from 'zod';

export const YouTubeURLSchema = z.string().url().refine(
  (url) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const validHosts = [
        'youtube.com', 'www.youtube.com', 'm.youtube.com',
        'youtu.be', 'www.youtu.be',
        'youtube-nocookie.com', 'www.youtube-nocookie.com',
        'youtube.co', 'www.youtube.co',
        'music.youtube.com', 'tv.youtube.com',
        'gaming.youtube.com'
      ];
      const isValidHost = validHosts.some(host => hostname === host || hostname.endsWith('.' + host));
      console.log('[Server Validation]', { hostname, isValidHost, fullUrl: url });
      return isValidHost;
    } catch {
      console.log('[Server Validation]', { error: 'URL parse failed', fullUrl: url });
      return false;
    }
  },
  'Must be a valid YouTube URL'
);

export const ConversionFormat = z.enum(['mp3', 'mp4']);
export const ConversionMode = z.enum(['individual', 'playlist']);

export const AudioQuality = z.enum(['128', '192', '256', '320']);
export const VideoQuality = z.enum(['360', '480', '720', '1080']);

export const ConversionRequestSchema = z.object({
  url: YouTubeURLSchema,
  format: ConversionFormat,
  mode: ConversionMode.optional().default('individual'),
  audioQuality: AudioQuality.optional().default('320'),
  videoQuality: VideoQuality.optional().default('720'),
});

export type ConversionRequest = z.infer<typeof ConversionRequestSchema>;
export type ConversionFormat = z.infer<typeof ConversionFormat>;
