const config = require('../config');

// EasyManager 配置
const EASYMANAGER_URL = config.easymanager.baseUrl;
const EASYMANAGER_API_KEY = config.easymanager.apiKey;

class ServerService {
  /**
   * 获取公开服务器列表
   */
  static async getPublicServers() {
    try {
      const response = await fetch(`${EASYMANAGER_URL}/api/forum/servers/public`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      return (result.success && result.servers) || [];
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
      const response = await fetch(`${EASYMANAGER_URL}/api/forum/user/${mindauthId}/servers`, {
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
      const response = await fetch(`${EASYMANAGER_URL}/api/forum/servers/${serverId}/basic`, {
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
      const response = await fetch(`${EASYMANAGER_URL}/api/forum/apply`, {
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
   * 获取可用版本列表
   */
  static async getAvailableVersions() {
    try {
      const response = await fetch(`${EASYMANAGER_URL}/api/versions`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      return (result.success && result.versions) || [];
    } catch (error) {
      console.error('EasyManager versions error:', error);
      return [];
    }
  }

  /**
   * 获取公开模板列表
   */
  static async getPublicTemplates() {
    try {
      const response = await fetch(`${EASYMANAGER_URL}/api/templates`, {
        headers: {
          'X-Service-Key': EASYMANAGER_API_KEY
        }
      });
      const result = await response.json();
      return (result.success && result.templates) || [];
    } catch (error) {
      console.error('EasyManager templates error:', error);
      return [];
    }
  }
}

module.exports = ServerService;