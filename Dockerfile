FROM ollama/ollama:0.40.2 AS ollama
FROM oven/bun:1.3.0 AS bun

FROM node:24.18.0-bookworm-slim AS manifests
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/hobby-catalog/package.json packages/hobby-catalog/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig*.json ./
COPY apps/server apps/server
COPY apps/web apps/web
COPY packages packages
RUN bun run build

FROM manifests AS production-dependencies
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM node:24.18.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libopenblas0 libvulkan1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ollama /bin/ollama /usr/bin/ollama
COPY --from=ollama /usr/lib/ollama /usr/lib/ollama
COPY --from=production-dependencies /app /app
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/hobby-catalog/dist packages/hobby-catalog/dist
COPY scripts/container.mjs scripts/container.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 \
    OLLAMA_HOST=127.0.0.1:11434 OLLAMA_URL=http://127.0.0.1:11434 \
    OLLAMA_MODELS=/var/data/models OLLAMA_MODEL=gemma3:1b \
    OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_DEBUG=false
EXPOSE 10000
CMD ["node", "scripts/container.mjs"]
