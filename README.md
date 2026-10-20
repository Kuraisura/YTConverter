# 🎬 YouTube to MP4 & MP3 Converter

**Video/Audio Conversion Tool** · `Windows Forms`

Desktop application for converting YouTube videos to MP4 or MP3 with metadata preview, playlist support, and bitrate selection.

## Why This Project

Turning a YouTube video into a usable MP4 or MP3 usually means installing a desktop program, trusting an ad-filled converter site, or repeating the same `yt-dlp` and `ffmpeg` commands by hand. Mark wanted a converter he could run himself: hosted on his own infrastructure, backed by his own storage bucket, and safe to hand to classmates without worrying that a burst of traffic would break it.

So this is built as a self-hosted conversion *service* rather than a single-user script. Every request is schema-validated and rate-limited, every conversion is queued in Redis so slow FFmpeg work never blocks a web response, and every finished file lands in Cloudflare R2 with a short lifetime — the service can be shared freely without degrading into a pile of orphaned files. It is also the kind of system Mark enjoys building end to end: a designed front end, a real async job pipeline, and the unglamorous operational layer (leases, retries, cron cleanup, health checks) that keeps it alive in production.

## How It Works

Consider Dani, a student assembling a study playlist:

1. **Paste and configure.** Dani opens the dashboard, pastes a YouTube link containing a playlist, switches the source to *Playlist*, chooses *MP3 Audio* at *320 kbps*, and presses *Fetch Metadata*.
2. **Verify before committing.** The API checks the URL against a YouTube host allowlist (Zod schema) and fetches the real title, thumbnail, and item count via `yt-dlp`. Dani confirms she grabbed the right playlist before any downloading starts.
3. **Queued, not blocked.** `/api/convert` fingerprints the anonymous client (HMAC of the request IP), applies the conversion rate limit, then enforces admission rules — max active jobs per client, max queue depth — and pushes a job onto the Upstash Redis queue. The browser moves straight into a processing state.
4. **The worker picks it up.** A separate worker process polls `/api/queue-handler`, claims the job with a lease, downloads the media with `yt-dlp`, transcodes it with FFmpeg, zips multi-file playlist output, and uploads the result to Cloudflare R2.
5. **Live progress.** Dani's browser polls `/api/progress` while the job's status messages advance — *Analyzing media… Converting format… Preparing download…* — until the job reports `completed` along with the file size.
6. **Delivery.** `/api/download` mints a presigned R2 link and hands Dani a single ZIP file. She can copy the share link or immediately start another conversion.
7. **Automatic cleanup.** A cleanup task is scheduled when the job finishes; a token-protected cron endpoint later deletes the R2 object and expires the job record, so storage never accumulates.

## Modules

### Conversion Dashboard
`app/page.tsx`, `lib/hooks/useConversion.ts` — the single-screen client for the entire flow: URL field, Individual/Playlist source toggle, MP3/MP4 format cards, bitrate and resolution selects, a system status pill, and a staged state machine (`idle → fetching → selection → processing → success/failed`) that polls progress every 800 ms for up to an hour.

**Scenario:** A first-time visitor reads the "How It Works" panel, pastes a link, watches the status pill move from `IDLE` to `PROCESSING` to ready, and downloads the file — without ever reloading the page.

### Validation & Metadata Gateway
`lib/validation.ts`, `lib/youtube.ts` — Zod schemas allowlist YouTube hosts and constrain format, mode, and quality values; metadata is fetched through `yt-dlp --dump-single-json` (with a YouTube Data API key and optional cookie file for bot-checks), with playlist flat-parsing for item counts.

**Scenario:** Someone submits a lookalike domain or a private, members-only video; the request is rejected with a clear message before a job is ever created, so the queue only contains work that can actually run.

### Job Queue
`lib/queue.ts` — persistent Redis queue and job records (status, progress, file URL, error, timestamps), with Lua-scripted admission control (per-client active-job cap, global queue depth, ownership TTL), processing leases with heartbeat, automatic requeue of interrupted jobs, and two-day job expiration.

**Scenario:** Ten people hit the service at once; the first jobs enter the queue and the rest receive a polite "queue full" or "too many jobs" response instead of a crashed server — and if a worker dies mid-job, its lease expires and the job returns to the queue on its own.

### Rate Limiting & Anonymous Access
`lib/rate-limit.ts` — with no accounts, client identity is an HMAC-SHA256 of the request IP keyed by a server secret, counted through a fixed-window Redis counter (default 5 conversions per 10 minutes) and returned with `Retry-After` headers.

**Scenario:** A script hammering `/api/convert` is throttled after five attempts, while a normal user converting a couple of videos never notices the limit exists.

### Queue Worker & Job Processor
`scripts/queue-worker.js`, `lib/processor.ts` — a standalone Node worker (configurable concurrency, default 2) polls `/api/queue-handler`; the processor runs download → convert → upload → schedule cleanup, refreshes its lease every 30 seconds, zips playlist output with `archiver`, and maps internal failures to safe, human-readable error messages.

**Scenario:** Inside Docker, supervisord runs the Next.js server and the worker side by side, so the web UI stays responsive while two conversions are already running in the background.

### Conversion Engine
`lib/converter.ts` — fluent-ffmpeg wrappers for streaming MP3 encoding (128–320 kbps, `libmp3lame`, 44.1 kHz stereo) and MP4 re-encoding with height mapping (360p–1080p, `libx264` + AAC, fast preset), plus temp-directory management and file-size reporting.

**Scenario:** A user picks 320 kbps for a lecture recording and 720p for a talk; each file is transcoded to exactly that specification instead of accepting whatever YouTube serves.

### Object Storage
`lib/r2-storage.ts` — S3-compatible client for Cloudflare R2 with content-type mapping, presigned GET URLs (default 48-hour expiry), retry-with-backoff, and storage health diagnostics.

**Scenario:** The finished file is served straight from the bucket through a time-limited link — no server bandwidth spent on file transfer, and no permanent public URL left behind afterward.

### Delivery & Progress API
`app/api/download`, `app/api/progress`, `app/api/progress-stream`, `app/api/retry` — job-status polling, a streaming progress endpoint, presigned downloads with friendly filenames, and a retry endpoint for failed jobs.

**Scenario:** A conversion that failed on a flaky connection is retried from the same screen instead of making the user paste the URL and choose the format all over again.

### Cleanup, Health & Deployment
`lib/cleanup-scheduler.ts`, `/api/cleanup`, `/api/cleanup-cron`, `/api/health`, `Dockerfile`, `supervisord.conf` — grace-period deletion of R2 objects and Redis job records, an env/R2 health endpoint that returns diagnostics, an Alpine image bundling FFmpeg and an isolated `yt-dlp` virtualenv with supervisord managing server and worker, a GitHub Action keeping the Render free instance awake, plus `RENDER_DEPLOYMENT.md` and `LOCAL_HOSTING.md` operator guides.

**Scenario:** An overnight cron sweep removes yesterday's files, and the moment an R2 key goes missing `/api/health` answers 503 with diagnostics — the operator finds out before users do.

## Features

- Paste YouTube URL and fetch video metadata
- Convert to MP4 (video) or MP3 (audio)
- Individual video or playlist mode
- Selectable bitrate for audio extraction
- Video thumbnail and title preview before conversion
- One-click download with copy link option

## Tech Stack

Current web application:

- Next.js 16 (App Router) with React 19 and TypeScript
- Tailwind CSS 4 + shadcn/ui component kit
- yt-dlp
- FFmpeg
- Upstash Redis — job queue, admission control, rate limiting, cleanup scheduling
- Cloudflare R2 via the AWS S3 SDK — file storage and presigned delivery links
- Docker (Alpine + supervisord) for self-hosted deployment

Earlier revisions of this README described a Windows Forms desktop GUI:

- C#
- WPF
- .NET

## Screenshots

### Input stage — users paste a YouTube URL and choose their desired output format (MP4 video or MP3 audio) and quality. The "How It Works" panel first-time users through the process. The IDLE status confirms the system is ready to fetch.

![Input stage — users paste a YouTube URL and choose their desired output format (MP4 video or MP3 audio) and quality. The "How It Works" panel first-time users through the process. The IDLE status confirms the system is ready to fetch.](screenshots/1.png)

### Verification step — after fetching, the user sees the video thumbnail and title to confirm they're converting the right video before committing to the download. Prevents wasting time on the wrong URL.

![Verification step — after fetching, the user sees the video thumbnail and title to confirm they're converting the right video before committing to the download. Prevents wasting time on the wrong URL.](screenshots/2.png)

### Delivery stage — conversion is complete. Users can download the file directly, copy the shareable link, or immediately start converting another video. The file size is shown so users know what to expect.

![Delivery stage — conversion is complete. Users can download the file directly, copy the shareable link, or immediately start converting another video. The file size is shown so users know what to expect.](screenshots/3.png)

## About

Self-hosted web service that wraps yt-dlp and FFmpeg behind a designed single-page interface, with a Redis-backed job queue, Cloudflare R2 delivery, rate limiting, and automatic file cleanup. Supports single videos and playlists with format selection and metadata preview, and ships as a Docker image ready for Render or local hosting.

---

Built by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
