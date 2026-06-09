const config = require('../config');
const redis = require('../database/redis');

const EASYMANAGER_URL = config.easymanager.baseUrl;
const EASYMANAGER_API_KEY = config.easymanager.apiKey;
const FETCH_TIMEOUT = 5000;
const CACHE_TTL_VERSIONS = 300;
const CACHE_TTL_TEMPLATES = 300;
const CACHE_TTL_PUBLIC_SERVERS = 60;
const FAILURE_CACHE_TTL = 30;
const LOG_THROTTLE_MS = 60_000;

const lastLogAt = new Map();

function logThrottled(key, message, error) {
  const now = Date.now();
  const last = lastLogAt.get(key) || 0;
  if (now - last < LOG_THROTTLE_MS) return;
  lastLogAt.set(key, now);
  console.warn(message, error?.message || error);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

async function getCachedJson(cacheKey) {
  const cached = await redis.get(cacheKey);
  return cached ? JSON.parse(cached) : null;
}

async function setCachedJson(cacheKey, value, ttl) {
  await redis.set(cacheKey, JSON.stringify(value), ttl);
}

async function fetchEasyManagerJson(path, { cacheKey, ttl, fallback, method = 'GET', headers = {}, body } = {}) {
  if (cacheKey) {
    const cached = await getCachedJson(cacheKey);
    if (cached) return cached;
  }

  try {
    const response = await fetchWithTimeout(`${EASYMANAGER_URL}${path}`, {
      method,
      headers: {
        'X-Service-Key': EASYMANAGER_API_KEY,
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`EasyManager HTTP ${response.status}`);
    }

    const result = await response.json();
    if (cacheKey) await setCachedJson(cacheKey, result, ttl);
    return result;
  } catch (error) {
    logThrottled(path, `EasyManager unavailable for ${path}:`, error);
    if (cacheKey) await setCachedJson(cacheKey, fallback, FAILURE_CACHE_TTL);
    return fallback;
  }
}

class ServerService {
  static async getPublicServers() {
    const result = await fetchEasyManagerJson('/api/forum/servers/public', {
      cacheKey: 'cache:public_servers',
      ttl: CACHE_TTL_PUBLIC_SERVERS,
      fallback: { success: true, servers: [] },
    });
    return (result.success && result.servers) || [];
  }

  static async getUserServers(mindauthId) {
    const result = await fetchEasyManagerJson(`/api/forum/user/${mindauthId}/servers`, {
      fallback: { success: true, servers: [] },
      headers: { 'X-User-ID': String(mindauthId) },
    });
    return (result.success && result.servers) || [];
  }

  static async getServerBasic(serverId) {
    const result = await fetchEasyManagerJson(`/api/forum/servers/${serverId}/basic`, {
      fallback: { success: false, server: null },
    });
    return result.success ? result.server : null;
  }

  static async applyServer(mindauthId, data) {
    return fetchEasyManagerJson('/api/forum/apply', {
      method: 'POST',
      headers: {
        'X-User-ID': String(mindauthId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        version: data.version,
        template_id: data.template_id || null,
      }),
      fallback: { success: false, message: '服务器申请服务暂不可用，请稍后再试' },
    });
  }

  static async getAvailableVersions() {
    const result = await fetchEasyManagerJson('/api/versions', {
      cacheKey: 'cache:versions',
      ttl: CACHE_TTL_VERSIONS,
      fallback: { success: true, versions: [] },
    });
    return (result.success && result.versions) || [];
  }

  static async getPublicTemplates() {
    const result = await fetchEasyManagerJson('/api/templates', {
      cacheKey: 'cache:templates',
      ttl: CACHE_TTL_TEMPLATES,
      fallback: { success: true, templates: [] },
    });
    return (result.success && result.templates) || [];
  }
}

module.exports = ServerService;
