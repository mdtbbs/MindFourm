# Backend Dockerfile - MindFourm NestJS API
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
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

# Writable upload target; must be a mounted volume in production so uploads survive
# container replacement.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Drop root: the process only needs to read its own code and write to uploads.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "dist/main.js"]
