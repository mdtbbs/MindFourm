import { ServersService } from './servers.service';
import type { Request } from 'express';
export declare class ServersController {
    private readonly serversService;
    constructor(serversService: ServersService);
    getPublicServers(): Promise<any>;
    getAvailableVersions(): Promise<any>;
    getTemplates(): Promise<any>;
    getServerBasic(id: number): Promise<any>;
    getUserServers(req: Request): Promise<any>;
    applyServer(req: Request, body: {
        name: string;
        description: string;
        version: string;
        template_id: number;
    }): Promise<any>;
}
