# Base stage with dependencies and ffmpeg
FROM node:22-alpine AS base

# Install media tooling and supervisord. yt-dlp lives in an isolated Python
# environment so Alpine's system Python remains package-manager controlled.
RUN apk add --no-cache ffmpeg python3 py3-pip supervisor \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]"

ENV PATH="/opt/yt-dlp/bin:$PATH"

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Pin pnpm so dependency-build policy does not change between deployments.
RUN corepack enable \
    && corepack prepare pnpm@11.19.0 --activate \
    && pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build the Next.js application
RUN pnpm build

# Set up supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 10000
ENV PORT=10000

# Start supervisor to manage both Next.js and the worker
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
