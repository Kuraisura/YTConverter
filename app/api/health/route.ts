import { NextRequest, NextResponse } from 'next/server';
import { checkR2Health, logHealthCheckResults, getR2Diagnostics } from '@/lib/helpers';
import { logEnvValidation, logEnvSummary } from '@/lib/helpers';

/**
 * Health check endpoint
 * GET /api/health
 *
 * Returns:
 * - 200: System healthy
 * - 503: System unhealthy with diagnostics
 * - 500: Error during health check
 */
export async function GET(request: NextRequest) {
  try {
    // Validate environment first
    const envValidation = logEnvValidation();

    if (!envValidation.valid) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          reason: 'Environment configuration invalid',
          errors: envValidation.errors,
          warnings: envValidation.warnings,
          diagnostics: getR2Diagnostics(),
        },
        { status: 503 }
      );
    }

    logEnvSummary();

    // Perform R2 health check
    const r2Health = await checkR2Health(
      process.env.R2_ACCOUNT_ID || '',
      process.env.R2_ACCESS_KEY_ID || '',
      process.env.R2_SECRET_ACCESS_KEY || '',
      process.env.R2_BUCKET_NAME || ''
    );

    logHealthCheckResults(r2Health);

    const responseData = {
      status: r2Health.healthy ? 'healthy' : 'unhealthy',
      timestamp: r2Health.timestamp,
      checks: r2Health.checks,
      diagnostics: getR2Diagnostics(),
      warnings: envValidation.warnings,
    };

    return NextResponse.json(responseData, {
      status: r2Health.healthy ? 200 : 503,
    });
  } catch (error) {
    console.error('[health] Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during health check',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
