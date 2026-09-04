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
`frontend/.env.production` during `next build` and production startup.

The PM2 config starts the frontend with `npm start` from `frontend/`, not with a
raw `next start`. That package script runs `scripts/start-standalone.js`, which
mirrors `.next/static` and `public` into `.next/standalone` before launching the
standalone server. Keep that path for bare-metal deploys; starting
`.next/standalone/server.js` directly without those directories makes hashed CSS
and JS chunks disappear after deploys.

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

HTML responses must not be stored by browsers or shared CDNs. Next.js may emit a
long `s-maxage` on prerendered pages; if ESA/Cloudflare/another CDN caches that
HTML across a redeploy, the page can keep referencing old content-hashed CSS/JS
files. Those old files 404 as `text/plain`, and browsers refuse to apply them as
stylesheets.

Keep the frontend `location /` rule aligned with `nginx/conf.d/default.conf`:

```nginx
proxy_hide_header Cache-Control;
proxy_hide_header ETag;
add_header Cache-Control "no-cache, no-store, must-revalidate" always;
```

Do not apply this to `/_next/static/`. Content-hashed Next.js assets should keep
their long immutable cache headers.

## Post-deploy cache verification

After each frontend or Nginx deploy:

1. Reload the active 宝塔/Nginx vhost.
2. Restart or reload the PM2 frontend process so it uses the latest standalone
   build and startup script.
3. Purge CDN/ESA cached HTML for changed routes such as `/posts/new`.
4. Verify headers from outside the server:

```bash
curl -I https://mdtbbs.cn/posts/new
curl -I https://mdtbbs.cn/_next/static/css/<current-hash>.css
```

Expected result:

- `/posts/new` has no `s-maxage=31536000` and no upstream `ETag`.
- `/posts/new` sends a no-store/no-cache `Cache-Control`.
- the current CSS hash returns `200` with `Content-Type: text/css`.

Old CSS hashes may still return `404 text/plain`; that is acceptable as long as
no live HTML references them.
