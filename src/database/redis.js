const Redis = require('ioredis');
const config = require('../config');

let client = null;

function initialize() {
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 2000);
    }
  });

  client.on('connect', () => {
    console.log(`Redis connected: ${config.redis.host}:${config.redis.port}`);
  });

  client.on('error', (err) => {
    console.error('Redis error:', err.message);
  });

  return client;
}

function getClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call initialize() first.');
  }
  return client;
}

async function get(key) {
  return getClient().get(key);
}

async function set(key, value, ttlSeconds = null) {
  const client = getClient();
  if (ttlSeconds) {
    return client.set(key, value, 'EX', ttlSeconds);
  }
  return client.set(key, value);
}

async function del(key) {
  return getClient().del(key);
}

async function exists(key) {
  return getClient().exists(key);
}

async function incr(key) {
  return getClient().incr(key);
}

async function expire(key, seconds) {
  return getClient().expire(key, seconds);
}

async function ttl(key) {
  return getClient().ttl(key);
}

async function keys(pattern) {
  return getClient().keys(pattern);
}

async function hset(key, field, value) {
  return getClient().hset(key, field, value);
}

async function hget(key, field) {
  return getClient().hget(key, field);
}

async function hgetall(key) {
  return getClient().hgetall(key);
}

async function hdel(key, field) {
  return getClient().hdel(key, field);
}

async function close() {
  if (client) {
    await client.quit();
    client = null;
    console.log('Redis client closed');
  }
}

module.exports = {
  initialize,
  getClient,
  get,
  set,
  del,
  exists,
  incr,
  expire,
  ttl,
  keys,
  hset,
  hget,
  hgetall,
  hdel,
  close
};