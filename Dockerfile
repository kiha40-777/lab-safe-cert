# syntax=docker/dockerfile:1
#
# Build:  docker build -t lab-safe-cert .
# Run:    docker run -p 3000:3000 -v lab-safe-cert-data:/data lab-safe-cert
#         (or simply `docker compose up --build`, see docker-compose.yml)
#
# All data (database, uploaded PDFs) lives in /data: keep it on a volume or it is lost
# when the container is removed. On the first start, the generated admin password is
# printed once in the container log (docker logs <container>), unless ADMIN_PASSWORD is set.
# Alternatively set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN: the data is then kept in that
# Turso database and /data is not used (see docs/DEPLOYMENT.md).

# ---- build stage: install dependencies and build the app ----------------------------
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run stage: only what is needed to run the server -------------------------------
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
