import { Repository } from 'typeorm';
import { Level } from '@entities/level.entity';
import { User } from '@entities/user.entity';
export declare class LevelsService {
    private levelRepo;
    private userRepo;
    constructor(levelRepo: Repository<Level>, userRepo: Repository<User>);
    getAllLevels(): Promise<Level[]>;
    getUserLevel(userId: number): Promise<Level | null>;
    getUserLevelInfo(userId: number): Promise<{
        level: Level | null;
        progress: number;
    }>;
    createLevel(data: Partial<Level>): Promise<Level>;
    updateLevel(id: number, data: Partial<Level>): Promise<Level>;
    deleteLevel(id: number): Promise<void>;
    initializeDefaultLevels(): Promise<void>;
}
