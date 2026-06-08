# Frontend Dockerfile - MindFourm Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MINDAUTH_URL
ARG NEXT_PUBLIC_MINDAUTH_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MINDAUTH_URL=$NEXT_PUBLIC_MINDAUTH_URL
ENV NEXT_PUBLIC_MINDAUTH_CLIENT_ID=$NEXT_PUBLIC_MINDAUTH_CLIENT_ID
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
