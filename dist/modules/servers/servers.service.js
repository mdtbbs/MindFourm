"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let ServersService = class ServersService {
    constructor(configService) {
        this.configService = configService;
        this.easyManagerUrl = this.configService.get('easymanager.baseUrl', '');
        this.serviceKey = this.configService.get('easymanager.apiKey', '');
    }
    getAxiosConfig() {
        return {
            headers: {
                'X-Service-Key': this.serviceKey,
            },
        };
    }
    async getPublicServers() {
        try {
            const response = await axios_1.default.get(`${this.easyManagerUrl}/api/forum/servers/public`, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to fetch public servers');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
    async getUserServers(mindauthId) {
        try {
            const response = await axios_1.default.get(`${this.easyManagerUrl}/api/forum/user/${mindauthId}/servers`, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to fetch user servers');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
    async getServerBasic(serverId) {
        try {
            const response = await axios_1.default.get(`${this.easyManagerUrl}/api/forum/servers/${serverId}/basic`, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to fetch server info');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
    async applyServer(mindauthId, data) {
        try {
            const response = await axios_1.default.post(`${this.easyManagerUrl}/api/forum/apply`, { mindauth_id: mindauthId, ...data }, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to apply for server');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
    async getAvailableVersions() {
        try {
            const response = await axios_1.default.get(`${this.easyManagerUrl}/api/versions`, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to fetch available versions');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
    async getPublicTemplates() {
        try {
            const response = await axios_1.default.get(`${this.easyManagerUrl}/api/templates`, this.getAxiosConfig());
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new common_1.BadRequestException(error.response.data?.message || 'Failed to fetch templates');
            }
            throw new common_1.BadRequestException('Failed to connect to EasyManager service');
        }
    }
};
exports.ServersService = ServersService;
exports.ServersService = ServersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ServersService);
//# sourceMappingURL=servers.service.js.map