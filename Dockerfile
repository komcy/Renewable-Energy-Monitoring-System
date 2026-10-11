# syntax=docker/dockerfile:1
#
# REMS production image: one container runs the Express API and serves the
# built React client from the same origin (port 5000).
#
#   docker build -t rems .
#   docker run --env-file server/.env -p 5000:5000 rems
#
# Stage 1 builds the client, stage 2 installs production-only server
# dependencies, stage 3 is a slim runtime with neither dev tooling nor sources
# it doesn't need.

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------- client build
FROM node:${NODE_VERSION} AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
# Same-origin API in production: the server serves the client, so /api is relative
ENV VITE_API_URL=/api
RUN npm run build

# ---------------------------------------------------------------- server deps
FROM node:${NODE_VERSION} AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app

# Server code + production dependencies, owned by the unprivileged `node` user
COPY --chown=node:node --from=server-deps /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/ ./server/
# Built client, served by Express from ../client/dist
COPY --chown=node:node --from=client-build /app/client/dist ./client/dist

USER node
WORKDIR /app/server
EXPOSE 5000

# Container is healthy when the API answers and the database is connected
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>r.json()).then(b=>process.exit(b.database==='connected'?0:1)).catch(()=>process.exit(1))"

# Run node directly (not via npm) so SIGTERM reaches the app's graceful shutdown
CMD ["node", "server.js"]
