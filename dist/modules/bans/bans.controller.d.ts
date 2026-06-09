import { BansService } from './bans.service';
export declare class BansController {
    private readonly bansService;
    constructor(bansService: BansService);
    getList(page?: number, limit?: number, ban_type?: string, is_active?: number): Promise<{
        data: import("../../entities").Ban[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    create(dto: {
        ban_type: string;
        value: string;
        reason?: string;
    }, user_id: number): Promise<import("../../entities").Ban>;
    update(id: number, updates: {
        reason?: string;
        is_active?: number;
    }): Promise<import("../../entities").Ban>;
    deactivate(id: number): Promise<{
        message: string;
    }>;
}
