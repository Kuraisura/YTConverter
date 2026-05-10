'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { VideoMetadata } from '@/lib/youtube';

export type ConversionState = 'idle' | 'fetching' | 'selection' | 'processing' | 'failed' | 'success';

export interface ConversionJob {
  id: string;
  url: string;
  format: 'mp3' | 'mp4';
  audioQuality?: string;
  videoQuality?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  statusMessage?: string;
  isPlaylist?: boolean;
  error?: string;
  fileUrl?: string;
  filename?: string;
  fileSize?: number;
  title?: string;
  metadata?: VideoMetadata;
}

export function useConversion() {
  const [state, setState] = useState<ConversionState>('idle');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp3');
  const [audioQuality, setAudioQuality] = useState('320');
  const [videoQuality, setVideoQuality] = useState('720');
  const [mode, setMode] = useState<'individual' | 'playlist'>('individual');
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [firstProgressUpdateAt, setFirstProgressUpdateAt] = useState<number | null>(null);
  const [isValidUrl, setIsValidUrl] = useState(false);

  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number>(0);
  const pollingInterval = 800;
  const maxPollingTime = 3600000;

  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    setIsValidUrl(newUrl.includes('youtube.com') || newUrl.includes('youtu.be'));
  }, []);

  const startConversion = useCallback(async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    setState('fetching');
    setError(null);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, mode, audioQuality, videoQuality }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start conversion');
      }

      const data = await response.json();
      const jobWithMetadata = { ...data.job, metadata: data.metadata };
      setJob(jobWithMetadata);
      setMetadata(data.metadata);

      // Show warning if metadata is fallback
      if (data.metadataWarning) {
        console.warn('[useConversion] Metadata warning:', data.metadataWarning);
        // Store warning to display in selection state
        setError(data.metadataWarning);
      }

      setState('selection');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process URL';
      setError(message);
      setState('idle');
    }
  }, [url, format, mode, audioQuality, videoQuality]);

  const confirmSelection = useCallback(async () => {
    if (!job) return;

    setState('processing');
    setError(null);
    pollingStartTimeRef.current = Date.now();
    setFirstProgressUpdateAt(Date.now() + 5000);

    fetch('/api/queue-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(() => {
      setError('Please try again later.');
    });

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/progress?jobId=${job.id}`);
        if (!response.ok) {
          pollingTimeoutRef.current = setTimeout(pollProgress, 2000);
          return;
        }

        const jobData: ConversionJob = await response.json();
        setJob((prev) => (prev ? { ...prev, ...jobData } : jobData));

        if (jobData.status === 'processing' && jobData.progress > 0) {
          setFirstProgressUpdateAt(null);
        }

        if (jobData.status === 'completed') {
          if (jobData.fileUrl) {
            setState('success');
            return;
          }
          pollingTimeoutRef.current = setTimeout(pollProgress, 1000);
          return;
        }

        if (jobData.status === 'failed') {
          setError('Please try again later.');
          setState('failed');
          return;
        }

        if (jobData.status !== 'queued') {
          setError(null);
        }

        if (Date.now() - pollingStartTimeRef.current > maxPollingTime) {
          setError('Please try again later.');
          setState('failed');
          return;
        }

        const nextInterval = jobData.status === 'queued' ? 2000 : pollingInterval;
        pollingTimeoutRef.current = setTimeout(pollProgress, nextInterval);
      } catch {
        setError('Please try again later.');
        pollingTimeoutRef.current = setTimeout(pollProgress, pollingInterval);
      }
    };

    pollProgress();
  }, [job, pollingInterval, maxPollingTime]);

  const retryConversion = useCallback(async () => {
    if (!job) return;
    setError(null);

    try {
      const response = await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!response.ok) throw new Error('Retry unavailable');

      const data = await response.json();
      setJob((previous) => previous ? { ...previous, ...data.job } : data.job);
      confirmSelection();
    } catch {
      setError('Please try again later.');
      setState('failed');
    }
  }, [job, confirmSelection]);

  const reset = useCallback(() => { /* primary reset */
    setState('idle');
    setUrl('');
    setFormat('mp3');
    setMode('individual');
    setAudioQuality('320');
    setVideoQuality('720');
    setJob(null);
    setMetadata(null);
    setError(null);
    setIsValidUrl(false);
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
    }
  }, []);

  const markDownloaded = useCallback(() => {
    setJob((prev) => prev ? {
      ...prev,
      fileUrl: undefined,
      statusMessage: 'Downloaded and storage freed',
    } : null);
  }, []);

  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    url,
    format,
    mode,
    audioQuality,
    videoQuality,
    job,
    error,
    isValidUrl,
    metadata,
    firstProgressUpdateAt,
    handleUrlChange,
    setFormat,
    setMode,
    setAudioQuality,
    setVideoQuality,
    setError,
    startConversion,
    confirmSelection,
    retryConversion,
    reset,
    markDownloaded,
  };
}











