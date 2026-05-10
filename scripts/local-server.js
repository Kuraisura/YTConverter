#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { cleanupOnShutdown, loadLocalEnvironment } = require('./shutdown-cleanup');

loadLocalEnvironment();

const port = process.env.PORT || '3000';
const nextCli = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const sharedEnvironment = {
  ...process.env,
  PORT: port,
};

const processes = [
  spawn(process.execPath, [nextCli, 'start', '--hostname', '0.0.0.0', '--port', port], {
    env: sharedEnvironment,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['scripts/queue-worker.js'], {
    env: {
      ...sharedEnvironment,
      WORKER_API_URL: process.env.WORKER_API_URL || `http://127.0.0.1:${port}`,
    },
    stdio: 'inherit',
  }),
];

let stopping = false;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.pid || child.killed) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  try {
    await cleanupOnShutdown();
  } catch (error) {
    console.error('[local-server] Shutdown cleanup failed:', error.message);
    exitCode = 1;
  }
  process.exit(exitCode);
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error('[local-server] Failed to start a process:', error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[local-server] A process stopped (${signal || `exit ${code}`}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => { void stop(0); });
process.on('SIGTERM', () => { void stop(0); });

console.log(`[local-server] Website: http://localhost:${port}`);
console.log(`[local-server] LAN: http://<your-pc-ip>:${port}`);
