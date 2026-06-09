import { OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Setting } from '@entities/index';
export declare class SettingsService implements OnModuleInit {
    private settingRepository;
    private settingsCache;
    constructor(settingRepository: Repository<Setting>);
    onModuleInit(): Promise<void>;
    seedDefaults(): Promise<void>;
    getAll(): Promise<Record<string, string>>;
    getByCategory(category: string): Promise<Record<string, string>>;
    get(key: string): Promise<string | null>;
    getNumber(key: string): Promise<number | null>;
    setBatch(category: string, keyValuePairs: Record<string, string>): Promise<void>;
    private loadSettings;
}
