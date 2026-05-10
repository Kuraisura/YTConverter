import { NextRequest, NextResponse } from 'next/server';
import { QueueAdmissionError, retryJob } from '@/lib/queue';
import { checkConversionRateLimit, getAnonymousClientId } from '@/lib/rate-limit';

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
    const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
    if (!jobId) {
      return NextResponse.json({ error: 'Please try again later.' }, { status: 400 });
    }

    const job = await retryJob(jobId, clientId);
    if (!job) {
      return NextResponse.json({ error: 'Please try again later.' }, { status: 409 });
    }

    return NextResponse.json({ job }, { status: 200 });
  } catch (error) {
    if (error instanceof QueueAdmissionError) {
      return NextResponse.json({ error: 'Please wait for your current conversions to finish.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Please try again later.' }, { status: 503 });
  }
}
