FROM docker.io/library/node:26-slim AS base
RUN npm install --global pnpm@12.17.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM base AS web-build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY design design
COPY src src
COPY web web
RUN pnpm exec vite build

FROM docker.io/library/node:26-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY migrations migrations
COPY --from=web-build /app/dist/web dist/web
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "src/targets/node/index.ts"]
