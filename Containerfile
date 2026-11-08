FROM docker.io/library/node:26-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS node

FROM node AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM base AS web-build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY design design
COPY tools/theme-script.ts tools/theme-script.ts
COPY src src
COPY web web
RUN pnpm exec vite build

FROM node
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 NPM_CONFIG_PREFIX=/data/cli CLAUDE_CONFIG_DIR=/data/claude
ENV PATH=/data/cli/bin:$PATH
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY migrations migrations
COPY --from=web-build /app/dist/web dist/web
RUN mkdir -p /data/cli /data/claude && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "src/targets/node/index.ts"]
