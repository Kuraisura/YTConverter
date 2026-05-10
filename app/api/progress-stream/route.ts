import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return new Response('Missing jobId', { status: 400 });
    }

    return NextResponse.json(
      {
        error: 'Progress streaming is disabled in the Vercel deployment. Use /api/progress polling instead.',
      },
      { status: 410 }
    );
  } catch (error) {
    console.error('Error in /api/progress-stream:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
