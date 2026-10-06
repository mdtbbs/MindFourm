# Backend Dockerfile - MindFourm NestJS API
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# npm's prepare hook runs during install, before the rest of the source is copied.
COPY scripts/install-git-hooks.cjs ./scripts/install-git-hooks.cjs
RUN --mount=type=cache,target=/root/.npm npm ci --production=false
COPY . .
RUN npm run build:backend

# Reinstall with production deps only, so the runner does not carry the build
# toolchain (nest CLI, typescript, jest, playwright) into the shipped image.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
# Needed by the one-off maintenance scripts (content re-sanitisation, session-audit
# token scrubbing) which are run inside this container after a deploy.
COPY --from=builder --chown=node:node /app/scripts ./scripts
# Developer-doc routes load their Markdown guides at runtime.
COPY --from=builder --chown=node:node /app/docs/api ./docs/api
COPY --from=builder --chown=node:node /app/docs/product ./docs/product

# Writable upload target; must be a mounted volume in production so uploads survive
# container replacement.
RUN mkdir -p /app/uploads /var/lib/mindfourm/cloud-saves && chown -R node:node /app/uploads /var/lib/mindfourm

# Drop root: the process only needs to read its own code and write to uploads.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/main.js"]
