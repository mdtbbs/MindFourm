import { SettingsService } from './settings.service';
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    getAll(): Promise<Record<string, string>>;
    getByCategory(category: string): Promise<Record<string, string>>;
    updateSettings(category: string, data: Record<string, string>): Promise<{
        message: string;
    }>;
}
