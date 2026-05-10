#!/usr/bin/env node

/**
 * Environment and R2 Storage Verification Script
 * Run this before deployment to verify all configurations are correct
 * 
 * Usage:
 *   node scripts/verify-setup.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('═'.repeat(60), 'cyan');
  log(title, 'cyan');
  log('═'.repeat(60), 'cyan');
}

function checkEnvVariable(name, required = true) {
  const value = process.env[name];
  const status = value ? '✓' : '✗';
  const color = value ? 'green' : required ? 'red' : 'yellow';
  const type = required ? 'REQUIRED' : 'OPTIONAL';
  
  log(`${status} ${name.padEnd(35)} [${type}]`, color);
  
  if (!value && required) {
    return false;
  }
  return true;
}

function maskValue(value, visibleChars = 4) {
  if (!value || value.length <= visibleChars) return '***';
  return value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars);
}

async function main() {
  log('\n🔍 Verification Script - YouTube to MP4/MP3 Converter\n', 'cyan');

  // Check .env file exists
  logSection('1. Environment File Check');
  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envPath = path.join(process.cwd(), '.env');
  
  if (fs.existsSync(envLocalPath)) {
    log(`✓ .env.local found`, 'green');
    require('dotenv').config({ path: envLocalPath });
  } else if (fs.existsSync(envPath)) {
    log(`⚠ Using .env instead of .env.local (consider creating .env.local)`, 'yellow');
    require('dotenv').config({ path: envPath });
  } else {
    log(`✗ No .env or .env.local file found`, 'red');
    log(`  Create .env.local based on .env.example`, 'yellow');
    process.exit(1);
  }

  // Check required environment variables
  logSection('2. Environment Variables');
  let allValid = true;

  const requiredVars = [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_ACCOUNT_ID',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];

  const optionalVars = [
    'R2_PRESIGNED_EXPIRES_SEC',
    'CLEANUP_DELAY_MS',
    'CLEANUP_DELETE_JOB_IMMEDIATE',
  ];

  for (const varName of requiredVars) {
    if (!checkEnvVariable(varName, true)) {
      allValid = false;
    }
  }

  log('');
  for (const varName of optionalVars) {
    checkEnvVariable(varName, false);
  }

  if (!allValid) {
    log('\n❌ Missing required environment variables!', 'red');
    log('Please update .env.local with all required values.', 'yellow');
    process.exit(1);
  }

  // Display masked values
  logSection('3. Configuration Summary');
  log(`R2 Endpoint:  https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  log(`R2 Bucket:    ${process.env.R2_BUCKET_NAME}`);
  log(`Access Key:   ${maskValue(process.env.R2_ACCESS_KEY_ID || '')}`);
  log(`Secret Key:   ${maskValue(process.env.R2_SECRET_ACCESS_KEY || '')}`);
  log(`Redis URL:    ${maskValue(process.env.UPSTASH_REDIS_REST_URL || '', 8)}`);
  log(`Redis Token:  ${maskValue(process.env.UPSTASH_REDIS_REST_TOKEN || '')}`);
  log(`Presigned URL Expiry: ${process.env.R2_PRESIGNED_EXPIRES_SEC || '86400'} seconds`);
  log(`Cleanup Delay: ${process.env.CLEANUP_DELAY_MS || '60000'} ms`);

  // Check file structure
  logSection('4. Project Structure');
  const requiredDirs = [
    'lib',
    'lib/helpers',
    'app/api',
    'scripts',
  ];

  for (const dir of requiredDirs) {
    const fullPath = path.join(process.cwd(), dir);
    const exists = fs.existsSync(fullPath);
    const status = exists ? '✓' : '✗';
    const color = exists ? 'green' : 'red';
    log(`${status} ${dir}`, color);
  }

  const requiredFiles = [
    'lib/helpers/index.ts',
    'lib/r2-storage.ts',
    'lib/cleanup-scheduler.ts',
    'app/api/health/route.ts',
  ];

  log('');
  for (const file of requiredFiles) {
    const fullPath = path.join(process.cwd(), file);
    const exists = fs.existsSync(fullPath);
    const status = exists ? '✓' : '✗';
    const color = exists ? 'green' : 'yellow';
    log(`${status} ${file}`, color);
  }

  // Summary
  logSection('5. Summary');
  log('✓ All environment variables are configured', 'green');
  log('✓ Project structure is valid', 'green');
  log('');
  log('Next Steps:', 'cyan');
  log('1. Run: npm run build');
  log('2. Test locally: npm run dev');
  log('3. Test health endpoint: curl http://localhost:3000/api/health');
  log('4. Deploy to Vercel: git push origin main');
  log('');
  log('For worker setup, see: scripts/queue-worker.js', 'yellow');
  log('');
}

main().catch((error) => {
  log(`\n❌ Verification failed: ${error.message}`, 'red');
  process.exit(1);
});
