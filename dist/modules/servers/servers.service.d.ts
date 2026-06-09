import { ConfigService } from '@nestjs/config';
export declare class ServersService {
    private configService;
    private readonly easyManagerUrl;
    private readonly serviceKey;
    constructor(configService: ConfigService);
    private getAxiosConfig;
    getPublicServers(): Promise<any>;
    getUserServers(mindauthId: number): Promise<any>;
    getServerBasic(serverId: number): Promise<any>;
    applyServer(mindauthId: number, data: {
        name: string;
        description: string;
        version: string;
        template_id: number;
    }): Promise<any>;
    getAvailableVersions(): Promise<any>;
    getPublicTemplates(): Promise<any>;
}
