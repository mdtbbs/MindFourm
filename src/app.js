const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const compress = require('koa-compress');
const serve = require('koa-static');
const path = require('path');
const { errorHandler } = require('./middleware/error');
const routes = require('./routes');
const config = require('./config');

const app = new Koa();

app.proxy = true;

// CDN configuration
const CDN_URL = process.env.CDN_URL || '';
const STATIC_CACHE_TTL = parseInt(process.env.STATIC_CACHE_TTL, 10) || 86400; // 24 hours

app.use(compress({
  gzip: { threshold: 1024 },
  deflate: { threshold: 1024 }
}));

app.use(errorHandler);

const allowedOrigins = [config.app.frontendUrl, config.app.apiUrl];

app.use(cors({
  origin: (ctx) => {
    const requestOrigin = ctx.get('Origin');
    // Skip CORS for non-CORS requests (no Origin header)
    if (!requestOrigin) return false;
    // In development, allow any origin that sends credentials
    // In production, only allow configured origins
    if (config.app.env === 'development') {
      return requestOrigin;
    }
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : false;
  },
  credentials: true
}));

app.use(bodyParser({
  json: { limit: '1mb' }
}));

// Serve uploaded avatars at /uploads/avatars/<filename>
const avatarsDir = path.join(__dirname, '../uploads/avatars');
app.use(serve(avatarsDir, {
  prefix: '/uploads/avatars',
  maxage: STATIC_CACHE_TTL * 1000,
  setHeaders: (res) => {
    if (CDN_URL) {
      res.setHeader('X-CDN-Cache', 'HIT');
      res.setHeader('CDN-Url', CDN_URL);
    }
  }
}));

// Serve uploaded attachments at /uploads/attachments/<filename>
const attachmentsDir = path.join(__dirname, '../uploads/attachments');
app.use(serve(attachmentsDir, {
  prefix: '/uploads/attachments',
  maxage: STATIC_CACHE_TTL * 1000,
  setHeaders: (res) => {
    if (CDN_URL) {
      res.setHeader('X-CDN-Cache', 'HIT');
      res.setHeader('CDN-Url', CDN_URL);
    }
  }
}));

// Serve uploaded resources at /uploads/resources/<filename>
const resourcesDir = path.join(__dirname, '../uploads/resources');
app.use(serve(resourcesDir, {
  prefix: '/uploads/resources',
  maxage: STATIC_CACHE_TTL * 1000,
  setHeaders: (res) => {
    if (CDN_URL) {
      res.setHeader('X-CDN-Cache', 'HIT');
      res.setHeader('CDN-Url', CDN_URL);
    }
  }
}));

// Serve static public files (server application page etc.)
const publicDir = path.join(__dirname, '../public');
app.use(serve(publicDir, {
  maxage: STATIC_CACHE_TTL * 1000
}));

app.use(routes.routes());
app.use(routes.allowedMethods());

// Cache-Control for static-like API responses
app.use(async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    if (ctx.path === '/api/categories' || ctx.path === '/api/tags') {
      ctx.set('Cache-Control', 'public, max-age=60');
    } else if (ctx.path === '/api/settings') {
      ctx.set('Cache-Control', 'public, max-age=30');
    }
  }
});

app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, message: 'Not found' };
});

module.exports = app;
