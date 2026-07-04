# MindFourm bare-metal deployment

This deployment path does not use Docker.

## Services

- Node.js 20+
- MySQL 8
- Redis 7
- PM2
- Nginx or another reverse proxy

## Build

```bash
npm ci
npm run build

cd frontend
npm ci
npm run build
cd ..
```

## Environment

Copy the examples and fill real values:

```bash
cp .env.production.example .env
cp frontend/.env.production.example frontend/.env.production
```

The backend reads `.env` from the `MindFourm` directory. The frontend reads
`frontend/.env.production` during `next build` and `next start`.

## Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
```

Health check:

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:3000
```

## Nginx

Use `nginx/conf.d/default.conf` as the base reverse proxy config. It routes:

- `/api` and `/uploads` to `127.0.0.1:4000`
- the frontend to `127.0.0.1:3000`

Add HTTPS certificates in the server-level Nginx setup used by your host.
