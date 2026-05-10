# Render deployment notes

## YouTube authentication

YouTube may reject downloads from hosting-provider IP addresses with a
"Sign in to confirm you're not a bot" response. Do not store a Google username,
password, or cookies in Git.

Use a separate, low-privilege YouTube account because automated access can cause
the cookies to expire or the account to be restricted.

1. Sign in to YouTube in a private browser window.
2. Export the YouTube cookies in Netscape `cookies.txt` format.
3. Close the private window and do not reuse that session.
4. In the Render service, open **Environment**.
5. Under **Secret Files**, add a file named `youtube-cookies.txt`.
6. Paste the exported file contents and save.

Render mounts the file at `/etc/secrets/youtube-cookies.txt`, which the
application detects automatically. To use another location, set
`YOUTUBE_COOKIES_PATH` to its absolute path.

For compatibility, a Render Secret File named `cookies.txt` is also detected at
`/etc/secrets/cookies.txt`.

Refresh the secret file when YouTube expires or rotates the cookies. Never add
the cookie file to the Docker image or repository.

Cookies can still be rejected when they were created on a different IP address
from the Render service. They are authentication material, not a guaranteed
way to bypass YouTube's automated-request checks.

## Reliable video details

Use the official YouTube Data API for title, channel, duration, thumbnail, and
playlist item count. This does not require an end-user login or OAuth for public
videos.

1. Create or select a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Create an API key and restrict it to **YouTube Data API v3**.
4. Add it to the main Render service as the secret environment variable
   `YOUTUBE_API_KEY`.

The application tries this API first and falls back to youtubei.js and yt-dlp
if the key is missing or the API is temporarily unavailable.

## Download limitations

MP3 and MP4 downloads use yt-dlp with the Render Secret File described above.
No additional private service is required. Hosting-provider IP addresses can
still be challenged or blocked by YouTube, so refresh the cookie file when
needed. A cookie refresh cannot guarantee access if the Render outbound IP is
blocked.

## Runtime configuration

- Runtime: Docker
- Health check: `/api/health/live`
- `WORKER_API_URL`: `http://127.0.0.1:10000` (or omit it)
- `PORT`: allow Render to provide it; the default is `10000`
- `YOUTUBE_API_KEY`: secret key for reliable public metadata
- `DISABLE_QUEUE_WORKER`: set to `true` when a local PC processes the shared queue

## Keeping the free web service awake

The repository includes `.github/workflows/keep-render-awake.yml`. GitHub Actions
pings the non-cacheable `/api/health/live` endpoint every five minutes, before
Render's 15-minute idle timeout. It waits until the endpoint returns the real
JSON health response instead of treating Render's temporary loading page as a
successful wake-up. You can also run it manually from the repository's
**Actions** tab under **Keep Render service awake**.

Scheduled workflows can occasionally be delayed by GitHub. The only
Render-supported guarantee of no cold starts is a paid instance; this workflow
is a best-effort option for the free service and consumes the workspace's free
instance hours while the service remains active.

### More reliable free scheduler: Upstash QStash

If GitHub does not create scheduled runs, use QStash instead. Its free allowance
is sufficient for a five-minute health check.

1. Open the Upstash Console and select **QStash** → **Schedules**.
2. Create a schedule with destination
   `https://ytconverter-vt6g.onrender.com/api/health/live`.
3. Set the method to `GET` and the cron expression to `*/5 * * * *`.
4. Set two retries and save the schedule.
5. Confirm QStash logs show a `200` response whose body contains
   `{"status":"ok"}`.

After QStash is confirmed, you may disable the GitHub workflow to avoid duplicate
health checks. Do not put a QStash token in the repository; creating this public
GET schedule through the Upstash dashboard requires no application secret.
