import { LevelsService } from './levels.service';
import { CreateLevelDto, UpdateLevelDto } from './dto/level.dto';
export declare class LevelsController {
    private readonly levelsService;
    constructor(levelsService: LevelsService);
    getAllLevels(): Promise<{
        success: boolean;
        data: import("../../entities").Level[];
    }>;
    getUserLevel(userId: number): Promise<{
        success: boolean;
        data: {
            level: import("../../entities").Level | null;
            progress: number;
        };
    }>;
    getAdminLevels(): Promise<{
        success: boolean;
        data: import("../../entities").Level[];
    }>;
    createLevel(dto: CreateLevelDto): Promise<{
        success: boolean;
        data: import("../../entities").Level;
    }>;
    updateLevel(id: number, dto: UpdateLevelDto): Promise<{
        success: boolean;
        data: import("../../entities").Level;
    }>;
    deleteLevel(id: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
}
