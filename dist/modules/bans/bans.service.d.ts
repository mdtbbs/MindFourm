import { Repository } from 'typeorm';
import { Ban, User } from '@entities/index';
export declare class BansService {
    private banRepository;
    private userRepository;
    private banCache;
    private cacheExpiry;
    private readonly CACHE_TTL;
    constructor(banRepository: Repository<Ban>, userRepository: Repository<User>);
    create(dto: {
        ban_type: string;
        value: string;
        reason?: string;
        created_by: number;
    }): Promise<Ban>;
    getList(params: {
        page: number;
        limit: number;
        ban_type?: string;
        is_active?: number;
    }): Promise<{
        data: Ban[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getById(id: number): Promise<Ban>;
    update(id: number, updates: {
        reason?: string;
        is_active?: number;
    }): Promise<Ban>;
    deactivate(id: number): Promise<void>;
    isActive(type: string, value: string | number): Promise<boolean>;
    checkIp(ip: string): Promise<boolean>;
    ipToNum(ip: string): number;
    ipInRange(ip: string, cidr: string): boolean;
    private maybeRefreshCache;
    private refreshBanCache;
    private invalidateBanCache;
}
