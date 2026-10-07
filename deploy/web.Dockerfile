# Client (static build) behind nginx, which also proxies the API.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps/fs-pro-client ./apps/fs-pro-client
RUN npm ci --workspace fs-pro-client --workspace @repo/api-contract --include-workspace-root
# Empty = same origin: the browser calls /api on the host that served it.
ARG VITE_APP_API_BASE_URL=
ENV VITE_APP_API_BASE_URL=$VITE_APP_API_BASE_URL
RUN npm run build --workspace fs-pro-client

FROM nginx:1.27-alpine
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV SERVER_HOST=server REALTIME_HOST=realtime
COPY --from=build /repo/apps/fs-pro-client/dist /usr/share/nginx/html
EXPOSE 80
