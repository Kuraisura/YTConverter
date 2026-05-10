import { NextRequest, NextResponse } from 'next/server';
import { ConversionRequestSchema } from '@/lib/validation';
import { createJob, QueueAdmissionError } from '@/lib/queue';
import { checkConversionRateLimit, getAnonymousClientId } from '@/lib/rate-limit';
import { getVideoMetadata } from '@/lib/youtube';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const clientId = getAnonymousClientId(request);
    const rateLimit = await checkConversionRateLimit(clientId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many conversion requests. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': rateLimit.retryAfter.toString() } },
      );
    }

    const body = await request.json();
    console.log('[API /api/convert] Received request:', body);

    // Validate request
    const parsed = ConversionRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log('[API /api/convert] Validation failed:', parsed.error.errors);
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { url, format, mode, audioQuality, videoQuality } = parsed.data;
    const isPlaylist = mode === 'playlist';
    console.log('[API /api/convert] Validation passed, fetching metadata for:', url, { mode });

    // Fetch video metadata to validate URL
    let metadata;
    let metadataWarning: string | null = null;
    try {
      metadata = await getVideoMetadata(url, isPlaylist);
      console.log('[API /api/convert] Metadata fetched:', JSON.stringify(metadata, null, 2));

      // Detect if we're using fallback metadata (when title contains "YouTube Video" or "Playlist")
      if (
        metadata.title?.includes('YouTube Video') ||
        metadata.title?.includes('YouTube Playlist')
      ) {
        metadataWarning = 'Unable to fetch video details. Conversion will use default metadata.';
        console.warn('[API /api/convert] Using fallback metadata:', { title: metadata.title });
      }
    } catch (error) {
      console.log('[API /api/convert] Metadata fetch failed:', error);
      return NextResponse.json(
        { error: 'Invalid YouTube URL or video unavailable' },
        { status: 400 }
      );
    }

    // Validate that we have a usable title
    if (!metadata.title || metadata.title === 'Unknown') {
      return NextResponse.json(
        { error: 'Could not retrieve video information. Please check the URL and try again.' },
        { status: 400 }
      );
    }

    // Create conversion job
    const jobId = uuidv4();
    const job = await createJob(jobId, url, format, audioQuality, videoQuality, metadata.title, isPlaylist, clientId);

    return NextResponse.json(
      {
        job,
        metadata,
        metadataWarning,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof QueueAdmissionError) {
      const message = error.reason === 'client-limit'
        ? 'You already have five conversions in progress. Please wait for one to finish.'
        : 'The conversion queue is currently full. Please try again later.';
      return NextResponse.json({ error: message }, { status: 429 });
    }
    console.error('Error in /api/convert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
