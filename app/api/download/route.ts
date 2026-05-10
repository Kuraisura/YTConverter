import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/queue';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job is not completed' },
        { status: 400 }
      );
    }

    if (!job.fileUrl) {
      return NextResponse.json(
        { error: 'File URL not available' },
        { status: 400 }
      );
    }

    const filename = job.filename || `youtube.${job.isPlaylist ? 'zip' : job.format || 'mp3'}`;
    const contentType = job.isPlaylist ? 'application/zip' : job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    const key = `conversions/${jobId}/result.${job.isPlaylist ? 'zip' : job.format || 'mp3'}`;

    try {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || '',
        Key: key,
      });

      const object = await s3Client.send(getCommand);
      const objectBody = object.Body;

      if (!objectBody) {
        return NextResponse.json(
          { error: 'File body not available' },
          { status: 500 }
        );
      }

      const headers = new Headers({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      if (object.ContentLength) {
        headers.set('Content-Length', object.ContentLength.toString());
      }

      return new NextResponse(objectBody as any, {
        headers,
      });
    } catch (error) {
      console.error('Error streaming file from R2:', error);
      return NextResponse.json(
        { error: 'Failed to stream download file' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in /api/download:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
