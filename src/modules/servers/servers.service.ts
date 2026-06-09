import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ServersService {
  private readonly easyManagerUrl: string;
  private readonly serviceKey: string;

  constructor(private configService: ConfigService) {
    this.easyManagerUrl = this.configService.get<string>('easymanager.baseUrl', '');
    this.serviceKey = this.configService.get<string>('easymanager.apiKey', '');
  }

  private getAxiosConfig() {
    return {
      headers: {
        'X-Service-Key': this.serviceKey,
      },
    };
  }

  async getPublicServers() {
    try {
      const response = await axios.get(
        `${this.easyManagerUrl}/api/forum/servers/public`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new BadRequestException(error.response.data?.message || 'Failed to fetch public servers');
      }
      throw new BadRequestException('Failed to connect to EasyManager service');
    }
  }

  async getUserServers(mindauthId: number) {
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
