import { DataSource } from 'typeorm';
export declare class DatabaseModule {
}
export declare function initializeDatabase(dataSource?: DataSource): Promise<void>;
