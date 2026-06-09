import { Repository, DataSource } from 'typeorm';
import { ResourceCategory } from '@entities/resource-category.entity';
export declare class ResourceCategoryService {
    private categoryRepository;
    private dataSource;
    constructor(categoryRepository: Repository<ResourceCategory>, dataSource: DataSource);
    list(includeInactive?: boolean): Promise<ResourceCategory[]>;
    getById(id: number): Promise<ResourceCategory | null>;
    create(dto: Partial<ResourceCategory>): Promise<ResourceCategory>;
    update(id: number, dto: Partial<ResourceCategory>): Promise<ResourceCategory | null>;
    delete(id: number): Promise<void>;
}
