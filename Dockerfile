# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY backend backend
COPY frontend frontend
# The public container uses one same-origin endpoint and never exposes local-LLM controls.
ENV VITE_APP_MODE=cloud
ENV VITE_API_ORIGIN=""
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    APP_MODE=cloud \
    HOST=0.0.0.0 \
    PORT=8787 \
    SERVE_STATIC=true \
    STATIC_DIR=/app/public \
    SESSION_DB_PATH=/data/tutor-sessions.db

RUN groupadd --system tutor && useradd --system --gid tutor --home-dir /app tutor \
  && mkdir -p /app/public /data \
  && chown -R tutor:tutor /app /data
COPY --from=build --chown=tutor:tutor /app/node_modules /app/node_modules
COPY --from=build --chown=tutor:tutor /app/backend/node_modules /app/backend/node_modules
COPY --from=build --chown=tutor:tutor /app/backend/dist /app/backend/dist
COPY --from=build --chown=tutor:tutor /app/frontend/dist /app/public
COPY --from=build --chown=tutor:tutor /app/backend/package.json /app/backend/package.json

USER tutor
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend/dist/server.js"]
