FROM docker.io/library/node:26-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS node

FROM node AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY extension/package.json extension/package.json
RUN spec="$(node -e 'const field = require("./package.json").packageManager; const pinned = typeof field === "string" ? /^pnpm@(\d+\.\d+\.\d+)\+sha512\.([0-9a-f]{128})$/.exec(field) : null; if (pinned === null) throw new Error("packageManager is not pnpm@<version>+sha512.<128 hex>"); console.log(pinned[1], pinned[2]);')" \
    && version="${spec% *}" && hash="${spec#* }" \
    && npm pack "pnpm@$version" --loglevel=error --pack-destination /tmp \
    && echo "$hash  /tmp/pnpm-$version.tgz" | sha512sum --check --strict \
    && npm install --global "/tmp/pnpm-$version.tgz" \
    && rm "/tmp/pnpm-$version.tgz"

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter threadsift

FROM base AS web-build
RUN pnpm install --frozen-lockfile --filter threadsift
COPY tsconfig.json vite.config.ts ./
COPY design design
COPY tools/theme-script.ts tools/worker-headers.ts tools/
COPY src src
COPY web web
RUN pnpm exec vite build

FROM node
LABEL org.opencontainers.image.source=https://github.com/KyaniteHQ/threadsift
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 NPM_CONFIG_PREFIX=/data/cli CLAUDE_CONFIG_DIR=/data/claude CODEX_HOME=/data/codex GROK_HOME=/data/grok
ENV PATH=/data/cli/bin:/data/grok/bin:$PATH
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY migrations migrations
COPY --from=web-build /app/dist/web dist/web
RUN mkdir -p /data/cli /data/claude /data/codex /data/grok && chmod 700 /data/codex /data/grok && chown -R node:node /data && ln -s /data /app/.data
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "src/targets/node/index.ts"]
