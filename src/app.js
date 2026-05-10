const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const { errorHandler } = require('./middleware/error');
const routes = require('./routes');
const config = require('./config');

const app = new Koa();

app.proxy = true;

app.use(errorHandler);

app.use(cors({
  origin: config.app.env === 'development' ? '*' : config.app.baseUrl,
  credentials: true
}));

app.use(bodyParser({
  json: { limit: '10mb' }
}));

app.use(routes.routes());
app.use(routes.allowedMethods());

app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, message: 'Not found' };
});

module.exports = app;