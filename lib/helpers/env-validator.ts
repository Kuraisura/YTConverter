/**
 * Environment variable validation and configuration
 */

import { logWarning, logInfo } from './error-handler';

export interface EnvConfig {
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2AccountId: string;
  upstashRedisUrl: string;
  upstashRedisToken: string;
  nodeEnv: 'development' | 'production' | 'test';
}

/**
 * Validate all required environment variables
 */
export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredVars = [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ACCOUNT_ID',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check optional but recommended
  if (!process.env.R2_PRESIGNED_EXPIRES_SEC) {
    warnings.push('R2_PRESIGNED_EXPIRES_SEC not set, using default 86400 (24 hours)');
  }

  if (!process.env.CLEANUP_DELAY_MS) {
    warnings.push('CLEANUP_DELAY_MS not set, using default 60000 (1 minute)');
  }

  // Warning for development
  if (process.env.NODE_ENV !== 'production') {
    warnings.push('Running in non-production mode; ensure this is intentional');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log environment validation results
 */
export function logEnvValidation() {
  const validation = validateEnv();

  if (!validation.valid) {
    console.error('❌ Environment validation failed:');
    validation.errors.forEach((err) => {
      console.error(`  - ${err}`);
    });
  } else {
    logInfo('ENV', '✅ All required environment variables are set');
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    validation.warnings.forEach((warn) => {
      console.warn(`  - ${warn}`);
    });
  }

  return validation;
}

/**
 * Get environment configuration (safe access with defaults)
 */
export function getEnvConfig(): EnvConfig {
  return {
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || '',
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  };
}

/**
 * Mask sensitive values for logging
 */
export function maskSensitiveEnv(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) return '***';
  return value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars);
}

/**
 * Log safe environment summary (masking sensitive values)
 */
export function logEnvSummary() {
  const config = getEnvConfig();
  logInfo('ENV', 'Environment configuration:', {
    r2Bucket: config.r2BucketName,
    r2Account: config.r2AccountId,
    r2AccessKey: maskSensitiveEnv(config.r2AccessKeyId),
    r2SecretKey: maskSensitiveEnv(config.r2SecretAccessKey),
    redisUrl: maskSensitiveEnv(config.upstashRedisUrl, 8),
    nodeEnv: config.nodeEnv,
  });
}
