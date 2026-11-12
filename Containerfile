FROM docker.io/library/node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS node

FROM node AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY extension/package.json extension/package.json
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter threadsift

FROM base AS web-build
RUN pnpm install --frozen-lockfile --filter threadsift
COPY tsconfig.json vite.config.ts ./
COPY design design
COPY tools/theme-script.ts tools/theme-script.ts
COPY src src
COPY web web
RUN pnpm exec vite build

FROM node
LABEL org.opencontainers.image.source=https://github.com/KyaniteHQ/threadsift
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 NPM_CONFIG_PREFIX=/data/cli CLAUDE_CONFIG_DIR=/data/claude CODEX_HOME=/data/codex
ENV PATH=/data/cli/bin:$PATH
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY migrations migrations
COPY --from=web-build /app/dist/web dist/web
RUN mkdir -p /data/cli /data/claude /data/codex && chmod 700 /data/codex && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "src/targets/node/index.ts"]
