FROM ollama/ollama:0.40.2 AS ollama

FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig*.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/hobby-catalog/package.json packages/hobby-catalog/package.json
RUN npm ci --ignore-scripts
COPY apps/server apps/server
COPY packages packages
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.18.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libopenblas0 libvulkan1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ollama /bin/ollama /usr/bin/ollama
COPY --from=ollama /usr/lib/ollama /usr/lib/ollama
COPY --from=build /app /app
COPY scripts/container.mjs scripts/container.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 \
    OLLAMA_HOST=127.0.0.1:11434 OLLAMA_URL=http://127.0.0.1:11434 \
    OLLAMA_MODELS=/var/data/models OLLAMA_MODEL=gemma3:1b \
    OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_DEBUG=false
EXPOSE 10000
CMD ["node", "scripts/container.mjs"]
