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

app.use(compress({
  gzip: { threshold: 1024 },
  deflate: { threshold: 1024 }
}));

app.use(errorHandler);

app.use(cors({
  origin: config.app.env === 'development' ? '*' : config.app.baseUrl,
  credentials: true
}));

app.use(bodyParser({
  json: { limit: '1mb' }
}));

// Serve uploaded avatars at /uploads/avatars/<filename>
const avatarsDir = path.join(__dirname, '../uploads/avatars');
app.use(serve(avatarsDir, { prefix: '/uploads/avatars' }));

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
