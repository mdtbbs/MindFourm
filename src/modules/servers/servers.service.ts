import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ServersService {
  private readonly easyManagerUrl: string;
  private readonly serviceKey: string;
  private readonly enabled: boolean;
  private readonly logger = new Logger(ServersService.name);

  constructor(private configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('easymanager.enabled', false);
    this.easyManagerUrl = this.configService.get<string>('easymanager.baseUrl', '');
    this.serviceKey = this.configService.get<string>('easymanager.apiKey', '');
    if (!this.enabled) {
      this.logger.log('EasyManager integration is disabled — server APIs will return empty data');
    }
  }

  private getAxiosConfig() {
    return {
      headers: {
        'X-Service-Key': this.serviceKey,
      },
    };
  }

  async getPublicServers() {
    if (!this.enabled) {
      return { success: true, servers: [] };
    }
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/forum/servers/public`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';

      this.logger.warn(
        `EasyManager public server list unavailable (${status ?? 'network'}): ${message}`
      );

      return {
        success: true,
        servers: [],
      };
    }
  }

  async getUserServers(mindauthId: number) {
    if (!this.enabled) {
      return { success: true, servers: [], message: '服务器功能已关闭' };
    }
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/forum/user/${mindauthId}/servers`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to fetch user servers');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }

  async getServerBasic(serverId: number) {
    if (!this.enabled) {
      throw new BadRequestException('服务器功能已关闭');
    }
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/forum/servers/${serverId}/basic`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to fetch server info');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }

  async applyServer(mindauthId: number, data: { name: string; description: string; version: string; template_id: number }) {
    if (!this.enabled) {
      throw new BadRequestException('服务器功能已关闭');
    }
    try {
      const response = await axios.post(
        `${this.easyManagerUrl}/api/forum/apply`,
        { mindauth_id: mindauthId, ...data },
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to apply for server');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }

  async getAvailableVersions() {
    if (!this.enabled) {
      return { success: true, versions: [] };
    }
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/versions`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to fetch available versions');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }

  async getPublicTemplates() {
    if (!this.enabled) {
      return { success: true, templates: [] };
    }
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/templates`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to fetch templates');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }
}
