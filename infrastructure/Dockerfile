FROM node:24-bookworm-slim AS workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=20000 npm ci
COPY . .

FROM workspace AS api
RUN DATABASE_URL=postgresql://build:build@localhost/build npm run db:generate && npm run build -w @prism/api
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]

FROM workspace AS web-build
RUN npm run build -w @prism/web

FROM nginx:1.28-alpine AS web
COPY infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist/browser /usr/share/nginx/html
EXPOSE 80
