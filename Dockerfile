FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod

# Install ffmpeg and Python 3
RUN apk add --no-cache ffmpeg python3 py3-pip

# Install yt-dlp
RUN pip3 install yt-dlp

# Copy application code
COPY . .

# Run the queue worker
CMD ["node", "scripts/queue-worker.js"]
