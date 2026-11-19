# Build from the creator-studio directory:  docker build -f render-worker/Dockerfile -t creator-studio-worker .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY src/services/ffmpeg/filtergraph.ts src/services/ffmpeg/filtergraph.ts
COPY src/services/compositor/motion.ts src/services/compositor/motion.ts
COPY render-worker/server.ts render-worker/server.ts
RUN echo '{"type":"module"}' > package.json
ENV PORT=8787 JOBS_DIR=/data/jobs
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "render-worker/server.ts"]
