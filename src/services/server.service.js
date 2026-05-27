const config = require('../config');
const redis = require('../database/redis');

// EasyManager 配置
const EASYMANAGER_URL = config.easymanager.baseUrl;
const EASYMANAGER_API_KEY = config.easymanager.apiKey;

// 超时设置 (5秒)
const FETCH_TIMEOUT = 5000;

// 缓存 TTL (秒)
const CACHE_TTL_VERSIONS = 300;  // 5分钟
const CACHE_TTL_TEMPLATES = 300; // 5分钟
const CACHE_TTL_PUBLIC_SERVERS = 60; // 1分钟

// 带超时的 fetch helper
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
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

class ServerService {
  /**
   * 获取公开服务器列表 (带缓存)
   */
  static async getPublicServers() {
    const cacheKey = 'cache:public_servers';
    try {
      // 先检查缓存
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/forum/servers/public`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      const servers = (result.success && result.servers) || [];

      // 写入缓存
      await redis.set(cacheKey, JSON.stringify(servers), CACHE_TTL_PUBLIC_SERVERS);
      return servers;
    } catch (error) {
      console.error('EasyManager public servers error:', error);
      return [];
    }
  }

  /**
   * 获取用户的服务器列表
   * @param {number} mindauthId - MindAuth 用户ID
   */
  static async getUserServers(mindauthId) {
    try {
      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/forum/user/${mindauthId}/servers`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY,
          'X-User-ID': String(mindauthId)
        }
      });
      const result = await response.json();
      return (result.success && result.servers) || [];
    } catch (error) {
      console.error('EasyManager user servers error:', error);
      return [];
    }
  }

  /**
   * 获取服务器基础信息
   * @param {number} serverId - 服务器ID
   */
  static async getServerBasic(serverId) {
    try {
      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/forum/servers/${serverId}/basic`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      return result.success ? result.server : null;
    } catch (error) {
      console.error('EasyManager server basic error:', error);
      return null;
    }
  }

  /**
   * 申请创建服务器
   * @param {number} mindauthId - MindAuth 用户ID
   * @param {object} data - 申请数据 {name, description, version, template_id}
   */
  static async applyServer(mindauthId, data) {
    try {
      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/forum/apply`, {
        method: 'POST',
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY,
          'X-User-ID': String(mindauthId),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          version: data.version,
          template_id: data.template_id || null
        })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('EasyManager apply server error:', error);
      return { success: false, message: '服务器申请服务连接失败' };
    }
  }

  /**
   * 获取可用版本列表 (带缓存)
   */
  static async getAvailableVersions() {
    const cacheKey = 'cache:versions';
    try {
      // 先检查缓存
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/versions`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      const versions = (result.success && result.versions) || [];

      // 写入缓存
      await redis.set(cacheKey, JSON.stringify(versions), CACHE_TTL_VERSIONS);
      return versions;
    } catch (error) {
      console.error('EasyManager versions error:', error);
      return [];
    }
  }

  /**
   * 获取公开模板列表 (带缓存)
   */
  static async getPublicTemplates() {
    const cacheKey = 'cache:templates';
    try {
      // 先检查缓存
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await fetchWithTimeout(`${EASYMANAGER_URL}/api/templates`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      const templates = (result.success && result.templates) || [];

      // 写入缓存
      await redis.set(cacheKey, JSON.stringify(templates), CACHE_TTL_TEMPLATES);
      return templates;
    } catch (error) {
      console.error('EasyManager templates error:', error);
      return [];
    }
  }
}

module.exports = ServerService;