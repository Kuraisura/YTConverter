# Host the converter on Windows

The website and conversion worker run together on this PC. Upstash Redis still
holds the queue and Cloudflare R2 still stores completed files.

## Environment

Keep all real credentials in `.env.local`; this file is ignored by Git. Copy
the variable names from `.env.example` and fill in the values. The required
variables are:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `YOUTUBE_API_KEY`

For authenticated YouTube requests, export fresh cookies in Netscape format to
a location outside this repository and set, for example:

```text
YOUTUBE_COOKIES_PATH=C:/Users/Kurai/youtube-cookies.txt
```

The first line of the file must be `# Netscape HTTP Cookie File` or
`# HTTP Cookie File`. Never commit this file.

## Install and run

From PowerShell in the project folder:

```powershell
python -m pip install --upgrade "yt-dlp[default]"
pnpm install --frozen-lockfile
pnpm build
pnpm start:local
```

Open `http://localhost:3000`. Stop both processes with Ctrl+C.

Stopping `start:local` with Ctrl+C terminates the Next.js, worker, yt-dlp, and
ffmpeg process trees first. It then deletes objects under the app-owned R2
`conversions/` prefix and clears queued, processing, cleanup, rate-limit, and job
records from Redis. Other objects in the bucket are not touched. Keep the
terminal open until it prints `Shutdown cleanup complete`.

To perform the same cleanup while the server is already stopped, run:

```powershell
corepack pnpm cleanup:local
```

## Use this PC to process jobs from the Render website

The local and Render installations must use the same Upstash Redis and R2
credentials. In the Render web service, add:

```text
DISABLE_QUEUE_WORKER=true
```

Then redeploy Render and keep `pnpm start:local` running on this PC. Render will
accept and queue conversion requests, while this PC claims the shared Redis
jobs, downloads and converts the media, uploads the result to R2, and updates
the job status seen by the online visitor. Do not set this variable to `true`
in the local `.env.local` file.

`WORKER_CONCURRENCY=2` allows this PC to process two independent conversions at
once. Values from 1 through 8 are supported; increase it only if the PC has
enough CPU, memory, temporary disk space, and network bandwidth. Each active
conversion can run ffmpeg and yt-dlp at the same time.

Active jobs renew a Redis processing lease every 30 seconds. If the PC or worker
stops unexpectedly, `PROCESSING_LEASE_MS=600000` returns abandoned jobs to the
FIFO queue after 10 minutes. Once a file is uploaded to R2, its worker slot is
released immediately; the visitor does not hold a slot while deciding whether
to download it.

Anonymous submissions are limited by IP before metadata is fetched. The default
limits are five requests per 10 minutes, five unfinished jobs per visitor, 30
waiting jobs globally, and a 30-second maximum queue wait. Configure these with
`CONVERSION_RATE_LIMIT`, `CONVERSION_RATE_WINDOW_SEC`,
`MAX_ACTIVE_JOBS_PER_CLIENT`, `MAX_QUEUE_DEPTH`, and `MAX_QUEUE_WAIT_MS`. Set a
long random `RATE_LIMIT_SECRET` in Render (and locally if this PC accepts direct
browser traffic); never commit its value.
Completed R2 files are scheduled for deletion 10 minutes after upload with
`CLEANUP_DELAY_MS=600000`.

Other devices on the same network can use `http://YOUR-PC-IP:3000` after the
Windows Firewall allows inbound TCP port 3000. Do not expose this port directly
to the public internet. Use an authenticated tunnel if remote access is needed.
