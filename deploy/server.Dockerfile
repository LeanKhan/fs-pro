# API server (Node). Build context: the repo root.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps/fs-pro-server ./apps/fs-pro-server
# Only the server's workspace dependencies (the client and realtime gateway
# are separate images). Dev dependencies stay: the migrate job needs
# drizzle-kit and ts-node.
RUN npm ci --workspace fs-pro-server --workspace @repo/api-contract --include-workspace-root
RUN npm run build --workspace @repo/api-contract && npm run build --workspace fs-pro-server

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
COPY deploy/migrate.sh ./deploy/migrate.sh
WORKDIR /repo/apps/fs-pro-server
# The server writes game-logs.log, tmp/uploads and uploaded images here.
RUN mkdir -p tmp/uploads && chown -R node:node /repo/apps/fs-pro-server
EXPOSE 3000
USER node
CMD ["node", "build/server.js"]
