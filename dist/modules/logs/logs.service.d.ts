import { Repository } from 'typeorm';
import { OperationLog, User } from '@entities/index';
export declare class LogsService {
    private operationLogRepository;
    private userRepository;
    constructor(operationLogRepository: Repository<OperationLog>, userRepository: Repository<User>);
    log(data: {
        user_id?: number;
        action: string;
        target_type?: string;
        target_id?: number;
        details?: string;
        ip_address?: string;
        user_agent?: string;
    }): Promise<OperationLog>;
    getLogs(params: {
        page: number;
        limit: number;
        user_id?: number;
        action?: string;
        target_type?: string;
    }): Promise<{
        data: OperationLog[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}
