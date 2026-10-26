# YT Converter

A self-hosted web converter that queues YouTube media jobs and delivers MP3 or MP4 downloads.

**Web** · **Utility Project** · 2026

[Portfolio](https://kuraisler.xyz) · [Website demo](https://ytconverter-vt6g.onrender.com/)

## Purpose

YT Converter gives users a browser interface for a media-conversion pipeline. It handles metadata preview, format selection, background processing, and temporary download delivery so long-running conversions do not block the web interface.

## Intended users

People converting media they own or have permission to download, and operators who want to host their own conversion service.

## Main capabilities

- Preview video or playlist metadata before starting a job.
- Choose MP3 audio or MP4 video with supported quality options.
- Follow job progress and download a file or playlist archive.
- Apply queue limits, rate limiting, retry handling, and automatic file cleanup.

## How it was built

### Browser and API

Next.js, React, and TypeScript implement the interface and server endpoints; Tailwind CSS and Radix UI provide the visual components.

### Background processing

API routes place work in an Upstash Redis queue. A separate Node.js worker runs yt-dlp for retrieval and FFmpeg for conversion.

### Temporary delivery

Finished files are uploaded to Cloudflare R2 and delivered through signed links. Cleanup jobs remove stored output; Docker packages the server and worker.

## Technology stack

| Responsibility | Technologies |
| --- | --- |
| Web interface | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI |
| Conversion & queue | Node.js, yt-dlp, FFmpeg, Upstash Redis |
| Storage & deployment | Cloudflare R2, AWS S3 SDK, Docker |

## Project scope and current state

A self-hosted utility project. Conversion depends on source availability, the hosting environment, external services, and configured worker and storage credentials. Public demo uptime is not guaranteed.

## Source guide

- [`app/api/`](app/api/)
- [`lib/queue.ts`](lib/queue.ts)
- [`lib/processor.ts`](lib/processor.ts)
- [`scripts/queue-worker.js`](scripts/queue-worker.js)
- [`LOCAL_HOSTING.md`](LOCAL_HOSTING.md)
- [`RENDER_DEPLOYMENT.md`](RENDER_DEPLOYMENT.md)

## Development setup

Requires a Node.js version compatible with package.json, FFmpeg, yt-dlp, Upstash Redis, and Cloudflare R2 configuration. Read LOCAL_HOSTING.md and RENDER_DEPLOYMENT.md for environment and worker setup. The UI alone does not run conversion jobs. Use the provided Docker setup when you need the server, worker, and conversion tools packaged together.

```sh
npm install
npm run dev

# In a second terminal, with the worker configured:
npm run worker

# Production build
npm run build
```

## Screenshot and module walkthrough

Expand a screen below to see the capture and an explanation of the module, its visible controls, and its role in the application.

<details open>
<summary><strong>01 · Conversion request setup</strong></summary>

The form accepts a YouTube link, individual/playlist mode, output format, and audio quality. Fetch Metadata begins the preview stage, while an adjacent guide explains the conversion flow.

<p><img src="screenshots/1.png" alt="Conversion request setup" width="960"></p>

</details>

<details>
<summary><strong>02 · Metadata preview and confirmation</strong></summary>

The retrieved thumbnail, title, and channel let users check the source before conversion. The preview panel provides Back and Convert now actions while retaining the selected output options.

<p><img src="screenshots/2.png" alt="Metadata preview and confirmation" width="960"></p>

</details>

<details>
<summary><strong>03 · Completed conversion and download</strong></summary>

The result panel reports a ready download with format and file size. Download File, Copy link, and Convert another connect the completed background job to retrieval and the next request.

<p><img src="screenshots/3.png" alt="Completed conversion and download" width="960"></p>

</details>

---

Project by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
