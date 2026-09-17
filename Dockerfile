FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm ci --prefix templates/frontend --no-audit --no-fund
RUN VITE_API_ORIGIN= npm run build

FROM node:24.18.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git tini && rm -rf /var/lib/apt/lists/*
ARG CODEX_VERSION=0.154.0
RUN npm install -g @openai/codex@${CODEX_VERSION} --no-audit --no-fund
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data /app/workspaces /home/node/.codex && chown -R node:node /app/data /app/workspaces /home/node/.codex
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4100 DATA_ROOT=/app/data WORKSPACES_ROOT=/app/workspaces CODEX_HOME=/home/node/.codex SERVE_WEB=1
USER node
EXPOSE 4100
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "apps/api/dist/main.js"]
